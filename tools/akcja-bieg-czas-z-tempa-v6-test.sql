-- Test po skutku 20261215 (regulamin v6: czas z tempa bez górnego limitu, maraton po zatwierdzeniu, przeliczenie). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa), bieg próbny 'proba-v6' na 5 km, zapisy i treningi tylko tutaj; cztery konta bez treningów z ostatnich 40 dni i jeden trener; imiona wymyślone.
-- Automatu (akcja_bieg_automat) nie wołamy (przechodzi po prawdziwym biegu); przeliczenie biegu próbnego przez akcja_bieg_przelicz, jak w migracji.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; k jsonb; e jsonb; b uuid; tr uuid; ka uuid[]; ku uuid[]; v text; zm int;
  uA uuid; uB uuid; uC uuid; uD uuid; lB45 uuid; lC53 uuid; lC12 uuid;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v6';
  LISTA constant text := 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)';
begin
  if to_regprocedure('public.akcja_bieg_czas_wersji(integer, numeric, integer, text)') is null then raise exception 'FAIL 1: brak akcja_bieg_czas_wersji (migracja 20261215 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. uprawnienia: nowe funkcje bez przeglądarki; lista tylko service_role
  foreach v in array array['public.akcja_bieg_czas_wersji(integer, numeric, integer, text)', 'public.akcja_bieg_przelicz(uuid)', LISTA] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1a: % dostępna z przeglądarki', v; end if;
  end loop;
  if not has_function_privilege('service_role', LISTA, 'execute') then raise exception 'FAIL 1b: EF straciła listę'; end if;
  n := n + 4;

  -- 1c. reguła liczenia: v6 bez górnego limitu, v5 do 10,49 km, starsze tylko do 5,49 km
  if public.akcja_bieg_czas_wersji(4800, 16, 5, W) is distinct from 1500 or public.akcja_bieg_czas_wersji(13500, 45, 5, W) is distinct from 1500
     or public.akcja_bieg_czas_wersji(1560, 5.2, 5, W) is distinct from 1560 or public.akcja_bieg_czas_wersji(1650, 5.5, 5, W) is distinct from 1500
     or public.akcja_bieg_czas_wersji(1000, 4.9, 5, W) is distinct from 1000 or public.akcja_bieg_czas_wersji(null, 16, 5, W) is not null
     or public.akcja_bieg_czas_wersji(2946, 10.01, 5, W) is distinct from 1472 or public.akcja_bieg_czas_wersji(2100, 8, 5, W) is distinct from 1313
     or public.akcja_bieg_czas_wersji(4800, 16, 5, '2026-11-v5') is not null or public.akcja_bieg_czas_wersji(2946, 10.01, 5, '2026-11-v5') is distinct from 1472
     or public.akcja_bieg_czas_wersji(1998, 6, 5, '2026-11-v4') is not null then raise exception 'FAIL 1c: reguła czasu na 5 km według wersji'; end if;
  n := n + 1;

  -- 2. bieg próbny 5 km, cztery zapisy; stan „przed migracją” = wybór treningów przy v5, potem v6 i przeliczenie
  select c.id into tr from public.coaches c limit 1;
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 4) y;
  if tr is null or coalesce(array_length(ka, 1), 0) < 4 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 4 konta bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-v6', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', '2026-11-v5') returning id into b;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[1], 'ja', 'Anna', true, 1, 5, W, now()) returning id into uA;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[2], 'ja', 'Bogna', true, 2, 5, W, now()) returning id into uB;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[3], 'ja', 'Celina', true, 3, 5, W, now()) returning id into uC;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[4], 'ja', 'Dawid', true, 4, 5, W, now()) returning id into uD;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 16, '1:20:00', 'Spokojny', 'Run', now() - interval '3 days', 'intervals', now() - interval '3 days');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 45, '3:45:00', 'Spokojny', 'Run', now() - interval '3 days', 'intervals', now() - interval '3 days') returning id into lB45;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[3], 5.3, '27:00', 'Spokojny', 'Run', now() - interval '3 days', 'manual', now() - interval '3 days') returning id into lC53;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[3], 12, '55:00', 'Spokojny', 'Run', now() - interval '2 days', 'intervals', now() - interval '2 days') returning id into lC12;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[4], 5.2, '26:00', 'Spokojny', 'Run', now() - interval '1 day', 'intervals', now() - interval '1 day');
  foreach v in array array[uA::text, uB::text, uC::text, uD::text] loop
    if (public.akcja_bieg_wynik_z_treningu(v::uuid, null)->>'ok')::boolean is not true then raise exception 'FAIL 2-1: wynik z treningu dla %', v; end if;
  end loop;
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uC) is distinct from lC53 then raise exception 'FAIL 2a: przy v5 automat brał 5,3 km (12 km poza zakresem do 10,49)'; end if;
  update public.akcja_biegi set regulamin_wersja = W where id = b;
  zm := public.akcja_bieg_przelicz(b);
  if zm <> 1 or (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uC) is distinct from lC12 then raise exception 'FAIL 2b: przeliczenie przy v6: % zmian, oczekiwano 1 (Celina na 12 km, 22:55 z tempa)', zm; end if;
  n := n + 2;

  -- 3. lista publiczna przy v6: 16 km = 25:00 z tempa, 12 km = 22:55 z tempa, 5,2 km = czas treningu; 45 km czeka na zatwierdzenie (bez czasu)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-v6', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 3;
  if (e->>'czas_s')::int is distinct from 1375 or (e->>'miejsce')::int is distinct from 1 or (e->>'z_tempa')::boolean is not true then raise exception 'FAIL 3a: 12 km: 22:55 z tempa, miejsce 1: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
  if (e->>'czas_s')::int is distinct from 1500 or (e->>'miejsce')::int is distinct from 2 or (e->>'z_tempa')::boolean is not true or e ? 'trening_km' then raise exception 'FAIL 3b: 16 km: 25:00 z tempa, miejsce 2, bez prawdziwego dystansu: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 4;
  if (e->>'czas_s')::int is distinct from 1560 or (e->>'miejsce')::int is distinct from 3 or e ? 'z_tempa' then raise exception 'FAIL 3c: 5,2 km: czas treningu 26:00, bez dopisku: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if e is null or e ? 'czas_s' or e ? 'miejsce' then raise exception 'FAIL 3d: 45 km przed zatwierdzeniem z czasem na liście: %', e; end if;
  if (j->>'w_rankingu')::int <> 3 then raise exception 'FAIL 3e: w rankingu 3 osoby: %', j->'w_rankingu'; end if;
  n := n + 5;

  -- 4. 45 km: dyplom z czasem, wynik czeka na sprawdzenie; panel: flaga „trening dłuższy niż maraton” i „Zatwierdź”; 16 km bez flagi
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-v6');
  execute 'reset role';
  if (k->0->>'czas_biegu_s')::int is distinct from 1500 or (k->0->>'z_tempa')::boolean is not true or (k->0->>'do_weryfikacji')::boolean is not true then raise exception 'FAIL 4a: 45 km: dyplom 25:00 z tempa, czeka na sprawdzenie: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-v6');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 2;
  if not (e->'do_sprawdzenia' ? 'trening dłuższy niż maraton') or (e->>'do_weryfikacji')::boolean is not true or (e->>'trening_km')::numeric is distinct from 45 then raise exception 'FAIL 4b: panel, 45 km: flaga maratonu i „Zatwierdź”: %', e; end if;
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 1;
  if e->'do_sprawdzenia' <> '[]'::jsonb or (e->>'do_weryfikacji')::boolean is not false then raise exception 'FAIL 4c: panel, 16 km: bez flag (limit 10,49 km zniknął): %', e; end if;
  n := n + 3;

  -- 5. „Zatwierdź” dla 45 km: wchodzi do rankingu z czasem z tempa
  update public.akcja_bieg_uczestnicy set weryfikacja = 'zatwierdzony', weryfikacja_at = now(), weryfikacja_przez = tr where id = uB;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-v6', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if (e->>'czas_s')::int is distinct from 1500 or (e->>'miejsce')::int is distinct from 2 or (e->>'z_tempa')::boolean is not true or (j->>'w_rankingu')::int <> 4 then raise exception 'FAIL 5: 45 km po zatwierdzeniu: 25:00 z tempa w rankingu: %', j; end if;
  n := n + 1;

  -- 6. wskazanie zawodnika wygrywa z przeliczeniem: 5,3 km wskazane, przeliczenie go nie rusza; zatwierdzony wynik (45 km) też nie, mimo lepszego 8 km
  perform public.akcja_bieg_wynik_z_treningu(uC, lC53);
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 8, '35:00', 'Spokojny', 'Run', now() - interval '1 hour', 'intervals', now() - interval '1 hour');
  zm := public.akcja_bieg_przelicz(b);
  if zm <> 0 or (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uC) is distinct from lC53 then raise exception 'FAIL 6a: przeliczenie ruszyło wskazany trening (% zmian)', zm; end if;
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uB) is distinct from lB45 then raise exception 'FAIL 6c: przeliczenie ruszyło zatwierdzony wynik'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-v6');
  execute 'reset role';
  if (k->0->>'czas_biegu_s')::int is distinct from 1620 or (k->0->>'z_tempa')::boolean is not false then raise exception 'FAIL 6b: wskazane 5,3 km: czas treningu 27:00: %', k; end if;
  n := n + 3;

  -- 7. ten sam bieg przy v5 (wycofanie): 16 km bez czasu i z flagą 10,49 km, jak po 20261214
  update public.akcja_biegi set regulamin_wersja = '2026-11-v5' where id = b;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-v6', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
  if e ? 'czas_s' then raise exception 'FAIL 7a: v5: 16 km z czasem na liście: %', e; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-v6');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 1;
  if not (e->'do_sprawdzenia' ? 'trening dłuższy niż 10,49 km: bez czasu w rankingu') then raise exception 'FAIL 7b: v5: flaga jak po 20261214: %', e; end if;
  update public.akcja_biegi set regulamin_wersja = W where id = b;
  n := n + 2;

  -- 8. prawdziwy bieg (jeśli jest): co najmniej v6 (od 20261217 v7; blizna-309) i każdy ukończony dorosły z czasem treningu ma czas na 5 km (limit zniknął)
  if exists (select 1 from public.akcja_biegi where slug = 'bieg-mikolajki') then
    if not public.akcja_bieg_wersja_od((select regulamin_wersja from public.akcja_biegi where slug = 'bieg-mikolajki'), 6) then raise exception 'FAIL 8a: bieg-mikolajki poniżej v6'; end if;
    if exists (select 1 from public.akcja_bieg_uczestnicy u join public.akcja_biegi bb on bb.id = u.bieg_id where bb.slug = 'bieg-mikolajki' and u.rodzaj = 'ja' and u.wycofany_at is null
                and u.ukonczony_at is not null and u.wynik_s is not null and public.akcja_bieg_czas_biegu(u, bb) is null) then raise exception 'FAIL 8b: bieg-mikolajki: ukończony z czasem treningu bez czasu na 5 km'; end if;
    n := n + 2;
  end if;

  raise exception 'TESTY CZASU Z TEMPA V6 ZIELONE: % sprawdzeń', n;
end $test$;
