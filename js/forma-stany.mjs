// STANY FORMY (M3-2, 1.11.2026) — SŁOWNIK zdań, które aplikacja już pokazuje na kaflu Forma: tarcza formy w sb.js
// (`_badge` / `_title` / `_sub` w zasilaniu kafla, literały bez polskich znaków) i etykieta `window.formaZoneLabel`.
// Okienko („jaka mam formę") składa odpowiedź WYŁĄCZNIE z liczb TSB/CTL/ATL (formaSeria z _shared/reguly-treningow.mjs)
// i zdań z tej tablicy — żadnych porad poza tym. Klucz = opisFormy(tsb) z reguly-treningow.mjs (te same progi, które
// pilnuje tools/bramka-reguly.js). blizna-84 porównuje każde zdanie z sb.js po zdjęciu polskich znaków — zmiana tekstu
// na kaflu bez zmiany tutaj = czerwony test. Plik BEZ import/export, jak js/tekst.mjs (globalThis.BM_FORMA_STANY).
(function (g) {
  "use strict";
  g.BM_FORMA_STANY = {
    "świeżość": { etykieta: "wypoczęty", tytul: "Naładowany po brzegi.", pod: "Ciało gotowe na wysiłek - zaufaj planowi i słuchaj nóg." },
    "optimum": { etykieta: "optimum", tytul: "Forma świeża.", pod: "Dobry moment na mocniejszy akcent albo start." },
    "neutralna": { etykieta: "neutralna", tytul: "Trening idzie równo.", pod: "Obciążenie pod kontrolą - kontynuuj plan." },
    "obciążenie": { etykieta: "obciążenie", tytul: "Nogi trochę ciężkie.", pod: "Wyraźne zmęczenie - pilnuj regeneracji." },
    "przeciążenie": { etykieta: "przeciążenie", tytul: "Zmęczenie siedzi w nogach.", pod: "Dziś nic mocnego - organizm potrzebuje odpoczynku." },
  };
})(globalThis);
