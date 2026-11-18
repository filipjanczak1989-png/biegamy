-- Test po skutku 20261214 (czas na dystans biegu z tempa, regulamin v5). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa), bieg próbny 'proba-tempo' na 5 km, zapisy i treningi tylko tutaj; sześć kont bez treningów z ostatnich 40 dni i jeden trener; imiona wymyślone.
-- Automatu (akcja_bieg_automat) tu nie wołamy: przechodzi po wszystkich otwartych biegach, także prawdziwym. Kolejność wyboru sprawdza akcja_bieg_wynik_z_treningu bez wskazania.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; k jsonb; e jsonb; b uuid; tr uuid; ka uuid[]; ku uuid[]; v text;
  uA uuid; uB uuid; uC uuid; uD uuid; uE uuid; uF uuid; uz uuid; lA uuid; lA11 uuid; lE54 uuid; lE6 uuid;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v5';
  LISTA constant text := 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)';
begin
  if to_regprocedure('public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi)') is null then raise exception 'FAIL 1: brak akcja_bieg_czas_biegu (migracja 20261214 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. uprawnienia: nowe funkcje bez przeglądarki; lista tylko service_role (EF); „moje zapisy” i wybór treningu tylko zalogowani
  foreach v in array array['public.akcja_bieg_wersja_od(text, integer)', 'public.akcja_bieg_czas_na_dystans(integer, numeric, integer, boolean)', 'public.akcja_bieg_gorna_rankingu(public.akcja_bieg_uczestnicy)',
                           'public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'public.akcja_bieg_z_tempa(public.akcja_bieg_uczestnicy, public.akcja_biegi)', LISTA] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1a: % dostępna z przeglądarki', v; end if;
  end loop;
  if not has_function_privilege('service_role', LISTA, 'execute') then raise exception 'FAIL 1b: EF straciła listę'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_moi(text)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_wynik_ustal(uuid, uuid)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_wynik_ustal(uuid, uuid)', 'execute') then raise exception 'FAIL 1c: uprawnienia „moich zapisów” albo wyboru treningu'; end if;
  n := n + 8;

  -- 1d. reguła liczenia (5 km): do 5,49 km czas treningu, 5,50–10,49 km tempo × 5 zaokrąglone do sekundy, dłuższy bez czasu; bez v5 tylko do 5,49 km
  if public.akcja_bieg_czas_na_dystans(2946, 10.01, 5, true) is distinct from 1472 or public.akcja_bieg_czas_na_dystans(1998, 6, 5, true) is distinct from 1665
     or public.akcja_bieg_czas_na_dystans(1560, 5.2, 5, true) is distinct from 1560 or public.akcja_bieg_czas_na_dystans(1600, 5.49, 5, true) is distinct from 1600
     or public.akcja_bieg_czas_na_dystans(1650, 5.5, 5, true) is distinct from 1500 or public.akcja_bieg_czas_na_dystans(1000, 10.49, 5, true) is distinct from 477
     or public.akcja_bieg_czas_na_dystans(1000, 10.5, 5, true) is not null or public.akcja_bieg_czas_na_dystans(1998, 6, 5, false) is not null
     or public.akcja_bieg_czas_na_dystans(1450, 4.9, 5, true) is distinct from 1450 or public.akcja_bieg_czas_na_dystans(null, 6, 5, true) is not null then raise exception 'FAIL 1d: reguła czasu na 5 km'; end if;
  if not public.akcja_bieg_wersja_od('2026-11-v5', 5) or public.akcja_bieg_wersja_od('2026-11-v4', 5) or public.akcja_bieg_wersja_od(null, 5) or public.akcja_bieg_wersja_od('v5', 5)
     or not public.akcja_bieg_wersja_od('2026-11-v12', 5) then raise exception 'FAIL 1e: wersja regulaminu'; end if;
  n := n + 2;

  -- 2. bieg próbny 5 km na v5, sześć zapisów „ja” i dziecko
  select c.id into tr from public.coaches c limit 1;
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 6) y;
  if tr is null or coalesce(array_length(ka, 1), 0) < 6 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 6 kont bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-tempo', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W) returning id into b;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[1], 'ja', 'Anna', true, 1, 5, W, now()) returning id into uA;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[2], 'ja', 'Bogna', true, 2, 5, W, now()) returning id into uB;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[3], 'ja', 'Celina', true, 3, 5, W, now()) returning id into uC;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[4], 'ja', 'Dawid', true, 4, 5, W, now()) returning id into uD;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (b, ka[5], 'ja', 'Ewa', true, 5, 5, W) returning id into uE;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[6], 'ja', 'Filomena', true, 6, 5, W, now()) returning id into uF;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, oswiadczenie_rodzica_at, regulamin_wersja, dystans_wlasny_km, ukonczony_at) values (b, ka[1], 'dziecko', 'Zosia', true, 7, now(), W, 1.0, now()) returning id into uz;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 5.2, '26:00', 'Spokojny', 'Run', now() - interval '3 days', 'intervals', now() - interval '3 days') returning id into lA;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 11, '45:00', 'Spokojny', 'Run', now() - interval '2 days', 'intervals', now() - interval '2 days') returning id into lA11;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 10.01, '49:06', 'Spokojny', 'Run', now() - interval '2 days', 'intervals', now() - interval '2 days');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[3], 6.0, '33:18', 'Spacer', null, now() - interval '2 days', 'manual', now() - interval '2 days');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[4], 12, '58:00', 'Spokojny', 'Run', now() - interval '1 day', 'intervals', now() - interval '1 day');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[5], 5.4, '25:12', 'Spokojny', 'Run', now() - interval '3 days', 'manual', now() - interval '3 days') returning id into lE54;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[5], 6.0, '29:30', 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lE6;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[6], 8, '22:00', 'Spokojny', 'Run', now() - interval '1 day', 'intervals', now() - interval '1 day');
  foreach v in array array[uA::text, uB::text, uC::text, uD::text, uE::text, uF::text] loop
    if (public.akcja_bieg_wynik_z_treningu(v::uuid, null)->>'ok')::boolean is not true then raise exception 'FAIL 2-1: wynik z treningu dla %', v; end if;
  end loop;

  -- 2a. wybór bez wskazania przy v5: najlepszy czas na 5 km spośród treningów 5,00–10,49 km (6 km z tempa 24:35 przed 5,4 km w 25:12 o lepszym tempie);
  --     trening ponad 10,49 km nie wygrywa nawet szybszym tempem
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uE) is distinct from lE6 then raise exception 'FAIL 2a: v5 wybrał nie ten trening (oczekiwano 6 km z tempa 24:35)'; end if;
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uA) is distinct from lA then raise exception 'FAIL 2b: trening 11 km wygrał z 5,2 km'; end if;
  update public.akcja_biegi set regulamin_wersja = '2026-11-v4' where id = b;
  perform public.akcja_bieg_wynik_z_treningu(uE, null);
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uE) is distinct from lE54 then raise exception 'FAIL 2c: przy v4 wybór jak dotąd (5,00–5,49 km najpierw) się zmienił'; end if;
  update public.akcja_biegi set regulamin_wersja = W where id = b;
  perform public.akcja_bieg_wynik_z_treningu(uE, null);
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uE) is distinct from lE6 then raise exception 'FAIL 2d: po powrocie do v5 wybór nie wrócił do 6 km'; end if;
  n := n + 4;

  -- 3. lista publiczna przy v5: czas na 5 km, miejsca razem (z tempa z dopiskiem), bez zgody / do weryfikacji / ponad 10,49 km / dziecko bez czasu
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-tempo', 0, 50, null);
  jp := public.akcja_bieg_ukonczyli('proba-tempo', 0, 50, 5);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if (e->>'czas_s')::int is distinct from 1472 or (e->>'miejsce')::int is distinct from 1 or (e->>'z_tempa')::boolean is not true or e ? 'trening_km' then raise exception 'FAIL 3a: 10,01 km w 49:06: 24:32 z tempa, miejsce 1: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
  if (e->>'czas_s')::int is distinct from 1560 or (e->>'miejsce')::int is distinct from 2 or e ? 'z_tempa' or e ? 'trening_km' then raise exception 'FAIL 3b: 5,2 km: czas treningu, miejsce 2, bez dopisku: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 3;
  if (e->>'czas_s')::int is distinct from 1665 or (e->>'miejsce')::int is distinct from 3 or (e->>'z_tempa')::boolean is not true or (e->>'reczny')::boolean is not true then raise exception 'FAIL 3c: 6 km ręcznie: 27:45 z tempa, miejsce 3, wynik ręczny: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 4;
  if e is null or e ? 'czas_s' or e ? 'miejsce' or e ? 'trening_km' or e ? 'z_tempa' then raise exception 'FAIL 3d: 12 km z czasem na liście: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 5;
  if e is null or e ? 'czas_s' or e ? 'z_tempa' then raise exception 'FAIL 3e: bez zgody na ranking czas na liście: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 6;
  if e is null or e ? 'czas_s' then raise exception 'FAIL 3f: tempo do weryfikacji, czas przed zatwierdzeniem: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 7;
  if e is null or e ? 'czas_s' or (e->>'dziecko')::boolean is not true then raise exception 'FAIL 3g: dziecko z czasem: %', e; end if;
  if (j->>'w_rankingu')::int <> 3 or (jp->>'w_rankingu')::int <> 3 or (jp->'lista'->0->>'numer')::int <> 2 or (jp->'lista'->2->>'numer')::int <> 3 then raise exception 'FAIL 3h: ranking 5 km: 3 osoby, kolejność 2, 1, 3: %', jp; end if;
  n := n + 8;

  -- 4. „moje zapisy” (dyplom i karta): czas na 5 km bez względu na zgodę i weryfikację; ponad 10,49 km bez czasu
  perform set_config('request.jwt.claims', json_build_object('sub', ku[5], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-tempo');
  execute 'reset role';
  if (k->0->>'czas_biegu_s')::int is distinct from 1475 or (k->0->>'z_tempa')::boolean is not true or (k->0->>'wynik_trening_km')::numeric is distinct from 6 or (k->0->>'wynik_s')::int is distinct from 1770 then raise exception 'FAIL 4a: bez zgody: dyplom 24:35 z tempa, trening 6 km 29:30: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[4], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-tempo');
  execute 'reset role';
  if k->0->'czas_biegu_s' <> 'null'::jsonb or (k->0->>'z_tempa')::boolean is not false or (k->0->>'wynik_s')::int is distinct from 3480 then raise exception 'FAIL 4b: 12 km: dyplom bez czasu: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[6], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-tempo');
  execute 'reset role';
  if (k->0->>'czas_biegu_s')::int is distinct from 825 or (k->0->>'do_weryfikacji')::boolean is not true then raise exception 'FAIL 4c: 8 km w 22:00: dyplom 13:45 z tempa, wynik czeka na weryfikację: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-tempo');
  execute 'reset role';
  select x into e from jsonb_array_elements(k) x where x->>'rodzaj' = 'ja';
  if (e->>'czas_biegu_s')::int is distinct from 1560 or (e->>'z_tempa')::boolean is not false then raise exception 'FAIL 4d: 5,2 km: dyplom z czasem treningu, bez dopisku: %', e; end if;
  select x into e from jsonb_array_elements(k) x where x->>'rodzaj' = 'dziecko';
  if e->'czas_biegu_s' <> 'null'::jsonb or (e->>'z_tempa')::boolean is not false then raise exception 'FAIL 4e: dziecko z czasem na dyplomie: %', e; end if;
  n := n + 5;

  -- 5. zatwierdzenie tempa: 8 km w 22:00 wchodzi z miejscem 1 (13:45 z tempa), reszta przesuwa się
  update public.akcja_bieg_uczestnicy set weryfikacja = 'zatwierdzony', weryfikacja_at = now(), weryfikacja_przez = tr where id = uF;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-tempo', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 6;
  if (e->>'czas_s')::int is distinct from 825 or (e->>'miejsce')::int is distinct from 1 or (e->>'z_tempa')::boolean is not true then raise exception 'FAIL 5a: po zatwierdzeniu 13:45 z tempa, miejsce 1: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if (e->>'miejsce')::int is distinct from 2 or (j->>'w_rankingu')::int <> 4 then raise exception 'FAIL 5b: miejsca po zatwierdzeniu: %', j; end if;
  n := n + 2;

  -- 6. panel organizatora: prawdziwy wynik jak dotąd; flaga tylko ponad 10,49 km (10,01 km już bez flagi)
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-tempo');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 2;
  if (e->>'wynik_s')::int is distinct from 2946 or (e->>'trening_km')::numeric is distinct from 10.01 or e->'do_sprawdzenia' <> '[]'::jsonb then raise exception 'FAIL 6a: panel, 10,01 km: prawdziwy czas, bez flagi: %', e; end if;
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 4;
  if (e->>'wynik_s')::int is distinct from 3480 or not (e->'do_sprawdzenia' ? 'trening dłuższy niż 10,49 km: bez czasu w rankingu') then raise exception 'FAIL 6b: panel, 12 km: flaga ponad 10,49 km: %', e; end if;
  n := n + 2;

  -- 7. regulamin v4 w bazie (przed 34g): lista jak po 20261213 (dłuższy trening ze zgodą: prawdziwy dystans i czas bez miejsca), bez „z tempa”; flaga jak dotąd
  update public.akcja_biegi set regulamin_wersja = '2026-11-v4' where id = b;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-tempo', 0, 50, null);
  execute 'reset role';
  if exists (select 1 from jsonb_array_elements(j->'lista') x where x ? 'z_tempa') then raise exception 'FAIL 7a: „z tempa” przy regulaminie v4: %', j; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if (e->>'czas_s')::int is distinct from 2946 or (e->>'trening_km')::numeric is distinct from 10.01 or e ? 'miejsce' then raise exception 'FAIL 7b: v4, 10,01 km: czas bez miejsca jak po 20261213: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
  if (e->>'miejsce')::int is distinct from 1 or (j->>'w_rankingu')::int <> 1 then raise exception 'FAIL 7c: v4: w rankingu tylko 5,00–5,49 km: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-tempo');
  execute 'reset role';
  if k->0->'czas_biegu_s' <> 'null'::jsonb or (k->0->>'z_tempa')::boolean is not false then raise exception 'FAIL 7d: v4: czas z tempa na dyplomie: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-tempo');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 2;
  if not (e->'do_sprawdzenia' ? 'trening ponad 2 razy dłuższy niż dystans biegu') then raise exception 'FAIL 7e: v4: flaga jak dotąd (ponad 10 km): %', e; end if;
  -- v3: ani czasu bez miejsca, ani z tempa
  update public.akcja_biegi set regulamin_wersja = '2026-11-v3' where id = b;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-tempo', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if e ? 'czas_s' or e ? 'z_tempa' or e ? 'trening_km' then raise exception 'FAIL 7f: v3: czas dłuższego treningu na liście: %', e; end if;
  update public.akcja_biegi set regulamin_wersja = W where id = b;
  n := n + 6;

  -- 8. wskazanie zawodnika ma pierwszeństwo: 5,4 km wskazane mimo lepszego czasu z tempa; dyplom z czasem tego treningu
  perform public.akcja_bieg_wynik_z_treningu(uE, lE54);
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uE) is distinct from lE54 or (select wynik_wskazany from public.akcja_bieg_uczestnicy where id = uE) is not true then raise exception 'FAIL 8a: wskazanie nie przeszło'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[5], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-tempo');
  execute 'reset role';
  if (k->0->>'czas_biegu_s')::int is distinct from 1512 or (k->0->>'z_tempa')::boolean is not false then raise exception 'FAIL 8b: wskazane 5,4 km: dyplom 25:12 bez dopisku: %', k; end if;
  n := n + 2;

  raise exception 'TESTY CZASU Z TEMPA ZIELONE: % sprawdzeń', n;
end $test$;
