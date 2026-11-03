/* BLIZNA 118 (3.11.2026, Filip 03:31): DATA NA ZAPOWIEDZI ≠ DATA STARTU. Teaser (index.html, dla-fabianka.html) pokazuje
   `data_zapowiedzi` z licznika (8.11 do zapowiedz_zmiana_at = 5.11 20:00 Europe/Warsaw, potem 7.11); prawdziwy start (akcje.start,
   okno guzika, licznik, odznaki, cytaty dnia) BEZ ZMIAN = 7.11; „Dziś. Jedno kliknięcie…” według PRAWDZIWEGO dnia startu;
   zagadki okienka bez dnia (pytania o 7.11 i 8.11 nadal łapane). Test po skutku: tools/akcja-wyprawa-test.sql FAIL 4a–4d. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('migracja: kolumny, licznik przed startem oddaje data_zapowiedzi wg now() vs zapowiedz_zmiana_at, start niezmieniony, UPDATE dla Filipa', () => {
  const m = czytaj('supabase/migrations/20261104_akcja_wyprawa.sql');
  assert.match(m, /add column data_zapowiedzi date, add column zapowiedz_zmiana_at timestamptz default \('2026-11-05 20:00' at time zone 'Europe\/Warsaw'\), add column data_zapowiedzi_po date;/);
  assert.match(m, /set data_zapowiedzi = '2026-11-08', data_zapowiedzi_po = '2026-11-07', zapowiedz_zmiana_at = \('2026-11-05 20:00' at time zone 'Europe\/Warsaw'\) where slug in \('dla-fabianka', 'proba'\);/);
  assert.match(m, /'data_zapowiedzi', case when a\.data_zapowiedzi is null then a\.start\s+when a\.zapowiedz_zmiana_at is not null and now\(\) >= a\.zapowiedz_zmiana_at then coalesce\(a\.data_zapowiedzi_po, a\.start\)\s+else a\.data_zapowiedzi end/);
  assert.doesNotMatch(m, /set start = |okno_startu_od =/, 'start i okno guzika nietknięte');
  assert.match(m, /if j->>'start' <> '2026-11-07' then raise exception/);
  assert.match(m, /update public\.akcje set zapowiedz_zmiana_at = '2026-11-05 20:00 Europe\/Warsaw' where slug = 'dla-fabianka';/, 'gotowa linia dla Filipa w nagłówku');
  const t = czytaj('tools/akcja-wyprawa-test.sql');
  for (const f of ['FAIL 4a', 'FAIL 4b', 'FAIL 4c', 'FAIL 4d']) assert.ok(t.includes(f), f);
  assert.match(czytaj('supabase/migrations/20261104_WYCOFANIE_akcja_wyprawa.sql'), /drop column if exists data_zapowiedzi, drop column if exists zapowiedz_zmiana_at, drop column if exists data_zapowiedzi_po/);
});

test('teasery: data z data_zapowiedzi (nie start), „Dziś…” według start; 5.11 19:59 → 8.11, 20:00 → 7.11 (symulacja licznika)', () => {
  const i = czytaj('index.html'), f = czytaj('dla-fabianka.html');
  assert.match(i, /const zap = String\(d\.data_zapowiedzi \|\| d\.start\);/); assert.match(i, /const krotka = Number\(zap\.slice\(8, 10\)\) \+ '\.' \+ zap\.slice\(5, 7\);/);
  assert.match(i, /\(dzis >= String\(d\.start\) \? 'Dziś\. Jedno kliknięcie zmieni wszystko\.' : 'Zapamiętaj tę datę\.'\)/, '„Dziś” według prawdziwego startu');
  assert.match(f, /\$\('wielka-data'\)\.textContent = krotka\(d && \(d\.data_zapowiedzi \|\| d\.start\)\);/);
  assert.match(f, /d && d\.start && dzisWaw\(\) >= String\(d\.start\) \? 'Dziś\. Jedno kliknięcie zmieni wszystko\.'/);
  // ta sama reguła co w SQL, policzona tu dla dwóch chwil (bramka na godzinę): 5.11 19:59 → 8.11, 20:00 → 7.11
  const licznik = (teraz) => { const zmiana = Date.parse('2026-11-05T20:00:00+01:00'); return teraz >= zmiana ? '2026-11-07' : '2026-11-08'; };
  assert.equal(licznik(Date.parse('2026-11-05T19:59:00+01:00')), '2026-11-08'); assert.equal(licznik(Date.parse('2026-11-05T20:00:00+01:00')), '2026-11-07');
  const krotka = (iso) => Number(String(iso).slice(8, 10)) + '.' + String(iso).slice(5, 7);
  assert.equal(krotka('2026-11-08'), '8.11'); assert.equal(krotka('2026-11-07'), '7.11');
});

test('zagadki okienka bez dnia; pytania o 7.11 i 8.11 nadal trafiają w zagadkę', async () => {
  globalThis.escapeHtml = (s) => String(s);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  const A = globalThis.BM_AKCJA_CYTATY;
  for (const z of A.ZAGADKI) assert.doesNotMatch(z, /\d{1,2}\.\d{2}|\d{1,2} listopada|listopad|sobot|niedziel/i, 'zagadka z dniem: ' + z);
  assert.equal(A.DZIEN_STARTU, '2026-11-07', 'prawdziwy start bez zmian');
  const R = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko/router.mjs')).href);
  A.ustawStan({ ruszyla: false });
  for (const q of ['co sie dzieje 7 listopada', 'co bedzie 8.11', 'co sie dzieje 8 listopada', 'co jest 7.11']) assert.equal((R.dopasuj(q, '2026-11-04') || {}).log, 'zagadka', q);
});
