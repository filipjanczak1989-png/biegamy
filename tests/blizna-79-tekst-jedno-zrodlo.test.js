/* BLIZNA 79 (1.11.2026, porządek): js/tekst.mjs — jedno źródło normalizacji „bez polskich znaków + rdzeń", nazw
   miesięcy i odmiany. Wcześniej 5 kopii normalizacji, 6 list miesięcy, 3 odmiany „startów".

   Ryzyka:
   1) ROZJAZD JS ↔ SQL. events_search na maszynie3 (K-API 017: klucz_szukania, rdzenie_zapytania) to inny runtime —
      musi dawać TO SAMO co tekst.mjs. Wyniki z bazy (1.11.2026, psql na maszynie3) wpisane niżej; zmiana reguły
      w jednym miejscu bez drugiego = czerwony test.
   2) DRUGA KOPIA wraca. Okienko, sb.js (IMPREZY), races.html, share-card i wyszukiwarka przepisów nie definiują już
      własnych list miesięcy, odmiany ani normalizacji.
   3) KOLEJNOŚĆ ładowania: tekst.mjs przed sb.js na stronach, które go używają; w SW precache. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tekstDlaOkna } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8');
const T = tekstDlaOkna();

// maszyna3, wyniki 1.11.2026: select x, klucz_szukania(x), array_to_string(rdzenie_zapytania(x), ',')
const SQL = [
  ['Ultrakotliny', 'ultrakotliny', 'ultrakotl'],
  ['w Poznaniu', 'wpoznaniu', 'pozna'],
  ['Maraton Warszawski', 'maratonwarszawski', 'warszaw,mara'],
  ['Bieg Niepodległości', 'biegniepodleglosci', 'niepodleglo,bieg'],
  ['Łódź Ultra-Kotlina', 'lodzultrakotlina', 'kotl,lodz,ultr'],
];

test('JS = SQL na 5 przykładach: klucz (bez znaków i spacji) i rdzenie słów ≥ 3 znaki', () => {
  for (const [x, klucz, rdzenie] of SQL) {
    assert.equal(T.bezZnakow(x).replace(/[^a-z0-9]/g, ''), klucz, x);
    const r = [...new Set(T.bezZnakow(x).split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(T.rdzen))]
      .sort((a, b) => b.length - a.length || a.localeCompare(b));
    assert.equal(r.join(','), rdzenie, x);
  }
});

test('funkcje: bezZnakow, tylkoLitery, normalizuj (jak dawny router), rdzeń, odmiana, miesiące', () => {
  assert.equal(T.bezZnakow('ŁÓDŹ Żółć'), 'lodz zolc');
  assert.equal(T.tylkoLitery('12. Poznański Bieg!'), 'poznanskibieg');
  assert.equal(T.normalizuj('  Kiedy mam   START?! Łódź '), 'kiedy mam start lodz');
  assert.equal(T.normalizuj(null), ''); assert.equal(T.bezZnakow(null), '');
  assert.deepEqual(['abc', 'abcd', 'abcde', 'poznaniu', 'ultrakotliny'].map(T.rdzen), ['abc', 'abcd', 'abcd', 'pozna', 'ultrakotl']);
  assert.deepEqual([1, 2, 4, 5, 12, 14, 22, 25, 101].map((n) => T.startow(n)), ['start', 'starty', 'starty', 'startów', 'startów', 'startów', 'starty', 'startów', 'startów']);
  assert.equal(T.MIESIACE_MIANOWNIK.length, 12); assert.equal(T.MIESIACE_DOPELNIACZ[8], 'września'); assert.equal(T.MIESIACE_MIEJSCOWNIK[10], 'listopadzie');
});

test('bez drugich kopii: okienko (EF i UI), sb.js IMPREZY, races.html, share-card, przepisy-szukaj czytają z tekst.mjs', () => {
  const ef = (f) => czytaj('supabase', 'functions', 'okienko', f);
  for (const f of ['biegi.mjs', 'kalendarz.mjs', 'moje.mjs', 'router.mjs', 'odpowiedz.mjs']) {
    assert.match(ef(f), /import "\.\.\/\.\.\/\.\.\/js\/tekst\.mjs";/, f);
    assert.ok(!/normalize\("NFD"\)/.test(ef(f)), `${f}: własna normalizacja`);
  }
  const bezKom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/listopadzie|"styczniu"|\[jeden, kilka, wiele\]/.test(bezKom(ef('odpowiedz.mjs'))), 'odpowiedz: własne miesiące/odmiana');
  const ui = czytaj('js', 'okienko.js');
  assert.ok(!/'styczeń'|'startów'/.test(ui), 'okienko.js: własne miesiące/odmiana');
  assert.ok(!/normalize\('NFD'\)/.test(czytaj('js', 'przepisy-szukaj.mjs')), 'przepisy-szukaj: własna normalizacja');
  const sb = czytaj('sb.js');
  const imp = sb.slice(sb.indexOf('window.IMPREZY = (function () {'), sb.indexOf('})();', sb.indexOf('window.IMPREZY = (function () {')));
  assert.ok(!/normalize\('NFD'\)/.test(imp), 'IMPREZY: własna normalizacja');
  assert.match(imp, /window\.BM_TEKST\.tylkoLitery\(s\)/);
  const r = czytaj('races.html');
  assert.ok(!/'październik'|'startów'/.test(r), 'races.html: własne miesiące/odmiana');
  const sh = czytaj('supabase', 'functions', '_shared', 'miesiace.mjs');
  assert.match(sh, /import "\.\.\/\.\.\/\.\.\/js\/tekst\.mjs";/); assert.ok(!/"STYCZEŃ"/.test(sh), 'share-card: własna lista');
  for (const f of ['pamiec.mjs', 'osoba.mjs', 'odpowiedz.mjs']) assert.ok(!/export const (ODP_OSOBA|ODP_BRAK|NIE_ZNAJDE)\b/.test(ef(f)), `${f}: martwa stała`);
});

test('kolejność: tekst.mjs przed sb.js na zawodnik/races/nutrition; SW precache', () => {
  for (const s of ['zawodnik.html', 'races.html', 'nutrition.html']) {
    const h = czytaj(s);
    const t = h.indexOf('<script src="js/tekst.mjs"></script>'), b = h.indexOf('<script src="sb.js"></script>');
    assert.ok(t > 0 && t < b, `${s}: tekst.mjs przed sb.js`);
  }
  assert.match(czytaj('sw.js'), /'\/js\/tekst\.mjs'/);
});
