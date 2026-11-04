// OKIENKO M3a (1.11.2026) — biegi_nadchodzace: kalendarz imprez z maszyny wyników F6 (upcoming_races), tokenem
// użytkownika, wspólna pamięć F6 10 min (f6.mjs). Tylko odczyt, bez linków zewnętrznych w kartach (v1 — linki do stron
// biegów wejdą z K4/K5 w kalendarzu). Pusto = „Maszyna wyników nie ma biegów w tym zakresie." (nie „nie ma takich
// biegów": to granica NASZYCH danych).
//
// Miasto filtruje EF, nie F6: pytania przychodzą w odmianie („w Poznaniu", „pod Środą"), a p_q szuka podciągu
// w nazwie/mieście — „Poznaniu" nie trafi w „Poznań". EF bierze RDZEŃ słowa (bez polskich znaków, bez końcówki,
// ≥ 4 litery) i dopasowuje go do początków słów nazwy i miasta. Zakres dat idzie do F6 (p_from/p_to); gdy F6 odda
// pełny limit (ucięty wynik), EF pyta drugi raz z p_q = rdzeń, żeby miasto spoza pierwszych 300 nie zginęło.
import { f6 } from "./f6.mjs";
import "../../../js/tekst.mjs";
const T = /** @type {any} */ (globalThis).BM_TEKST;   // porządek 1.11: normalizacja, rdzeń, miesiące, odmiana — js/tekst.mjs

export const MAX_DNI_BIEGOW = 366, DNI_DOMYSLNIE = 90, DNI_Z_MIEJSCEM = 365, MAX_KART_BIEGOW = 10, LIMIT_F6 = 300;
export const ODP_BIEGI_PUSTO = "Maszyna wyników nie ma biegów w tym zakresie.";
export const DYSTANSE = { "5": 5, "10": 10, "21": 21.0975, "42": 42.195 };

export function bezZnakow(s) { return T.bezZnakow(s); }
/** „Poznaniu" → „pozna", „Środą" → „srod", „Krakowie" → „krako", „Gdyni" → „gdyn" (tylko litery, potem rdzeń). */
export function rdzen(slowo) { return T.rdzen(T.tylkoLitery(slowo)); }
function dodajDni(d, n) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
export function dniMiedzy(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); }
/* Etap 5 ławki (1.11): pytanie z miastem albo dystansem, bez miesiąca („półmaraton w krakowie") → rok do przodu, bo
   wiosenne biegi leżą poza 90 dniami; bez miasta i dystansu zostaje 90 (lista „jakie biegi" ma być krótka). */
export const domyslnyZakres = (dzis, args = {}) => ({ od: dzis, do: dodajDni(dzis, args.miejsce || args.dystans ? DNI_Z_MIEJSCEM : DNI_DOMYSLNIE) });

function pasujeMiejsce(b, r) {
  if (!r) return true;
  const slowa = bezZnakow(`${b.name || ""} ${b.city || ""}`).split(/[^a-z]+/).filter(Boolean);
  return slowa.some((w) => w.startsWith(r));
}
function pasujeDystans(b, km) {
  if (!km) return true;
  return (Array.isArray(b.distances) ? b.distances : []).some((d) => Math.abs(Number(d) - km) <= km * 0.03);
}
function domena(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } }

/** args (po walidacji): {od, do, miejsce?, dystans?} → {od, do, miejsce, dystans_km, liczba, biegi[≤10]}. Rzuca BladF6. */
export async function biegiNadchodzace(fetchFn, token, args, teraz = Date.now()) {
  const r = args.miejsce ? rdzen(args.miejsce) : null;
  const km = args.dystans ? DYSTANSE[args.dystans] : null;
  let wiersze = await f6(fetchFn, token, "upcoming_races", { p_from: args.od, p_to: args.do, lim: LIMIT_F6 }, teraz);
  if (r && wiersze.length >= LIMIT_F6) {
    const dod = await f6(fetchFn, token, "upcoming_races", { p_from: args.od, p_to: args.do, p_q: r, lim: LIMIT_F6 }, teraz);
    const juz = new Set(wiersze.map((w) => w.group_key));
    wiersze = wiersze.concat(dod.filter((w) => !juz.has(w.group_key)));
  }
  const trafione = wiersze.filter((b) => b && b.event_date >= args.od && b.event_date <= args.do && pasujeMiejsce(b, r) && pasujeDystans(b, km))
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  return { od: args.od, do: args.do, miejsce: args.miejsce || null, dystans_km: km, liczba: trafione.length,
    biegi: trafione.slice(0, MAX_KART_BIEGOW).map((b) => ({ klucz: typeof b.klucz === "string" ? b.klucz.slice(0, 80) : null, nazwa: String(b.name || "").slice(0, 120), data: b.event_date || null,
      miasto: b.city && b.city !== "Polska" ? String(b.city).slice(0, 60) : null,
      dystanse: (Array.isArray(b.distances) ? b.distances : []).map(Number).filter((x) => x > 0).slice(0, 6),
      zrodlo_domena: domena(b.source_url), status: b.status === "zgloszona" || b.status === "potwierdzona" ? b.status : null })) };   // 018
}
