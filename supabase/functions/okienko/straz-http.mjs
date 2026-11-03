// OKIENKO — straż wejścia HTTP (AWARIA 3.11, blizna-136), wspólna dla EF okienko i okienko-v2 (v2 importuje stąd, bez kopii).
// 3.11 19:36–19:45 każde pytanie kończyło się w przeglądarce „Nie dam rady teraz odpowiedzieć”, a w okienko_log i okienko_v2_log
// nie było ANI JEDNEGO wiersza — nie było czego czytać. Dwie dziury, które to umożliwiały:
//   1) wyjątek poza try w handlerze → Deno.serve oddaje 500 BEZ nagłówków CORS → przeglądarka widzi błąd sieci, log milczy;
//   2) wywołanie bez limitu czasu (Gemini) wisi dłużej, niż klient czeka (20 s, js/okienko.js) → klient przerywa, EF nie loguje.
// Tu: termin całej obsługi (krótszy niż klienta) + opis wyjątku do wpisu 'blad'. Odpowiedź błędu zawsze idzie przez `odp` EF (z CORS).

export const TERMIN_MS = 16000;   // klient przerywa po 20 000 ms — EF musi odpowiedzieć wcześniej, żeby zostawić wpis i oddać CORS

export class PrzekroczonyTermin extends Error {}

/** Wynik obietnicy albo PrzekroczonyTermin po `ms`. Obietnica biegnie dalej (jej własny log może dojść później — to dobrze: widać, ile trwała). */
export function zTerminem(obietnica, ms = TERMIN_MS) {
  let t = null;
  const termin = new Promise((_, odrzuc) => { t = setTimeout(() => odrzuc(new PrzekroczonyTermin("termin " + ms + " ms")), ms); });
  return Promise.race([obietnica, termin]).finally(() => { if (t) clearTimeout(t); });
}

/** Opis wyjątku do powod_odrzucenia i console.error: nazwa + komunikat + pierwsza ramka stosu; długie ciągi (klucze, JWT) wycięte. */
export function opisBledu(e) {
  const nazwa = (e && e.name) || "Error";
  const tresc = String((e && e.message) || e || "");
  const ramka = String((e && e.stack) || "").split("\n").map((l) => l.trim()).find((l) => l.startsWith("at ")) || "";
  return (nazwa + ": " + tresc + (ramka ? " | " + ramka.replace(/^at\s+/, "").replace(/^.*\/functions\//, "") : ""))
    .replace(/[A-Za-z0-9_-]{30,}/g, "…").slice(0, 300);
}
