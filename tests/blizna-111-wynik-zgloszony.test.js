/* BLIZNA 111 (2.11.2026, etap 2 — wynik zgłoszony; docs/projekt-wyniki-jak-manager-2026-11-02.md §3, decyzje Filipa 2.11).
   Walidator (twarde progi z rekordów świata, miękkie ostrzeżenia, data z przyszłości, dystans 0,5–400), dopasowanie z oficjalnym
   (±1 dzień, ±3 % dystansu, klucz imprezy gdy jest, dwa kandydaty → brak, > 2 % → informuj), migracja (CHECK tempa, UNIQUE,
   strażnik kolumn systemowych przez current_setting, RPC z auth.uid() i właścicielem/trenerem, revoke po create, polityki
   own/coach/public, delete_my_account zna tabelę, CHECK f6_runner_key z k:), „nie bije rekordów" (rekordy i odznaki nie czytają
   tabeli), jeden modal + jedna funkcja zapisu, EF okienko nie zapisuje. RLS po skutku: tools/wyniki-zgloszone-test.sh. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
async function Z() { globalThis.window = globalThis; await import(pathToFileURL(path.join(KORZEN, 'js/wynik-zgloszony.mjs')).href); return globalThis.BM_WYNIK_ZGLOSZONY; }
const DZIS = '2026-11-02';

test('walidator: kształt czasu, dopełnienie h:mm na długich, twarde progi (rekord świata), miękkie ostrzeżenia, data, dystans', async () => {
  const z = await Z();
  const w = (km, czas, extra) => z.waliduj({ nazwa: 'Bieg', data: '2026-10-10', dystans_km: km, czas, dzis: DZIS, ...(extra || {}) });
  assert.equal(w(10, '45:30').czas_s, 2730); assert.equal(w(42.195, '3:45:00').czas_s, 13500);
  assert.equal(w(42.195, '2:04').czas_s, 7440, 'h:mm na maratonie = 2 h 04 min'); assert.equal(w(21.0975, '1:45').czas_s, 6300);
  assert.equal(w(10, '44').ok, false, 'samo „44" to nie czas'); assert.equal(w(10, '45:75').ok, false); assert.equal(w(10, 'abc').ok, false);
  assert.equal(w(10, '20:00').ok, false, '2:00/km < rekord świata'); assert.equal(w(5, '12:00').ok, false); assert.equal(w(21.0975, '55:00').ok, false); assert.equal(w(42.195, '1:58:00').ok, false); assert.equal(w(100, '5:40:00').ok, false, 'ultra 3:24/km');
  assert.deepEqual(w(10, '29:00').ostrzezenia.length, 1, '2:54/km — miękkie'); assert.equal(w(10, '30:00').ostrzezenia.length, 1); assert.equal(w(10, '34:00').ostrzezenia.length, 0);
  assert.equal(w(10, '1:45:00').ostrzezenia.length, 1, '10:30/km — miękkie'); assert.equal(w(10, '3:30:00').ok, false, '21:00/km > 20:00/km');
  assert.equal(w(100, '20:00:00').ostrzezenia.length, 0, 'ultra 12:00/km bez ostrzeżenia (próg 15:00)');
  assert.equal(w(10, '33:00', { pb_s: 2700 }).ostrzezenia.some((o) => /nowy rekord/.test(o)), true, '> 15 % lepiej niż pb'); assert.equal(w(10, '43:00', { pb_s: 2700 }).ostrzezenia.length, 0);
  assert.equal(z.waliduj({ nazwa: 'Bieg', data: '2026-11-03', dystans_km: 10, czas: '45:00', dzis: DZIS }).ok, false, 'jutro'); assert.equal(z.waliduj({ nazwa: 'Bieg', data: '1989-12-31', dystans_km: 10, czas: '45:00', dzis: DZIS }).ok, false);
  assert.equal(z.waliduj({ nazwa: 'Bieg', data: '2025-10-01', dystans_km: 10, czas: '45:00', dzis: DZIS }).ostrzezenia.some((o) => /ponad roku/.test(o)), true);
  assert.equal(w(0.4, '2:00').ok, false); assert.equal(w(401, '50:00:00').ok, false); assert.equal(z.waliduj({ nazwa: 'ab', data: '2026-10-10', dystans_km: 10, czas: '45:00', dzis: DZIS }).ok, false);
  assert.equal(w(10, ' 45:30 ').czas_s, 2730, 'spacje'); assert.equal(w('10,0', '45:30').dystans_km, 10, 'przecinek dziesiętny');
});

test('dopasowanie z oficjalnym: ±1 dzień, ±3 % dystansu, klucz imprezy gdy oba mają, dwa kandydaty → brak, > 2 % → informuj', async () => {
  const z = await Z();
  const of = (bieg, data, km, czas, klucz) => ({ bieg, data, km, czas, klucz_imprezy: klucz || null });
  assert.equal(z.dopasuj({ data: '2026-03-01', dystans_km: 10, czas_s: 2750 }, [of('A', '2026-03-02', 10.2, 2700)]).roznica_pct, 1.85);
  assert.equal(z.dopasuj({ data: '2026-03-01', dystans_km: 10, czas_s: 2800 }, [of('A', '2026-03-01', 10, 2700)]).informuj, true, '3,7 %');
  assert.equal(z.dopasuj({ data: '2026-03-01', dystans_km: 10, czas_s: 2750 }, [of('A', '2026-03-03', 10, 2700)]), null, '2 dni');
  assert.equal(z.dopasuj({ data: '2026-03-01', dystans_km: 10, czas_s: 2750 }, [of('A', '2026-03-01', 10.5, 2700)]), null, '5 %');
  assert.equal(z.dopasuj({ data: '2026-03-01', dystans_km: 10, czas_s: 2750 }, [of('A', '2026-03-01', 10, 2700), of('B', '2026-03-02', 10, 2600)]), null, 'dwa kandydaci');
  assert.equal(z.dopasuj({ data: '2026-03-01', dystans_km: 10, czas_s: 2750, impreza_klucz: 'kalendarz:x' }, [of('A', '2026-03-01', 10, 2700, 'kalendarz:y')]), null, 'inny klucz imprezy');
  assert.equal(z.dopasuj({ data: '2026-03-01', dystans_km: 10, czas_s: 2750, impreza_klucz: 'kalendarz:x' }, [of('A', '2026-03-01', 10, 2700, 'kalendarz:x')]).roznica_pct, 1.85);
});

test('migracja: CHECK tempa i UNIQUE, strażnik przez current_setting, RPC właściciel/trener, revoke po create, 9 polityk, delete_my_account, CHECK f6 z k:, WYCOFANIE', () => {
  const m = czytaj('supabase/migrations/20261102_wyniki_zgloszone.sql');
  assert.match(m, /constraint wz_tempo_rozsadne check \(czas_s::numeric \/ dystans_km between 140 and 1200\)/);
  assert.match(m, /constraint wz_jeden_na_start unique \(athlete_id, data, dystans_km\)/);
  assert.match(m, /if coalesce\(current_setting\('biegamy\.wz_rpc', true\), ''\) = '1' then return new; end if;/);
  assert.match(m, /elsif new\.stan <> 'zgloszony' or new\.oficjalny_result_id is not null/, 'insert z wartościami systemowymi odrzucony');
  assert.match(m, /a\.user_id = auth\.uid\(\) or a\.coach_id = auth\.uid\(\)/, 'RPC: właściciel albo trener');
  assert.match(m, /revoke all on public\.wyniki_zgloszone from public, anon, authenticated;\s*\ngrant select, insert, update, delete on public\.wyniki_zgloszone to authenticated;/);
  assert.equal((m.match(/create policy wz_/g) || []).length, 9);
  assert.match(m, /wz_read_public[\s\S]*?a\.is_public = true/); assert.match(m, /wz_insert_coach[\s\S]*?zrodlo = 'trener' and wpisal_user_id = auth\.uid\(\) and athlete_id in \(select id from public\.athletes where coach_id = auth\.uid\(\)\)/);
  assert.match(m, /DELETE FROM public\.wyniki_zgloszone\s+WHERE athlete_id = v_athlete_id;/, 'delete_my_account kasuje wyniki zgłoszone');
  assert.match(m, /athletes_f6_runner_key_check check \(f6_runner_key is null or f6_runner_key ~ '[^']*\^k:\[\^\|\]\{2,60\}\\\|\[0-9\]\{4\}\$'\)/, 'k:<nazwisko>|<rocznik>');
  assert.match(m, /pg_policies where tablename = 'wyniki_zgloszone'\) <> 9/);
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261102_WYCOFANIE_wyniki_zgloszone.sql')));
  assert.match(czytaj('tools/wyniki-zgloszone-test.sql'), /FAIL 2a: obcy widzi prywatny/, 'RLS po skutku dla 3 kont');
});

test('„zgłoszony nie bije rekordów": rekordy/trend i odznaki nie czytają tabeli; jeden modal i jedna funkcja zapisu; EF nie zapisuje', () => {
  for (const p of ['js/wyniki-lista.mjs', 'supabase/functions/okienko/moje.mjs', 'supabase/functions/okienko/osoba.mjs']) assert.doesNotMatch(czytaj(p), /wyniki_zgloszone/, p);
  assert.doesNotMatch(czytaj('sb.js'), /wyniki_zgloszone/, 'sb.js (odznaki, pb_*) nie zna tabeli');
  const z = czytaj('js/wynik-zgloszony.mjs');
  assert.equal((z.match(/from\("wyniki_zgloszone"\)\.insert\(/g) || []).length, 1, 'jedna funkcja zapisu');
  assert.doesNotMatch(z, /pb_5k|pb_10k|pb_half|pb_marathon|awardBadge|achievements/, 'bez zapisu pb_* i odznak');
  assert.match(z, /zrodlo: d\.zrodlo === "trener" \? "trener" : "zawodnik"/, 'źródło z kontekstu otwarcia, nie z pola formularza');
  assert.match(z, /Rekordów życiowych ani odznak to nie zmienia/);
  const h = czytaj('wyniki.html'); assert.match(h, /Z\.otworz\(\{ athlete_id: _athleteId, zrodlo: 'zawodnik'/); assert.doesNotMatch(h, /from\('wyniki_zgloszone'\)\.(insert|upsert|update)\(/, 'strona zapisuje wyłącznie przez moduł');
  assert.match(h, /<span class="w-etyk">zgłoszony<\/span>/, 'etykieta');
  for (const f of fs.readdirSync(path.join(KORZEN, 'supabase/functions/okienko'))) if (/\.(ts|mjs)$/.test(f)) assert.doesNotMatch(czytaj('supabase/functions/okienko/' + f), /wyniki_zgloszone/, 'EF okienko: ' + f);
});
