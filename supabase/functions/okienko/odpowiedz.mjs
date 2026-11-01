// OKIENKO (M1 krok 2) — odpowiedź BEZ modelu: zdania z szablonów + karty z wyników narzędzi. Każda liczba w zdaniu
// pochodzi z wyniku narzędzia (ta sama zasada co strażnik cyfr modelu w kroku 3). Pusto → „Nie mam tego w Twoich danych."
export const NIE_MAM = "Nie mam tego w Twoich danych.";
export const NIE_ZNAJDE = "Tego nie znajdę w aplikacji.";

function odmiana(n, [jeden, kilka, wiele]) {
  const d = n % 10, s = n % 100;
  return n === 1 ? jeden : (d >= 2 && d <= 4 && (s < 12 || s > 14)) ? kilka : wiele;
}
const km = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const DZIEN = (d) => { const [r, m, dd] = d.split("-"); return `${Number(dd)}.${m}`; };

/** wynik narzędzia → {zdania[], karty[]} */
export function zWyniku(nazwa, w, args = {}) {
  if (!w) return { zdania: [NIE_MAM], karty: [] };
  if (nazwa === "moj_plan") {
    const t = w.treningi || [];
    if (!t.length) return { zdania: [NIE_MAM], karty: [] };
    const karty = t.map((x) => ({ typ: "trening", dane: x }));
    if (w.od === w.do) {
      const x = t[0], kiedy = args.zakres === "jutro" ? "Jutro" : args.data ? DZIEN(w.od) : "Dziś";
      return { zdania: [`${kiedy}: ${x.typ}${x.dystans_km ? ", " + km(x.dystans_km) + " km" : ""}.`], karty };
    }
    return { zdania: [`W planie od ${DZIEN(w.od)} do ${DZIEN(w.do)}: ${t.length} ${odmiana(t.length, ["trening", "treningi", "treningów"])}.`], karty };
  }
  if (nazwa === "moje_treningi") {
    if (!w.liczba) return { zdania: [NIE_MAM], karty: [] };
    return { zdania: [`Od ${DZIEN(w.od)} do ${DZIEN(w.do)}: ${km(w.suma_km)} km biegu, ${w.liczba} ${odmiana(w.liczba, ["trening", "treningi", "treningów"])}.`],
      karty: (w.lista || []).slice(0, 5).map((x) => ({ typ: "trening", dane: x })) };
  }
  if (nazwa === "moje_starty") {
    const c = w.cele || [];
    if (!c.length) return { zdania: [NIE_MAM], karty: [] };
    const x = c[0], kiedy = x.dni_do === 0 ? "dziś" : x.dni_do === 1 ? "jutro" : `za ${x.dni_do} dni`;
    return { zdania: [`Najbliższy start: ${x.nazwa}, ${kiedy} (${DZIEN(x.data)}).`], karty: c.slice(0, 3).map((s) => ({ typ: "start", dane: s })) };
  }
  if (nazwa === "wyzwania_postep") {
    const a = (w.aktywne || []).filter((x) => x.procent > 0 && x.procent < 100).sort((p, q) => q.procent - p.procent);
    if (!a.length) return { zdania: ["Nie masz teraz wyzwania w toku."], karty: (w.aktywne || []).map((x) => ({ typ: "wyzwanie", dane: x })) };
    return { zdania: [`Najbliżej ukończenia: ${a[0].nazwa}, ${a[0].procent}%.`], karty: (w.aktywne || []).map((x) => ({ typ: "wyzwanie", dane: x })) };
  }
  if (nazwa === "odznaki_moje") {
    if (!w.liczba) return { zdania: [NIE_MAM], karty: [] };
    return { zdania: [`Masz ${w.liczba} ${odmiana(w.liczba, ["odznakę", "odznaki", "odznak"])}.`], karty: (w.ostatnie || []).map((x) => ({ typ: "odznaka", dane: x })) };
  }
  return { zdania: [NIE_MAM], karty: [] };
}
