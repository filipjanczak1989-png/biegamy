/* BLIZNA 82 (1.11.2026, M3-1 (2) kolejność i detektory) — luki z ławki 50 pytań.

   1) „maraton warszawski", „kiedy jest maraton warszawski 2027", „bieg niepodleglosci" → IMPREZA po nazwie, nie lista
      biegów; lista zostaje dla „jakie biegi/maratony w <miesiąc|miasto>".
   2) Lista wyklucza „co jeść | jak | czy | ile kosztuje" (to porady/ceny, nie termin).
   3) Pusta lista podaje ZAKRES („od 1.11 do 30.01 w Krakowie"), nie „w tym zakresie".
   4) „weekend" = najbliższe sb–nd.
   5) „rekord świata/Polski/Europy/olimpijski" ≠ mój rekord → nie moje_rekordy.
   6) „co to jest odznaka X" → katalog (karta odznaki), nie moje odznaki.
   7) Katalog pomija słowa kategorii (cwiczenia, program, trening, oddech, utwor, piosenka…) i liczy cyfry jako słowa („4-7-8").
   8) Odmiana imienia i nazwiska do F6: najpierw jak jest, przy 0 trafień rdzenie — maks. 2 wywołania. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const DZIS = '2026-11-01';   // niedziela

test('(1)(2) router listy: nazwa po „maraton/bieg" → null (impreza); porady i ceny → null; lista zostaje dla miesiąca/miasta', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  for (const t of ['maraton warszawski', 'kiedy jest maraton warszawski 2027', 'bieg niepodleglosci', 'polmaraton poznanski kiedy', 'maraton debno 2027']) {
    assert.equal(R.dopasuj(t, DZIS), null, 'lista: ' + t);
    assert.ok(I.imprezaZPytania(t), 'impreza: ' + t);
  }
  for (const t of ['co jesc przed polmaratonem', 'jak przygotowac sie do maratonu', 'czy biegac maraton bez treningu', 'ile kosztuje wpisowe na maraton w debnie', 'cena biegu w poznaniu'])
    assert.equal(R.dopasuj(t, DZIS), null, t);
  for (const [t, m] of [['jakie biegi w listopadzie w poznaniu', 'poznaniu'], ['jakie maratony w kwietniu', undefined], ['gdzie pobiec dyche w grudniu', undefined], ['biegi gorskie w maju', undefined], ['jakie biegi w krakowie', 'krakowie']]) {
    const r = R.dopasuj(t, DZIS);
    assert.equal(r && r.narzedzie, 'biegi_nadchodzace', t);
    assert.equal(r.args.miejsce, m, t);
  }
});

test('(3) pusta lista mówi, jaki zakres; (4) weekend = sb–nd (nd 1.11 → 1.11–1.11; wt 3.11 → 7–8.11)', async () => {
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  assert.deepEqual(zWyniku('biegi_nadchodzace', { od: '2026-11-01', do: '2027-01-30', miejsce: 'Krakowie', przy: 'w', dystans_km: 21.0975, liczba: 0, biegi: [] }).zdania,
    ['Maszyna wyników nie ma biegów od 1.11 do 30.01 w Krakowie na półmaratonie.']);
  assert.deepEqual(zWyniku('biegi_nadchodzace', { od: '2026-12-01', do: '2026-12-31', liczba: 0, biegi: [] }).zdania, ['Maszyna wyników nie ma biegów w grudniu.']);
  assert.deepEqual(R.dopasuj('jakie biegi w weekend', DZIS).args, { od: '2026-11-01', do: '2026-11-01' });
  assert.deepEqual(R.dopasuj('jakie biegi w weekend', '2026-11-03').args, { od: '2026-11-07', do: '2026-11-08' });
  assert.deepEqual(R.dopasuj('biegi w weekend w poznaniu', '2026-11-06').args, { od: '2026-11-07', do: '2026-11-08', miejsce: 'poznaniu', przy: 'w' });
});

test('(5) rekord świata/Polski/Europy/olimpijski → nie moje_rekordy; moje rekordy / życiówka → tak', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const t of ['rekord swiata w maratonie', 'rekord polski na 10 km', 'rekord europy w polmaratonie', 'rekord olimpijski maraton', 'rekord trasy maraton warszawski'])
    assert.notEqual((R.dopasuj(t, DZIS) || {}).narzedzie, 'moje_rekordy', t);
  for (const t of ['moje rekordy', 'moja zyciowka na 10 km', 'jakie mam szanse na rekordy']) assert.equal(R.dopasuj(t, DZIS).narzedzie, 'moje_rekordy', t);
});

test('(6)(7) katalog: „co to jest odznaka wracam do gry" → odznaka; „cwiczenia na core" → program; „oddech 4-7-8" → technika; „pokaz wyzwania" zostaje w routerze', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const K = await zaladuj('supabase/functions/okienko/katalog.mjs');
  assert.equal(R.dopasuj('co to jest odznaka wracam do gry', DZIS), null, 'router odznak nie łapie „co to jest"');
  assert.equal(R.dopasuj('jakie mam odznaki', DZIS).narzedzie, 'odznaki_moje');
  assert.equal(R.dopasuj('pokaz wyzwania', DZIS).narzedzie, 'wyzwania_postep');
  const sb = () => atrapa({ radio_tracks: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Czwarta Godzina', artist: 'X' }], recipes: [] });
  const o = await K.szukajWKatalogu(sb(), 'co to jest odznaka wracam do gry');
  assert.ok(o && o.karty[0].typ === 'kat_odznaka' && o.karty[0].dane.nazwa === 'Wracam do gry', JSON.stringify(o));
  const c = await K.szukajWKatalogu(sb(), 'cwiczenia na core');
  assert.ok(c && c.karty[0].typ === 'cwiczenie' && c.karty[0].dane.klucz === 'core', JSON.stringify(c));
  const b = await K.szukajWKatalogu(sb(), 'oddech 4-7-8');
  assert.ok(b && b.karty[0].typ === 'cwiczenie' && b.karty[0].dane.klucz === '478', JSON.stringify(b));
  const u = await K.szukajWKatalogu(sb(), 'zagraj piosenke czwarta godzina');
  assert.ok(u && u.karty[0].typ === 'utwor');
  assert.equal(await K.szukajWKatalogu(sb(), 'cwiczenia'), null, 'samo słowo kategorii → nic');
});

test('(8) F6: „Katarzyny Chojnackiej" → 0 → drugie wywołanie rdzeniami „katarz chojnack"; maks. 2 wywołania; trafienie od razu = 1 wywołanie', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  const wolania = [];
  const fetchFn = async (url, init) => { const rpc = url.split('/rpc/')[1]; const a = JSON.parse(init.body); wolania.push([rpc, a.q]);
    if (rpc === 'search_runners') return { ok: true, status: 200, json: async () => (a.q === 'katarz chojnack' || a.q === 'Katarzyna Chojnacka' ? [{ runner_key: 'datasport:1', display_name: 'CHOJNACKA KATARZYNA', yob: 1991, results_count: 12 }] : []) };
    return { ok: true, status: 200, json: async () => [{ event_name: 'Maraton Dębno', event_date: '2026-10-18', distance_km: 42.195, time_seconds: 10652, position_total: 45 }] }; };
  F._wyczyscPamiecF6();
  const w = await O.wynikiSzukaj(fetchFn, 'T', 'Katarzyny Chojnackiej');
  assert.ok(w && w.najlepszy.starty === 12);
  assert.deepEqual(wolania.filter((x) => x[0] === 'search_runners').map((x) => x[1]), ['Katarzyny Chojnackiej', 'katarz chojnack']);
  F._wyczyscPamiecF6(); wolania.length = 0;
  await O.wynikiSzukaj(fetchFn, 'T', 'Katarzyna Chojnacka');
  assert.equal(wolania.filter((x) => x[0] === 'search_runners').length, 1, 'trafienie od razu = jedno wywołanie');
  F._wyczyscPamiecF6(); wolania.length = 0;
  assert.equal(await O.wynikiSzukaj(fetchFn, 'T', 'Zenon Nieistniejacy'), null);
  assert.equal(wolania.filter((x) => x[0] === 'search_runners').length, 2, 'maks. 2 wywołania');
});
