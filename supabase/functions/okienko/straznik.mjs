// OKIENKO (M1 krok 3) — strażnik cyfr (M1-okienko-wykonanie.md pkt 4). Model NIE MOŻE podać liczby, której nie ma
// w wynikach narzędzi. Zbiór dozwolonych = wszystkie liczby z JSON wyników (kropka i przecinek), daty z wyników w
// formatach YYYY-MM-DD, D.MM, DD.MM, D.MM.YYYY, sam dzień i sam rok z tych dat, godziny HH:MM. Zdanie z cyfrą spoza
// zbioru → ODRZUCONE (powód do logu). Świadoma luka (zapisana w M1): liczebniki słowne („dwa") nie są cyframi.
export const NIE_MAM = "Nie mam tego w Twoich danych.";
export const OTO = "Oto, co znalazłem.";
/** Zdanie wstępne, gdy po strażniku nie zostało żadne zdanie, a są karty: jedno narzędzie → jego zdanie, kilka → OTO. */
export const OTO_NARZEDZIA = { moj_plan: "Oto Twój plan.", moje_treningi: "Oto Twoje treningi.", moje_starty: "Oto Twoje starty.",
  wyzwania_postep: "Oto Twoje wyzwania.", odznaki_moje: "Oto Twoje odznaki." };
export function wstep(narzedziaKart = []) {
  const n = [...new Set(narzedziaKart)];
  return n.length === 1 && OTO_NARZEDZIA[n[0]] ? OTO_NARZEDZIA[n[0]] : OTO;
}

const RE_LICZBA = /\d+(?:[.,:]\d+)*/g;
const norm = (s) => s.replace(/,/g, ".");

/** Powód do okienko_log: odrzucone zdania (co model próbował powiedzieć) albo — przy zdaniu zastępczym bez odrzuceń —
    że model nie dał zdań / nie dał JSON-u. null = odpowiedź modelu przeszła bez zmian. */
export function powodPustych(s, m = {}) {
  const czesci = s.odrzucone.map((o) => `liczba ${o.liczba}: ${o.zdanie}`);
  if (s.puste && !czesci.length) czesci.push(m.bez_json ? "model: brak JSON-u, zdanie zastępcze" : "model: brak zdań, zdanie zastępcze");
  else if (s.puste) czesci.unshift("wszystkie zdania odrzucone, zdanie zastępcze");
  return czesci.length ? czesci.join(" | ").slice(0, 500) : null;
}

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

/** → {zdania, odrzucone:[{zdanie, liczba}], puste} — zdania już po strażniku; pusto → NIE_MAM albo wstęp z narzędzi kart
    (puste=true: odpowiedź to zdanie zastępcze, powód idzie do logu). */
export function sprawdz(zdania, kartyLiczba, wyniki, narzedziaKart = []) {
  const ok = [], odrzucone = [];
  const dozw = dozwoloneLiczby(wyniki);
  for (const z of Array.isArray(zdania) ? zdania : []) {
    if (typeof z !== "string" || !z.trim()) continue;
    const zla = (z.match(RE_LICZBA) || []).map(norm).find((c) => !dozw.has(c) && !dozw.has(c.replace(/\.$/, "")));
    if (zla) odrzucone.push({ zdanie: z.slice(0, 200), liczba: zla });
    else ok.push(z.trim());
  }
  if (!ok.length) return { zdania: [kartyLiczba > 0 ? wstep(narzedziaKart) : NIE_MAM], odrzucone, puste: true };
  return { zdania: ok.slice(0, 2), odrzucone, puste: false };
}
