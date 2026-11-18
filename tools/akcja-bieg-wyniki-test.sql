-- Testy BIEGU, ETAP 2 (20261126_akcja_bieg_wyniki.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS). Bieg próbny przy ulicy próbnej, weekend = wczoraj i dziś.
-- Strażnik licznika prawdziwej ulicy (obie drogi), uprawnienia, zgoda konta (także rodzic z samymi dziećmi) i rezygnacja tokenem, odbiorcy e-maila, parser czasu i tolerancja dystansu,
-- wynik automatem (najdłuższy dystans z listy, potem tempo; rower i trening spoza okna nie), wskazanie innego treningu, automat z crona, dziecko „swój dystans”, odznaki w kolekcji konta
-- (raz, z powiadomieniem), panel i ręczne zaliczenie tylko dla trenera (bez czasów), fazy (przed biegiem, po terminie), sprzątanie po 90 dniach z podsumowaniem. Zawsze wycofana (tools/akcja-bieg-wyniki-test.sh).
do $T$
declare
  n int := 0; j jsonb; k jsonb; k2 jsonb; j0 jsonb; t0 timestamptz; t1 timestamptz; t2 timestamptz; t3 timestamptz; t4 timestamptz; tt timestamptz; tok2 uuid; zw uuid; zw2 uuid; zwa uuid; zw2a uuid; tr uuid; b uuid; ja uuid; dz uuid; dz2 uuid; l_krotki uuid; l5 uuid; l10 uuid; l_rower uuid; l_stary uuid;
  D date := (now() at time zone 'Europe/Warsaw')::date; tok uuid; v text; przed jsonb;
  W constant text := '2026-11-v1';
begin
  -- konta: dwa konta zawodników z adresem e-mail (bez trenerów), zw bez treningów w ostatnich 10 dniach (prawdziwe treningi nie mieszają się z testowymi), i jeden trener
  select a.user_id into zw from public.athletes a where a.user_id is not null and a.full_name is not null and btrim(a.full_name) ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]{2,20}( |$)'
    and not exists (select 1 from public.coaches c where c.id = a.user_id) and exists (select 1 from auth.users u where u.id = a.user_id and u.email is not null)
    and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '10 days') order by a.created_at limit 1;
  select a.user_id into zw2 from public.athletes a where a.user_id is not null and a.user_id <> zw and not exists (select 1 from public.coaches c where c.id = a.user_id)
    and exists (select 1 from auth.users u where u.id = a.user_id and u.email is not null) order by a.created_at desc limit 1;
  select c.id into tr from public.coaches c limit 1;
  if zw is null or zw2 is null or tr is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  select a.id into zwa from public.athletes a where a.user_id = zw;
  select a.id into zw2a from public.athletes a where a.user_id = zw2;

  -- 0. strażnik licznika: prawdziwa ulica przed migracjami i po nich, obiema drogami produkcji, identyczna (pole bieg porównywane, gdy było już przed)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  select t.j into j0 from _licznik_przed t;
  if j0 is null then raise exception 'FAIL 0a: brak stanu licznika sprzed migracji (_licznik_przed)'; end if;
  if (j - 'bieg') <> (j0 - 'bieg') or (j0 ? 'bieg' and j->'bieg' is distinct from j0->'bieg') then raise exception 'FAIL 0b: licznik prawdziwej ulicy (service_role) zmienił się'; end if;
  select t.j into j0 from _licznik_przed_zal t;
  perform set_config('request.jwt.claims', json_build_object('sub', (select sub from _konto_straznika), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  if j0 is null or (j - 'bieg') <> (j0 - 'bieg') or (j0 ? 'bieg' and j->'bieg' is distinct from j0->'bieg') then raise exception 'FAIL 0c: licznik prawdziwej ulicy (zalogowany) zmienił się'; end if;
  n := n + 3;

  -- przygotowanie: ulica próbna, bieg próbny w fazie „trwa” (wczoraj–dziś), zapis zw na 5 km ze zgodą na e-mail i dziecko zw; zw2 tylko z dzieckiem
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', D, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  update public.akcje set konta_testowe = coalesce(konta_testowe, '{}'::uuid[]) || array(select a.id from public.athletes a) where slug = 'proba';   -- 20261211: bieg akcji testowej przyjmuje tylko konta_testowe; konta testu dopisane w tej transakcji
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-wyniki', 'Bieg próbny', D - 1, D, D + 2, '{5,10}', 'otwarty', W) returning id into b;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-wyniki', 5, true, true, W, 'Ola');
  if not (j->>'ok')::boolean then raise exception 'FAIL 0d: zapis zw: %', j; end if;
  ja := (j->>'id')::uuid;
  j := public.akcja_bieg_dopisz_dziecko('proba-wyniki', 'Zosia', true, true, W);
  if not (j->>'ok')::boolean then raise exception 'FAIL 0e: dziecko zw: %', j; end if;
  dz := (j->>'id')::uuid;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-wyniki', 'Kuba', false, true, W);
  if not (j->>'ok')::boolean then raise exception 'FAIL 0f: dziecko zw2: %', j; end if;
  dz2 := (j->>'id')::uuid;
  execute 'reset role';

  -- 1. uprawnienia: nowe tabele bez dostępu z przeglądarki; anon nic; funkcje serwisowe tylko dla service_role; wewnętrzne dla nikogo
  if has_table_privilege('anon', 'public.akcja_bieg_zgody', 'SELECT') or has_table_privilege('authenticated', 'public.akcja_bieg_zgody', 'SELECT')
     or has_table_privilege('authenticated', 'public.akcja_bieg_maile', 'SELECT') or has_table_privilege('anon', 'public.akcja_bieg_maile', 'SELECT') then raise exception 'FAIL 1a: tabele etapu 2 dostępne z przeglądarki'; end if;
  foreach v in array array['public.akcja_bieg_moja_zgoda(text)', 'public.akcja_bieg_zgoda_email(text, boolean)', 'public.akcja_bieg_wynik_ustal(uuid, uuid)', 'public.akcja_bieg_treningi_z_okna(text)',
                           'public.akcja_bieg_dziecko_ukoncz(uuid, numeric)', 'public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)', 'public.akcja_bieg_panel(text)'] loop
    if has_function_privilege('anon', v, 'EXECUTE') or not has_function_privilege('authenticated', v, 'EXECUTE') then raise exception 'FAIL 1b: %: anon nie, authenticated tak', v; end if;
  end loop;
  foreach v in array array['public.akcja_bieg_rezygnacja(uuid)', 'public.akcja_bieg_do_przypomnienia(timestamptz, integer)', 'public.akcja_bieg_mail_zapisz(uuid, uuid, text)', 'public.akcja_bieg_automat()', 'public.akcja_bieg_sprzatanie()'] loop
    if has_function_privilege('anon', v, 'EXECUTE') or has_function_privilege('authenticated', v, 'EXECUTE') or not has_function_privilege('service_role', v, 'EXECUTE') then raise exception 'FAIL 1c: % tylko dla service_role', v; end if;
  end loop;
  foreach v in array array['public.akcja_bieg_wynik_z_treningu(uuid, uuid)', 'public.akcja_bieg_odznaka(uuid)', 'public.akcja_bieg_sekundy(text)', 'public.akcja_bieg_dystans_zaliczony(integer[], numeric)',
                           'public.akcja_bieg_liczby(uuid)', 'public.akcja_bieg_zgoda_z_zapisu()'] loop
    if has_function_privilege('anon', v, 'EXECUTE') or has_function_privilege('authenticated', v, 'EXECUTE') then raise exception 'FAIL 1d: % wewnętrzna', v; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.akcja_bieg_publiczny(text)', 'EXECUTE') or has_function_privilege('service_role', 'public.akcja_bieg_publiczny(text)', 'EXECUTE') then raise exception 'FAIL 1e: publiczny tylko przez licznik'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin perform public.akcja_bieg_wynik_ustal(ja, null); raise exception 'FAIL 1f: anon ustala wynik'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 6;

  -- 2. zgoda konta: z zapisu „ja” (wyzwalacz), rodzic z samymi dziećmi włącza ją sam, konto bez zapisu nie; odbiorcy e-maila; rezygnacja tokenem bez logowania
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moja_zgoda('proba-wyniki');
  if not (j->>'zgoda_email')::boolean or not (j->>'ma_zapis')::boolean then raise exception 'FAIL 2a: zgoda z zapisu: %', j; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moja_zgoda('proba-wyniki');
  if (j->>'zgoda_email')::boolean or not (j->>'ma_zapis')::boolean then raise exception 'FAIL 2b: rodzic z samymi dziećmi przed zgodą: %', j; end if;
  j := public.akcja_bieg_zgoda_email('proba-wyniki', true);
  if not (j->>'ok')::boolean then raise exception 'FAIL 2c: rodzic z samymi dziećmi włącza zgodę: %', j; end if;
  if not (public.akcja_bieg_moja_zgoda('proba-wyniki')->>'zgoda_email')::boolean then raise exception 'FAIL 2d: zgoda nie zapisana'; end if;
  j := public.akcja_bieg_zgoda_email('nie-ma-takiego', true);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 2e: nieistniejący bieg: %', j; end if;
  execute 'reset role';
  update public.akcja_bieg_uczestnicy set wycofany_at = now() where id = dz2;   -- bez aktywnego zapisu zgody się nie zmienia
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zgoda_email('proba-wyniki', false);
  if (j->>'ok')::boolean or j->>'powod' <> 'brak_zapisu' then raise exception 'FAIL 2f: konto bez aktywnego zapisu: %', j; end if;
  execute 'reset role';
  update public.akcja_bieg_uczestnicy set wycofany_at = null where id = dz2;
  -- odbiorcy e-maila i limit dobowy z logu: bieg dwudniowy przesunięty na chwilę daleko w przyszłość; chwile wybrane tak, że okno jest to samo przed 20261207
  -- (dwa dni przed startem od 18:00, dzień przed od 8:00) i po niej (3 dni przed końcem od 8:00, zaległe następnego dnia),
  -- żeby prawdziwe wysyłki z logu nie liczyły się do doby testu; potem daty wracają
  update public.akcja_biegi set dzien_od = D + 400, dzien_do = D + 401, wynik_do = D + 403 where id = b;
  t0 := ((D + 398)::timestamp + interval '7 hours 55 minutes') at time zone 'Europe/Warsaw'; t1 := ((D + 398)::timestamp + interval '18 hours 5 minutes') at time zone 'Europe/Warsaw';
  t2 := ((D + 397)::timestamp + interval '20 hours') at time zone 'Europe/Warsaw';  t3 := ((D + 399)::timestamp + interval '8 hours 5 minutes') at time zone 'Europe/Warsaw';
  t4 := ((D + 400)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  foreach tt in array array[t0, t2, t4] loop
    if exists (select 1 from jsonb_array_elements(public.akcja_bieg_do_przypomnienia(tt)) e where (e->>'bieg_id')::uuid = b) then raise exception 'FAIL 2g: poza oknem wysyłki (%)', tt; end if;
  end loop;
  k := public.akcja_bieg_do_przypomnienia(t1);
  k2 := public.akcja_bieg_do_przypomnienia(t3);
  j := public.akcja_bieg_do_przypomnienia(t1, 1);
  execute 'reset role';
  if not exists (select 1 from jsonb_array_elements(k) e where (e->>'konto_id')::uuid = zw2a and jsonb_array_length(e->'uczestnicy') = 1 and e->'uczestnicy'->0->>'rodzaj' = 'dziecko' and e->>'token' is not null and e->>'email' is not null and (e->>'dni_do_biegu')::int = 2)
     or not exists (select 1 from jsonb_array_elements(k) e where (e->>'konto_id')::uuid = zwa and jsonb_array_length(e->'uczestnicy') = 2) then raise exception 'FAIL 2h: dwa dni przed od 18:00 (rodzic z samymi dziećmi i konto z dzieckiem)'; end if;
  if (select count(*) from jsonb_array_elements(k2) e where (e->>'bieg_id')::uuid = b and (e->>'dni_do_biegu')::int = 1) <> 2 then raise exception 'FAIL 2i: dzień przed od 8:00: %', k2; end if;
  if jsonb_array_length(j) <> 1 then raise exception 'FAIL 2j: limit 1 = jeden odbiorca: %', jsonb_array_length(j); end if;
  if exists (select 1 from jsonb_array_elements(k) e, jsonb_array_elements(e->'uczestnicy') x where x ? 'wynik_s' or x ? 'konto_id') then raise exception 'FAIL 2k: w liście do e-maila za dużo pól'; end if;
  insert into public.akcja_bieg_maile (bieg_id, konto_id, wyslano_at) values (b, zw2a, t1);   -- jedna wysyłka tej doby (jak z EF), liczona do limitu
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_do_przypomnienia(t1 + interval '1 minute', 2);
  k := public.akcja_bieg_do_przypomnienia(t1 + interval '2 minutes', 1);
  execute 'reset role';
  if jsonb_array_length(j) <> 1 or (j->0->>'konto_id')::uuid <> zwa then raise exception 'FAIL 2l: limit 2 minus jedna wysyłka z logu = jeden, bez wysłanego: %', j; end if;
  if jsonb_array_length(k) <> 0 then raise exception 'FAIL 2m: limit wyczerpany wysyłką z logu: %', k; end if;
  delete from public.akcja_bieg_maile where bieg_id = b;
  update public.akcja_biegi set dzien_od = D - 1, dzien_do = D, wynik_do = D + 2 where id = b;
  -- rezygnacja tokenem bez logowania; po rezygnacji i po wysyłce konto nie wraca na listę
  select z.token into tok from public.akcja_bieg_zgody z where z.bieg_id = b and z.konto_id = zwa;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_rezygnacja(tok);
  if not (j->>'ok')::boolean or j->>'nazwa' <> 'Bieg próbny' then raise exception 'FAIL 2n: rezygnacja tokenem: %', j; end if;
  j := public.akcja_bieg_rezygnacja(gen_random_uuid());
  if (j->>'ok')::boolean then raise exception 'FAIL 2o: obcy token'; end if;
  perform public.akcja_bieg_mail_zapisz(b, zw2a, null);
  k := public.akcja_bieg_do_przypomnienia(((D - 2)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw');
  execute 'reset role';
  if exists (select 1 from jsonb_array_elements(k) e where (e->>'konto_id')::uuid in (zwa, zw2a)) then raise exception 'FAIL 2p: po rezygnacji i po wysyłce konto nie wraca na listę'; end if;
  if (select zgoda_email from public.akcja_bieg_uczestnicy where id = ja) then raise exception 'FAIL 2q: rezygnacja ma zgasić też pole w wierszu „ja”'; end if;
  n := n + 17;

  -- 2T. token rezygnacji: losowy UUID z bazy, unikalny, jeden na konto i bieg, stały przy zmianach zgody; wychodzi WYŁĄCZNIE z listy do e-maila (rola serwisowa)
  if (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = 'public.akcja_bieg_zgody'::regclass and a.attname = 'token') <> 'gen_random_uuid()' then raise exception 'FAIL 2T-a: token nie z gen_random_uuid()'; end if;
  if not exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                  where i.indrelid = 'public.akcja_bieg_zgody'::regclass and i.indisunique and i.indnatts = 1 and a.attname = 'token') then raise exception 'FAIL 2T-b: token bez unikalności'; end if;
  if (select array_agg(a.attname::text order by a.attname) from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.conrelid = 'public.akcja_bieg_zgody'::regclass and c.contype = 'p') <> array['bieg_id', 'konto_id'] then raise exception 'FAIL 2T-c: jeden wiersz (i token) na konto i bieg'; end if;
  select z.token into tok2 from public.akcja_bieg_zgody z where z.bieg_id = b and z.konto_id = zw2a;
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.akcja_bieg_zgoda_email('proba-wyniki', false); perform public.akcja_bieg_zgoda_email('proba-wyniki', true);
  v := public.akcja_bieg_moi('proba-wyniki')::text || public.akcja_bieg_moja_zgoda('proba-wyniki')::text || public.akcja_bieg_zgoda_email('proba-wyniki', true)::text || public.akcja_licznik('proba')::text;
  execute 'reset role';
  if (select z.token from public.akcja_bieg_zgody z where z.bieg_id = b and z.konto_id = zw2a) <> tok2 then raise exception 'FAIL 2T-d: token zmienił się przy zmianie zgody'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  v := v || public.akcja_licznik('proba')::text || coalesce(public.akcja_bieg_ukonczyli('proba-wyniki', 0, 100)::text, '');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v := v || public.akcja_bieg_panel('proba-wyniki')::text;
  execute 'reset role';
  if position(tok::text in v) > 0 or position(tok2::text in v) > 0 or v ~* '"token"' then raise exception 'FAIL 2T-e: token wyszedł z funkcji dla przeglądarki albo licznika'; end if;
  if (select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'akcja\_bieg%' and p.prosrc ~ 'token')
     <> 'akcja_bieg_do_przypomnienia,akcja_bieg_rezygnacja' then raise exception 'FAIL 2T-f: token czytają tylko lista do e-maila i rezygnacja'; end if;
  n := n + 6;

  -- 3. czas i dystans: formaty z zegarka i formularza; tolerancja GPS 2 %
  if public.akcja_bieg_sekundy('45:30') <> 2730 or public.akcja_bieg_sekundy('1:02:05') <> 3725 or public.akcja_bieg_sekundy(' 5400 ') <> 5400
     or public.akcja_bieg_sekundy('abc') is not null or public.akcja_bieg_sekundy('99999999999') is not null or public.akcja_bieg_sekundy('0') is not null
     or public.akcja_bieg_sekundy('45:99') is not null or public.akcja_bieg_sekundy(null) is not null then raise exception 'FAIL 3a: parser czasu'; end if;
  if public.akcja_bieg_dystans_zaliczony('{5,10}', 9.8) <> 10 or public.akcja_bieg_dystans_zaliczony('{5,10}', 9.79) <> 5 or public.akcja_bieg_dystans_zaliczony('{5,10}', 4.9) <> 5
     or public.akcja_bieg_dystans_zaliczony('{5,10}', 4.89) is not null then raise exception 'FAIL 3b: tolerancja dystansu'; end if;
  n := n + 2;

  -- 4. wynik automatem: treningi zw w oknie i poza nim; liczy się najdłuższy dystans z listy (zapis na 5, zrobione 10 → 10), nawet gdy 5 km było szybsze; rower i trening sprzed weekendu nie
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (zwa, 3, '20:00', 'Spokojny', 'Run', ((D - 1)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tb1') returning id into l_krotki;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (zwa, 5.2, '25:00', 'Spokojny', 'Run', ((D - 1)::timestamp + interval '10 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tb2') returning id into l5;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (zwa, 10.1, '58:00', 'Spokojny', 'Run', (D::timestamp + interval '1 hour') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tb3') returning id into l10;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (zwa, 30, '1:10:00', 'Rower', 'Ride', ((D - 1)::timestamp + interval '12 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tb4') returning id into l_rower;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (zwa, 15, '1:20:00', 'Spokojny', 'Run', ((D - 3)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tb5') returning id into l_stary;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_treningi_z_okna('proba-wyniki');
  if jsonb_array_length(k) <> 3 or exists (select 1 from jsonb_array_elements(k) e where (e->>'id')::uuid in (l_rower, l_stary))
     or not exists (select 1 from jsonb_array_elements(k) e where (e->>'id')::uuid = l_krotki and e->'zalicza_km' = 'null'::jsonb) then raise exception 'FAIL 4a: treningi z okna: %', k; end if;
  j := public.akcja_bieg_wynik_ustal(ja, null);
  if not (j->>'ok')::boolean or (j->>'wynik_dystans_km')::int <> 10 or (j->>'wynik_s')::int <> 3480 or (j->>'log_id')::uuid <> l10 then raise exception 'FAIL 4b: automat (10 km, 58:00): %', j; end if;
  j := public.akcja_bieg_wynik_ustal(ja, l5);
  if not (j->>'ok')::boolean or (j->>'wynik_dystans_km')::int <> 5 or (j->>'wynik_s')::int <> 1500 then raise exception 'FAIL 4c: wskazany trening 5 km: %', j; end if;
  foreach v in array array[l_rower::text, l_stary::text, l_krotki::text] loop
    j := public.akcja_bieg_wynik_ustal(ja, v::uuid);
    if (j->>'ok')::boolean or j->>'powod' <> 'brak_treningu' then raise exception 'FAIL 4d: trening % nie może zaliczyć: %', v, j; end if;
  end loop;
  j := public.akcja_bieg_wynik_ustal(dz, null);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_twoj' then raise exception 'FAIL 4e: dziecko nie ma wyniku z treningu: %', j; end if;
  j := public.akcja_bieg_moi('proba-wyniki');
  if not exists (select 1 from jsonb_array_elements(j) e where (e->>'id')::uuid = ja and (e->>'wynik_dystans_km')::int = 5 and (e->>'wynik_s')::int = 1500 and e->>'odznaka' = 'zwykla' and e->>'ukonczony_at' is not null) then raise exception 'FAIL 4f: moje zapisy po wyniku: %', j; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(ja, null);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_twoj' then raise exception 'FAIL 4g: cudzy zapis: %', j; end if;
  execute 'reset role';
  if (select count(*) from public.achievements where athlete_id = zwa and badge_id = 'bieg-proba-wyniki') <> 1 then raise exception 'FAIL 4h: odznaka biegu raz w kolekcji konta'; end if;
  if (select count(*) from public.notifications where athlete_id = zwa and type = 'badge' and message = 'Zdobyłeś odznakę: Bieg próbny 🏅') <> 1 then raise exception 'FAIL 4i: jedno powiadomienie o odznace'; end if;
  n := n + 9;

  -- 5. automat z crona: zapis bez wyniku dostaje najlepszy trening z okna
  update public.akcja_bieg_uczestnicy set ukonczony_at = null, wynik_s = null, wynik_dystans_km = null, wynik_log_id = null where id = ja;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_bieg_automat() < 1 then raise exception 'FAIL 5a: automat nic nie ustalił'; end if;
  execute 'reset role';
  if (select wynik_dystans_km from public.akcja_bieg_uczestnicy where id = ja) <> 10 then raise exception 'FAIL 5b: automat z crona: 10 km'; end if;
  if (select count(*) from public.achievements where athlete_id = zwa and badge_id = 'bieg-proba-wyniki') <> 1 then raise exception 'FAIL 5c: odznaka nie dubluje się'; end if;
  n := n + 3;

  -- 6. dziecko: rodzic wpisuje swój dystans; odznaka dziecka w kolekcji rodzica; cudze dziecko i zły dystans nie
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach v in array array['0', '0.05', '150'] loop
    j := public.akcja_bieg_dziecko_ukoncz(dz, v::numeric);
    if (j->>'ok')::boolean or j->>'powod' <> 'dystans' then raise exception 'FAIL 6a: dystans dziecka %: %', v, j; end if;
  end loop;
  j := public.akcja_bieg_dziecko_ukoncz(dz, 1.456);
  if not (j->>'ok')::boolean or (j->>'dystans_wlasny_km')::numeric <> 1.46 then raise exception 'FAIL 6b: dziecko 1,46 km: %', j; end if;
  j := public.akcja_bieg_dziecko_ukoncz(dz2, 2);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_twoj' then raise exception 'FAIL 6c: cudze dziecko: %', j; end if;
  execute 'reset role';
  if not exists (select 1 from public.achievements where athlete_id = zwa and badge_id = 'bieg-proba-wyniki-dziecko-' || (select numer from public.akcja_bieg_uczestnicy where id = dz)) then raise exception 'FAIL 6d: odznaka dziecka w kolekcji rodzica'; end if;
  if (select wynik_s from public.akcja_bieg_uczestnicy where id = dz) is not null then raise exception 'FAIL 6e: dziecko bez czasu'; end if;
  n := n + 5;

  -- 7. panel trenera: tylko trener, bez czasów, kont i e-maili; ręczne zaliczenie dziecka zw2 i walidacja
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.akcja_bieg_panel('proba-wyniki'); raise exception 'FAIL 7a: panel dla zawodnika'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_bieg_zalicz_recznie(dz2, 2, null); raise exception 'FAIL 7b: zaliczenie przez zawodnika'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-wyniki');
  if k->'bieg'->>'slug' <> 'proba-wyniki' or jsonb_array_length(k->'uczestnicy') <> 3 or not exists (select 1 from jsonb_array_elements(k->'biegi') e where e->>'slug' = 'proba-wyniki') then raise exception 'FAIL 7c: panel: %', k; end if;
  if k::text ~* '"wynik_s"|konto|"email"|oswiadczenie|token|wynik_log' then raise exception 'FAIL 7d: w panelu dane prywatne'; end if;
  if not exists (select 1 from jsonb_array_elements(k->'uczestnicy') e where (e->>'id')::uuid = ja and (e->>'ukonczony')::boolean and (e->>'z_treningu')::boolean and not (e->>'zaliczony_recznie')::boolean) then raise exception 'FAIL 7e: stan „ja” w panelu'; end if;
  j := public.akcja_bieg_zalicz_recznie(ja, 7, null);
  if (j->>'ok')::boolean or j->>'powod' <> 'dystans' then raise exception 'FAIL 7f: dystans spoza listy: %', j; end if;
  j := public.akcja_bieg_zalicz_recznie(ja, 5, 30);
  if (j->>'ok')::boolean or j->>'powod' <> 'czas' then raise exception 'FAIL 7g: czas poniżej minuty: %', j; end if;
  j := public.akcja_bieg_zalicz_recznie(dz2, 2, 600);
  if (j->>'ok')::boolean or j->>'powod' <> 'czas' then raise exception 'FAIL 7h: dziecko bez czasu: %', j; end if;
  j := public.akcja_bieg_zalicz_recznie(dz2, 2, null);
  if not (j->>'ok')::boolean then raise exception 'FAIL 7i: zaliczenie dziecka zw2: %', j; end if;
  k := public.akcja_bieg_panel(null);
  if k->'bieg'->>'slug' is null then raise exception 'FAIL 7j: panel bez slugu pokazuje najnowszy bieg'; end if;
  execute 'reset role';
  if not exists (select 1 from public.achievements where athlete_id = zw2a and badge_id = 'bieg-proba-wyniki-dziecko-' || (select numer from public.akcja_bieg_uczestnicy where id = dz2))
     or (select zaliczony_przez from public.akcja_bieg_uczestnicy where id = dz2) <> tr then raise exception 'FAIL 7k: ręczne zaliczenie: odznaka i ślad trenera'; end if;
  n := n + 11;

  -- 8. fazy: przed biegiem nic, po wynik_do + 7 trener nie zalicza
  update public.akcja_biegi set dzien_od = D + 2, dzien_do = D + 3, wynik_do = D + 5 where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(ja, null);
  if (j->>'ok')::boolean or j->>'powod' <> 'poza_oknem' then raise exception 'FAIL 8a: wynik przed biegiem: %', j; end if;
  j := public.akcja_bieg_dziecko_ukoncz(dz, 2);
  if (j->>'ok')::boolean or j->>'powod' <> 'poza_oknem' then raise exception 'FAIL 8b: dziecko przed biegiem: %', j; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(ja, 5, null);
  if (j->>'ok')::boolean or j->>'powod' <> 'przed_biegiem' then raise exception 'FAIL 8c: zaliczenie przed biegiem: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set dzien_od = D - 12, dzien_do = D - 11, wynik_do = D - 10 where id = b;
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(ja, 5, null);
  if (j->>'ok')::boolean or j->>'powod' <> 'za_pozno' then raise exception 'FAIL 8d: zaliczenie po terminie: %', j; end if;
  execute 'reset role';
  n := n + 4;

  -- 9. sprzątanie 90 dni po wynik_do: wiersze uczestników, zgód i wysyłek znikają, liczby zostają w podsumowaniu i w liczniku, odznaki zostają
  przed := public.akcja_licznik('proba')->'bieg';
  update public.akcja_biegi set dzien_od = D - 100, dzien_do = D - 99, wynik_do = D - 98 where id = b;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_bieg_sprzatanie() < 1 then raise exception 'FAIL 9a: sprzątanie nic nie zrobiło'; end if;
  execute 'reset role';
  if exists (select 1 from public.akcja_bieg_uczestnicy where bieg_id = b) or exists (select 1 from public.akcja_bieg_zgody where bieg_id = b) or exists (select 1 from public.akcja_bieg_maile where bieg_id = b) then raise exception 'FAIL 9b: dane osób po 90 dniach'; end if;
  if (select podsumowanie from public.akcja_biegi where id = b) is null then raise exception 'FAIL 9c: brak podsumowania'; end if;
  k := public.akcja_licznik('proba')->'bieg';
  if (k->>'zapisani')::int <> (przed->>'zapisani')::int or (k->>'dzieci')::int <> 2 or (k->>'ukonczyli_n')::int <> (przed->>'ukonczyli_n')::int or (k->>'ukonczyli_n')::int <> 3 then raise exception 'FAIL 9d: liczby po sprzątaniu: % vs %', k, przed; end if;
  if not exists (select 1 from public.achievements where athlete_id = zwa and badge_id = 'bieg-proba-wyniki') then raise exception 'FAIL 9e: odznaka zostaje'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_bieg_sprzatanie() <> 0 then raise exception 'FAIL 9f: drugie sprzątanie ma nic nie robić'; end if;
  execute 'reset role';
  n := n + 6;

  raise exception 'TESTY WYNIKÓW BIEGU ZIELONE: % sprawdzeń', n;
end $T$;
