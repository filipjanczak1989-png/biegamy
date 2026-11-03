// OKIENKO 2.0 — log i limity v2 (E0). Jedyne miejsce zapisu EF okienko-v2 poza pamięcią rozmowy (rozmowa.mjs, E4).
//   * tabela okienko_v2_log = okienko_log + intencja, pewnosc, plan, ms, samosprawdzenie, ocena (migracja 20261105);
//   * limit dzienny: osoba na v2 pyta TYLKO przez v2 (front wybiera jedną wersję na sesję), więc liczymy z okienko_v2_log;
//   * budżet miesięczny jest WSPÓLNY: koszt v1 (limity.mjs) + koszt v2 — jeden OKIENKO_BUDZET_USD na obie wersje;
//   * progi i ceny importowane z v1 (LIMIT_DZIENNY, LIMIT_SIEC, PROG_OSTRZEZENIA, kosztUsd, CENA_ZAPYTANIA_USD) — bez kopii.
import { poczatekDniaWaw } from "../okienko/narzedzia.mjs";
import { kosztUsd } from "../okienko/model.mjs";
import { CENA_ZAPYTANIA_USD } from "../okienko/siec.mjs";
import { LIMIT_DZIENNY, LIMIT_SIEC, PROG_OSTRZEZENIA, kosztMiesiaca as kosztMiesiacaV1 } from "../okienko/limity.mjs";

export const TABELA = "okienko_v2_log";
export const TRYBY_MODELU = ["flash", "blad", "v2"];   // liczą się do 60/dobę (klasyfikator od E2 też = 'v2')

export async function uzyteDzisV2(adm, athleteId, dzis) {
  const { count, error } = await adm.from(TABELA).select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId).in("tryb", TRYBY_MODELU).gte("kiedy", poczatekDniaWaw(dzis));
  if (error) throw new Error(TABELA);
  return count || 0;
}

export async function uzyteSiecDzisV2(adm, athleteId, dzis) {
  const od = poczatekDniaWaw(dzis);
  const { count, error } = await adm.from(TABELA).select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId).eq("tryb", "siec").gte("kiedy", od);
  if (error) throw new Error(TABELA);
  const { count: osoby, error: e2 } = await adm.from(TABELA).select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId).in("tryb", ["osoba", "impreza"]).gte("zapytania_sieci", 1).gte("kiedy", od);
  if (e2) throw new Error(TABELA);
  return (count || 0) + (osoby || 0);
}

export async function kosztMiesiacaV2(adm, dzis) {
  const { data, error } = await adm.from(TABELA).select("tok_we,tok_wy,zapytania_sieci").gte("kiedy", poczatekDniaWaw(dzis.slice(0, 8) + "01"));
  if (error) throw new Error(TABELA);
  const s = (data || []).reduce((a, r) => ({ we: a.we + (r.tok_we || 0), wy: a.wy + (r.tok_wy || 0), z: a.z + (r.zapytania_sieci || 0) }), { we: 0, wy: 0, z: 0 });
  return kosztUsd(s) + s.z * CENA_ZAPYTANIA_USD;
}

/** → null | 'dzien' | 'miesiac' — jak v1, budżet = v1 + v2; wpis 'budzet80' raz w miesiącu w okienko_v2_log. */
export async function sprawdzLimityV2(adm, athleteId, dzis, budzetUsd) {
  if (await uzyteDzisV2(adm, athleteId, dzis) >= LIMIT_DZIENNY) return "dzien";
  if (!(budzetUsd > 0)) return null;
  const koszt = (await kosztMiesiacaV1(adm, dzis)) + (await kosztMiesiacaV2(adm, dzis));
  if (koszt >= budzetUsd) return "miesiac";
  if (koszt >= PROG_OSTRZEZENIA * budzetUsd) {
    const { count } = await adm.from(TABELA).select("id", { count: "exact", head: true })
      .eq("tryb", "budzet80").gte("kiedy", poczatekDniaWaw(dzis.slice(0, 8) + "01"));
    if (!count) await zapiszLogV2(adm, { athlete_id: athleteId, tekst: `budżet (v1+v2): ${koszt.toFixed(2)} z ${budzetUsd} USD`, tryb: "budzet80", ok: true });
  }
  return null;
}

export { LIMIT_SIEC };

/** Jedyny zapis logu v2 (nazwa tabeli literałem — blizna-113 skanuje zapisy po literale). Błąd logu NIE psuje odpowiedzi, ale wraca do wołającego.
    Zwraca id wpisu (kciuki 3.11: klient ocenia wpis przez RPC okienko_ocena) albo true, gdy klient nie umie `.select` (atrapa ławki), albo false. */
export async function zapiszLogV2(adm, w) {
  const q = adm.from("okienko_v2_log").insert({
    athlete_id: w.athlete_id, tekst: String(w.tekst || "").slice(0, 300), narzedzia: w.narzedzia || [], tryb: w.tryb,
    tok_we: w.tok_we || 0, tok_wy: w.tok_wy || 0, zapytania_sieci: w.zapytania_sieci || 0, ok: w.ok !== false,
    powod_odrzucenia: w.powod_odrzucenia ? String(w.powod_odrzucenia).slice(0, 500) : null,
    intencja: w.intencja || null, pewnosc: typeof w.pewnosc === "number" ? Math.max(0, Math.min(1, Math.round(w.pewnosc * 100) / 100)) : null,
    plan: w.plan || [], ms: typeof w.ms === "number" ? Math.max(0, Math.round(w.ms)) : null,
    samosprawdzenie: typeof w.samosprawdzenie === "boolean" ? w.samosprawdzenie : null });
  const r = q && typeof q.select === "function" ? await q.select("id").single() : await q;
  if (!r || r.error) return false;
  return r.data && Number.isFinite(Number(r.data.id)) ? Number(r.data.id) : true;
}

/** skrót odpowiedzi do wpisu (raport poranny, sędzia) — best-effort, nigdy nie psuje odpowiedzi; zdania bez kart i źródeł, ≤ 400 */
export async function zapiszOdpowiedzV2(adm, id, zdania) {
  if (!Number.isFinite(Number(id)) || !Array.isArray(zdania) || !zdania.length) return false;
  try { const { error } = await adm.from("okienko_v2_log").update({ odpowiedz: zdania.filter((z) => typeof z === "string").join(" ").slice(0, 400) }).eq("id", Number(id)); return !error; } catch { return false; }
}
