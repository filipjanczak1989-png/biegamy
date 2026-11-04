/* BLIZNA 107 (2.11.2026, OK Filipa po przeglądzie A) — okienko PRZED 8.11: pięć reguł.
   1) data startu (7.11/8.11/„siódmego listopada") daje zagadkę tylko BEZ słów o własnych danych — „plan na 7.11", „co mam 8.11",
      „trening 8.11" idą normalnie (plan/treningi);
   2) „kiedy rusza akcja", „jaki jest cel akcji", „na co zbieramy", „kiedy start akcji", „link do zbiórki" → zagadka przed startem,
      PO_STARCIE + karta akcji po starcie (karta niesie url_zbiorki z bazy — js/okienko.js rysuje „Oficjalna zbiórka ›");
   3) nazwisko + słowo biegowe („Jan Kowalski parkrun", „Anna Nowak maraton") → tryb OSOBY (nie lista biegów, nie tryb imprezy);
   4) samo nazwisko w kontekście wyników („wyniki Nowaka", „jak pobiegł Kowalski w Dębnie", „kim jest Kowalski") → tryb osoby;
      strażnik ścieżki ogólnej i strażnik imprezy znają samo nazwisko;
   5) wyjątek „pytanie wprost" ZAMKNIĘTY: do sieci wyłącznie osoba publiczna sportowo (≥ 30 startów / MP / podium open). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const DZIS = '2026-11-05';

test('1) pułapka daty zdjęta: data bez słów o własnych danych → zagadka; z nimi → normalnie', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const A = globalThis.BM_AKCJA_CYTATY; A.ustawStan({ ruszyla: false });
  for (const q of ['co będzie 7.11', 'siódmego listopada', 'co sie dzieje 8 listopada', '7.11', 'co bedzie 7 listopada']) assert.equal((R.dopasuj(q, DZIS) || {}).log, 'zagadka', q);
  for (const q of ['plan na 7.11', 'co mam 8.11', 'trening 8.11', 'jaki mam plan na 7 listopada', 'moje treningi 7.11']) assert.notEqual((R.dopasuj(q, DZIS) || {}).log, 'zagadka', 'nie zagadka: ' + q);
});

test('2) słowa akcji/zbiórki → zagadka przed startem, PO_STARCIE po starcie; własne km nieprzechwycone', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const A = globalThis.BM_AKCJA_CYTATY;
  const Q = ['kiedy rusza akcja', 'jaki jest cel akcji', 'na co zbieramy', 'kiedy start akcji', 'link do zbiórki', 'link do zbiorki', 'cel akcji', 'na co jest ta zbiórka', 'ile km ma akcja', 'kiedy akcja się zaczyna'];
  try {
    A.ustawStan({ ruszyla: false });
    for (const q of Q) { const r = R.dopasuj(q, DZIS); assert.equal(r && r.log, 'zagadka', q); assert.ok(A.ZAGADKI.includes(r.zdanie), 'zagadka z listy: ' + q); }
    A.ustawStan({ ruszyla: true });
    for (const q of Q.filter((x) => x !== 'jaki jest cel akcji')) assert.deepEqual(R.dopasuj(q, DZIS), { zdanie: A.PO_STARCIE, log: 'zagadka' }, 'po starcie: ' + q);   // „jaki jest cel akcji” ma własne zdanie z FAQ (blizna-158)
    for (const q of ['ile km mam w akcji', 'ile mam km w tym tygodniu', 'moj plan']) assert.notEqual((R.dopasuj(q, DZIS) || {}).log, 'zagadka', q);
  } finally { A.ustawStan({ ruszyla: false }); }
  // karta po starcie niesie link zbiórki (EF: kartaOkienka; klient: „Oficjalna zbiórka ›")
  assert.match(czytaj('js/akcja.mjs'), /url_zbiorki: d\.url_zbiorki \|\| null \} \};/);
  assert.match(czytaj('js/okienko.js'), /Oficjalna zbiórka ›/);
  assert.match(czytaj('supabase/functions/okienko/index.ts'), /if \(traf\.log === "zagadka" && AKK\) \{ const k = AKK\.kartaOkienka\(akcjaDane\); if \(k\) kartyZd = \[k\]; \}/);
});

test('3) nazwisko + słowo biegowe → tryb osoby; nazwy imprez nie', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  for (const [q, oczek] of [['Jan Kowalski parkrun', 'Jan Kowalski'], ['kasia nowak ultra', 'kasia nowak'], ['Anna Nowak maraton', 'Anna Nowak'], ['Jan Kowalski trail wyniki', 'Jan Kowalski']]) {
    assert.equal((R.dopasuj(q, DZIS) || {}).narzedzie, undefined, 'router nie robi z tego listy biegów: ' + q);
    const o = O.osobaZPytania(q); assert.ok(o && o.q === oczek, q + ' → ' + JSON.stringify(o));
  }
  for (const q of ['Bieg Niepodleglosci Poznan', 'Maraton Warszawski Praga', 'maraton warszawski', 'jakie biegi w Poznaniu', 'parkrun Cytadela']) assert.equal(O.osobaZPytania(q), null, 'nie osoba: ' + q);
  assert.equal((R.dopasuj('jakie biegi w listopadzie', DZIS) || {}).narzedzie, 'biegi_nadchodzace');
});

test('4) samo nazwisko: tryb osoby w „wyniki X" / „jak pobiegł X w Mieście" / „kim jest X"; strażnicy sieci', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const P = await zaladuj('supabase/functions/okienko/pamiec.mjs');
  assert.deepEqual(O.osobaZPytania('wyniki Nowaka'), { q: 'Nowaka', wprost: false, gdzie: null });
  assert.deepEqual(O.osobaZPytania('jak pobiegl Kowalski w Debnie'), { q: 'Kowalski', wprost: false, gdzie: 'Debnie' });
  assert.deepEqual(O.osobaZPytania('kim jest Kowalski'), { q: 'Kowalski', wprost: true, gdzie: null });
  for (const q of ['wyniki Nowaka', 'Kowalski startował', 'kim jest Nowak', 'Kipchoge rekord']) assert.equal(P.wygladaNaNazwisko(q), true, q);
  for (const q of ['jakie wyniki w Berlinie', 'kto wygral maraton w Berlinie', 'wyniki Biegu Niepodleglosci', 'Poznań maraton kiedy', 'ile km w pazdzierniku']) assert.equal(P.wygladaNaNazwisko(q), false, 'nie nazwisko: ' + q);
  const ef = czytaj('supabase/functions/okienko/index.ts');
  assert.match(ef, /const blokadaSieci = wygladaNaOsobe\(tekst\) \|\| !!osobaWZdaniu\(tekst\) \|\| wygladaNaNazwisko\(tekst\);/);
  const imp = czytaj('supabase/functions/okienko/impreza.mjs');
  assert.match(imp, /const naOsobe = wygladaNaOsobe\(q\) \|\| wygladaNaNazwisko\(q \+ " wyniki"\) \|\| samoNazwisko;/);
  assert.match(imp, /const wolnoSiec = !\(naOsobe && !kalendarz\.length && !nasze\.length\)/);
});

test('5) „wprost" zamknięte: prywatna osoba nigdy do sieci, publiczna sportowo tak', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  const lancuch = () => { const c = { then: (ok) => ok({ data: [], error: null }) }; for (const m of ['select', 'neq', 'ilike', 'limit', 'or', 'eq']) c[m] = () => c; return c; };
  const sb = { from: () => lancuch() };
  const f6 = (runners, wyniki) => ({ fetchFn: async (url) => ({ ok: true, status: 200, json: async () => (url.includes('search_runners') ? runners : wyniki) }) });
  const start = (n, nazwa) => Array.from({ length: n }, (_, i) => ({ event_name: nazwa || 'Bieg ' + i, event_date: '2026-0' + (1 + (i % 9)) + '-01', event_city: 'X', distance_km: 10, time_seconds: 3000 + i, position_total: 50 }));
  const prywatna = f6([{ runner_key: 'd:1', display_name: 'KOWALSKI JAN', yob: 1990, results_count: 3 }], start(3));
  const publiczna = f6([{ runner_key: 'd:2', display_name: 'NOWAK ANNA', yob: 1985, results_count: 31 }], start(31));
  const mp = f6([{ runner_key: 'd:3', display_name: 'LIS AGNIESZKA', yob: 1988, results_count: 2 }], start(2, 'Mistrzostwa Polski w maratonie'));
  let siec = 0; const deps = (f, q, wprost) => ({ sb, athleteId: 'ja', fetchFn: f.fetchFn, token: 'T', q, wprost, gdzie: null, sieciDozwolona: async () => true,
    siec: async () => { siec++; return { zdania: ['x'], zrodla: [{ tytul: 'a', url: 'https://a' }], tok: { we: 1, wy: 1 }, zapytania: 1 }; } });
  for (const [q, wprost] of [['Jan Kowalski', true], ['Jan Kowalski', false], ['Kowalski', true], ['Kowalski', false]]) { F._wyczyscPamiecF6(); await O.odpowiedzOsoba(deps(prywatna, q, wprost)); }
  assert.equal(siec, 0, 'prywatna osoba: 0 wyjść do sieci, także przy „kim jest … w sieci"');
  F._wyczyscPamiecF6(); await O.odpowiedzOsoba(deps(publiczna, 'Anna Nowak', false)); assert.equal(siec, 1, '≥ 30 startów → sieć');
  F._wyczyscPamiecF6(); await O.odpowiedzOsoba(deps(mp, 'Agnieszka Lis', false)); assert.equal(siec, 2, 'MP → sieć');
  const src = czytaj('supabase/functions/okienko/osoba.mjs');
  assert.match(src, /const doSieci = !!\(wyniki && wyniki\.publiczna\);/);
  assert.doesNotMatch(src, /wprost \? `Kim jest/);
  assert.match(czytaj('docs/okienko-spec.md'), /wyjątek „pytanie wprost” zamknięty/i);
});
