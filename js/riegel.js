// RIEGEL — JEDNO źródło wykładnika prognozy czasu T2 = T1 · (D2/D1)^k (Filip 3.11: „jedna stała w jednym module, wszyscy z niej
// korzystają, blizna”). Czytają: js/generator-planu.js (kotwica planu), js/wyniki-lista.mjs (ekwiwalent 10 km do trendu formy),
// zawodnik.html (_renderPredykcje — predyktor w karcie Forma), w przyszłości okienko (W1 prognoza startu). Plik BEZ import/export —
// działa jako <script src> (globalThis.BM_RIEGEL), jako require() w testach i jako `import "…/js/riegel.js"` w EF (Deno).
// ⚠️ WARTOŚĆ: 1,06 = literatura (Riegel 1981), używana w aplikacji od początku. Zmierzona u nas mediana z par PB to 1,091 (16.08.2026),
// ale wykładnik indywidualny został ODRZUCONY (w górę pomaga, w dół szkodzi 0/30; patrz tests/predykcje.test.js, docs/riegel-zwiad-2026-11-03.md).
// Zmiana wartości = decyzja Filipa = zmiana TYLKO tutaj (blizna-123 pilnuje, że nigdzie indziej nie ma literału).
(function (g) {
  var WYKLADNIK = 1.06;
  function przelicz(czas_s, zKm, naKm) { return czas_s * Math.pow(naKm / zKm, WYKLADNIK); }
  function ekwiwalent10(czas_s, km) { return przelicz(czas_s, km, 10); }
  var API = { WYKLADNIK: WYKLADNIK, przelicz: przelicz, ekwiwalent10: ekwiwalent10 };
  g.BM_RIEGEL = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
