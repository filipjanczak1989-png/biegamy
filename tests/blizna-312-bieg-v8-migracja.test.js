/* BLIZNA 312 / 20.11: migracja 20261218 (regulamin v8, front: blizna-311). Dwie jednoliniowe kotwice w akcja_bieg_ukonczyli, wycofanie = te same pary odwrotnie;
   strażnik ponownego uruchomienia (nowe teksty zawierają kotwice — drugie uruchomienie zdublowałoby pole „profil”, błąd dopiero przy wywołaniu listy);
   warunki linku: zapis „ja”, zgoda na imię, bieg od v8, profil publiczny, pełnoletni (data → 18+, bez daty → zgoda na ranking). Test po skutku z flagą. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('migracja 20261218: kotwice, warunki linku, strażnik, bramki danych; wycofanie odwrotnie; test po skutku z flagą', () => {
  const pary = (s) => [...s.matchAll(/\((\d+), '(public\.[^']+)',\n\s+\$k\$([^\n]*?)\$k\$,\n\s+\$k\$([^\n]*?)\$k\$\)/g)].map((m) => [m[2], m[3], m[4]]);
  const m = czytaj('supabase/migrations/20261218_akcja_bieg_v8_profil.sql'), w = czytaj('supabase/migrations/20261218_WYCOFANIE_akcja_bieg_v8_profil.sql');
  const pm = pary(m), pw = pary(w);
  assert.equal(pm.length, 2); assert.deepEqual(pw, pm.map(([f, a, b]) => [f, b, a]).reverse());
  const profil = pm[0][2];
  for (const war of ["u.rodzaj = 'ja'", 'u.zgoda_imie', 'public.akcja_bieg_wersja_od(b.regulamin_wersja, 8)', 'not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)', 'a.is_public',
    '(a.date_of_birth is not null or u.ranking_zgoda_at is not null)', 'then u.konto_id end as profil']) assert.ok(profil.includes(war), war);
  assert.equal(pm[1][2], "'reczny', p.reczny) || case when p.profil is not null then jsonb_build_object('profil', p.profil) else '{}'::jsonb end");
  assert.match(m, /if position\(' as profil' in pg_get_functiondef\('public\.akcja_bieg_ukonczyli\(text, integer, integer, integer\)'::regprocedure\)\) > 0 then\n\s+raise exception '20261218: lista ma już pole profil \(migracja wykonana\), nic nie zmieniam'; end if;/);
  assert.match(m, /if b\.regulamin_wersja not in \('2026-11-v7', '2026-11-v8'\) then raise exception/);
  assert.match(m, /update public\.akcja_biegi set regulamin_wersja = '2026-11-v8', regulamin_od = v_dzis where id = b\.id and regulamin_wersja = '2026-11-v7';/);
  assert.match(w, /update public\.akcja_biegi set regulamin_wersja = '2026-11-v7', regulamin_od = date '2026-11-19' where slug = 'bieg-mikolajki' and regulamin_wersja = '2026-11-v8';/);
  const sh = czytaj('tools/akcja-bieg-profil-test.sh'), sq = czytaj('tools/akcja-bieg-profil-test.sql');
  assert.match(sh, /if \[ "\$\{AKCJA_BIEG_PROFIL_Z_MIGRACJA:-0\}" = 1 \]; then tr -d '\\r' < supabase\/migrations\/20261218_akcja_bieg_v8_profil\.sql/);
  assert.match(sh, /echo 'rollback;'/);
  assert.match(sq, /raise exception 'TESTY PROFILU NA LISCIE ZIELONE: % sprawdzeń', n;/);
  assert.match(sq, /if not public\.akcja_bieg_wersja_od\(\(select regulamin_wersja from public\.akcja_biegi where slug = 'bieg-mikolajki'\), 8\) then/, 'co najmniej v8 (blizna-309)');
  const notice = (sq.slice(sq.indexOf('-- 5.')).match(/raise notice [^\n]*/) || [''])[0];
  assert.match(notice, /^raise notice 'bieg-mikolajki: % na liście, % z linkiem do profilu', j->>'razem', \(select count\(\*\) from jsonb_array_elements\(j->'lista'\) x where x \? 'profil'\);$/, 'z prawdziwego biegu same liczby');
  assert.doesNotMatch(notice, /->>'(imie|profil|numer)'/);
});
