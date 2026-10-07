// Blizna #42 (07.10.2026) — gra Janusz Run SKASOWANA; pilnujemy, żeby nie wróciła po kawałku.
//
// Decyzja Filipa 7.10, wzorzec 1:1 jak Bieguś (blizna-41). Zmierzone na prod przed kasacją: 1 gracz
// (Filip, konto 12.05.2026, dzień 1, ostatnia aktywność 13.05), jr_runs 37 bez completed_at,
// 4 osiągnięcia, 0 akcji/zdarzeń/bonusów; janusz.html NIELINKOWANA z żadnej strony, nie w SW ani
// manifeście. gra.html („BiegaMy: Wyzwanie", game_scores) to OSOBNA gra — zostaje.
// Faza 1 (ten commit): janusz.html → przekierowanie, js/janusz/ i assets/janusz/ poza repo, CLAUDE.md
// bez opisu silnika. Faza 2 (osobny commit): migracja drop 13 funkcji + 11 tabel jr_* po backupie,
// delete_my_account bez jr_players PRZED dropem.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const istnieje = (f) => fs.existsSync(path.join(KORZEN, f));
const bezKomentarzy = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('kod: janusz.html to samo przekierowanie z nagrobkiem, bez silnika i bez jr_', () => {
  const pelny = czytaj('janusz.html');
  assert.ok(pelny.length < 4000, 'janusz.html ma ' + pelny.length + ' B — to nie jest przekierowanie');
  assert.match(pelny, /NAGROBEK \(07\.10\.2026\)/);
  const b = bezKomentarzy(pelny);
  assert.match(b, /<meta http-equiv="refresh" content="0; url=zawodnik\.html">/);
  assert.match(b, /location\.replace\("zawodnik\.html"\)/);
  for (const wz of [/js\/janusz/, /assets\/janusz/, /jr_[a-z_]+/, /supabase\.co|sb_publishable_/, /localStorage/]) {
    assert.doesNotMatch(b, wz, 'ślad gry w przekierowaniu: ' + wz);
  }
});

test('kod: żaden śledzony plik poza przekierowaniem nie odwołuje się do gry (js/janusz, assets/janusz, jr_, janusz.html)', () => {
  const pliki = execSync('git ls-files "*.html" "*.js" "*.mjs" "*.ts" "*.json"', { cwd: KORZEN }).toString()
    .split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('tests/') && x !== 'janusz.html' && !x.startsWith('js/janusz/'));
  const slady = [];
  for (const f of pliki) {
    const s = bezKomentarzy(czytaj(f));
    for (const m of s.matchAll(/js\/janusz|assets\/janusz|janusz\.html|\bjr_[a-z_]+/g)) {
      const linia = s.slice(0, m.index).split('\n').length;
      slady.push(f + ':~' + linia + ' ' + s.split('\n')[linia - 1].trim().slice(0, 90));
    }
  }
  assert.deepEqual(slady, [], 'wejścia do gry wróciły:\n' + slady.join('\n'));
});

test('kod: CLAUDE.md nie opisuje silnika gry, która nie istnieje, i nie nazywa gra.html Januszem', () => {
  const c = czytaj('CLAUDE.md');
  assert.doesNotMatch(c, /Janusz Run Game Engine/);
  assert.doesNotMatch(c, /gra\.html.*Janusz Run game/);
  assert.match(c, /Removed games \(tombstones\)/);
});

test('pliki: js/janusz/ i assets/janusz/ są poza drzewem (operacja masowa, wykonana świadomie)', () => {
  const zostaly = ['js/janusz', 'assets/janusz'].filter(istnieje);
  assert.deepEqual(zostaly, [], 'pliki gry nadal w drzewie: ' + zostaly.join(', '));
  assert.ok(istnieje('gra.html'), 'gra.html (BiegaMy: Wyzwanie) to osobna gra — ma zostać');
  assert.ok(istnieje('assets/modele/auto.glb') && istnieje('assets/ui/logo-bm-but.webp'), 'skasowane za dużo');
});

test('faza 2: migracja kasacji zmienia delete_my_account PRZED dropem i kasuje dzieci przed rodzicami', () => {
  const m = czytaj('supabase/migrations/20261007_kasacja_janusz_run_baza.sql').replace(/\r/g, '');
  const bez = m.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  const iDma = bez.indexOf('CREATE OR REPLACE FUNCTION public.delete_my_account()');
  const iFn = bez.indexOf('drop function if exists public.jr_');
  const iTab = bez.indexOf('drop table if exists public.jr_');
  assert.ok(iDma > 0 && iFn > iDma && iTab > iFn, 'kolejność: delete_my_account → funkcje → tabele');
  assert.doesNotMatch(bez.slice(iDma, iFn), /DELETE FROM public\.jr_players/, 'delete_my_account nadal woła jr_players — po drop każde usunięcie konta = 42P01');
  assert.match(bez, /DELETE FROM public\.radio_likes\s+WHERE user_id\s+= v_uid;/, 'reszta delete_my_account ma zostać 1:1');
  const dropy = [...bez.matchAll(/drop table if exists public\.(jr_[a-z_]+);/g)].map((x) => x[1]);
  assert.equal(dropy.length, 11, '11 tabel jr_*');
  const poz = (t) => dropy.indexOf(t);
  assert.ok(poz('jr_equipment') < poz('jr_athletes') && poz('jr_runs') < poz('jr_athletes') && poz('jr_events_log') < poz('jr_athletes'), 'dzieci jr_athletes przed nią');
  assert.ok(poz('jr_athletes') < poz('jr_players') && poz('jr_achievements') < poz('jr_players') && poz('jr_workout_bonuses') < poz('jr_players'), 'dzieci jr_players przed nią');
  assert.equal((bez.match(/drop function if exists public\.jr_/g) || []).length, 13, '13 funkcji jr_* (zmierzone na prod 7.10)');
  const w = czytaj('supabase/migrations/20261007_WYCOFANIE_kasacja_janusz_run_baza.sql');
  assert.ok(!/grant\s+[^;]*\bto\s+anon\b/i.test(w), 'WYCOFANIE nadaje coś anonowi — na prod EXECUTE dla anon był skutkiem default privileges, nie decyzją');
  assert.equal((w.match(/create table if not exists public\.jr_/g) || []).length, 11);
  assert.ok(w.indexOf('create table if not exists public.jr_players') < w.indexOf('create table if not exists public.jr_athletes'), 'wycofanie: rodzice przed dziećmi');
  assert.match(czytaj('tools/backup-janusz-run.sql'), /jsonb_agg\(to_jsonb\(x\)\) as jr_runs_backup/);
});
