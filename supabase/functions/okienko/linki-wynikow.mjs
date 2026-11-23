// LINKI WYNIKÓW (Filip 23.11, krok 3 b): „Oficjalne wyniki ›” tylko do serwisów pomiaru czasu z listy. Lista = domeny, z których maszyna wyników
// już zbiera wyniki albo które Filip zatwierdził (source_domains: datasport, elektronicznezapisy, b4sport, plus-timing, foxter-sport, time4run).
// Ta sama funkcja posłuży sieci po link (krok c). Kopia listy i funkcji jest w js/okienko.js (front bez modułów) — blizna-338 pilnuje zgodności.
// Przyjmuje WYŁĄCZNIE: https, host = domena z listy albo jej poddomena, bez portu, bez „user@”, bez punycode (xn--), bez adresu IP; inaczej null.
export const DOMENY_WYNIKOW = ["datasport.pl", "elektronicznezapisy.pl", "b4sport.pl", "plus-timing.pl", "foxter-sport.pl", "time4run.com.pl"];

/** → znormalizowany adres (URL.href) albo null */
export function linkWynikow(u) {
  if (typeof u !== "string" || u.length > 500 || /[\s\\\u0000-\u001f\u007f]/.test(u)) return null;
  let x;
  try { x = new URL(u); } catch { return null; }
  if (x.protocol !== "https:" || x.username || x.password || x.port) return null;
  const h = x.hostname.toLowerCase();
  if (!h || h.split(".").some((s) => !s || s.startsWith("xn--")) || /^[\d.]+$/.test(h) || h.includes(":")) return null;
  return DOMENY_WYNIKOW.some((d) => h === d || h.endsWith("." + d)) ? x.href : null;
}
