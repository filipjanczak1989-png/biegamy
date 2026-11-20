/* BLIZNA 315 / 20.11: zwiad końca biegu — cron akcja-bieg-przypomnienie (migracja 20261128) NIE był na produkcji, więc jedyny e-mail biegu (3.12) by nie wyszedł.
   Test po skutku przed wdrożeniem crona: tools/akcja-bieg-przypomnienie-cron-test.sh (AKCJA_BIEG_CRON_Z_MIGRACJA=1): jedno zadanie, plan 7:00/7:20/7:40 UTC, prawdziwa
   funkcja bez ?test=1, sekret z vault, timeout 150 s, strefa crona UTC, dziś zero odbiorców i próba w szkicu (inaczej cron wysłałby próbie), 3.12 tylko bieg-mikolajki. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('test po skutku crona przypomnienia: flaga, transakcja wycofana, sprawdzenia polecenia i odbiorców; migracja bez zmian', () => {
  const sh = czytaj('tools/akcja-bieg-przypomnienie-cron-test.sh'), sq = czytaj('tools/akcja-bieg-przypomnienie-cron-test.sql'), mig = czytaj('supabase/migrations/20261128_akcja_bieg_przypomnienie_cron.sql');
  assert.match(sh, /if \[ "\$\{AKCJA_BIEG_CRON_Z_MIGRACJA:-0\}" = 1 \]; then tr -d '\\r' < supabase\/migrations\/20261128_akcja_bieg_przypomnienie_cron\.sql/);
  assert.match(sh, /echo 'rollback;'/); assert.doesNotMatch(sh, /echo 'commit;'/);
  assert.doesNotMatch(sq, /net\.http_post/, 'test nie woła funkcji');
  for (const w of ["j.schedule <> '0,20,40 7 * * *'", "'?test'", "'timeout_milliseconds := 150000'", "current_setting('cron.timezone', true)", "slug = 'proba-bieg' and status <> 'szkic'",
    "timestamptz '2026-12-03 08:05 Europe/Warsaw'", "x->>'koniec_godz' is distinct from '20:00'", "raise exception 'TESTY CRONA PRZYPOMNIENIA ZIELONE: % sprawdzeń', n;"]) assert.ok(sq.includes(w), w);
  assert.match(mig, /select cron\.schedule\('akcja-bieg-przypomnienie', '0,20,40 7 \* \* \*', \$job\$/);
  assert.match(mig, /url     := 'https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/functions\/v1\/bieg-przypomnienie',/);
  assert.match(mig, /timeout_milliseconds := 150000\);/);
});
