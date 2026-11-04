/* BLIZNA 104 (2.11.2026, Filip 18:30) — „jak dołączyć" w okienku NIGDY nie idzie do sieci.
   Zwiad dnia 6: przed startem „jak dołączyć" trafiało do internetu (kluby biegowe, reddit). Teraz:
   przed startem → odpowiedź z katalogu o rejestracji w aplikacji (bez słowa o akcji) + przycisk do rejestracji;
   po starcie → zagadka/karta akcji (bez zmian). Router odpowiada sam (0 tokenów) — sieć nie ma szansy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const PYTANIA = ['jak się zapisać', 'jak dołączyć do biegamy', 'jak się zarejestrować', 'jak założyć konto'];   // gołe „jak dołączyć” od 4.11 to zdanie akcji (blizna-158)

test('przed startem: rejestracja w aplikacji, bez słowa o akcji; po starcie: zagadka akcji', async () => {
  const R = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/okienko/router.mjs')).href);
  const A = globalThis.BM_AKCJA_CYTATY;
  try {
    A.ustawStan({ ruszyla: false });
    for (const q of PYTANIA) {
      const r = R.dopasuj(q, '2026-11-06');
      assert.ok(r && r.log === 'rejestracja', 'przed startem → rejestracja: ' + q);
      assert.ok(R.zagadkaKandydat(q), 'EF pobiera stan akcji dla: ' + q);
      const k = r.karty[0];
      assert.equal(k.typ, 'kat_pojecie'); assert.equal(k.dane.cel, 'index.html#dolacz');
      assert.doesNotMatch(r.zdanie + ' ' + k.dane.tytul + ' ' + k.dane.co_to, /akcj|fabian|12 ?500|7\.11|kilometr\w* dla/i, 'bez zdradzania akcji');
    }
    A.ustawStan({ ruszyla: true });
    for (const q of PYTANIA) { const r = R.dopasuj(q, '2026-11-07'); assert.equal(r.log, 'zagadka', 'po starcie → karta akcji: ' + q); assert.equal(r.zdanie, A.PO_STARCIE); }
    for (const q of ['jak dołączyć do trenera', 'jak zapisać trening', 'jak zapisać bieg']) {
      A.ustawStan({ ruszyla: false }); assert.notEqual((R.dopasuj(q, '2026-11-06') || {}).log, 'rejestracja', q);
    }
  } finally { A.ustawStan({ ruszyla: false }); }
});

test('EF: odpowiedź routera ze zdaniem zwraca karty routera i kończy pytanie PRZED siecią', () => {
  const ef = czytaj('supabase/functions/okienko/index.ts');
  const iRouter = ef.indexOf('const traf = dopasuj(tekst, dzis);'), iSiec = ef.indexOf('zapytajSiec(');
  assert.ok(iRouter > 0 && iSiec > iRouter, 'router przed siecią');
  assert.match(ef, /if \(Array\.isArray\(\(traf as \{ karty\?: unknown\[\] \}\)\.karty\)\) kartyZd = /);
  assert.match(ef, /if \(traf && "zdanie" in traf\) \{[\s\S]*?return odp\(200, \{ \.\.\.pusto\("router"\), zdania: \[traf\.zdanie\], karty: kartyZd, chipy: \(traf as \{ chipy\?: unknown\[\] \}\)\.chipy \|\| \[\] \}\);/);   // 3.11: + chipy (blizna-112)
});

test('klient: przycisk karty prowadzi do rejestracji (biała lista celu), katalog zna to samo zdanie', async () => {
  assert.match(czytaj('js/okienko.js'), /if \(url === 'index\.html#dolacz'\) return url;/);
  const kat = czytaj('supabase/functions/okienko/katalog.mjs');
  assert.match(kat, /import \{ ODP_REJESTRACJA \} from "\.\/router\.mjs";/);
  assert.match(kat, /tekst: ODP_REJESTRACJA\.tekst, cel: ODP_REJESTRACJA\.cel/);
  assert.match(czytaj('index.html'), /if \(location\.hash === '#dolacz'\) \{[^}]*\.tab\[onclick\*="register"\]/, 'cel karty otwiera Rejestrację');
});
