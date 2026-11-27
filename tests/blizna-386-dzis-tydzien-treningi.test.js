// Blizna #386 (26.11.2026) — nowe Dziś: linia tygodnia bez planu mówiła „2 dni z ruchem”.
//
// Filip obejrzał kadr i linię na swoim koncie: „dni z ruchem” to nowe pojęcie, którego nie ma nigdzie indziej.
// Stary „Postęp tygodnia” bez planu pokazuje liczbę treningów tygodnia („3 treningi w tym tygodniu”).
// Decyzja 26.11: „Ten tydzień: 21,7 km · 2 treningi”, z poprawną odmianą. Liczba to wpisy tygodnia (wszystkie
// aktywności, jak w starym), nie dni: dwa biegi jednego dnia to 2 treningi.
// „Ten tydzień: jeszcze bez treningu” i wariant z planem („N z M treningów”) zostają bez zmian.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, PROFIL } = require('./_dzis-nowy-strona.js');

const log = (iso, typ, km, czas) => ({ logged_at: iso, training_type: typ, distance_km: km, duration: czas });
const linia = (o) => strona().B.tydzienLinia(Object.assign({ km: 10, planKm: 0, zaplanowane: 0, zrobione: 0, wpisow: 0, dniZRuchem: 0 }, o));

test('(1) odmiana: 1 trening, 2–4 treningi, 5+ treningów; 12–14 treningów, 22–24 treningi', () => {
  const slowo = (n) => linia({ wpisow: n, dniZRuchem: Math.min(n, 7) }).replace(/^.*<\/b> /, '');
  const oczekiwane = { 1: 'trening', 2: 'treningi', 3: 'treningi', 4: 'treningi', 5: 'treningów', 6: 'treningów', 9: 'treningów', 10: 'treningów', 11: 'treningów', 12: 'treningów', 13: 'treningów', 14: 'treningów',
    15: 'treningów', 21: 'treningów', 22: 'treningi', 23: 'treningi', 24: 'treningi', 25: 'treningów', 31: 'treningów', 32: 'treningi', 112: 'treningów', 122: 'treningi' };
  for (const n of Object.keys(oczekiwane)) assert.equal(slowo(Number(n)), oczekiwane[n], n + ' ' + oczekiwane[n]);
  assert.equal(linia({ wpisow: 2, dniZRuchem: 2, km: 21.7 }), 'Ten tydzień: <b>22</b> km · <b>2</b> treningi');
});

test('(2) liczy treningi, nie dni: dwa wpisy jednego dnia to 2 treningi; rower też jest treningiem; „dni z ruchem” znika', async () => {
  const wpisy = [log('2026-11-26T06:00:00+00:00', 'Spokojny', 5, '30:00'), log('2026-11-26T17:00:00+00:00', 'Tempo', 6, '30:00'), log('2026-11-24T06:00:00+00:00', 'Rower', 22, '1:05:00')];
  const s = strona({ trening: [], wpisyTyg: wpisy, profil: Object.assign({}, PROFIL, { coach_id: null }) }); s.B.start(); await s.doKonca();
  assert.equal(s.B.tydzien().dniZRuchem, 2); assert.equal(s.B.tydzien().wpisow, 3);
  assert.equal(s.cz('tydzien-linia').innerHTML, 'Ten tydzień: <b>11</b> km · <b>3</b> treningi');
  assert.doesNotMatch(linia({ wpisow: 3, dniZRuchem: 2 }), /z ruchem| dni | dzień /);
});

test('(3) bez zmian: pusty tydzień bez planu i wariant z planem', () => {
  assert.equal(linia({ km: 0 }), 'Ten tydzień: jeszcze bez treningu');
  assert.equal(linia({ km: 24.6, planKm: 38, zaplanowane: 5, zrobione: 3, wpisow: 4, dniZRuchem: 4 }), 'Ten tydzień: <b>25</b> z 38 km · <b>3</b> z 5 treningów');
});
