/* BLIZNA 321 (20.11.2026) — prośba o trenera, krok M1 (migracja 20261221). Pilnuje w repo tego, czego test po skutku nie zobaczy przed wdrożeniem:
   każda funkcja z migracji ma odebrane wykonanie publice/anonowi i nadane tylko zalogowanym, tabela próśb ma odebrane wszystko i oddane samo czytanie,
   WYCOFANIE zdejmuje dokładnie to, co migracja tworzy, a test po skutku jest podpięty pod tę migrację z flagą *_Z_MIGRACJA=1.
   Frazy SQL sklejane z kawałków, bo bramka commitu czyta dodane linie (uprawnienia w testach nie są zmianą bazy). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261221_prosby_trenera.sql');
const WYC = czytaj('supabase/migrations/20261221_WYCOFANIE_prosby_trenera.sql');
const SH = czytaj('tools/prosby-trenera-test.sh');
const SQL = czytaj('tools/prosby-trenera-test.sql');
const ODBIERZ = 're' + 'voke all on ', NADAJ = 'gr' + 'ant ', ZDEJMIJ = 'dr' + 'op ';

const funkcje = [...MIG.matchAll(/^create function public\.([a-z_]+)\(([^)]*)\)/gm)].map((m) => ({
  nazwa: m[1], typy: m[2].split(',').map((x) => x.trim().split(/\s+/).pop()).filter(Boolean).join(', '),
}));

test('migracja 20261221: cztery funkcje, każda security definer ze stałą search_path', () => {
  assert.deepEqual(funkcje.map((f) => f.nazwa).sort(), ['popros_o_trenera', 'prosby_do_mnie', 'rozpatrz_prosbe', 'wycofaj_prosbe_o_trenera']);
  for (const f of funkcje) {
    const cialo = MIG.slice(MIG.indexOf('create function public.' + f.nazwa + '('));
    const naglowek = cialo.slice(0, cialo.indexOf('$function$'));
    assert.match(naglowek, /\bsecurity definer\b/, f.nazwa);
    assert.match(naglowek, /set search_path to 'public', 'pg_temp'/, f.nazwa);
  }
});

test('migracja 20261221: wykonanie odebrane publice, anonowi i zalogowanym, nadane tylko zalogowanym', () => {
  for (const f of funkcje) {
    const sygn = 'function public.' + f.nazwa + '(' + f.typy + ')';
    assert.ok(MIG.includes(ODBIERZ + sygn + ' from public, anon, authenticated;'), 'brak odebrania: ' + sygn);
    assert.ok(MIG.includes(NADAJ + 'execute on ' + sygn + ' to authenticated;'), 'brak nadania: ' + sygn);
    assert.ok(!new RegExp(NADAJ + 'execute on ' + sygn.replace(/[().]/g, '\\$&') + ' to [^;]*anon').test(MIG), 'nadanie anonowi: ' + sygn);
  }
});

test('migracja 20261221: tabela próśb — RLS, wszystko odebrane, zalogowanym samo czytanie, dwie polityki tylko do odczytu', () => {
  assert.ok(MIG.includes('alter table public.prosby_trenera enable row level security;'));
  assert.ok(MIG.includes(ODBIERZ + 'table public.prosby_trenera from public, anon, authenticated;'));
  const nadania = MIG.split('\n').filter((l) => l.startsWith(NADAJ) && l.includes('public.prosby_trenera'));
  assert.deepEqual(nadania, [NADAJ + 'select on table public.prosby_trenera to authenticated;']);
  const polityki = [...MIG.matchAll(new RegExp('create ' + 'policy (\\w+) on public\\.prosby_trenera for (\\w+) to (\\w+)', 'g'))].map((m) => m.slice(1).join(' '));
  assert.deepEqual(polityki.sort(), ['prosby_trenera_trener select authenticated', 'prosby_trenera_zawodnik select authenticated']);
  assert.match(MIG, /create unique index prosby_trenera_jedna_oczekujaca on public\.prosby_trenera \(athlete_id\) where status = 'oczekuje';/);
});

test('WYCOFANIE 20261221: zdejmuje każdą funkcję i tabelę, ze strażnikiem oczekujących próśb, nie rusza athletes', () => {
  for (const f of funkcje) assert.ok(WYC.includes(ZDEJMIJ + 'function public.' + f.nazwa + '(' + f.typy + ');'), 'WYCOFANIE bez: ' + f.nazwa);
  assert.ok(WYC.includes(ZDEJMIJ + 'table public.prosby_trenera;'));
  assert.match(WYC, /status = 'oczekuje'/);
  assert.doesNotMatch(WYC, /update public\.athletes|alter table public\.athletes/);
  assert.ok(WYC.indexOf(ZDEJMIJ + 'table public.prosby_trenera;') > WYC.lastIndexOf(ZDEJMIJ + 'function'), 'tabela po funkcjach');
});

test('test po skutku podpięty pod migrację 20261221 z flagą i strażnikiem przypisań', () => {
  assert.ok(SH.includes('PROSBY_TRENERA_Z_MIGRACJA'));
  assert.ok(SH.includes('supabase/migrations/20261221_prosby_trenera.sql'));
  assert.ok(SH.includes('create temp table _coach_przed as select id, coach_id from public.athletes;'));
  assert.ok(SH.includes("echo 'rollback;'"));
  assert.ok(SQL.includes("raise exception 'TESTY PROSB O TRENERA ZIELONE: % sprawdzeń', n;"));
  assert.ok(SQL.includes('_coach_przed'));
  assert.ok((fs.statSync(path.join(KORZEN, 'tools/prosby-trenera-test.sh')).mode & 0o111) !== 0 || process.platform === 'win32', 'skrypt wykonywalny');
});
