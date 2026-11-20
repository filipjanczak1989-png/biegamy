/* BLIZNA 324 (20.11.2026) — bramka commitu i rola anon w LIŚCIE ról. Do tego dnia wzorce wymagały `TO anon` / `FROM anon` zaraz po
   słowie kluczowym, więc (a) nadanie `… TO authenticated, anon` schodziło do zwykłego GRANT/REVOKE — w CI ostrzeżenie zamiast czerwonego
   runu, (b) odebranie `… FROM public, anon, authenticated` nie domykało pary z CREATE TABLE i bramka ostrzegała o tabeli bez odebranych
   praw anona, choć prawa w bazie były dobre (migracja 20261221). Frazy SQL sklejane z kawałków: test czyta bramka, a ona czyta dodane linie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sprawdz } = require('../tools/bramka-commit.js');

const G = 'gra' + 'nt ', R = 'rev' + 'oke ', CT = 'cre' + 'ate table ';
const L = (linie, tryb) => sprawdz({ pliki: [], dodane: linie }, tryb || 'hook');
const twarda = (w) => w.blokady.some((b) => b.ciBlokada);
const bezPary = (w) => w.ostrzezenia.some((o) => o.obiektAnon);

test('GRANT dla anona w liście ról → twarda blokada (czerwony run w CI)', () => {
  assert.ok(twarda(L([G + 'select on public.tab_x to authenticated, anon;'], 'ci')));
  assert.ok(twarda(L([G + 'execute on function public.f(uuid) to service_role,anon;'], 'ci')));
  assert.ok(twarda(L([G + 'all on table public.tab_x to postgres, authenticated , anon ;'], 'ci')));
  assert.ok(twarda(L([G + 'serwisowa to authenticated, anon;'], 'ci')), 'członkostwo w roli');
  assert.ok(twarda(L([G + 'select on public.tab_x to anon;'], 'ci')), 'pojedynczy anon jak dotąd');
});

test('GRANT … TO public (także w liście, każdą wielkością liter) → twarda jak TO anon; schemat public w ON i obiekt public.x nie', () => {
  assert.ok(twarda(L([G + 'execute on function public.f(uuid) to public;'], 'ci')));
  assert.ok(twarda(L([G + 'select on public.tab_x to authenticated, PUBLIC;'], 'ci')));
  assert.ok(twarda(L([G + 'serwisowa to public;'], 'ci')), 'członkostwo w roli');
  assert.ok(!twarda(L([G + 'usage on schema public to authenticated;'], 'ci')));
  assert.ok(!twarda(L([G + 'select on public.tab_x to authenticated;'], 'ci')));
  const tab = CT + 'public.tab_x (id uuid primary key);';
  assert.ok(bezPary(L([tab, R + 'all on table public.tab_x from public;'])), 'FROM public nie domyka pary — anon ma nadanie wprost');
});

test('bez anona w liście → nie twarda; nazwa obiektu i rola anon_x to nie anon', () => {
  assert.ok(!twarda(L([G + 'select on public.tab_x to authenticated, service_role;'], 'ci')));
  assert.ok(!twarda(L([G + 'select on public.anon_log to authenticated;'], 'ci')));
  assert.ok(!twarda(L([G + 'select on public.tab_x to anon_x;'], 'ci')));
});

test('CREATE TABLE + REVOKE … FROM <lista z anonem> domyka parę; bez anona w liście — ostrzeżenie zostaje', () => {
  const tab = CT + 'public.tab_x (id uuid primary key);';
  assert.ok(!bezPary(L([tab, R + 'all on table public.tab_x from public, anon, authenticated;'])));
  assert.ok(!bezPary(L([tab, R + 'all on public.tab_x from anon;'])), 'pojedynczy anon jak dotąd');
  assert.ok(bezPary(L([tab, R + 'all on table public.tab_x from public, authenticated;'])));
  assert.ok(bezPary(L([tab, R + 'all on table public.tab_x from anon_x;'])));
  assert.ok(bezPary(L([tab, R + 'all on table public.inna from public, anon;'])), 'inny obiekt nie gasi');
});

test('migracja 20261221 (prośby o trenera) nie daje już ostrzeżenia o tabeli bez odebranych praw anona', () => {
  const linie = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261221_prosby_trenera.sql'), 'utf8').replace(/\r/g, '').split('\n');
  const w = sprawdz({ pliki: [], dodane: linie, wPlikach: [{ plik: 'supabase/migrations/20261221_prosby_trenera.sql', linie }] }, 'hook');
  assert.ok(!bezPary(w));
  assert.ok(!twarda(w), 'migracja nie nadaje nic anonowi');
});
