// Domeny serwisów z wynikami / zapisami biegów (M2d, 1.11.2026). Źródło: docs/SOURCES.md repo kolektora
// (biegamy-collector, bez własnej biegamy.run) + uzupełnienie Filipa 1.11. Używa EF okienko: źródło z odpowiedzi
// z sieci z taką domeną zapisuje się jako znalezisko (lead dla K-źródła na maszynie3).
export const ZRODLA_WYNIKOW = [
  // docs/SOURCES.md (kolektor)
  "b4sport.pl", "d-u-v.org", "datasport.pl", "domtel-sport.pl", "dostartu.pl", "elektronicznezapisy.pl", "enduhub.com",
  "foxter-sport.pl", "maratonczykpomiarczasu.pl", "maratonypolskie.pl", "parkrun.pl", "plus-timing.pl", "racetime.net",
  "time2go.pl", "time4run.pl", "zapisyvaldano.pl", "zmierzymyczas.pl",
  // uzupełnienie Filipa 1.11 (bez powtórzeń z listy wyżej)
  "protiming.pl", "timekeeper.pl", "inessport.pl", "time-sport.pl",
];

/** Domena (np. „wyniki.datasport.pl" albo tytuł źródła z groundingChunks) należy do listy — sama albo jako subdomena. */
export function czyDomenaWynikow(domena) {
  const d = String(domena || "").toLowerCase().trim().replace(/^www\./, "");
  return !!d && ZRODLA_WYNIKOW.some((z) => d === z || d.endsWith("." + z));
}
