/* BLIZNA 103 (2.11.2026) — PROJEKT F dzień 6: gotowość na napływ nowych ludzi 7.11 (zwiad dnia 6).
   - okienko po starcie: „co to za akcja", „ile już km", „jak dołączyć", „kim jest Fabianek" → zagadka/karta akcji (bez modelu
     i sieci); krótkie „jak dołączyć" / „ile już km" dopiero po starcie; pytania o własne km nie są przechwytywane;
   - „Dołącz i biegnij" (dla-fabianka.html → index.html#dolacz): od razu formularz REJESTRACJI, bez hero (zwiad: hero zostawał);
   - po zapisie nowego treningu pamięć sumy akcji (sessionStorage) czyszczona — suma i „Twój wkład" się nie rozjeżdżają. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('okienko: pytania o akcję przed i po starcie; własne km i „dołączyć do trenera" nie', async () => {
  const R = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko/router.mjs')).href);
  const A = globalThis.BM_AKCJA_CYTATY;
  try {
    A.ustawStan({ ruszyla: false });
    for (const q of ['co to za akcja', 'ile km w akcji', 'jak dołączyć do akcji', 'kim jest Fabianek', 'Fabianek']) assert.equal(R.dopasuj(q, '2026-11-06').log, 'zagadka', q);
    for (const q of ['jak dołączyć', 'ile już km']) assert.notEqual((R.dopasuj(q, '2026-11-06') || {}).log, 'zagadka', 'przed startem: ' + q);
    A.ustawStan({ ruszyla: true });
    for (const q of ['co to za akcja', 'ile już km', 'ile km w akcji', 'jak dołączyć', 'jak dołączyć do akcji', 'kim jest Fabianek']) {
      const r = R.dopasuj(q, '2026-11-07');
      assert.equal(r.log, 'zagadka', q); assert.equal(r.zdanie, A.PO_STARCIE);
      assert.ok(R.zagadkaKandydat(q), 'EF pobierze stan akcji dla: ' + q);
    }
    for (const q of ['ile przebiegłem w tym miesiącu', 'ile mam km w tym tygodniu', 'jak dołączyć do trenera']) {
      assert.notEqual((R.dopasuj(q, '2026-11-07') || {}).log, 'zagadka', q);
    }
    assert.match(A.PO_STARCIE, /liczy się sam/, 'odpowiedź mówi, jak dołączyć');
  } finally { A.ustawStan({ ruszyla: false }); }
  assert.match(czytaj('supabase/functions/okienko/index.ts'), /if \(AK && zagadkaKandydat\(tekst\)\)/);
});

test('„Dołącz" → index.html#dolacz: bez hero, zakładka Rejestracja (klik, bo switchTab czyta event.target)', () => {
  const ix = czytaj('index.html');
  assert.match(ix, /const seenHero = localStorage\.getItem\('biegamy_seen_landing'\) \|\| location\.hash === '#dolacz';/);
  assert.match(ix, /if \(location\.hash === '#dolacz'\) \{[^}]*document\.querySelector\('\.tab\[onclick\*="register"\]'\);\s*if \(zakladka\) zakladka\.click\(\);/);
  assert.match(czytaj('dla-fabianka.html'), /href="index\.html#dolacz"/);
});

test('zapis nowego treningu czyści pamięć sumy akcji', () => {
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function saveLog()'), f = z.slice(i, z.indexOf('\n}\n', i));
  assert.match(f, /sessionStorage\.removeItem\('bm_akcja_stan_' \+ window\.BM_AKCJA_CYTATY\.slugDla\(_athleteId\)\)/);
});
