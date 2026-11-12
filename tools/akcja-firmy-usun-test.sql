-- Testy „USUŃ FIRMĘ” (20261113_akcja_firmy_usuniecie.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS).
-- Miękkie usunięcie czyści dane i zostawia rozliczenie; pliki do skasowania tylko własne; publicznie usuniętej nie ma; DELETE z przeglądarki odebrany; „Pokaż” nie wskrzesza;
-- firmy próby mają własny plik zastępczy. Jedna transakcja, zawsze wycofana (tools/akcja-firmy-usun-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; c int; j jsonb; tr uuid; zw uuid; f1 uuid; f2 uuid; z1 uuid; f record; z record;
  LOGO constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/00000000-0000-4000-8000-000000000011.webp';
  PLAKAT constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/00000000-0000-4000-8000-000000000012.webp';
  ZAST constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/aaaaaaaa-0000-4000-8000-00000000f1f1.png';
begin
  select id into tr from public.coaches limit 1;
  select a.user_id into zw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches k where k.id = a.user_id) order by a.created_at limit 1;
  if tr is null or zw is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', current_date, 100, 10, true, now()) on conflict (slug) do update set push_start_at = now(), wystartowala_at = now(), koniec = null;
  delete from public.akcja_firmy_zgloszenia where akcja_slug = 'proba';
  delete from public.akcja_firmy where akcja_slug = 'proba';   -- czysty stół na próbie (transakcja wycofywana)

  -- 1. uprawnienia: anon i zawodnik nie wykonają RPC; DELETE z przeglądarki odebrany; nowe kolumny czytelne, niezapisywalne
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin perform public.akcja_firmy_usun(gen_random_uuid()); raise exception 'FAIL 1a: anon usuwa firmę'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.akcja_firmy_usun(gen_random_uuid()); raise exception 'FAIL 1b: zawodnik usuwa firmę'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  if has_table_privilege('authenticated', 'public.akcja_firmy', 'DELETE') then raise exception 'FAIL 1c: DELETE z przeglądarki wciąż dozwolony'; end if;
  if has_table_privilege('anon', 'public.akcja_firmy', 'SELECT') or has_any_column_privilege('anon', 'public.akcja_firmy', 'SELECT') then raise exception 'FAIL 1d: anon czyta firmy'; end if;
  if has_column_privilege('authenticated', 'public.akcja_firmy', 'usunieta_at', 'UPDATE') or has_column_privilege('authenticated', 'public.akcja_firmy', 'usunal', 'UPDATE') then raise exception 'FAIL 1e: usunięcie zapisywalne z przeglądarki'; end if;
  if not has_column_privilege('authenticated', 'public.akcja_firmy', 'usunieta_at', 'SELECT') then raise exception 'FAIL 1f: panel nie przeczyta usunieta_at'; end if;
  n := n + 6;

  -- 2. dwie firmy próby ze wspólnym logo, pierwsza z plakatem i kwotą ze zgodą, zgłoszenie powiązane z pierwszą; licznik próby widzi obie
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane, zgoda_na_wymienienie, plakat_url)
    values ('proba', 'Firma Jeden', 'https://jeden.example.pl', LOGO, 'domek', 'wplata', 50000, true, true, true, PLAKAT) returning id into f1;
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane, zgoda_na_wymienienie)
    values ('proba', 'Firma Dwa', 'https://dwa.example.pl', LOGO, 'wiezowiec', 'wplata', 300000, false, true, true) returning id into f2;
  insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, link, email, zgoda_na_wymienienie, kwota_gr, status, decyzja_at, firma_id)
    values ('proba', 'domek', 'Firma Jeden', 'https://jeden.example.pl', 'ktos@example.pl', true, 50000, 'zatwierdzone', now(), f1) returning id into z1;
  j := public.akcja_licznik('proba');
  if not exists (select 1 from jsonb_array_elements(j->'firmy') e where e->>'nazwa' = 'Firma Jeden' and (e->>'kwota_gr')::int = 50000 and e->>'logo_url' = LOGO) then raise exception 'FAIL 2a: licznik próby nie widzi firmy przed usunięciem: %', j->'firmy'; end if;
  if (select count(*) from jsonb_array_elements(j->'firmy')) <> 2 then raise exception 'FAIL 2b: licznik próby: % firm zamiast 2', (select count(*) from jsonb_array_elements(j->'firmy')); end if;
  n := n + 2;

  -- 3. trener usuwa pierwszą: ok, do skasowania tylko plakat (logo dzieli z drugą)
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_firmy_usun(f1);
  execute 'reset role';
  if not (j->>'ok')::boolean then raise exception 'FAIL 3a: usunięcie odmówione: %', j; end if;
  if j->'pliki' <> '["00000000-0000-4000-8000-000000000012.webp"]'::jsonb then raise exception 'FAIL 3b: pliki do skasowania % (ma być tylko plakat)', j->'pliki'; end if;
  n := n + 2;

  -- 4. wiersz: dane wizerunkowe wyczyszczone, rozliczenie zostaje; zgłoszenie: nazwa, link i e-mail wyczyszczone, powiązanie i status zostają
  select * into f from public.akcja_firmy where id = f1;
  if f.nazwa <> '[usunięta]' or f.link is not null or f.logo_url is not null or f.plakat_url is not null or f.plakat_tekst is not null then raise exception 'FAIL 4a: dane wizerunkowe zostały: % % %', f.nazwa, f.link, f.logo_url; end if;
  if not f.ukryta or f.usunieta_at is null or f.usunal is distinct from tr then raise exception 'FAIL 4b: brak znacznika usunięcia (ukryta %, usunieta_at %, usunal %)', f.ukryta, f.usunieta_at, f.usunal; end if;
  if f.kwota_gr <> 50000 or not f.zgoda_na_kwote or f.rodzaj <> 'domek' or f.wsparcie <> 'wplata' then raise exception 'FAIL 4c: rozliczenie zmienione'; end if;
  select * into z from public.akcja_firmy_zgloszenia where id = z1;
  if z.nazwa <> '[usunięta]' or z.link is not null or z.email is not null then raise exception 'FAIL 4d: zgłoszenie nie wyczyszczone: % % %', z.nazwa, z.link, z.email; end if;
  if z.firma_id is distinct from f1 or z.status <> 'zatwierdzone' or z.kwota_gr <> 50000 then raise exception 'FAIL 4e: zgłoszenie straciło powiązanie albo rozliczenie'; end if;
  n := n + 5;

  -- 5. publicznie: licznik próby bez usuniętej, z drugą; stan próby liczy 1 żywą i 0 ukrytych (usunięta nie jest „ukrytą”); lista zgłoszeń zna id i usunięcie
  j := public.akcja_licznik('proba');
  if (select count(*) from jsonb_array_elements(j->'firmy')) <> 1 or j::text like '%usunięta%' or j::text like '%Firma Jeden%' then raise exception 'FAIL 5a: usunięta w liczniku: %', j->'firmy'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_sciezka_stan();
  execute 'reset role';
  if (j->>'firmy')::int <> 1 or (j->>'firmy_ukryte')::int <> 0 then raise exception 'FAIL 5b: stan próby firmy % ukryte % (ma być 1 i 0)', j->>'firmy', j->>'firmy_ukryte'; end if;
  j := public.akcja_firmy_zgloszenia_lista();
  if not exists (select 1 from jsonb_array_elements(j->'zgloszenia') e where (e->>'id')::uuid = z1 and (e->>'firma_id')::uuid = f1 and (e->>'firma_usunieta')::boolean) then raise exception 'FAIL 5c: lista zgłoszeń bez firma_id/firma_usunieta'; end if;
  n := n + 3;

  -- 6. drugie wywołanie: juz_usunieta; obce id: nie_ma; NULL: błąd
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (public.akcja_firmy_usun(f1))->>'powod' is distinct from 'juz_usunieta' then raise exception 'FAIL 6a: drugie usunięcie nie mówi juz_usunieta'; end if;
  if (public.akcja_firmy_usun(gen_random_uuid()))->>'powod' is distinct from 'nie_ma' then raise exception 'FAIL 6b: obce id nie mówi nie_ma'; end if;
  begin perform public.akcja_firmy_usun(null); raise exception 'FAIL 6c: NULL przeszedł'; exception when null_value_not_allowed then null; end;
  n := n + 3;

  -- 7. UPDATE z przeglądarki: usuniętego wiersza nie rusza („Pokaż” nie wskrzesza), żywy edytowalny jak dotąd
  update public.akcja_firmy set ukryta = false where id = f1; get diagnostics c = row_count;
  if c <> 0 then raise exception 'FAIL 7a: „Pokaż” wskrzesza usuniętą'; end if;
  update public.akcja_firmy set nazwa = 'Firma Dwa Bis' where id = f2; get diagnostics c = row_count;
  if c <> 1 then raise exception 'FAIL 7b: edycja żywej firmy nie działa'; end if;
  execute 'reset role';
  if (select nazwa from public.akcja_firmy where id = f1) <> '[usunięta]' then raise exception 'FAIL 7c: usunięta zmieniona'; end if;
  n := n + 3;

  -- 8. firmy próby: własny plik zastępczy, nigdy logo prawdziwej firmy; po ich dodaniu usunięcie drugiej oddaje jej logo (nikt inny go nie używa)
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_firmy(true);
  execute 'reset role';
  if exists (select 1 from public.akcja_firmy where akcja_slug = 'proba' and nazwa like '%Prób%' and logo_url is not null and logo_url <> ZAST) then raise exception 'FAIL 8a: firma próby z cudzym logo'; end if;
  if (select logo_url from public.akcja_firmy where akcja_slug = 'proba' and nazwa = 'Partner Próbny') is distinct from ZAST then raise exception 'FAIL 8b: Partner Próbny bez pliku zastępczego'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_firmy_usun(f2);
  execute 'reset role';
  if j->'pliki' <> '["00000000-0000-4000-8000-000000000011.webp"]'::jsonb then raise exception 'FAIL 8c: po usunięciu ostatniego użytkownika logo pliki % (ma być logo)', j->'pliki'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_firmy(false);
  execute 'reset role';
  if not (j->'pliki' ? 'aaaaaaaa-0000-4000-8000-00000000f1f1.png') then raise exception 'FAIL 8d: usunięcie firm próby nie oddaje pliku zastępczego: %', j->'pliki'; end if;
  if exists (select 1 from public.akcja_firmy where akcja_slug = 'proba') then raise exception 'FAIL 8e: „Usuń firmy próby” zostawia wiersze (próba to dane testowe, tam kasujemy twardo)'; end if;
  n := n + 5;

  -- 9. definicje i polityki: funkcje pomijają usunięte, próba nie czyta cudzego logo, trzy polityki trenera, brak polityki DELETE, UPDATE tylko na żywych
  if pg_get_functiondef('public.akcja_licznik(text)'::regprocedure) !~ 'and f\.usunieta_at is null;' then raise exception 'FAIL 9a: licznik bez filtru usunięcia'; end if;
  if (select count(*) from regexp_matches(pg_get_functiondef('public.akcja_sciezka_stan()'::regprocedure), 'f\.usunieta_at is null', 'g')) <> 2 then raise exception 'FAIL 9b: stan próby bez filtru usunięcia'; end if;
  if pg_get_functiondef('public.akcja_proba_firmy(boolean)'::regprocedure) ~ 'select f\.logo_url into v_logo' then raise exception 'FAIL 9c: próba czyta logo prawdziwej firmy'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy') <> 3
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy' and (cmd = 'DELETE' or roles <> '{authenticated}' or (coalesce(qual, '') || coalesce(with_check, '')) not like '%auth_is_coach()%'))
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy' and cmd = 'UPDATE' and qual like '%usunieta_at IS NULL%' and with_check like '%usunieta_at IS NULL%') then
    raise exception 'FAIL 9d: polityki akcja_firmy inne, niż oczekiwane';
  end if;
  if has_function_privilege('anon', 'public.akcja_firmy_usun(uuid)', 'EXECUTE') then raise exception 'FAIL 9e: anon ma EXECUTE na usuwaniu'; end if;
  n := n + 5;

  raise exception 'TESTY USUWANIA FIRM ZIELONE: % asercji', n;
end $T$;
