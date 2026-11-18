-- Test po skutku zasady rankingu: 20261203 (źródło wyniku, zakres długości, wskazanie) ZMIENIONE przez 20261206 (decyzja 17.11): w rankingu każdy dorosły ze zgodą,
-- także z wynikiem ręcznym (klucz 'reczny' = dopisek), tylko trening do dystans + 0,49 km, tempo spoza 3:00–36:00/km dopiero po weryfikacji (tools/akcja-bieg-dyplom-flagi-test.sql).
-- W transakcji z .sh, zawsze wycofanej. Bieg próbny i treningi tylko w tej transakcji; imiona wymyślone. Dziewięć kont dorosłych, wszyscy ze zgodą na ranking poza ostatnim.
do $test$
declare
  n int := 0; b uuid; j jsonb; k jsonb; v text; ka uuid[]; ku uuid[]; l uuid[]; v_log uuid; i int; v_trener uuid; e jsonb;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v2';
  IMIONA constant text[] := array['Anna', 'Bogna', 'Celina', 'Dawid', 'Edek', 'Franek', 'Gustaw', 'Hanna', 'Iga'];
  -- rodzaj wyniku konta i: 1 zegarek 1500 s · 2 wpis ręczny 1200 s · 3 ze zdjęcia (ocr) 1300 s · 4 zaliczony przez organizatora bez treningu 1250 s · 5 zegarek 1600 s
  --   6 wpis ręczny wzbogacony importem 1100 s · 7 zegarek, potem poprawiony przez organizatora 1000 s · 8 cudzy trening z zegarka 900 s · 9 zegarek bez zgody na ranking 800 s
  ZRODLA constant text[] := array['intervals', 'manual', 'ocr', null, 'intervals', 'manual', 'intervals', 'intervals', 'intervals'];
  ZEWN constant text[] := array['test-bieg', 'app', 'app', null, 'test-bieg', 'intervals', 'test-bieg', 'test-bieg', 'test-bieg'];
  CZASY constant int[] := array[1500, 1200, 1300, 1250, 1600, 1100, 1000, 900, 800];
begin
  -- 0. strażnik: licznik prawdziwej ulicy identyczny przed i po migracji (migracja nie dotyka licznika)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_licznik('dla-fabianka') is distinct from (select t.j from _licznik_przed t) then raise exception 'FAIL 0: licznik prawdziwej ulicy zmienił się po migracji'; end if;
  execute 'reset role';
  n := n + 1;

  -- 1. funkcja reguły jest i nie jest dla przeglądarki
  if to_regprocedure('public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy)') is null then raise exception 'FAIL 1: brak funkcji akcja_bieg_wynik_z_zegarka (migracja 20261203 nie weszła)'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy)', 'execute')
     or has_function_privilege('authenticated', 'public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy)', 'execute') then raise exception 'FAIL 1b: reguła dostępna dla anon albo authenticated'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute') or has_function_privilege('authenticated', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or not has_function_privilege('service_role', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_moi(text)', 'execute')
     or has_function_privilege('anon', 'public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'execute')
     or has_function_privilege('authenticated', 'public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'execute') then raise exception 'FAIL 1c: uprawnienia zmienionych funkcji inne niż przed migracją'; end if;
  if to_regprocedure('public.akcja_bieg_do_weryfikacji(public.akcja_bieg_uczestnicy)') is null then raise exception 'FAIL 1d: brak zasady rankingu z 20261206 (wynik ręczny w rankingu, weryfikacja tempa)'; end if;
  n := n + 4;

  -- 2. bieg próbny w fazie wyniki, dziewięciu dorosłych z wynikiem na 5 km i dziecko
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-bieg', 'Bieg próbny', DZIS - 2, DZIS - 1, DZIS + 1, '{5}', 'otwarty', W) returning id into b;
  select array_agg(t.id order by t.created_at, t.id), array_agg(t.user_id order by t.created_at, t.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null
            and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at, a.id limit 9) t;
  if coalesce(array_length(ka, 1), 0) < 9 then raise exception 'FAIL 2-0: za mało kont do testu (potrzeba 9 bez daty urodzenia)'; end if;
  select id into v_trener from auth.users order by id limit 1;
  l := array_fill(null::uuid, array[9]);
  for i in 1..9 loop
    if ZRODLA[i] is not null then
      insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
        values (ka[case when i = 8 then 1 else i end], 5.1, '25:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '9 hours' + i * interval '1 minute') at time zone 'Europe/Warsaw', ZRODLA[i], ZEWN[i], 'tbr-' || i)
        returning id into v_log;
      l[i] := v_log;
    end if;
    insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, wynik_s, wynik_dystans_km, wynik_log_id, zaliczony_przez, ukonczony_at, odznaka, ranking_zgoda_at)
      values (b, ka[i], 'ja', IMIONA[i], true, i, 5, W, CZASY[i], 5, l[i], case when i in (4, 7) then v_trener end, now() - i * interval '1 minute', 'zwykla', case when i < 9 then now() end);
  end loop;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, oswiadczenie_rodzica_at, regulamin_wersja, dystans_wlasny_km, ukonczony_at, odznaka)
    values (b, ka[1], 'dziecko', 'Zosia', true, 10, now(), W, 1.5, now(), 'zwykla');

  -- 3. lista 5 km: w rankingu osiem wyników ze zgodą (z zegarka i ręczne), miejsca po czasie: 900 s (cudzy trening = ręczny), 1000, 1100, 1200, 1250, 1300, 1500, 1600
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  k := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50);
  execute 'reset role';
  if (j->>'razem')::int <> 9 or (j->>'w_rankingu')::int <> 8 then raise exception 'FAIL 3a: 5 km razem 9, w rankingu 8: razem %, w rankingu %', j->>'razem', j->>'w_rankingu'; end if;
  if (j->'lista'->0->>'numer')::int <> 8 or (j->'lista'->0->>'miejsce')::int <> 1 or (j->'lista'->0->>'czas_s')::int <> 900 or (j->'lista'->0->>'reczny')::boolean is not true then raise exception 'FAIL 3b: pierwsze miejsce = 900 s z dopiskiem: %', j->'lista'->0; end if;
  if (j->'lista'->6->>'numer')::int <> 1 or (j->'lista'->6->>'miejsce')::int <> 7 or (j->'lista'->6->>'reczny')::boolean or (j->'lista'->7->>'numer')::int <> 5 or (j->'lista'->7->>'miejsce')::int <> 8 or (j->'lista'->7->>'czas_s')::int <> 1600
    then raise exception 'FAIL 3c: zegarek 1500 s na 7. miejscu, 1600 s na 8.: % %', j->'lista'->6, j->'lista'->7; end if;
  n := n + 3;
  -- 4. każdy wynik ręczny: na liście z czasem, miejscem i dopiskiem; zegarek bez zgody: bez czasu i bez dopisku; dziecko: bez czasu i bez dopisku
  foreach i in array array[2, 3, 4, 6, 7, 8] loop
    select x into e from jsonb_array_elements(k->'lista') x where (x->>'numer')::int = i;
    if e is null then raise exception 'FAIL 4a: wynik ręczny nr % zniknął z listy (ma zostać ukończenie)', i; end if;
    if (e->>'czas_s')::int is distinct from CZASY[i] or not e ? 'miejsce' then raise exception 'FAIL 4b: wynik ręczny nr % bez swojego czasu albo miejsca: %', i, e; end if;
    if (e->>'reczny')::boolean is not true then raise exception 'FAIL 4c: wynik ręczny nr % bez dopisku: %', i, e; end if;
    n := n + 3;
  end loop;
  select x into e from jsonb_array_elements(k->'lista') x where (x->>'numer')::int = 9;
  if e ? 'czas_s' or (e->>'reczny')::boolean is not false then raise exception 'FAIL 4d: zegarek bez zgody na ranking: bez czasu i bez dopisku: %', e; end if;
  select x into e from jsonb_array_elements(k->'lista') x where (x->>'numer')::int = 10;
  if e ? 'czas_s' or (e->>'reczny')::boolean is not false or (e->>'dziecko')::boolean is not true then raise exception 'FAIL 4e: dziecko bez czasu i bez dopisku: %', e; end if;
  if (k->>'razem')::int <> 10 or (k->>'w_rankingu')::int <> 8 then raise exception 'FAIL 4f: lista ogólna razem 10, w rankingu 8: %', k - 'lista'; end if;
  v := k::text;
  if v ~ '"(konto_id|wynik_s|wynik_log_id|zaliczony_przez|source|email)"' or v ~ '"czas_s": 800\M' then raise exception 'FAIL 4g: lista z polami kont albo czasem bez zgody na ranking'; end if;
  n := n + 4;

  -- 5. moje zapisy: klucz wynik_reczny (konto 2 ręczny, konto 1 z zegarka; dziecko konta 1 bez dopisku)
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  execute 'reset role';
  if jsonb_array_length(j) <> 1 or (j->0->>'wynik_reczny')::boolean is not true or (j->0->>'wynik_s')::int <> 1200 then raise exception 'FAIL 5a: moje zapisy konta z wpisem ręcznym: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  execute 'reset role';
  if jsonb_array_length(j) <> 2 or exists (select 1 from jsonb_array_elements(j) x where (x->>'wynik_reczny')::boolean is not false) then raise exception 'FAIL 5b: moje zapisy konta z zegarkiem i dzieckiem: %', j; end if;
  n := n + 2;

  -- 6. prawdziwa droga: automat z wpisu ręcznego daje ukończenie i ranking (25:00, dopisek); po dopisaniu treningu z zegarka i wskazaniu go wynik z zegarka (31:00)
  update public.akcja_bieg_uczestnicy set ukonczony_at = null, wynik_s = null, wynik_dystans_km = null, wynik_log_id = null, odznaka = 'brak' where bieg_id = b and numer = 2;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 2), null);
  if (j->>'ok')::boolean is not true or (j->>'log_id')::uuid <> l[2] then raise exception 'FAIL 6a: automat z wpisu ręcznego ma dać ukończenie: %', j; end if;
  if public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 2), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1500 then raise exception 'FAIL 6b: wpis ręczny z automatu w rankingu z 25:00'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[2], 5.0, '31:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '15 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tbr-2z') returning id into v_log;
  l[2] := v_log;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 2), l[2]);
  if (j->>'ok')::boolean is not true or public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 2), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1860
    then raise exception 'FAIL 6c: wskazany trening z zegarka ma wejść do rankingu z 31:00: %', j; end if;
  n := n + 3;

  -- 7. trening z zegarka usunięty po zaliczeniu. Do 20261212: wynik zostawał w rankingu jako ręczny (dopisek). Od 20261212 (decyzja Filipa 18.11, usterka z produkcji):
  --    wynik bez treningu znika z listy (automat może wziąć inny trening); w rankingu o jedno miejsce mniej. Warunek po funkcji z 20261212: test prawdziwy po obu stronach.
  delete from public.training_logs where id = l[5];
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 5;
  if to_regprocedure('public.akcja_bieg_wiszace_wyczysc()') is not null then
    if e is not null or (select ukonczony_at from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 5) is not null then raise exception 'FAIL 7a: po usunięciu treningu wynik ma zniknąć (20261212): %', e; end if;
    if (j->>'w_rankingu')::int <> 7 or (j->'lista'->6->>'numer')::int <> 2 or (j->'lista'->6->>'miejsce')::int <> 7 or (j->'lista'->6->>'czas_s')::int <> 1860 then raise exception 'FAIL 7b: ranking po zmianach: 31:00 na 7. miejscu: %', j; end if;
  else
    if e is null or (e->>'czas_s')::int is distinct from 1600 or (e->>'reczny')::boolean is not true then raise exception 'FAIL 7a: po usunięciu treningu wynik ma zostać z czasem i dopiskiem: %', e; end if;
    if (j->>'w_rankingu')::int <> 8 or (j->'lista'->7->>'numer')::int <> 2 or (j->'lista'->7->>'miejsce')::int <> 8 or (j->'lista'->7->>'czas_s')::int <> 1860 then raise exception 'FAIL 7b: ranking po zmianach: 31:00 na 8. miejscu: %', j; end if;
  end if;
  n := n + 2;

  -- 8. DŁUGOŚĆ (17.11): w rankingu 5 km trening do 5,49 km włącznie; 5,50 km i 10 km dają ukończenie bez czasu i bez dopisku; „moje zapisy” oddają prawdziwy dystans treningu
  if to_regprocedure('public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)') is null then raise exception 'FAIL 8-0: brak funkcji akcja_bieg_wynik_do_rankingu'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)', 'execute')
     or has_function_privilege('authenticated', 'public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)', 'execute') then raise exception 'FAIL 8-0b: reguła długości dostępna dla anon albo authenticated'; end if;
  update public.training_logs set distance_km = 5.49 where id = l[1];
  if public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 1), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1500 then raise exception 'FAIL 8a: trening 5,49 km ma być w rankingu'; end if;
  update public.training_logs set distance_km = 4.9 where id = l[1];
  if public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 1), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1500 then raise exception 'FAIL 8b: dolna granica bez zmian: 4,9 km w rankingu'; end if;
  foreach v in array array['5.5', '10'] loop
    update public.training_logs set distance_km = v::numeric where id = l[1];
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    execute 'set local role service_role';
    j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
    execute 'reset role';
    select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
    -- bieg tego testu ma regulamin v2: czas dłuższego treningu bez miejsca (20261213) dotyczy dopiero v4, tu lista bez czasu jak dotąd
    if e is null or e ? 'czas_s' or e ? 'miejsce' or (e->>'reczny')::boolean is not false then raise exception 'FAIL 8c: trening % km: na liście (ukończenie), bez czasu i bez dopisku: %', v, e; end if;
    if (j->>'w_rankingu')::int <> 7 - (to_regprocedure('public.akcja_bieg_wiszace_wyczysc()') is not null)::int or (j->'lista'->0->>'numer')::int <> 8 or (j->'lista'->0->>'miejsce')::int <> 1 or exists (select 1 from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1 and x ? 'miejsce')
      then raise exception 'FAIL 8d: długi trening wypada z rankingu, reszta zostaje: %', j; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    k := public.akcja_bieg_moi('proba-bieg');
    execute 'reset role';
    select x into e from jsonb_array_elements(k) x where x->>'rodzaj' = 'ja';
    if (e->>'wynik_trening_km')::numeric <> v::numeric or (e->>'wynik_dystans_km')::int <> 5 or (e->>'wynik_s')::int <> 1500 or (e->>'wynik_reczny')::boolean is not false then raise exception 'FAIL 8e: moje zapisy: prawdziwy dystans treningu % km, zaliczone 5 km, czas bez zmian: %', v, e; end if;
    n := n + 3;
  end loop;
  if (select x->'wynik_trening_km' from jsonb_array_elements(k) x where x->>'rodzaj' = 'dziecko') is distinct from 'null'::jsonb then raise exception 'FAIL 8f: dziecko bez dystansu treningu'; end if;
  update public.training_logs set distance_km = 5.1 where id = l[1];
  n := n + 4;

  -- 9. WSKAZANIE: wpis ręczny z dopisanym zapisem z zegarka (konto 6) z automatu ma dopisek „wynik ręczny”, wskazany przez uczestnika jest bez dopisku; oba w rankingu (20261206);
  --    wpis ze zdjęcia (konto 3) wskazany: w rankingu z dopiskiem
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 6), null);
  if (j->>'ok')::boolean is not true or (select wynik_wskazany from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 6) then raise exception 'FAIL 9a: automat nie oznacza wyniku jako wskazany: %', j; end if;
  if public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 6), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1500 or public.akcja_bieg_wynik_z_zegarka((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 6))
    then raise exception 'FAIL 9b: wpis ręczny z dopisanym zegarkiem bez wskazania: w rankingu, z dopiskiem'; end if;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 6), l[6]);
  if (j->>'ok')::boolean is not true or not (select wynik_wskazany from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 6) then raise exception 'FAIL 9c: wskazany trening ma ustawić wynik_wskazany: %', j; end if;
  if public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 6), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1500 then raise exception 'FAIL 9d: wskazany wpis z dopisanym zegarkiem ma wejść do rankingu z 25:00'; end if;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 3), l[3]);
  if (j->>'ok')::boolean is not true or public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 3), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1500
     or public.akcja_bieg_wynik_z_zegarka((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 3))
    then raise exception 'FAIL 9e: wpis ze zdjęcia wskazany: w rankingu z dopiskiem: %', j; end if;
  n := n + 5;

  -- 10. AUTOMAT wybiera najpierw trening, który wejdzie do rankingu: konto 9 ma z zegarka 5,1 km (25:00) i dostaje szybszy tempem 10 km (40:00) → wynik z 5,1 km;
  --     potem wiarygodne tempo przed szybszym: wpis ręczny 5 km w 10:00 (2:00/km) przegrywa z 5,1 km 25:00
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[9], 10, '40:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '16 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tbr-9d');
  update public.akcja_bieg_uczestnicy set ukonczony_at = null, wynik_s = null, wynik_dystans_km = null, wynik_log_id = null, odznaka = 'brak' where bieg_id = b and numer = 9;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 9), null);
  if (j->>'log_id')::uuid is distinct from l[9] or (j->>'wynik_s')::int <> 1500 then raise exception 'FAIL 10a: automat ma wybrać trening z zakresu rankingu (5,1 km), nie szybszy 10 km: %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[9], 5, '10:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '17 hours') at time zone 'Europe/Warsaw', 'manual', 'app', 'tbr-9e');
  update public.akcja_bieg_uczestnicy set ukonczony_at = null, wynik_s = null, wynik_dystans_km = null, wynik_log_id = null, odznaka = 'brak' where bieg_id = b and numer = 9;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 9), null);
  if (j->>'log_id')::uuid is distinct from l[9] then raise exception 'FAIL 10a2: automat ma wybrać wiarygodne tempo przed 2:00/km: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[6], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_treningi_z_okna('proba-bieg');
  execute 'reset role';
  if jsonb_array_length(j) <> 1 or (j->0->>'z_zegarka')::boolean is not true then raise exception 'FAIL 10b: treningi konta 6: wpis z dopisanym zegarkiem ma z_zegarka: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_treningi_z_okna('proba-bieg');
  execute 'reset role';
  if jsonb_array_length(j) <> 1 or (j->0->>'z_zegarka')::boolean is not false or j->0->>'zalicza_km' <> '5' then raise exception 'FAIL 10c: treningi konta 3: wpis ze zdjęcia bez z_zegarka: %', j; end if;
  n := n + 3;

  raise exception 'TESTY RANKINGU Z ZEGARKA ZIELONE: % sprawdzeń', n;
end $test$;
