// OKIENKO (M1 krok 3) — strażnik cyfr (M1-okienko-wykonanie.md pkt 4). Model NIE MOŻE podać liczby, której nie ma
// w wynikach narzędzi. Zbiór dozwolonych = wszystkie liczby z JSON wyników (kropka i przecinek), daty z wyników w
// formatach YYYY-MM-DD, D.MM, DD.MM, D.MM.YYYY, sam dzień i sam rok z tych dat, godziny HH:MM. Zdanie z cyfrą spoza
// zbioru → ODRZUCONE (powód do logu). Świadoma luka (zapisana w M1): liczebniki słowne („dwa") nie są cyframi.
export const NIE_MAM = "Nie mam tego w Twoich danych.";
export const OTO = "Oto, co znalazłem.";

const RE_LICZBA = /\d+(?:[.,:]\d+)*/g;
const norm = (s) => s.replace(/,/g, ".");

export function dozwoloneLiczby(wyniki) {
  const tekst = JSON.stringify(wyniki ?? null);
  const z = new Set();
  for (const m of tekst.match(RE_LICZBA) || []) { z.add(norm(m)); for (const cz of m.split(/[.,:]/)) z.add(cz); }
  for (const [, r, mi, d] of tekst.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
    const D = String(Number(d)), M = String(Number(mi));
    for (const f of [`${D}.${mi}`, `${d}.${mi}`, `${D}.${M}`, `${D}.${mi}.${r}`, `${d}.${mi}.${r}`, D, d, r]) z.add(f);
  }
  for (const [g] of tekst.matchAll(/\b\d{1,2}:\d{2}\b/g)) z.add(g);
  return z;
}

/** → {zdania, odrzucone:[{zdanie, liczba}]} — zdania już po strażniku; pusto → NIE_MAM albo OTO (gdy są karty). */
export function sprawdz(zdania, kartyLiczba, wyniki) {
  const ok = [], odrzucone = [];
  const dozw = dozwoloneLiczby(wyniki);
  for (const z of Array.isArray(zdania) ? zdania : []) {
    if (typeof z !== "string" || !z.trim()) continue;
    const zla = (z.match(RE_LICZBA) || []).map(norm).find((c) => !dozw.has(c) && !dozw.has(c.replace(/\.$/, "")));
    if (zla) odrzucone.push({ zdanie: z.slice(0, 200), liczba: zla });
    else ok.push(z.trim());
  }
  if (!ok.length) return { zdania: [kartyLiczba > 0 ? OTO : NIE_MAM], odrzucone };
  return { zdania: ok.slice(0, 2), odrzucone };
}
