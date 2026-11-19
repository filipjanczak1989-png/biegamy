/* BLIZNA 308 / 19.11: migracja 20261217 (regulamin v7, front: blizna-307). Jednoliniowe kotwice, wycofanie = te same pary odwrotnie, bramki danych bieg-mikolajki,
   migracja nikogo nie cofa; test po skutku tools/akcja-bieg-v7-test.sh z flagą AKCJA_BIEG_V7_Z_MIGRACJA=1 przed wdrożeniem. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('migracja 20261217: jednoliniowe kotwice, wycofanie = te same pary odwrotnie; bramki danych; test po skutku z flagą', () => {
  const pary = (s) => [...s.matchAll(/\((\d+), '(public\.[^']+)',\n\s+\$k\$([^\n]*?)\$k\$,\n\s+\$k\$([^\n]*?)\$k\$\)/g)].map((m) => [m[2], m[3], m[4]]);
  const m = czytaj('supabase/migrations/20261217_akcja_bieg_v7_czas_wymagany.sql'), w = czytaj('supabase/migrations/20261217_WYCOFANIE_akcja_bieg_v7_czas_wymagany.sql');
  const pm = pary(m), pw = pary(w);
  assert.equal(pm.length, 11); assert.deepEqual(pw, pm.map(([f, a, b]) => [f, b, a]).reverse());
  assert.match(m, /if b\.regulamin_wersja not in \('2026-11-v6', '2026-11-v7'\) then raise exception/);
  assert.match(m, /update public\.akcja_biegi set regulamin_wersja = '2026-11-v7', regulamin_od = v_dzis where id = b\.id and regulamin_wersja = '2026-11-v6';/);
  assert.doesNotMatch(m, /akcja_bieg_wynik_wyczysc|akcja_bieg_przelicz\(|set ukonczony_at = null where/, 'migracja nikogo nie cofa');
  assert.match(w, /update public\.akcja_biegi set regulamin_wersja = '2026-11-v6', regulamin_od = date '2026-11-19' where slug = 'bieg-mikolajki' and regulamin_wersja = '2026-11-v7';/);
  assert.match(w, /alter table public\.akcja_bieg_uczestnicy drop column wynik_usuniete_treningi;/);
  const sh = czytaj('tools/akcja-bieg-v7-test.sh');
  assert.match(sh, /if \[ "\$\{AKCJA_BIEG_V7_Z_MIGRACJA:-0\}" = 1 \]; then tr -d '\\r' < supabase\/migrations\/20261217_akcja_bieg_v7_czas_wymagany\.sql/);
  assert.match(sh, /create temp table _ukonczeni_przed as select count\(\*\)/); assert.match(sh, /echo 'rollback;'/);
  assert.match(czytaj('tools/akcja-bieg-v7-test.sql'), /raise exception 'TESTY V7 ZIELONE: % sprawdzeń', n;/);
});
