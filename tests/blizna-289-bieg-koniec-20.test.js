/* BLIZNA 289 / 18.11: decyzja Filipa: bieg i wyniki kończą się 6.12.2026 o 20:00 czasu polskiego, bez dopisywania do 8.12 (migracja 20261209: koniec_at, zalicz_do).
   - front: wszystkie teksty o końcu (nagłówek, zdanie fazy, karty dystansów, krok 3, faza „wyniki”) z koniec_at z bazy, z godziną; bez koniec_at jak dotąd;
   - regulamin 2026-11-v3: jedyna zmiana to § 2 z godziną końca; strona przyjmuje v2 i v3 (push przed plikiem danych 34e bez „WKRÓTCE”);
   - zapisani na starszej wersji widzą „Zmiana: bieg i wyniki kończą się 6.12 o 20:00.” (§ 12 ust. 2), „Rozumiem” chowa na tę wersję;
   - panel: „koniec biegu i wyników 6.12.2026, godz. 20:00”, zaliczanie ręczne do zalicz_do; e-mail z godziną końca;
   - migracja: kotwice, wycofanie i test po skutku z flagą w repo. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B, P;
test.before(async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL;
  const pk = czytaj('js/bieg-panel.mjs'), wytnij = (n) => { const i = pk.indexOf('  function ' + n + '('); return pk.slice(i, pk.indexOf('\n  function ', i + 10) > 0 ? pk.indexOf('\n  function ', i + 10) : undefined); };
  P = new Function(wytnij('dzien') + '\n' + wytnij('koniecPl') + '\n return { koniecPl: koniecPl };')();   // moduł panelu potrzebuje DOM przy ładowaniu: tylko te dwie funkcje
});
const BIEG = (x) => Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', koniec_at: '2026-12-06T19:00:00+00:00',
  faza: 'trwa', dystanse_km: [5], regulamin_wersja: '2026-11-v3', regulamin_od: '2026-11-19' }, x || {});
const STARY = (x) => BIEG(Object.assign({ wynik_do: '2026-12-08', koniec_at: null, regulamin_wersja: '2026-11-v2', regulamin_od: '2026-11-18' }, x || {}));

test('koniec_at z bazy w czasie polskim (19:00 UTC = 20:00), z dniem i krótko; brak albo zła wartość = nic', () => {
  assert.deepEqual(B.koniecBiegu(BIEG()), { iso: '2026-12-06', godz: '20:00' });
  assert.equal(B.koniecZDniem(BIEG()), 'niedzieli, 6 grudnia 2026, godz. 20:00');
  assert.equal(B.koniecKrotko(BIEG()), '6 grudnia, godz. 20:00');
  for (const k of [null, undefined, '', 'nie-data']) { assert.equal(B.koniecBiegu(BIEG({ koniec_at: k })), null); assert.equal(B.koniecKrotko(BIEG({ koniec_at: k })), ''); }
});

test('teksty strony: nagłówek, zdanie fazy, karty dystansów, krok 3; bez koniec_at jak dotąd', () => {
  assert.equal(B.terminOpis(BIEG()), 'kiedy chcesz w tym czasie · do 6.12.2026, godz. 20:00');
  assert.equal(B.terminOpis(STARY()), 'kiedy chcesz w tym czasie · wynik do 8.12.2026');
  assert.equal(B.naglowekStanu(BIEG(), 'przed').zdanie, 'Bieg trwa do 6 grudnia, godz. 20:00. Zapisz się i pobiegnij, kiedy chcesz.');
  assert.equal(B.naglowekStanu(STARY(), 'przed').zdanie, 'Bieg trwa do 6 grudnia. Zapisz się i pobiegnij, kiedy chcesz.');
  assert.equal(B.naglowekStanu(STARY({ faza: 'wyniki' }), 'przed').zdanie, 'Bieg za nami. Wyniki i spóźnione zapisy przyjmujemy do 8 grudnia.');
  assert.equal(B.zdanieKoniecWyniku(BIEG()), 'Z zegarka albo bez: wynik dopisujesz do 6.12.2026, godz. 20:00.');
  assert.equal(B.zdanieKoniecWyniku(STARY()), 'Z zegarka albo bez: wynik dopisujesz do dwóch dni po końcu.');
  assert.match(B.tekstyDystansow(BIEG()).karty_pod, /albo wpisujesz go sam, do 6 grudnia, godz\. 20:00\./);
  assert.match(B.tekstyDystansow(STARY()).karty_pod, /do dwóch dni po końcu biegu\./);
});

test('regulamin v3: jedyna zmiana to § 2 z godziną końca; v2 przyjmowana dalej, v3 bez koniec_at = brak wartości', () => {
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v7'); assert.deepEqual(B.WERSJE_TEKSTOW, ['2026-11-v2', '2026-11-v3', '2026-11-v4', '2026-11-v5', '2026-11-v6', '2026-11-v7']);   // v4: blizna-297, v5: blizna-298, v6: blizna-303, v7: blizna-307
  const L = { imie: 'Jan' }, link = 'https://example.org/zbiorka';
  const w3 = B.wartosciTekstow(BIEG(), L, link), w2 = B.wartosciTekstow(STARY(), L, link);
  assert.ok(w3 && w2, 'obie wersje dają teksty');
  assert.equal(w3.koniec, 'niedzieli, 6 grudnia 2026, godz. 20:00'); assert.equal(w2.koniec, undefined);
  assert.equal(B.wartosciTekstow(BIEG({ koniec_at: null }), L, link), null, 'v3 bez godziny końca w bazie = WKRÓTCE');
  assert.equal(B.wartosciTekstow(STARY({ regulamin_wersja: '2026-11-v1' }), L, link), null);
  assert.deepEqual(B.brakiTekstow(BIEG({ koniec_at: null }), L, link), ['koniec']);
  const t3 = B.regulaminBloki(w3).map((x) => x.tekst), t2 = B.regulaminBloki(Object.assign({}, w3, { wersja: '2026-11-v2' })).map((x) => x.tekst);
  assert.ok(t3.includes('1. Bieg trwa od środy, 18 listopada 2026 do niedzieli, 6 grudnia 2026, godz. 20:00.'));
  assert.ok(t3.includes('3. Wynik można dodać lub poprawić w aplikacji do niedzieli, 6 grudnia 2026, godz. 20:00.'));
  const rozne = t3.map((x, i) => [x, t2[i]]).filter(([a, b]) => a !== b);
  assert.equal(t3.length, t2.length);
  assert.deepEqual(rozne.map(([a]) => a.slice(0, 14)), ['1. Bieg trwa o', '3. Wynik można', '3. Wersja regu'], 'v3 różni się od v2 tylko dwoma punktami § 2 (i numerem wersji w § 13)');
  assert.ok(t3.some((x) => /Wersja regulaminu: 2026-11-v3, obowiązuje od 19 listopada 2026\./.test(x)));
});

test('komunikat o zmianie: tylko zapis na starszej wersji (nie wycofany) i bieg z godziną końca', () => {
  assert.equal(B.komunikatZmiany(BIEG(), [{ regulamin_wersja: '2026-11-v2' }]), 'Zmiana: bieg i wyniki kończą się 6.12 o 20:00.');
  assert.equal(B.komunikatZmiany(BIEG(), [{ regulamin_wersja: '2026-11-v3' }]), '');
  assert.equal(B.komunikatZmiany(BIEG(), [{ regulamin_wersja: '2026-11-v2', wycofany_at: '2026-11-19T10:00:00Z' }]), '');
  assert.equal(B.komunikatZmiany(BIEG({ koniec_at: null }), [{ regulamin_wersja: '2026-11-v2' }]), '');
  assert.equal(B.komunikatZmiany(BIEG(), []), ''); assert.equal(B.komunikatZmiany(BIEG(), null), '');
  const h = czytaj('bieg.html');
  assert.match(h, /<div class="bw-baner" id="bw-zmiana" role="status" hidden><span id="bw-zmiana-tekst"><\/span> <button type="button" class="bw-link-maly" id="bw-zmiana-ok">Rozumiem<\/button><\/div>/);
  assert.match(h, /rysujPlakat\(\); rysujZmiane\(\);/);
  assert.match(h, /\$\('bw-zmiana-tekst'\)\.textContent = t; \$\('bw-zmiana'\)\.hidden = !t \|\| schowany;/);
  assert.match(h, /\$\('bw-termin-opis'\)\.textContent = B\.terminOpis\(bieg\);/);
  assert.match(h, /\$\('bw-krok-koniec'\)\.textContent = B\.zdanieKoniecWyniku\(bieg\);/);
  assert.doesNotMatch(h, /wynik do ' \+ B\.zakresDni/, 'stary tekst nagłówka nie wraca');
});

test('panel trenera i e-mail z godziną końca', () => {
  assert.equal(P.koniecPl('2026-12-06T19:00:00Z'), '6.12.2026, godz. 20:00'); assert.equal(P.koniecPl(null), '');
  const pk = czytaj('js/bieg-panel.mjs');
  assert.match(pk, /koniecPl\(b\.koniec_at\) \? " · koniec biegu i wyników " \+ koniecPl\(b\.koniec_at\) : " · wyniki do " \+ dzien\(b\.wynik_do\)/);
  const ef = czytaj('supabase/functions/bieg-przypomnienie/index.ts');
  assert.match(ef, /export function godzKonca\(g: unknown\) \{ return \/\^\\d\{2\}:\\d\{2\}\$\/\.test/);
  assert.match(ef, /Czas masz do \$\{dataPl\(o\.wynik_do\)\}\$\{doGodz\}\./); assert.match(ef, /\\nWynik do \$\{dataPl\(o\.wynik_do\)\}\$\{doGodz\}\./);
  assert.match(ef, /\(do \$\{g \? `godz\. \$\{g\}` : 'końca dnia'\} w \$\{dt\}\)/);
});

test('migracja 20261209: dziesięć kotwic, wycofanie odwrotne, test po skutku z flagą', () => {
  const m = czytaj('supabase/migrations/20261209_akcja_bieg_koniec_20.sql'), w = czytaj('supabase/migrations/20261209_WYCOFANIE_akcja_bieg_koniec_20.sql');
  assert.match(m, /alter table public\.akcja_biegi add column koniec_at timestamptz, add column zalicz_do date;/);
  assert.equal((m.match(/^\s+\('public\.akcja_bieg_[a-z_]+\(/gm) || []).length, 10);
  assert.equal((w.match(/^\s+\('public\.akcja_bieg_[a-z_]+\(/gm) || []).length, 10);
  assert.match(m, /now\(\) < b\.koniec_at \+ interval '2 hours'/, 'automat 2 godziny po końcu');
  assert.match(m, /x\.source is not distinct from 'intervals'/, 'po końcu tylko import zegarka');
  assert.match(w, /alter table public\.akcja_biegi drop column koniec_at, drop column zalicz_do;/);
  const sh = czytaj('tools/akcja-bieg-koniec-test.sh');
  assert.match(sh, /AKCJA_BIEG_KONIEC_Z_MIGRACJA:-0\}" = 1/); assert.match(sh, /TESTY KOŃCA BIEGU ZIELONE/);
});
