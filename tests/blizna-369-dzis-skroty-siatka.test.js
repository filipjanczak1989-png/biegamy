// Blizna #369 (25.11.2026) — nowe Dziś: rząd skrótów uciekał poza ekran.
//
// Osiem skrótów stało w jednym, przewijanym w bok rzędzie (każdy co najmniej 56 px). Przy 360–430 px mieściło się 5–6,
// reszta była ucięta. Na telefonie dało się przesunąć palcem; na laptopie nie, a rząd potrafił stać przesunięty
// („Ciało” uciekało w lewo, „Gra” ucięta z prawej, zrzuty Filipa z produkcji).
// Wada weszła z ósmym skrótem („Odżywianie”), a narzędzie podglądu celowo POMIJAŁO skróty w kontroli „wystaje poza
// ekran”, więc jej nie wyłapało. Wyjątek zdjęty; tu pilnujemy samej reguły: siatka 4 kolumn, zero przewijania.
// Wymiary na ekranie (320–430 px) sprawdza podgląd w przeglądarce; test jednostkowy pilnuje stylu i liczby skrótów.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODUL = fs.readFileSync(path.join(__dirname, '..', 'js', 'dzis-nowy.mjs'), 'utf8').replace(/\r\n/g, '\n');
const regula = (sel) => { const m = MODUL.match(new RegExp('"' + sel.replace(/[.#]/g, '\\$&') + '\\{([^}]*)\\}')); assert.ok(m, 'brak reguły ' + sel); return m[1]; };

test('(1) skróty w siatce 4 kolumn, bez przewijania w bok; komórka może się zwężać, cel dotyku zostaje wysoki', () => {
  const rzad = regula('#dzis-nowy .dn-skroty');
  assert.match(rzad, /display:grid/); assert.match(rzad, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, 'cztery równe kolumny, które mogą się zwęzić (minmax 0), a nie rozpychać ekranu');
  assert.doesNotMatch(rzad, /overflow|flex/, 'żadnego przewijania ani rzędu flex');
  assert.doesNotMatch(MODUL, /dn-skroty::-webkit-scrollbar|scrollbar-width/, 'reguły chowające pasek przewijania zniknęły razem z przewijaniem');
  const skrot = regula('#dzis-nowy .dn-skrot');
  assert.match(skrot, /min-width:0/); assert.match(skrot, /min-height:72px/, 'komórka co najmniej 72 px wysokości (cel dotyku ≥ 44 px)');
  assert.doesNotMatch(skrot, /flex:1 0 56px/, 'stała minimalna szerokość 56 px wypychała ósmy skrót poza ekran');
  assert.match(regula('#dzis-nowy .dn-skrot .dn-krazek'), /width:48px;height:48px/);
});

test('(2) skrótów jest dokładnie osiem, w ustalonej kolejności: siatka 4 × 2 jest pełna, dziewiąty wymaga decyzji', () => {
  const w = { location: { search: '', hash: '', pathname: '/zawodnik.html' } };
  vm.runInNewContext(MODUL, { window: w, document: { documentElement: { classList: { contains: () => false, add() {}, remove() {} } }, getElementById: () => null }, URLSearchParams, Date, Promise });
  const S = JSON.parse(JSON.stringify(w.BM_DZIS.SKROTY));
  assert.deepEqual(S.map((x) => x[1]), ['Ciało', 'Odżywianie', 'Starty', 'Wyzwania', 'Odznaki', 'Radio', 'Czat', 'Gra'], 'kolejność zatwierdzona przez Filipa 25.11');
  assert.equal(S.length % 4, 0, 'niepełny rząd siatki (np. dziewiąty skrót sam w trzecim rzędzie) to decyzja projektowa, nie drobna zmiana');
  assert.ok(Math.max(...S.map((x) => x[1].length)) <= 10, 'napis dłuższy niż „Odżywianie” nie zmieści się w komórce przy 320 px');
});
