// OKIENKO M3a v2 (1.11.2026) — ADAPTER kalendarza imprez z maszyny wyników. JEDYNE miejsce, które wie, z którego RPC
// F6 pochodzą imprezy. Od 1.11.2026 14:58: events_search (K-API 017 — także przeszłe edycje; dokladnosc_daty i status
// zwraca null, bo źródła ich nie mają). Gałąź upcoming_races w argumenty()/szukajImprez zostaje ŚWIADOMIE jako droga
// wycofania (RPC_KALENDARZA = "upcoming_races"), nie martwy kod. Reszta okienka dostaje zawsze ten sam kształt (mapuj).
import { f6 } from "./f6.mjs";

export const RPC_KALENDARZA = "events_search";   // K-API 017 (1.11.2026); wycofanie = "upcoming_races"
export const MAX_IMPREZ = 20;

function domena(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } }
function dystanse(v) {
  if (Array.isArray(v)) return v.map(Number).filter((x) => x > 0).slice(0, 6);
  return String(v || "").split(/[;,|]/).map((x) => Number(String(x).replace(",", ".").replace(/[^\d.]/g, ""))).filter((x) => x > 0).slice(0, 6);
}
/** Wiersz F6 (upcoming_races: name/event_date/city/distances/source_url; events_search: nazwa/data/miejscowosc/…) → impreza. */
export function mapuj(r) {
  const miasto = r.miejscowosc ?? r.city ?? null;
  return {
    klucz: String(r.group_key ?? r.id ?? "").slice(0, 80) || null,
    nazwa: String(r.nazwa ?? r.name ?? "").slice(0, 120),
    data: r.data ?? r.event_date ?? null,
    dokladnosc_daty: r.dokladnosc_daty === "miesiac" ? "miesiac" : "dzien",
    miejscowosc: miasto && miasto !== "Polska" ? String(miasto).slice(0, 60) : null,
    dystanse: dystanse(r.dystanse ?? r.distances),
    zrodlo_domena: domena(r.url_zrodlo_strony ?? r.source_url ?? r.url_organizer ?? ""),
    status: r.status ?? null,
    przeszla: r.przeszla === true,
  };
}
/** Argumenty RPC — jedyne miejsce zależne od wybranego RPC (nazwy parametrów różnią się). */
function argumenty(q, od, doD) {
  if (RPC_KALENDARZA === "events_search") {
    const a = { p_q: q, p_limit: MAX_IMPREZ };
    if (od) a.p_from = od;
    if (doD) a.p_to = doD;
    return a;
  }
  return { p_from: od, p_to: doD, p_q: q, lim: MAX_IMPREZ };
}

const bezZnakow = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const obetnij = (w) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3)));   // „ultrakotliny" → „ultrakotl"
/** Imprezy pasujące do nazwy (q) w zakresie dat; ≤ 20, po dacie. Rzuca BladF6 (429 → 'limit').
    upcoming_races p_q szuka PODCIĄGU, a pytania są w odmianie („trasa ultrakotliny", „maratonu warszawskiego") — więc
    do F6 idzie rdzeń najdłuższego słowa (z polskimi znakami), a każde słowo q musi trafić rdzeniem w nazwę/miejscowość. */
export async function szukajImprez(fetchFn, token, { q, od, do: doD }, teraz = Date.now()) {
  const slowa = String(q).split(/\s+/).map((w) => w.replace(/[^\p{L}\d-]/gu, "")).filter((w) => w.length >= 3);
  if (!slowa.length) return [];
  const najdluzsze = slowa.reduce((a, b) => (b.length > a.length ? b : a));
  // events_search dostaje całe zapytanie (sam robi rdzenie po stronie bazy); upcoming_races — rdzeń najdłuższego słowa
  const q2 = RPC_KALENDARZA === "events_search" ? slowa.join(" ").slice(0, 80) : obetnij(najdluzsze).slice(0, 80);
  const wiersze = await f6(fetchFn, token, RPC_KALENDARZA, argumenty(q2, od, doD), teraz);
  const rdzenie = slowa.map((w) => obetnij(bezZnakow(w)));
  const lista = wiersze.map(mapuj).filter((i) => i.nazwa && i.data)
    .filter((i) => { const t = bezZnakow(`${i.nazwa} ${i.miejscowosc || ""}`); return rdzenie.every((r) => t.includes(r)); });
  // events_search: kolejność serwera (nadchodzące rosnąco, potem przeszłe malejąco); upcoming_races: po dacie
  if (RPC_KALENDARZA !== "events_search") lista.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return lista.slice(0, MAX_IMPREZ);
}
