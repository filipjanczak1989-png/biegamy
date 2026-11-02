/* BLIZNA 102 (2.11.2026) — PROJEKT F dzień 5, część z bazą: pushe (start / niedziela / zamknięcie), zamknięcie doby, dotarcie
   wyprawy. Zachowanie na żywej bazie: tools/akcja-dzien5-test.sh (12 asercji, rollback). Tu tekst migracji i EF akcja-push.
   Pilnuje: push startu i zamknięcia RAZ (flaga zajmowana przed wysyłką), niedziela BEZ KWOT (rozliczenie jednorazowe),
   próba tylko do kont testowych, nazwa akcji z bazy (kod bez imienia), sekret obowiązkowy, zamykanie tylko service_role. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SQL = czytaj('supabase/migrations/20261102_akcja_dzien5.sql').replace(/--[^\n]*/g, '');
const EF = czytaj('supabase/functions/akcja-push/index.ts');

test('migracja: zamknięcie tylko service_role, koniec = wczoraj przy sumie >= cel, wyzwalacz pushu startu raz, crony', () => {
  assert.match(SQL, /grant execute on function public\.akcja_zamknij_dobe\(\) to service_role;/);
  assert.doesNotMatch(SQL, /grant[^;]*akcja_zamknij_dobe[^;]*authenticated/i);
  assert.match(SQL, /if v_suma >= a\.cel_km then\s+update public\.akcje set koniec = v_wczoraj where id = a\.id and koniec is null;/);
  assert.match(SQL, /if old\.wystartowala_at is null and new\.wystartowala_at is not null and new\.push_start_at is null then/);
  assert.match(SQL, /cron\.schedule\('akcja-zamkniecie', '15 23 \* \* \*'/);
  assert.match(SQL, /cron\.schedule\('akcja-niedziela', '0 18 \* \* 0'/);
  assert.match(SQL, /push_start_at = null, push_zamkniecie_at = null/, 'reset próby czyści flagi');
  assert.doesNotMatch(SQL, /\bgrant\b[^;]*\banon\b/i);
  assert.ok(czytaj('supabase/migrations/20261102_WYCOFANIE_akcja_dzien5.sql').includes("cron.unschedule('akcja-niedziela')"));
});

test('EF akcja-push: sekret obowiązkowy, RAZ, niedziela bez kwot, próba tylko testowym, kod bez imienia', () => {
  assert.match(EF, /if \(!want \|\| \(req\.headers\.get\("x-push-secret"\) \|\| ""\) !== want\) return J\(401/);
  assert.match(EF, /update\(\{ push_start_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", a\.id\)\.is\("push_start_at", null\)/);
  assert.match(EF, /update\(\{ push_zamkniecie_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", a\.id\)\.is\("push_zamkniecie_at", null\)/);
  assert.match(EF, /if \(a\.testowa\) return \(a\.konta_testowe \|\| \[\]\)\.slice\(\);/);
  const niedziela = EF.slice(EF.indexOf('body.rodzaj === "niedziela"'), EF.lastIndexOf('return J(400'));
  assert.doesNotMatch(niedziela, /zł|gr\b|kwot/, 'push niedzielny z kwotą — rozliczenie jest jednorazowe');
  assert.match(EF, /`Ruszyło\. \$\{a\.nazwa \|\| "Akcja"\}\. Każdy kilometr się liczy\.`/);
  assert.doesNotMatch(EF, /fabian|borowczyk/i);
  assert.match(czytaj('supabase/config.toml'), /\[functions\.akcja-push\]\nverify_jwt = false/);
});

test('start-akcji: „Dotarliśmy" włączony razem z migracją (RPC akcja_dotarlismy), podwójne dotknięcie', () => {
  const h = czytaj('start-akcji.html');
  assert.match(h, /var DOTARCIE_GOTOWE = true;/, 'migracja dnia 5 na prod — przycisk włączony');
  assert.match(h, /window\.sb\.rpc\('akcja_dotarlismy', \{ p_slug: SLUG \}\)/);
  assert.match(h, /Date\.now\(\) - uzbrojony > 3000/);
});
