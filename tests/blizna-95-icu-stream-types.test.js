/* BLIZNA 95 (2.11.2026) — pomiar do decyzji o mapkach: stream_types i trainer z intervals.icu w training_logs.
   Decyzja Filipa z 24.08: trasy wracają, gdy udział aktywności ze śladem > 50%. Bez tych pól warunek jest
   niepoliczalny (docs/dzis-najpierw-dane-zwiad.md). Tylko zapis — zero tras, zero UI.
   Pilnuje: jedna para helperów we wspólnym module (sync i webhook to świadomy duplikat mapowania — oba muszą pisać),
   NULL zamiast zgadywania przy braku pola, wzbogacony wpis ręczny też niesie pomiar, migracja kolumn istnieje. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

test('helpery: tablica strumieni albo null; trainer tylko jawny boolean', async () => {
  const M = await zaladuj('supabase/functions/_shared/typ-aktywnosci.mjs');
  assert.deepEqual(M.strumienieAktywnosci({ stream_types: ['time', 'latlng', 'heartrate'] }), ['time', 'latlng', 'heartrate']);
  assert.equal(M.strumienieAktywnosci({}), null);
  assert.equal(M.strumienieAktywnosci({ stream_types: [] }), null);
  assert.equal(M.strumienieAktywnosci({ stream_types: 'latlng' }), null);
  assert.equal(M.strumienieAktywnosci(null), null);
  assert.deepEqual(M.strumienieAktywnosci({ stream_types: [' latlng ', 7, '', null] }), ['latlng']);
  assert.equal(M.strumienieAktywnosci({ stream_types: Array(60).fill('x'.repeat(50)) }).length, 40);
  assert.equal(M.strumienieAktywnosci({ stream_types: ['x'.repeat(50)] })[0].length, 32);
  assert.equal(M.trenazerAktywnosci({ trainer: true }), true);
  assert.equal(M.trenazerAktywnosci({ trainer: false }), false);
  assert.equal(M.trenazerAktywnosci({}), null);
  assert.equal(M.trenazerAktywnosci({ trainer: 'true' }), null);
});

test('sync i webhook: oba importują helpery i zapisują obie kolumny', () => {
  for (const ef of ['intervals-sync', 'intervals-webhook']) {
    const kod = czytaj(`supabase/functions/${ef}/index.ts`);
    assert.match(kod, /import \{[^}]*strumienieAktywnosci[^}]*trenazerAktywnosci[^}]*\} from '\.\.\/_shared\/typ-aktywnosci\.mjs'/, ef);
    assert.match(kod, /icu_stream_types: strumienieAktywnosci\(a\)/, ef);
    assert.match(kod, /icu_trainer: trenazerAktywnosci\(a\)/, ef);
    assert.doesNotMatch(kod, /\/activity\/\$\{[^}]+\}\/map/, ef + ': pobiera trasę — to tylko pomiar');
  }
});

test('wzbogacenie wpisu ręcznego przenosi pomiar', async () => {
  const K = await zaladuj('supabase/functions/_shared/kolizja-importu.mjs');
  assert.ok(K.POLA_WZBOGACENIA.includes('icu_stream_types') && K.POLA_WZBOGACENIA.includes('icu_trainer'));
  const w = K.zbudujWzbogacenie({ external_id: '1', icu_stream_types: ['latlng'], icu_trainer: false, distance_km: 5 });
  assert.deepEqual(w.icu_stream_types, ['latlng']);
  assert.equal(w.icu_trainer, false);
  assert.equal(w.distance_km, undefined, 'dystans człowieka wygrywa z telemetrią');
});

test('migracja kolumn i wycofanie istnieją; kolejność wdrożenia zapisana', () => {
  const m = czytaj('supabase/migrations/20261102_icu_stream_types.sql');
  assert.match(m, /add column icu_stream_types text\[\];/);
  assert.match(m, /add column icu_trainer boolean;/);
  assert.match(m, /PRZED wdrożeniem intervals-sync i intervals-webhook/);
  const w = czytaj('supabase/migrations/20261102_WYCOFANIE_icu_stream_types.sql');
  assert.match(w, /NAJPIERW cofnąć intervals-sync i intervals-webhook/);
});
