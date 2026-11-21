/* BLIZNA 327 (21.11.2026) — odznaki O1 (migracja 20261223). Wyzwalacz achievements_chronione BEFORE INSERT pomija PO CICHU (return null) zapisy
   z przeglądarki odznak nadawanych przez bazę: bieg-*, akcja-sponsor i wszystkie z flagą z_bazy w katalogu. Bez błędu, bo klient wstawia paczką.
   Funkcja BEZ security definer (sprawdza current_user), wykonanie odebrane przeglądarce, WYCOFANIE zdejmuje oba obiekty, test po skutku z flagą.
   Frazy SQL sklejane z kawałków: bramka commitu czyta dodane linie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261223_achievements_chronione.sql');
const WYC = czytaj('supabase/migrations/20261223_WYCOFANIE_achievements_chronione.sql');
const SH = czytaj('tools/odznaki-chronione-test.sh'), SQL = czytaj('tools/odznaki-chronione-test.sql');
const ODBIERZ = 're' + 'voke all on ', ZDEJMIJ = 'dr' + 'op ', DEFINER = 'security ' + 'definer';
const zBazy = (plik) => {
  const m = czytaj(plik).match(/const BADGES\s*=\s*\[[\s\S]*?\n\];/);
  return new Function(m[0] + ' return BADGES;')().filter((b) => b.z_bazy).map((b) => b.id).sort();
};

test('migracja 20261223: BEFORE INSERT, funkcja bez definera ze stałą search_path, wykonanie odebrane, nazwa przed achievements_okno', () => {
  assert.match(MIG, /create trigger achievements_chronione\n  before insert on public\.achievements\n  for each row execute function public\.achievements_chronione\(\);/);
  const i = MIG.indexOf('create function public.achievements_chronione()');
  const naglowek = MIG.slice(i, MIG.indexOf('$function$', i));
  assert.ok(i > 0 && !naglowek.includes(DEFINER) && /set search_path to 'public', 'pg_temp'/.test(naglowek));
  assert.ok(MIG.includes(ODBIERZ + 'function public.achievements_chronione() from public, anon, authenticated;'));
  assert.ok('achievements_chronione' < 'achievements_okno', 'kolejność wyzwalaczy po nazwie');
  assert.doesNotMatch(MIG, /\b(update|delete from|insert into)\s+public\.achievements\b/i, 'migracja nie zmienia odznak');
});

test('migracja 20261223: chronione = bieg-*, akcja-sponsor i odznaki z_bazy z katalogu; pominięcie (return null), nie błąd', () => {
  const cialo = MIG.slice(MIG.indexOf('as $function$'), MIG.lastIndexOf('$function$'));
  assert.ok(cialo.includes("if current_user not in ('authenticated', 'anon') then return new; end if;"));
  const m = cialo.match(/if new\.badge_id like 'bieg-%' or new\.badge_id in \(([^)]*)\) then return null; end if;/);
  assert.ok(m, 'warunek chronionych');
  const lista = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(lista, ['akcja-sponsor', ...zBazy('zawodnik.html')].sort(), 'lista chronionych = akcja-sponsor + z_bazy z katalogu');
  assert.deepEqual(zBazy('zawodnik.html'), zBazy('odznaki.html'));
  assert.doesNotMatch(cialo, /raise exception/, 'błąd wywróciłby paczkę odznak klienta');
});

test('WYCOFANIE 20261223 i test po skutku', () => {
  assert.ok(WYC.includes(ZDEJMIJ + 'trigger achievements_chronione on public.achievements;') && WYC.includes(ZDEJMIJ + 'function public.achievements_chronione();'));
  assert.ok(WYC.indexOf(ZDEJMIJ + 'trigger') < WYC.indexOf(ZDEJMIJ + 'function'));
  assert.ok(SH.includes('ODZNAKI_CHRONIONE_Z_MIGRACJA') && SH.includes('supabase/migrations/20261223_achievements_chronione.sql') && SH.includes("echo 'rollback;'"));
  for (const w of ["raise exception 'TESTY ODZNAK CHRONIONYCH ZIELONE: % sprawdzeń (odznak przed testem: %)'", "FAIL 3a: paczka", "FAIL 5a: funkcja definer", "FAIL 7a: service_role", "FAIL 4a: odznaka z zamkniętego okna"])
    assert.ok(SQL.includes(w), 'test bez: ' + w);
});
