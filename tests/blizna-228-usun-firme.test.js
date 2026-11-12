/* BLIZNA 228 (12.11.2026, decyzja Filipa): „USUŃ FIRMĘ” W PANELU TRENERA = miękkie usunięcie z wyczyszczeniem danych (20261113_akcja_firmy_usuniecie.sql).
   - wiersz zostaje do rozliczenia (kwota, rodzaj, wsparcie, kto i kiedy usunął); nazwa → „[usunięta]”, link/logo/plakat → NULL, ukryta = true; zgłoszenie: nazwa, link, e-mail wyczyszczone;
   - widoczność jak przy „ukryta”: licznik, stan próby pomijają usunięte; jedyna droga = RPC akcja_firmy_usun (tylko trener), DELETE z przeglądarki odebrany, UPDATE nie rusza usuniętego;
   - dwa błędy starego twardego DELETE naprawione: (1) firmy próby wskazywały logo prawdziwej firmy i usunięcie „Domek Próbny” kasowało cudzy plik — teraz próba ma własny plik
     zastępczy o stałej nazwie (wgrywa start-akcji.html), a plik kasuje się tylko wtedy, gdy żaden inny wiersz go nie używa (RPC i edycja z nowym logo); (2) plakat nie był kasowany nigdy;
   - panel zgłoszeń celuje po firma_id (lista zna firma_id i firma_usunieta), usunięta bez guzików. Test bazy: tools/akcja-firmy-usun-test.sh. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const M = czytaj('supabase/migrations/20261113_akcja_firmy_usuniecie.sql'), W = czytaj('supabase/migrations/20261113_WYCOFANIE_akcja_firmy_usuniecie.sql');
const T = czytaj('trener.html'), P = czytaj('js/firmy-panel.mjs'), S = czytaj('start-akcji.html');
const ZAST = 'aaaaaaaa-0000-4000-8000-00000000f1f1.png';

test('migracja: kolumny usunięcia, link bez NOT NULL, DELETE odebrany, UPDATE tylko na żywych, RPC tylko dla zalogowanych z bramką trenera', () => {
  assert.match(M, /alter table public\.akcja_firmy add column usunieta_at timestamptz, add column usunal uuid references auth\.users\(id\) on delete set null;/);
  assert.match(M, /alter table public\.akcja_firmy alter column link drop not null;/);
  /* zgłoszenia: kolumna link jest nullable od 20261107, ale CHECK wymaga linku poza cegiełką — test po skutku 12.11 wyłapał 23514; NULL także przy '[usunięta]' */
  assert.match(M, /add constraint akcja_firmy_zgloszenia_link_check check \(case when rodzaj = 'cegielka' then link is null\n\s*when nazwa = '\[usunięta\]' then link is null\n\s*else link is not null and char_length\(link\) <= 500/);
  assert.match(W, /where link is null and rodzaj <> 'cegielka';/, 'wycofanie nie dotyka cegiełek (ich link ma być NULL)');
  assert.doesNotMatch(W, /akcja_firmy_zgloszenia alter column link set not null/, 'cegiełki mają NULL w linku');
  assert.match(M, /revoke delete on public\.akcja_firmy from authenticated;/);
  assert.match(M, /drop policy if exists akcja_firmy_trener_kasuje on public\.akcja_firmy;/);
  assert.match(M, /create policy akcja_firmy_trener_zmienia on public\.akcja_firmy for update to authenticated\n\s*using \(public\.auth_is_coach\(\) and usunieta_at is null\) with check \(public\.auth_is_coach\(\) and usunieta_at is null\);/);
  assert.doesNotMatch(M, /grant (update|insert) \([^)]*usun/, 'nowe kolumny bez grantu zapisu');
  const f = M.slice(M.indexOf('create or replace function public.akcja_firmy_usun(p_id uuid)'), M.indexOf('revoke all on function public.akcja_firmy_usun'));
  assert.match(f, /security definer\n\s*set search_path to 'public', 'pg_temp'/);
  assert.match(f, /if auth\.uid\(\) is null or not public\.auth_is_coach\(\) then raise exception 'akcja_firmy_usun: tylko trener' using errcode = '42501'; end if;/);
  assert.match(f, /where id = p_id for update;/);
  assert.match(f, /if f\.usunieta_at is not null then return jsonb_build_object\('ok', false, 'powod', 'juz_usunieta'\); end if;/);
  assert.match(f, /not exists \(select 1 from public\.akcja_firmy i where i\.id <> f\.id and \(i\.logo_url = u or i\.plakat_url = u\)\)/, 'plik do skasowania tylko, gdy nikt inny go nie używa');
  assert.match(f, /set usunieta_at = now\(\), usunal = auth\.uid\(\), ukryta = true, nazwa = '\[usunięta\]', link = null, logo_url = null, plakat_url = null, plakat_tekst = null/);
  assert.match(f, /update public\.akcja_firmy_zgloszenia set nazwa = '\[usunięta\]', link = null, email = null where firma_id = f\.id;/);
  assert.doesNotMatch(f, /delete from/, 'wiersz zostaje do rozliczenia');
  assert.match(M, /revoke all on function public\.akcja_firmy_usun\(uuid\) from public, anon;\ngrant execute on function public\.akcja_firmy_usun\(uuid\) to authenticated;/);
});

test('migracja: funkcje poprawiane na żywej definicji ze strażnikiem (licznik, stan próby, próba firm z plikiem zastępczym, lista zgłoszeń z firma_id); kontrola końcowa; wycofanie', () => {
  assert.match(M, /if \(select count\(\*\) from regexp_matches\(v_def, \$r\$where f\\\.akcja_slug = a\\\.slug and not f\\\.ukryta;\$r\$, 'g'\)\) <> 1 then raise exception/);
  assert.match(M, /where f\.akcja_slug = a\.slug and not f\.ukryta and f\.usunieta_at is null;/);
  assert.match(M, /if j_po is distinct from j_przed then raise exception/, 'odpowiedź licznika dla prawdziwej akcji bez zmian');
  assert.match(M, /where f\.akcja_slug = 'proba' and not f\.ukryta and f\.usunieta_at is null\)/); assert.match(M, /where f\.akcja_slug = 'proba' and f\.ukryta and f\.usunieta_at is null\)/);
  assert.ok(M.includes("ZAST constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/" + ZAST + "'"), 'plik zastępczy próby o stałej nazwie');
  assert.match(M, /\$n\$v_logo := '\$n\$ \|\| ZAST \|\| \$n\$';/);
  assert.match(M, /'firma_id', z\.firma_id, 'firma_usunieta', exists \(select 1 from public\.akcja_firmy f where f\.id = z\.firma_id and f\.usunieta_at is not null\)\)/);
  for (const w of ["has_table_privilege('authenticated', 'public.akcja_firmy', 'DELETE')", "'usunieta_at', 'UPDATE')", "cmd = 'DELETE'", "qual like '%usunieta_at IS NULL%'", "has_function_privilege('anon', 'public.akcja_firmy_usun(uuid)', 'EXECUTE')", "~ 'select f\\.logo_url into v_logo'"])
    assert.ok(M.includes(w), 'kontrola końcowa: ' + w);
  assert.doesNotMatch(M + W, /Kasia|Filip\b(?! \d)|@gmail|[0-9]{3} zł/, 'bez imion z kontekstem, adresów i kwot (repo publiczne)');
  assert.match(W, /delete from public\.akcja_firmy where usunieta_at is not null;/, 'wycofanie: wyczyszczonych wierszy nie da się odtworzyć, wracają do starej postaci (skasowane)');
  assert.match(W, /create policy akcja_firmy_trener_kasuje on public\.akcja_firmy for delete to authenticated using \(public\.auth_is_coach\(\)\);/);
  assert.match(W, /grant delete on public\.akcja_firmy to authenticated;/); assert.match(W, /drop function if exists public\.akcja_firmy_usun\(uuid\);/);
  assert.match(W, /alter table public\.akcja_firmy drop column if exists usunieta_at;/);
  const sh = czytaj('tools/akcja-firmy-usun-test.sh'), sql = czytaj('tools/akcja-firmy-usun-test.sql');
  assert.match(sh, /FIRMY_USUN_Z_MIGRACJA/); assert.match(sh, /echo 'rollback;'/); assert.match(sql, /TESTY USUWANIA FIRM ZIELONE/);
  for (const w of ['FAIL 1c', 'FAIL 3b', 'FAIL 4a', 'FAIL 5a', 'FAIL 6a', 'FAIL 7a', 'FAIL 8a', 'FAIL 9d']) assert.ok(sql.includes(w), 'test bazy: ' + w);
});

test('trener.html: usunięcie przez RPC po okienku, pliki z odpowiedzi (tylko poprawne nazwy), lista bez usuniętych z zapasem na brak kolumny, edycja nie kasuje wspólnego pliku, plakat sprzątany', () => {
  const k = T.slice(T.indexOf('/* Firmy wspierające akcję: jeden formularz'), T.indexOf('</script>', T.indexOf('/* Firmy wspierające akcję: jeden formularz')));
  const us = k.slice(k.indexOf('async function usunFirme(f)'), k.indexOf("return 'usunieta';"));
  assert.ok(us.indexOf('window.BM_OKIENKO({') < us.indexOf("sb.rpc('akcja_firmy_usun'"), 'okienko przed wywołaniem');
  assert.match(us, /Nazwa, link, logo i plakat znikną z bazy od razu; do rozliczenia zostaje tylko kwota\./);
  assert.match(us, /if \(error \|\| !data \|\| data\.ok !== true\) \{/);
  assert.match(us, /const pliki = \(Array\.isArray\(data\.pliki\) \? data\.pliki : \[\]\)\.filter\(\(p\) => typeof p === 'string' && \/\^\[0-9a-f-\]\{36\}\\\.\(png\|jpg\|webp\)\$\/\.test\(p\)\);/);
  assert.doesNotMatch(k, /\.delete\(\)/, 'DELETE z przeglądarki znika z całego bloku firm');
  assert.match(k, /if \(zFiltrem\) q = q\.is\('usunieta_at', null\);/); assert.match(k, /if \(error && error\.code === '42703'\) \(\{ data, error \} = await zapytanie\(false\)\);/);
  assert.match(k, /async function plikWolny\(adres, pozaId\) \{[\s\S]{0,400}for \(const kolumna of \['logo_url', 'plakat_url'\]\)[\s\S]{0,200}if \(r\.error \|\| \(r\.data && r\.data\.length\)\) return false;/);
  assert.match(k, /\[\[edycja\.logo_url, wgrany\], \[edycja\.plakat_url, p\.wiersz\.plakat_url \? plikLogo\(p\.wiersz\.plakat_url\) : ''\]\]/);
  assert.match(k, /if \(plik && plik !== nowy && await plikWolny\(adres, edycja\.id\)\)/);
  assert.match(k, /const poId = firmaId \? firmy\.filter\(\(x\) => x\.id === firmaId\) : \[\];/);
  assert.match(k, /if \(kod === 'PGRST202'\) return 'baza jeszcze nie zna usuwania firm/);
});

test('panel zgłoszeń: usunięta bez guzików, usuwanie po firma_id; start-akcji: plik zastępczy próby o tej samej nazwie co w migracji, wgrywany przed dodaniem firm próby', () => {
  assert.match(P, /if \(z\.firma_usunieta\) \{ el\("div", "[^"]*", ramka, "Usunięta z Ulicy\."\); return; \}/);
  assert.ok(P.indexOf('if (z.firma_usunieta)') < P.indexOf('"Usuń z Ulicy"'), 'gałąź usuniętej przed guzikami');
  assert.ok(S.includes("var LOGO_PROBY = '" + ZAST + "';"));
  assert.match(S, /upload\(LOGO_PROBY, blob, \{ contentType: 'image\/png', upsert: false, cacheControl: '3600' \}\)/);
  assert.match(S, /addEventListener\('click', async function \(\) \{ await wgrajLogoProby\(\); sciezkaRpc\('akcja_proba_firmy', \{ p_dodaj: true \}/);
  assert.match(ZAST, /^[0-9a-f-]{36}\.(png|jpg|webp)$/, 'nazwa przechodzi CHECK kolumny i politykę wgrywania');
});
