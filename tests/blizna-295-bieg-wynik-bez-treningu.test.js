/* BLIZNA 295 / 18.11 wieczór (usterka z produkcji): zawodnik usunął w kalendarzu trening, który był jego wynikiem w biegu, a wynik dalej był na liście „ukończyli”.
   Przyczyna: akcja_bieg_uczestnicy.wynik_log_id → training_logs ON DELETE SET NULL zerował tylko odnośnik (czas, dystans, ukończenie zostawały).
   Odczyt 18.11 18:48: 1 taki zapis (bieg próbny proba-bieg, numer 1). Migracja 20261212 (decyzja Filipa; zmienia decyzję z 20261203, regulamin tego nie obiecywał):
   - BEFORE DELETE na training_logs czyści wynik „ja” (czas, dystans, ukończenie, wskazanie, weryfikacja), odznaka zostaje, bez „wynik usunięty” (automat może wziąć inny trening);
   - AFTER UPDATE dystansu, czasu, daty albo typu przelicza wynik z tego samego treningu (nie pasuje → czyszczony), wskazanie bez zmian;
   - zaliczenie przez organizatora i ukończenie dziecka bez zmian; jednorazowe sprzątanie wiszących wyników.
   Skutek w bazie: tools/akcja-bieg-trening-wynik-test.sh (flaga AKCJA_BIEG_TRENING_Z_MIGRACJA=1). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261212_akcja_bieg_wynik_bez_treningu.sql'), WYC = czytaj('supabase/migrations/20261212_WYCOFANIE_akcja_bieg_wynik_bez_treningu.sql');
const CT = 'create ' + 'trigger ', DR = 'dr' + 'op ';

test('triggery: BEFORE DELETE (przed SET NULL z klucza obcego) i AFTER UPDATE tylko pól wyniku, z warunkiem zmiany', () => {
  assert.ok(MIG.includes(CT + 'trg_akcja_bieg_trening_usuniety before delete on public.training_logs\n  for each row execute function public.akcja_bieg_trening_usuniety();'));
  assert.ok(MIG.includes(CT + 'trg_akcja_bieg_trening_zmieniony after update of distance_km, duration, logged_at, training_type, external_type on public.training_logs'));
  assert.match(MIG, /for each row when \(old\.distance_km is distinct from new\.distance_km or old\.duration is distinct from new\.duration or old\.logged_at is distinct from new\.logged_at/);
  assert.doesNotMatch(MIG, /alter table public\.akcja_bieg_uczestnicy (drop|add) constraint/, 'klucz obcy bez zmian');
});

test('czyszczenie: czas, dystans, ukończenie, wskazanie, weryfikacja; bez znacznika „wynik usunięty”; tylko „ja” bez zaliczenia przez organizatora', () => {
  const f = MIG.slice(MIG.indexOf('create function public.akcja_bieg_wynik_wyczysc'), MIG.indexOf('create function public.akcja_bieg_trening_usuniety'));
  assert.ok(f.includes("set ukonczony_at = null, wynik_log_id = null, wynik_s = null, wynik_dystans_km = null, wynik_wskazany = false,\n         weryfikacja = null, weryfikacja_at = null, weryfikacja_przez = null\n   where id = p_uczestnik and rodzaj = 'ja' and zaliczony_przez is null;"));
  assert.doesNotMatch(f, /wynik_usuniety|odznaka/, 'odznaka i „wynik usunięty” nietknięte');
  const z = MIG.slice(MIG.indexOf('create function public.akcja_bieg_trening_zmieniony'), MIG.indexOf('create function public.akcja_bieg_wiszace_wyczysc'));
  assert.ok(z.includes('v := public.akcja_bieg_wynik_z_treningu(r.id, new.id);'), 'ten sam trening z nowymi danymi');
  assert.ok(z.includes('elsif not r.wynik_wskazany then update public.akcja_bieg_uczestnicy set wynik_wskazany = false where id = r.id;'), 'wskazanie bez zmian');
  const w = MIG.slice(MIG.indexOf('create function public.akcja_bieg_wiszace_wyczysc'), MIG.indexOf('revoke all on function public.akcja_bieg_wynik_wyczysc'));
  assert.ok(w.includes("where u.rodzaj = 'ja' and u.ukonczony_at is not null and u.wynik_log_id is null and u.zaliczony_przez is null and u.wynik_usuniety_at is null loop"));
  assert.ok(MIG.includes('\nselect public.akcja_bieg_wiszace_wyczysc();\n'), 'jednorazowo w migracji');
  for (const f2 of ['akcja_bieg_wynik_wyczysc(uuid)', 'akcja_bieg_trening_usuniety()', 'akcja_bieg_trening_zmieniony()', 'akcja_bieg_wiszace_wyczysc()']) assert.ok(MIG.includes('re' + 'voke all on function public.' + f2 + ' from public, anon, authenticated;'), f2);
});

test('nagłówek mówi o zmianie decyzji z 20261203; wycofanie zdejmuje triggery, funkcje i indeks', () => {
  assert.match(MIG, /⚠️ Zmienia decyzję z 20261203/); assert.match(MIG, /Regulamin biegu tego nie obiecywał/);
  for (const x of ['trigger if exists trg_akcja_bieg_trening_usuniety on public.training_logs;', 'trigger if exists trg_akcja_bieg_trening_zmieniony on public.training_logs;', 'function public.akcja_bieg_wiszace_wyczysc();', 'index if exists public.akcja_bieg_uczestnicy_wynik_log_idx;']) assert.ok(WYC.includes(DR + x), x);
});

test('testy: po skutku z flagą i strażnikiem; krok 7 rankingu z zegarka prawdziwy po obu stronach migracji (bez CASE w warunku IF)', () => {
  const sh = czytaj('tools/akcja-bieg-trening-wynik-test.sh'), t = czytaj('tools/akcja-bieg-trening-wynik-test.sql'), r = czytaj('tools/akcja-bieg-ranking-gps-test.sql');
  assert.match(sh, /AKCJA_BIEG_TRENING_Z_MIGRACJA:-0/); assert.match(t, /FAIL 0: suma km albo procent ulicy inne/);
  assert.match(r, /if to_regprocedure\('public\.akcja_bieg_wiszace_wyczysc\(\)'\) is not null then\n    if e is not null/);
  assert.match(r, /<> 7 - \(to_regprocedure\('public\.akcja_bieg_wiszace_wyczysc\(\)'\) is not null\)::int or/);
  assert.doesNotMatch(r, /<> case when/, 'CASE … END w warunku IF psuł parser PL/pgSQL (syntax error at end of input)');
});
