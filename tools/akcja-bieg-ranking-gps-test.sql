-- Test po skutku 20261203 (ranking tylko z treningu z zegarka). W transakcji z .sh, zawsze wycofanej. Bieg próbny i treningi tylko w tej transakcji; imiona wymyślone.
-- Dziewięć kont dorosłych, wszyscy ze zgodą na ranking poza ostatnim; każdy inny rodzaj wyniku. Miejsca liczą się tylko między wynikami z zegarka.
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
  n := n + 3;

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

  -- 3. lista 5 km: w rankingu tylko dwa wyniki z zegarka (1500 s i 1600 s), choć siedem innych jest szybszych; miejsca 1 i 2
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  k := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50);
  execute 'reset role';
  if (j->>'razem')::int <> 9 or (j->>'w_rankingu')::int <> 2 then raise exception 'FAIL 3a: 5 km razem 9, w rankingu 2: razem %, w rankingu %', j->>'razem', j->>'w_rankingu'; end if;
  if (j->'lista'->0->>'numer')::int <> 1 or (j->'lista'->0->>'miejsce')::int <> 1 or (j->'lista'->0->>'czas_s')::int <> 1500 or (j->'lista'->0->>'reczny')::boolean then raise exception 'FAIL 3b: pierwsze miejsce = zegarek 1500 s: %', j->'lista'->0; end if;
  if (j->'lista'->1->>'numer')::int <> 5 or (j->'lista'->1->>'miejsce')::int <> 2 or (j->'lista'->1->>'czas_s')::int <> 1600 then raise exception 'FAIL 3c: drugie miejsce = zegarek 1600 s: %', j->'lista'->1; end if;
  n := n + 3;
  -- 4. każdy wynik ręczny: na liście (ukończenie zostaje), bez czasu i miejsca, z dopiskiem; zegarek bez zgody: bez czasu i bez dopisku; dziecko: bez czasu i bez dopisku
  foreach i in array array[2, 3, 4, 6, 7, 8] loop
    select x into e from jsonb_array_elements(k->'lista') x where (x->>'numer')::int = i;
    if e is null then raise exception 'FAIL 4a: wynik ręczny nr % zniknął z listy (ma zostać ukończenie)', i; end if;
    if e ? 'czas_s' or e ? 'miejsce' then raise exception 'FAIL 4b: wynik ręczny nr % ma czas albo miejsce: %', i, e; end if;
    if (e->>'reczny')::boolean is not true then raise exception 'FAIL 4c: wynik ręczny nr % bez dopisku: %', i, e; end if;
    n := n + 3;
  end loop;
  select x into e from jsonb_array_elements(k->'lista') x where (x->>'numer')::int = 9;
  if e ? 'czas_s' or (e->>'reczny')::boolean is not false then raise exception 'FAIL 4d: zegarek bez zgody na ranking: bez czasu i bez dopisku: %', e; end if;
  select x into e from jsonb_array_elements(k->'lista') x where (x->>'numer')::int = 10;
  if e ? 'czas_s' or (e->>'reczny')::boolean is not false or (e->>'dziecko')::boolean is not true then raise exception 'FAIL 4e: dziecko bez czasu i bez dopisku: %', e; end if;
  if (k->>'razem')::int <> 10 or (k->>'w_rankingu')::int <> 2 then raise exception 'FAIL 4f: lista ogólna razem 10, w rankingu 2: %', k - 'lista'; end if;
  v := k::text;
  if v ~ '"(konto_id|wynik_s|wynik_log_id|zaliczony_przez|source|email)"' or v ~ '"czas_s": (1200|1300|1250|1100|1000|900|800)\M' then raise exception 'FAIL 4g: lista z polami kont albo czasem wyniku ręcznego'; end if;
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

  -- 6. prawdziwa droga: automat z wpisu ręcznego daje ukończenie (ok, dyplom), ale nie ranking; po dopisaniu treningu z zegarka i wskazaniu go wynik wchodzi do rankingu
  update public.akcja_bieg_uczestnicy set ukonczony_at = null, wynik_s = null, wynik_dystans_km = null, wynik_log_id = null, odznaka = 'brak' where bieg_id = b and numer = 2;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 2), null);
  if (j->>'ok')::boolean is not true or (j->>'log_id')::uuid <> l[2] then raise exception 'FAIL 6a: automat z wpisu ręcznego ma dać ukończenie: %', j; end if;
  if public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 2), (select x from public.akcja_biegi x where x.id = b)) is not null then raise exception 'FAIL 6b: wpis ręczny z automatu w rankingu'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[2], 5.0, '31:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '15 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tbr-2z') returning id into v_log;
  l[2] := v_log;
  j := public.akcja_bieg_wynik_z_treningu((select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 2), l[2]);
  if (j->>'ok')::boolean is not true or public.akcja_bieg_czas_rankingu((select u from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.numer = 2), (select x from public.akcja_biegi x where x.id = b)) is distinct from 1860
    then raise exception 'FAIL 6c: wskazany trening z zegarka ma wejść do rankingu z 31:00: %', j; end if;
  n := n + 3;

  -- 7. trening z zegarka usunięty po zaliczeniu (wynik_log_id → NULL): ukończenie zostaje, miejsce w rankingu przepada
  delete from public.training_logs where id = l[5];
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 5;
  if e is null or e ? 'czas_s' or (e->>'reczny')::boolean is not true then raise exception 'FAIL 7a: po usunięciu treningu wynik ma zostać bez czasu, z dopiskiem: %', e; end if;
  if (j->>'w_rankingu')::int <> 2 or (j->'lista'->1->>'numer')::int <> 2 or (j->'lista'->1->>'miejsce')::int <> 2 then raise exception 'FAIL 7b: ranking po zmianach: 1500 s i 1860 s: %', j; end if;
  n := n + 2;

  raise exception 'TESTY RANKINGU Z ZEGARKA ZIELONE: % sprawdzeń', n;
end $test$;
