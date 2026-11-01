// TEKST — jedno źródło drobnych reguł językowych (porządek 1.11.2026): normalizacja „bez polskich znaków", rdzeń słowa,
// nazwy miesięcy, odmiana liczebnikowa. Czytają: EF okienko (biegi, kalendarz, moje, impreza, router, odpowiedz),
// js/przepisy-szukaj.mjs, js/okienko.js, sb.js (IMPREZY), races.html, _shared/miesiace.mjs (share-card).
// Plik BEZ import/export — działa jako <script src> i jako moduł (`import "…/js/tekst.mjs"` → globalThis.BM_TEKST),
// jak plan-pusty/cwiczenia-nazwy. Strony ładują go PRZED skryptami, które z niego korzystają.
// SQL na maszynie3 (klucz_szukania, rdzenie_zapytania — K-API 017) to inny runtime i ma dawać TO SAMO co rdzen() tutaj:
// pilnuje tests/blizna-79 na 5 przykładach (wyniki z bazy przepisane do testu).
(function (g) {
  "use strict";
  /** małe litery, bez znaków diakrytycznych, ł → l (reszta znaków bez zmian) */
  function bezZnakow(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  }
  /** bezZnakow + tylko litery a–z (klucz nazw do porównań: „Poznański Bieg 12." → „poznanskibieg") */
  function tylkoLitery(s) { return bezZnakow(s).replace(/[^a-z]/g, ""); }
  /** zdanie do dopasowań routera: bezZnakow, znaki spoza a–z0–9 → spacja, pojedyncze spacje */
  function normalizuj(t) { return bezZnakow(t || "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
  /** rdzeń słowa: ≤ 4 znaki bez zmian, dłuższe tracą 3 ostatnie (min. 4) — „poznaniu" → „pozna", „ultrakotliny" → „ultrakotl" */
  function rdzen(w) { w = String(w == null ? "" : w); return w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3)); }
  /** liczebnik + forma: odmiana(1|2–4|5+) — formy [jeden, kilka, wiele] */
  function odmiana(n, formy) {
    var d = n % 10, s = n % 100;
    return n === 1 ? formy[0] : (d >= 2 && d <= 4 && (s < 12 || s > 14)) ? formy[1] : formy[2];
  }
  var START = ["start", "starty", "startów"];
  g.BM_TEKST = {
    bezZnakow: bezZnakow, tylkoLitery: tylkoLitery, normalizuj: normalizuj, rdzen: rdzen, odmiana: odmiana,
    startow: function (n) { return odmiana(n, START); },
    MIESIACE_MIANOWNIK: ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"],
    MIESIACE_DOPELNIACZ: ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"],
    MIESIACE_MIEJSCOWNIK: ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrześniu", "październiku", "listopadzie", "grudniu"],
  };
})(globalThis);
