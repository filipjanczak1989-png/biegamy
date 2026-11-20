/* BLIZNA 316 / 20.11 (zwiad końca biegu): po 6.12 20:00 edycja treningu przeliczała wynik (np. poprawa czasu 7.12 zmieniała miejsce), a usunięcie treningu
   zdejmowało ukończenie i dyplom. Migracja 20261219: po końcu (faza zakonczony) wyzwalacze edycji i usunięcia nie ruszają wyniku; trening poprawiony po końcu
   przez osobę nie liczy się do wyniku; przy usunięciu dystans i źródło zostają w wynik_zamrozony (czas z tempa, ranking, dyplom bez zmian). Automat po końcu 24 h
   (było 2 h), tylko dla zapisów bez wyniku, trening z zegarka sprzed końca zsynchronizowany do 24 h. Organizator do zalicz_do bez zmian. Regulamin bez zmian. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('migracja 20261219: 11 jednoliniowych kotwic, wycofanie = te same pary odwrotnie; nowe obiekty bez dostępu z przeglądarki; bez danych', () => {
  const pary = (s) => [...s.matchAll(/\((\d+), '(public\.[^']+)',\n\s+\$k\$([^\n]*?)\$k\$,\n\s+\$k\$([^\n]*?)\$k\$\)/g)].map((m) => [m[2], m[3], m[4]]);
  const m = czytaj('supabase/migrations/20261219_akcja_bieg_zamrozenie_po_koncu.sql'), w = czytaj('supabase/migrations/20261219_WYCOFANIE_akcja_bieg_zamrozenie_po_koncu.sql');
  const pm = pary(m), pw = pary(w);
  assert.equal(pm.length, 11); assert.deepEqual(pw, pm.map(([f, a, b]) => [f, b, a]).reverse());
  const nowe = Object.fromEntries(pm.map(([f, , b], i) => [i + 1, b]));
  assert.match(nowe[1], /and not public\.akcja_bieg_po_koncu\(u\.bieg_id\) loop$/, 'edycja po końcu nie przelicza');
  assert.match(nowe[2], /where auth\.uid\(\) is not null and u\.konto_id = new\.athlete_id/, 'zapis poprawki po końcu tylko od osoby (nie synchronizacji)');
  assert.match(nowe[3], /and not public\.akcja_bieg_po_koncu\(u\.bieg_id\) loop$/, 'usunięcie po końcu nie czyści');
  assert.match(nowe[4], /set wynik_zamrozony = jsonb_build_object\('km', old\.distance_km, 'zegarek', /);
  assert.match(nowe[9], /now\(\) < b\.koniec_at \+ interval '24 hours' and u\.ukonczony_at is null\)\)$/, 'automat 24 h, tylko bez wyniku');
  assert.match(nowe[10], /x\.source is not distinct from 'intervals' and x\.created_at < b\.koniec_at \+ interval '24 hours'/);
  assert.match(m, /revoke all on table public\.akcja_bieg_treningi_po_koncu from public, anon, authenticated;/);
  assert.match(m, /revoke all on function public\.akcja_bieg_po_koncu\(uuid\) from public, anon, authenticated;/);
  assert.doesNotMatch(m, /update public\.akcja_biegi|insert into public\.akcja_bieg_uczestnicy|regulamin_wersja =/, 'bez danych i bez zmiany regulaminu');
  assert.match(w, /drop table public\.akcja_bieg_treningi_po_koncu;\nalter table public\.akcja_bieg_uczestnicy drop column wynik_zamrozony;/);
});

test('testy po skutku: nowy z flagą AKCJA_BIEG_ZAMROZENIE_Z_MIGRACJA=1; test końca biegu przepięty z 2 h na 24 h (25 h nie, 3 h tak)', () => {
  const sh = czytaj('tools/akcja-bieg-zamrozenie-test.sh'), sq = czytaj('tools/akcja-bieg-zamrozenie-test.sql'), k = czytaj('tools/akcja-bieg-koniec-test.sql');
  assert.match(sh, /if \[ "\$\{AKCJA_BIEG_ZAMROZENIE_Z_MIGRACJA:-0\}" = 1 \]; then tr -d '\\r' < supabase\/migrations\/20261219_akcja_bieg_zamrozenie_po_koncu\.sql/);
  assert.match(sh, /echo 'rollback;'/); assert.match(sh, /create temp table _ukonczeni_przed/);
  assert.match(sq, /raise exception 'TESTY ZAMROZENIA PO KONCU ZIELONE: % sprawdzeń', n;/);
  assert.doesNotMatch(sq, /perform public\.akcja_bieg_automat\(\)/, 'nowy test nie woła automatu na prawdziwym biegu');
  assert.match(k, /set koniec_at = now\(\) - interval '25 hours'/); assert.match(k, /FAIL 6b: automat 3 h po końcu \(okno 24 h\)/);
  assert.doesNotMatch(k, /koniec_at = now\(\) - interval '3 hours' where id = b;\n  insert into public\.training_logs[^\n]*\n[^\n]*now\(\) - interval '1 hour'\);\n  perform public\.akcja_bieg_automat\(\);\n  if \(select ukonczony_at[^\n]*is not null then raise exception 'FAIL 6a/, 'stare 2 h zniknęło');
});
