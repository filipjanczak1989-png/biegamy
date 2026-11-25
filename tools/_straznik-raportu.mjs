// STRAŻNIK RAPORTU NOCY (25.11.2026, blizna-125): ostatnia kontrola przed zapisem raportu do publicznego repo.
// To samo co `czysty` z anonimizacji, ale po zdjęciu znaczników i STAŁYCH zwrotów samego narzędzia.
//
// Po co wyjątki: słownik imion brał dwa stałe zwroty narzędzia za imiona i raport nie powstawał (kod 2, przebieg czerwony):
//   „Wiersz” (odmiana imienia Wiera) w zdaniu sekcji tygodniowej  → każdy poniedziałek (9.11, 16.11, 23.11),
//   „luka:”  (imię Luka) w linii „kandydat do ławki”              → każdy dzień z wpisem „do poprawy” (6.11, 22.11).
// Słownika nie ruszamy (ten sam anonimizuje dane po stronie serwera), nazw pól też nie („luka” wkleja się potem do ławki).
// Wyjątek to DOKŁADNY, stały zwrot, nie wzorzec: każdy znak poza nim dalej przechodzi przez `czysty`.
// Test pilnuje, że oba zwroty stoją w narzędziu litera w literę (zmiana szablonu bez zmiany listy = czerwony test).
import { czysty } from "./_anonimizuj.mjs";

export const STALE_ZWROTY = [
  "Wiersz tygodnia dopisany do docs/okienko-postep.md.",
  "{ luka: 'E?', uwaga: 'z życia ",
];
const ZNACZNIKI = /\[OSOBA\]|\[e-mail\]|\[telefon\]|osoba #\d+/g;

/** @returns {boolean} true, gdy raport można zapisać: bez danych osób poza znacznikami i stałymi zwrotami narzędzia */
export function raportCzysty(tekst) {
  let t = String(tekst || "").replace(ZNACZNIKI, "");
  for (const z of STALE_ZWROTY) t = t.split(z).join(" ");
  return czysty(t);
}
