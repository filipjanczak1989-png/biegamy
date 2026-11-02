/* BLIZNA 94 (2.11.2026) — PROJEKT F: migracja akcji (20261102_akcje.sql) + EF akcja-licznik. Strażnik tekstu, bez bazy.
   Zachowanie sprawdza tools/akcje-test-transakcji.sh (asercje w transakcji zawsze wycofanej, na żywej bazie).

   Pilnuje rzeczy, które łatwo zepsuć poprawką „przy okazji":
   - rola anonimowa NIE dostaje NICZEGO (decyzja Filipa 2.11, wariant b): niezalogowani czytają licznik przez EF
     akcja-licznik (verify_jwt off, klucz serwisowy tylko do RPC akcja_licznik, cache 60 s, CORS dwóch hostów);
     strażnik bramki commitów zostaje bez wyjątku; tabele bez prawa dla anon/authenticated;
   - przed startem licznik nie zwraca nazwy, imienia ani linku (v3 pkt 6: zero nazwy dziecka) i suma_km = null;
   - startujący = auth.uid() → auth_my_athlete_id() na liście akcja_startujacy, NIGDY user_metadata (LEKCJA z K5);
   - suma bez LEFT JOIN: least() w Postgresie pomija NULL — least(NULL, 100) = 100 dawało pustej akcji 100 km
     (złapane testem 5a 2.11.2026, zanim cokolwiek trafiło na prod);
   - wiersz dla-fabianka bez wymyślonego linku zbiórki i formy imienia (podaje Filip). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SQL = czytaj('supabase/migrations/20261102_akcje.sql');
const bezKomentarzy = SQL.replace(/--[^\n]*/g, '');
const funkcja = (nazwa) => {
  const m = bezKomentarzy.match(new RegExp('create function public\\.' + nazwa + '\\([\\s\\S]*?\\$fn\\$;'));
  assert.ok(m, 'brak funkcji ' + nazwa);
  return m[0];
};

test('rola anonimowa: zero grantów w migracji; licznik dla authenticated i service_role', () => {
  const granty = [...bezKomentarzy.matchAll(/grant\s+execute\s+on\s+function\s+public\.(\w+)\([^)]*\)\s+to\s+([^;]+);/gi)];
  assert.ok(granty.length >= 5);
  assert.doesNotMatch(bezKomentarzy, /\bgrant\b[^;]*\bto\b[^;]*\banon\b/i, 'jakikolwiek grant dla anon');
  const licznik = granty.find(([, fn]) => fn === 'akcja_licznik');
  assert.ok(licznik && /\bservice_role\b/.test(licznik[2]) && /\bauthenticated\b/.test(licznik[2]), 'licznik bez service_role/authenticated');
  assert.match(bezKomentarzy, /revoke all on public\.akcje, public\.akcja_startujacy, public\.akcja_sponsorzy from public, anon, authenticated;/);
  for (const fn of ['akcja_km_okna', 'akcja_licznik', 'akcja_moj_wklad', 'akcja_tydzien', 'akcja_start', 'akcja_proba_reset']) {
    assert.match(bezKomentarzy, new RegExp('revoke all on function public\\.' + fn + '\\([^)]*\\)\\s+from public, anon, authenticated;'), 'brak revoke ' + fn);
  }
  assert.doesNotMatch(bezKomentarzy, /grant[^;]*akcja_km_okna/i, 'akcja_km_okna wystawiona');
  assert.match(bezKomentarzy, /has_function_privilege\('anon', p\.oid, 'execute'\)/, 'brak asercji „anon zero” w migracji');
});

test('EF akcja-licznik: verify_jwt off, jeden RPC, zero .from(), cache 60 s, CORS dwóch hostów', () => {
  const kod = czytaj('supabase/functions/akcja-licznik/index.ts').replace(/^\s*\/\/[^\n]*/gm, '');
  assert.match(czytaj('supabase/config.toml'), /\[functions\.akcja-licznik\]\nverify_jwt = false/);
  const rpc = [...kod.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(rpc, ['akcja_licznik'], 'EF woła coś poza akcja_licznik');
  assert.doesNotMatch(kod, /\.from\(|\.storage|\.auth\.admin|\.functions\./, 'klucz serwisowy użyty do czegoś poza licznikiem');
  assert.match(kod, /CACHE_MS = 60_000/);
  assert.match(kod, /'Cache-Control': 'public, max-age=60'/);
  assert.ok(kod.includes("new Set(['https://biegamy.run', 'https://run.biegamy.app'])"), 'CORS: inne hosty');
  assert.doesNotMatch(kod, /Access-Control-Allow-Origin': '\*'/, 'CORS gwiazdka');
  assert.ok(kod.includes('/^[a-z0-9-]{2,40}$/'), 'slug bez białej listy');
  assert.match(kod, /req\.method !== 'GET'/);
});

test('wszystkie funkcje akcji: security definer + stały search_path', () => {
  const definicje = bezKomentarzy.match(/create function public\.akcja_\w+\([\s\S]*?as \$fn\$/g);
  assert.equal(definicje.length, 6);
  for (const d of definicje) {
    assert.match(d, /security definer/, d.slice(0, 60));
    assert.match(d, /set search_path = public, pg_temp/, d.slice(0, 60));
  }
});

test('licznik przed startem: bez nazwy, imienia, linku i sumy', () => {
  const f = funkcja('akcja_licznik');
  const m = f.match(/if a\.wystartowala_at is null then\s*return jsonb_build_object\(([\s\S]*?)\);\s*end if;/);
  assert.ok(m, 'brak gałęzi przed startem');
  const przed = m[1];
  for (const zakazane of ['nazwa', 'imie', 'url_zbiorki', 'wizerunek', 'slug', 'athlete']) {
    assert.doesNotMatch(przed, new RegExp(zakazane), 'przed startem wychodzi ' + zakazane);
  }
  assert.match(przed, /'suma_km', null/);
  assert.match(przed, /'wystartowala', false/);
  assert.doesNotMatch(f, /athlete_id'/, 'licznik zwraca athlete_id');
  assert.match(f, /'wizerunek',\s*case when a\.wizerunek_zgoda then a\.wizerunek_url end/);
});

test('startujący po auth.uid() i liście, nigdy po user_metadata', () => {
  assert.doesNotMatch(bezKomentarzy, /user_metadata|raw_user_meta|app_metadata/);
  for (const fn of ['akcja_tydzien', 'akcja_start', 'akcja_proba_reset']) {
    const f = funkcja(fn);
    assert.match(f, /auth\.uid\(\) is null/, fn);
    assert.match(f, /from public\.akcja_startujacy s where s\.akcja_id = a\.id and s\.athlete_id = public\.auth_my_athlete_id\(\)/, fn);
    assert.match(f, /errcode = '42501'/, fn);
  }
  assert.match(funkcja('akcja_moj_wklad'), /auth\.uid\(\) is null[\s\S]*42501/);
  assert.doesNotMatch(funkcja('akcja_moj_wklad'), /p_athlete|p_osoba/, 'wkład z parametrem osoby');
});

test('suma: JOIN (nie LEFT JOIN), doba warszawska, bez przyszłości, bez __badge__, cap', () => {
  const f = funkcja('akcja_km_okna');
  assert.doesNotMatch(f, /left\s+join/i, 'LEFT JOIN + least() = 100 km dla pustej akcji');
  assert.match(f, /join lateral/);
  assert.match(f, /at time zone 'Europe\/Warsaw'/);
  assert.match(f, /\(now\(\) at time zone 'Europe\/Warsaw'\)::date/);
  assert.match(f, /not like '\\_\\_badge\\_\\_%'/);
  assert.match(f, /least\(dz\.km, a\.cap_km_doba\)/);
  assert.doesNotMatch(f, /is_run_type|training_type\s+in/i, 'v2: wszystkie typy 1:1');
});

test('guzik: okno, tolerancja 2 min, idempotencja; rozliczenie teleskopowe', () => {
  const s = funkcja('akcja_start');
  assert.match(s, /if a\.wystartowala_at is not null then return public\.akcja_licznik\(p_slug\); end if;/);
  assert.match(s, /p_nacisnieto_at <= now\(\) \+ interval '2 minutes'/);
  assert.match(s, /where id = a\.id and wystartowala_at is null/);
  assert.match(s, /for update/);
  const t = funkcja('akcja_tydzien');
  assert.match(t, /floor\(least\(v_przed \+ v_tydz, a\.cel_km\) \* a\.stawka_gr_filip\)/);
  assert.match(t, /isodow from p_poniedzialek\) <> 1/);
});

test('wiersze: dla-fabianka bez wymyślonego linku i formy imienia; proba = persona zawodnika Filipa; startujący = konto trenera', () => {
  const fab = bezKomentarzy.match(/values \('dla-fabianka', ([^,]+), ([^,]+), ([^,]+),/);
  assert.ok(fab);
  assert.deepEqual([fab[1], fab[2], fab[3]].map((x) => x.trim()), ['null', 'null', 'null']);
  assert.match(bezKomentarzy, /date '2026-11-08', 12500, 10,/);
  assert.match(bezKomentarzy, /timestamp '2026-11-08 06:00:00' at time zone 'Europe\/Warsaw'/);
  assert.ok(bezKomentarzy.includes("values ('proba', 'Próba guzika', date '2026-11-02', 12500, 10, true, array['56092926-2cf1-44b6-952f-38614497fdc2'::uuid])"), 'próba: konto testowe');
  assert.match(bezKomentarzy, /t\.id = '9c2df65c-6a46-410e-ad5f-474e5d973ec9'/);
  assert.doesNotMatch(bezKomentarzy, /zrzutka|siepomaga|pomagam\.pl/i, 'wymyślony link zbiórki');
});

test('wycofanie istnieje i kasuje wszystko, co tworzy migracja', () => {
  const W = czytaj('supabase/migrations/20261102_WYCOFANIE_akcje.sql');
  for (const o of ['akcja_proba_reset()', 'akcja_start(text, timestamptz)', 'akcja_tydzien(text, date)', 'akcja_moj_wklad(text)',
    'akcja_licznik(text)', 'akcja_km_okna(uuid, date, date, uuid[])', 'public.akcja_sponsorzy', 'public.akcja_startujacy', 'public.akcje']) {
    assert.ok(W.includes(o), 'wycofanie bez ' + o);
  }
});
