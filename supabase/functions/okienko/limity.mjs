// OKIENKO (M1 krok 3) — limity i log. `adm` = klient service_role (JEDYNY, który pisze do okienko_log; authenticated
// nie ma grantu zapisu — migracja 20261101_okienko_log.sql). Wszystkie zapytania tu idą po okienko_log i nigdzie indziej.
//   * dzienny: 60 pytań do MODELU / osobę / dobę Warszawy (tryb 'flash' i 'blad' — błąd modelu też kosztuje); router
//     się nie liczy (M1 pkt 7);
//   * miesięczny: suma tokenów wszystkich osób od 1. dnia miesiąca × cena modelu vs OKIENKO_BUDZET_USD → 429 'miesiac';
//     przy ≥ 80 % jeden wpis 'budzet80' na miesiąc (decyzja Filipa 1.11).
// ⚠️ Retencja 30 dni a miesiąc 31-dniowy: 31. dnia cron zdążył skasować wpisy z 1. — budżet zaniża się o ≤ 1 dobę
//    na koniec takiego miesiąca. Świadome (log jest od kontroli kosztu, nie od rozliczenia); faktura jest w AI Studio.
import { poczatekDniaWaw } from "./narzedzia.mjs";
import { kosztUsd } from "./model.mjs";
import { CENA_ZAPYTANIA_USD } from "./siec.mjs";

export const LIMIT_DZIENNY = 60;
export const LIMIT_SIEC = 20;   // M2a: osobny licznik pytań z sieci / osobę / dobę Warszawy
export const PROG_OSTRZEZENIA = 0.8;

export async function uzyteDzis(adm, athleteId, dzis) {
  const { count, error } = await adm.from("okienko_log").select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId).in("tryb", ["flash", "blad"]).gte("kiedy", poczatekDniaWaw(dzis));
  if (error) throw new Error("okienko_log");
  return count || 0;
}

export async function uzyteSiecDzis(adm, athleteId, dzis) {
  const { count, error } = await adm.from("okienko_log").select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId).eq("tryb", "siec").gte("kiedy", poczatekDniaWaw(dzis));
  if (error) throw new Error("okienko_log");
  return count || 0;
}

/* Koszt = tokeny × cena modelu + zapytania wyszukiwania × 0,014 USD (M2a — grounding liczy się do budżetu). */
export async function kosztMiesiaca(adm, dzis) {
  const { data, error } = await adm.from("okienko_log").select("tok_we,tok_wy,zapytania_sieci").gte("kiedy", poczatekDniaWaw(dzis.slice(0, 8) + "01"));
  if (error) throw new Error("okienko_log");
  const s = (data || []).reduce((a, r) => ({ we: a.we + (r.tok_we || 0), wy: a.wy + (r.tok_wy || 0), z: a.z + (r.zapytania_sieci || 0) }), { we: 0, wy: 0, z: 0 });
  return kosztUsd(s) + s.z * CENA_ZAPYTANIA_USD;
}

/** → null (można pytać) | 'dzien' | 'miesiac'. Przy ≥ 80 % budżetu dopisuje raz w miesiącu wpis 'budzet80'. */
export async function sprawdzLimity(adm, athleteId, dzis, budzetUsd) {
  if (await uzyteDzis(adm, athleteId, dzis) >= LIMIT_DZIENNY) return "dzien";
  if (!(budzetUsd > 0)) return null;
  const koszt = await kosztMiesiaca(adm, dzis);
  if (koszt >= budzetUsd) return "miesiac";
  if (koszt >= PROG_OSTRZEZENIA * budzetUsd) {
    const { count } = await adm.from("okienko_log").select("id", { count: "exact", head: true })
      .eq("tryb", "budzet80").gte("kiedy", poczatekDniaWaw(dzis.slice(0, 8) + "01"));
    if (!count) await zapiszLog(adm, { athlete_id: athleteId, tekst: `budżet: ${koszt.toFixed(2)} z ${budzetUsd} USD`, tryb: "budzet80", ok: true });
  }
  return null;
}

/** Jedyny zapis okienka. Błąd logu NIE psuje odpowiedzi (log to kontrola, nie warunek), ale wraca do wołającego. */
export async function zapiszLog(adm, w) {
  const { error } = await adm.from("okienko_log").insert({
    athlete_id: w.athlete_id, tekst: String(w.tekst || "").slice(0, 300), narzedzia: w.narzedzia || [], tryb: w.tryb,
    tok_we: w.tok_we || 0, tok_wy: w.tok_wy || 0, zapytania_sieci: w.zapytania_sieci || 0, ok: w.ok !== false, powod_odrzucenia: w.powod_odrzucenia || null });
  return !error;
}
