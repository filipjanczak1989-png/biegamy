/* BLIZNA 318 / 20.11: crony akcja-wyprawa-slad (co 15 min) i morning-brief-hourly (co godzinę) wołały EF przez net.http_post bez timeout_milliseconds — pg_net czekał
   domyślne 5 s i zapisywał „Timeout of 5000 ms” (24 h: 30 z 44 wpisów net._http_response), choć funkcje kończyły pracę. Migracja 20261220: timeout 150 s (ślad wyprawy)
   i 60 s (brief; odczyt: powiadomienia 5–17 s po godzinie), kotwicą w poleceniu crona przez cron.alter_job. Każde nowe wywołanie EF z crona ma mieć timeout_milliseconds. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('migracja 20261220: dwie kotwice z timeoutem, wycofanie odwrotnie, bramki; test po skutku z flagą', () => {
  const m = czytaj('supabase/migrations/20261220_crony_timeout_pg_net.sql'), w = czytaj('supabase/migrations/20261220_WYCOFANIE_crony_timeout_pg_net.sql');
  const pary = (s) => [...s.matchAll(/\('([a-z-]+)', \$k\$([^\n]*?)\$k\$, \$k\$([^\n]*?)\$k\$\)/g)].map((x) => [x[1], x[2], x[3]]);
  const pm = pary(m), pw = pary(w);
  assert.deepEqual(pm, [
    ['akcja-wyprawa-slad', `body    := '{"rodzaj":"odswiez"}'::jsonb);`, `body    := '{"rodzaj":"odswiez"}'::jsonb, timeout_milliseconds := 150000);`],
    ['morning-brief-hourly', `body    := '{}'::jsonb`, `body    := '{}'::jsonb, timeout_milliseconds := 60000`]]);
  assert.deepEqual(pw, pm.map(([n, a, b]) => [n, b, a]).reverse());
  assert.match(m, /if position\('timeout_milliseconds' in j\.command\) > 0 then raise exception/, 'drugie uruchomienie odmawia');
  assert.match(m, /perform cron\.alter_job\(j\.jobid, command := replace\(j\.command, r\.kotwica, r\.nowe\)\);/, 'tylko polecenie, plan i aktywność bez zmian');
  const sh = czytaj('tools/crony-timeout-test.sh');
  assert.match(sh, /if \[ "\$\{CRONY_TIMEOUT_Z_MIGRACJA:-0\}" = 1 \]; then tr -d '\\r' < supabase\/migrations\/20261220_crony_timeout_pg_net\.sql/);
  assert.match(sh, /create temp table _cron_przed as select jobname, schedule, command, active from cron\.job;/); assert.match(sh, /echo 'rollback;'/);
  assert.match(czytaj('tools/crony-timeout-test.sql'), /raise exception 'TESTY TIMEOUTOW CRONOW ZIELONE: % sprawdzeń', n;/);
});

test('każde cron.schedule z net.http_post w migracjach od 20261128 ma timeout_milliseconds (bieg-przypomnienie: 150 s)', () => {
  const dir = path.join(KORZEN, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x >= '20261128' && !/WYCOFANIE/.test(x) && x.endsWith('.sql'))) {
    const s = czytaj('supabase/migrations/' + f);
    for (const blok of s.split(/select cron\.schedule\(/i).slice(1)) {
      const cialo = blok.slice(0, blok.indexOf('$job$);') > 0 ? blok.indexOf('$job$);') : 400);
      if (/net\.http_post/i.test(cialo)) assert.match(cialo, /timeout_milliseconds := \d+/, f + ': cron z net.http_post bez timeout_milliseconds');
    }
  }
});
