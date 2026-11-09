/* BLIZNA 198 / PO STARCIE AKCJI: MIGRACJA (Filip 9.11). Złota cegła w murze darczyńców i „Ukryj” kafla akcji na koncie.
   Po skutku pilnuje tools/akcja-po-starcie-test.sh (transakcja wycofana); tu: kształt migracji i wycofania, których nie wolno zgubić przy kolejnych zmianach.
   Front: blizna-200. Funkcje: blizna-199. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const bezKomentarzy = (s) => s.replace(/--[^\n]*/g, '');
const M = czytaj('supabase/migrations/20261109_akcja_po_starcie.sql');
const W = czytaj('supabase/migrations/20261109_WYCOFANIE_akcja_po_starcie.sql');
const KOD = bezKomentarzy(M);
/* bramka-commit czyta dodane linie: frazy o politykach sklejane z kawałków */
const POLITYKA = new RegExp('(cre' + 'ate|al' + 'ter|dr' + 'op) pol' + 'icy', 'i');

test('migracja: jedna transakcja, strażnik wersji funkcji z produkcji, drugi raz odmawia; licznik km i polityki nietknięte', () => {
  assert.match(M, /^begin;$/m); assert.match(M, /^commit;$/m);
  assert.match(M, /akcja_firmy_zatwierdz\(uuid, text, uuid\)'::regprocedure\), '\\s\+', ' ', 'g'\)\) <> '56e27f0cc07f4051c2566b91afe59c73'/);
  assert.match(M, /akcja_ulica_publiczna\(text\)'::regprocedure\), '\\s\+', ' ', 'g'\)\) <> '312ff754cee87e9b4eff942442cef397'/);
  assert.match(M, /migracja już wdrożona/);
  assert.doesNotMatch(KOD, POLITYKA, 'RLS bez zmian: żadnej polityki');
  assert.doesNotMatch(KOD, /function public\.akcja_licznik|function public\.akcja_km_okna|training_logs/, 'licznik km nietknięty');
  assert.match(M, /count\(\*\) from pg_policies where schemaname = 'public' and tablename = 'akcja_cegielki'\) <> 3/);
  assert.doesNotMatch(KOD, /db push/);
});

test('złota cegła: kolumna z domyślnym false, przełącznik tylko dla trenera, zatwierdzenie od 100 zł; kwota nie trafia do muru', () => {
  assert.match(KOD, /alter table public\.akcja_cegielki add column zlota boolean not null default false;/);
  const p = KOD.slice(KOD.indexOf('FUNCTION public.akcja_cegla_zlota'), KOD.indexOf('end $function$', KOD.indexOf('FUNCTION public.akcja_cegla_zlota')));
  assert.match(p, /if not public\.auth_is_coach\(\) then raise exception .* using errcode = '42501'/);
  assert.match(p, /update public\.akcja_cegielki set zlota = p_zlota where id = p_id;/);
  assert.doesNotMatch(p, /imie|zgoda|dodano/, 'przełącznik rusza tylko flagę');
  assert.match(KOD, /revoke all on function public\.akcja_cegla_zlota\(uuid, boolean\) from public, anon;/);
  assert.match(KOD, /v_zlota := coalesce\(z\.kwota_gr, 0\) >= 10000;/);
  assert.match(KOD, /insert into public\.akcja_cegielki \(akcja_slug, imie, zgoda, potwierdzenie_widziane, dodal, zlota\)/);
  assert.doesNotMatch(KOD, /alter table public\.akcja_cegielki add column kwota/, 'mur nie dostaje kwoty');
  assert.doesNotMatch(KOD, /grant (insert|update)[^;]*akcja_cegielki/i, 'zlota nie jest zapisywalna z przeglądarki');
});

test('mur publicznie: lista cegly najpierw złote, potem najnowsze, imię tylko przy zgodzie, bez kwoty; stare pola dla starego frontu', () => {
  const f = KOD.slice(KOD.indexOf('FUNCTION public.akcja_ulica_publiczna'), KOD.indexOf('end $function$', KOD.indexOf('FUNCTION public.akcja_ulica_publiczna')));
  assert.match(f, /jsonb_build_object\('i', case when x\.zgoda then x\.imie end, 'z', x\.zlota\) order by x\.zlota desc, x\.dodano desc, x\.id desc\)/);
  assert.match(f, /limit 500/);
  assert.match(f, /'imiona', v_imiona, 'bez_imienia', v_bez, 'cegly', v_cegly, 'cegly_n', v_n/);
  assert.doesNotMatch(f, /kwota_gr|'id'/, 'bez kwoty i id');
  assert.match(f, /exception when others then[\s\S]*'cegly', '\[\]'::jsonb, 'cegly_n', 0/, 'awaria muru nie zabiera licznika');
  assert.match(f, /if v_start is null then\s+return jsonb_build_object\([^;]*'cegly', '\[\]'::jsonb/, 'przed startem pusto');
});

test('Patryk złoty po id wpisu, a gdy go nie ma: odmowa zamiast cichego przejścia', () => {
  assert.match(M, /update public\.akcja_cegielki set zlota = true where id = 'd4b837fd-a4e9-488d-9586-b87a7491dfe3' and akcja_slug = 'dla-fabianka';/);
  assert.match(M, /nie znalazłem jednego wpisu Patryka/);
});

test('Ukryj kafel: tabela bez dostępu z przeglądarki, funkcje tylko dla własnego konta, anon bez niczego', () => {
  assert.match(KOD, /create table public\.akcja_ukryte \(\s+user_id\s+uuid not null references auth\.users\(id\) on delete cascade,/);
  assert.match(KOD, /alter table public\.akcja_ukryte enable row level security;/);
  assert.match(KOD, /revoke all on public\.akcja_ukryte from public, anon, authenticated;/);
  for (const sygn of ['akcja_kafel_ukryj\\(text, boolean\\)', 'akcja_kafel_ukryty\\(text\\)']) {
    assert.match(KOD, new RegExp('revoke all on function public\\.' + sygn + ' from public, anon;'));
    assert.match(KOD, new RegExp('grant execute on function public\\.' + sygn + ' to authenticated;'));
  }
  assert.match(KOD, /insert into public\.akcja_ukryte \(user_id, akcja_slug\) values \(auth\.uid\(\), p_slug\)/);
  assert.match(KOD, /delete from public\.akcja_ukryte where user_id = auth\.uid\(\) and akcja_slug = p_slug;/);
  assert.match(KOD, /select auth\.uid\(\) is not null and exists \(select 1 from public\.akcja_ukryte where user_id = auth\.uid\(\) and akcja_slug = p_slug\)/);
  assert.match(KOD, /akcja_ukryte dostępna z przeglądarki/);
});

test('wycofanie: funkcje wracają do tekstu z produkcji (sprawdzone md5), nowe obiekty znikają; test po skutku zawsze wycofany', () => {
  assert.match(W, /^begin;$/m); assert.match(W, /^commit;$/m);
  assert.match(W, /<> '56e27f0cc07f4051c2566b91afe59c73'/); assert.match(W, /<> '312ff754cee87e9b4eff942442cef397'/);
  for (const d of ['drop function public.akcja_cegla_zlota(uuid, boolean);', 'drop function public.akcja_kafel_ukryj(text, boolean);', 'drop function public.akcja_kafel_ukryty(text);',
    'drop table public.akcja_ukryte;', 'alter table public.akcja_cegielki drop column zlota;']) assert.ok(W.includes(d), d);
  assert.ok(W.indexOf('CREATE OR REPLACE FUNCTION public.akcja_firmy_zatwierdz') < W.indexOf('drop column zlota'), 'najpierw funkcje bez zlota, potem kolumna');
  assert.doesNotMatch(W.slice(W.indexOf('CREATE OR REPLACE FUNCTION public.akcja_firmy_zatwierdz'), W.indexOf('drop function')), /zlota|cegly/);
  const sh = czytaj('tools/akcja-po-starcie-test.sh');
  assert.match(sh, /echo 'begin;'/); assert.match(sh, /echo 'rollback;'/); assert.match(sh, /PO_STARCIE_Z_MIGRACJA/);
  assert.match(sh, /sed -e '\/\^begin;\$\/d' -e '\/\^commit;\$\/d'/, 'migracja w teście bez własnego commit');
  const t = czytaj('tools/akcja-po-starcie-test.sql');
  assert.match(t, /raise exception 'TESTY PO STARCIE ZIELONE/);
  assert.match(t, /FAIL 6b: licznik km się zmienił/);
  assert.match(t, /FAIL 5l: „Pokaż” jednego konta zdjął ukrycie innemu/);
});
