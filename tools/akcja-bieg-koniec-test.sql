-- Test po skutku 20261209 (koniec biegu i wyników o godzinie: koniec_at, zalicz_do). W transakcji z .sh, zawsze wycofanej.
-- Bieg próbny i treningi tylko w tej transakcji; cztery konta bez treningów z ostatnich 40 dni i jeden trener; imiona wymyślone.
-- now() jest w transakcji stałe: „przed końcem” i „po końcu” ustawiamy przez koniec_at względem now(), created_at treningów podajemy wprost.
do $test$
declare
  n int := 0; b uuid; j jsonb; k jsonb; tr uuid; ka uuid[]; ku uuid[]; u uuid[]; lA uuid; lB uuid; lC uuid; lC2 uuid; v text;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v2';
begin
  -- 0. strażnik: licznik prawdziwej ulicy identyczny przed i po migracji
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_licznik('dla-fabianka') is distinct from (select x.j from _licznik_przed x) then raise exception 'FAIL 0: licznik prawdziwej ulicy zmienił się po migracji'; end if;
  execute 'reset role';
  n := n + 1;

  -- 1. kolumny, uprawnienia, zmienione funkcje
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'akcja_biegi' and column_name = 'koniec_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'akcja_biegi' and column_name = 'zalicz_do') then
    raise exception 'FAIL 1: brak kolumny koniec_at albo zalicz_do (migracja 20261209 nie weszła)'; end if;
  foreach v in array array['koniec_at', 'zalicz_do'] loop
    if has_column_privilege('anon', 'public.akcja_biegi', v, 'SELECT') or has_column_privilege('authenticated', 'public.akcja_biegi', v, 'SELECT') then raise exception 'FAIL 1a: kolumna % widoczna z przeglądarki', v; end if;
  end loop;
  foreach v in array array['public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)', 'public.akcja_bieg_usun_wynik(uuid, text)', 'public.akcja_bieg_weryfikuj(uuid, text)'] loop
    if pg_get_functiondef(v::regprocedure) !~ 'coalesce\(b\.zalicz_do, b\.wynik_do \+ 7\)' then raise exception 'FAIL 1b: % bez okna zalicz_do', v; end if;
  end loop;
  if pg_get_functiondef('public.akcja_bieg_do_przypomnienia(timestamp with time zone, integer)'::regprocedure) !~ '''koniec_godz''' then raise exception 'FAIL 1c: lista e-maili bez koniec_godz'; end if;
  foreach v in array array['public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)', 'public.akcja_bieg_moi(text)', 'public.akcja_bieg_panel(text)', 'public.akcja_bieg_treningi_z_okna(text)'] loop
    if has_function_privilege('anon', v, 'execute') or not has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1d: % uprawnienia inne niż przed migracją', v; end if;
  end loop;
  foreach v in array array['public.akcja_bieg_automat()', 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1e: % dostępna z przeglądarki', v; end if;
  end loop;
  n := n + 9;

  -- 2. bieg próbny: od 5 dni, koniec dziś za godzinę; okno organizatora do DZIS + 9; zalicz_do poza zakresem odrzucone
  select c.id into tr from public.coaches c limit 1;
  select array_agg(x.id order by x.created_at, x.id), array_agg(x.user_id order by x.created_at, x.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 4) x;
  if tr is null or coalesce(array_length(ka, 1), 0) < 4 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 4 konta bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  update public.akcje set konta_testowe = coalesce(konta_testowe, '{}'::uuid[]) || array(select a.id from public.athletes a) where slug = 'proba';   -- 20261211: bieg akcji testowej przyjmuje tylko konta_testowe; konta testu dopisane w tej transakcji
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja, regulamin_od, koniec_at, zalicz_do)
    values ('proba', 'proba-koniec', 'Bieg próbny', DZIS - 5, DZIS, DZIS, '{5}', 'otwarty', W, DZIS - 5, now() + interval '1 hour', DZIS + 9) returning id into b;
  begin update public.akcja_biegi set zalicz_do = DZIS - 1 where id = b; raise exception 'FAIL 2a: zalicz_do przed końcem biegu przeszło'; exception when check_violation then null; end;
  begin update public.akcja_biegi set zalicz_do = DZIS + 32 where id = b; raise exception 'FAIL 2b: zalicz_do ponad 31 dni po końcu przeszło'; exception when check_violation then null; end;
  if public.akcja_bieg_faza((select x from public.akcja_biegi x where x.id = b)) <> 'trwa' then raise exception 'FAIL 2c: przed koniec_at faza ma być trwa'; end if;
  if (public.akcja_bieg_publiczny('proba') ->> 'koniec_at')::timestamptz is distinct from (select koniec_at from public.akcja_biegi where id = b) then raise exception 'FAIL 2d: licznik bez koniec_at'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-koniec');
  execute 'reset role';
  if (k->'bieg'->>'zalicz_do')::date is distinct from DZIS + 9 or (k->'bieg'->>'koniec_at')::timestamptz is distinct from (select koniec_at from public.akcja_biegi where id = b) then raise exception 'FAIL 2e: panel: zalicz_do i koniec_at: %', k->'bieg'; end if;
  n := n + 5;

  -- 3. przed końcem: zapis przez RPC, wynik z treningu dodanego ręcznie na stronie (wynik_ustal)
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-koniec', 5, true, false, W, 'Anna', true);
  execute 'reset role';
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 3a: zapis przed końcem: %', j; end if;
  u := array[(j->>'id')::uuid, null, null];
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (b, ka[2], 'ja', 'Bogna', true, 2, 5, W) returning id into lB;
  u[2] := lB;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (b, ka[3], 'ja', 'Celina', true, 3, 5, W) returning id into lC;
  u[3] := lC;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.1, '30:00', 'Spokojny', 'Run', now() - interval '30 minutes', 'manual', now()) returning id into lA;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(u[1], null);
  k := public.akcja_bieg_treningi_z_okna('proba-koniec');
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (j->>'log_id')::uuid <> lA then raise exception 'FAIL 3b: wynik przed końcem: %', j; end if;
  if jsonb_array_length(k) <> 1 then raise exception 'FAIL 3c: „Wskaż trening” przed końcem: %', k; end if;
  n := n + 3;

  -- 4. po końcu (koniec 10 minut temu): faza zakończony; zapis, wynik na stronie i dystans dziecka zamknięte
  update public.akcja_biegi set koniec_at = now() - interval '10 minutes' where id = b;
  if public.akcja_bieg_faza((select x from public.akcja_biegi x where x.id = b)) <> 'zakonczony' then raise exception 'FAIL 4a: po koniec_at faza ma być zakonczony'; end if;
  if public.akcja_bieg_faza((select x from public.akcja_biegi x where x.id = b), DZIS - 1) <> 'trwa' then raise exception 'FAIL 4b: wczoraj (p_dzis) faza trwa'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[4], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-koniec', 5, true, false, W, 'Dawid', false);
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' <> 'zamkniete' then raise exception 'FAIL 4c: zapis po końcu: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(u[1], lA);
  k := public.akcja_bieg_dopisz_dziecko('proba-koniec', 'Zosia', true, true, W);
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' <> 'poza_oknem' then raise exception 'FAIL 4d: „Wskaż trening” po końcu: %', j; end if;
  if (k->>'ok')::boolean then raise exception 'FAIL 4e: dopisanie dziecka po końcu: %', k; end if;
  n := n + 5;

  -- 5. automat w 2 godziny po końcu: import zegarka z biegu przed końcem (zsynchronizowany po końcu) TAK; wpis ręczny dodany po końcu NIE; trening po końcu NIE
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id, created_at)
    values (ka[2], 5.0, '28:00', 'Spokojny', 'Run', now() - interval '40 minutes', 'intervals', 'test-koniec', 'tk-b', now() - interval '5 minutes') returning id into lB;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[3], 5.0, '29:00', 'Spokojny', 'Run', now() - interval '40 minutes', 'manual', now() - interval '5 minutes') returning id into lC;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id, created_at)
    values (ka[3], 5.0, '27:00', 'Spokojny', 'Run', now() - interval '5 minutes', 'intervals', 'test-koniec', 'tk-c2', now() - interval '2 minutes') returning id into lC2;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u[2]) is distinct from lB then raise exception 'FAIL 5a: import zegarka z biegu przed końcem, zsynchronizowany po końcu: wynik ma wejść'; end if;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u[3]) is not null then raise exception 'FAIL 5b: wpis ręczny po końcu albo trening po końcu dały wynik'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_treningi_z_okna('proba-koniec');
  execute 'reset role';
  if exists (select 1 from jsonb_array_elements(k) x where (x->>'id')::uuid = lC2) then raise exception 'FAIL 5c: „Wskaż trening” pokazuje trening po końcu'; end if;
  n := n + 3;

  -- 6. automat po 2 godzinach od końca już nie działa (także dla importu zegarka sprzed końca)
  update public.akcja_biegi set koniec_at = now() - interval '3 hours' where id = b;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id, created_at)
    values (ka[3], 5.0, '31:00', 'Spokojny', 'Run', now() - interval '4 hours', 'intervals', 'test-koniec', 'tk-c3', now() - interval '1 hour');
  perform public.akcja_bieg_automat();
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u[3]) is not null then raise exception 'FAIL 6a: automat po 2 godzinach od końca dał wynik'; end if;
  n := n + 1;

  -- 7. organizator: zalicza po końcu do zalicz_do; po zalicz_do odmowa (zaliczanie, usunięcie, weryfikacja); bez zalicz_do jak dotąd wynik_do + 7
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(u[3], 5, null);
  execute 'reset role';
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 7a: zaliczenie po końcu biegu, przed zalicz_do: %', j; end if;
  update public.akcja_biegi set zalicz_do = DZIS where id = b;
  update public.akcja_biegi set dzien_do = DZIS - 1, wynik_do = DZIS - 1, zalicz_do = DZIS - 1 where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(u[1], 5, 1500);
  k := public.akcja_bieg_usun_wynik(u[2], 'test okna organizatora');
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' <> 'za_pozno' or (k->>'ok')::boolean or k->>'powod' <> 'za_pozno' then raise exception 'FAIL 7b: po zalicz_do odmowa: % %', j, k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_weryfikuj(u[2], 'zatwierdz');
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' <> 'za_pozno' then raise exception 'FAIL 7c: weryfikacja po zalicz_do: %', j; end if;
  update public.akcja_biegi set zalicz_do = null where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(u[1], 5, 1500);
  k := public.akcja_bieg_panel('proba-koniec');
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (k->'bieg'->>'zalicz_do')::date <> DZIS + 6 then raise exception 'FAIL 7d: bez zalicz_do okno wynik_do + 7: % %', j, k->'bieg'->'zalicz_do'; end if;
  n := n + 4;

  -- 8. bez koniec_at faza jak dotąd (dniami): dzisiejszy koniec biegu = trwa do północy
  update public.akcja_biegi set koniec_at = null, dzien_do = DZIS, wynik_do = DZIS where id = b;
  if public.akcja_bieg_faza((select x from public.akcja_biegi x where x.id = b)) <> 'trwa' or (public.akcja_bieg_publiczny('proba') -> 'koniec_at') <> 'null'::jsonb then raise exception 'FAIL 8: bez koniec_at faza dniami i licznik z koniec_at null'; end if;
  n := n + 1;

  raise exception 'TESTY KOŃCA BIEGU ZIELONE: % sprawdzeń', n;
end $test$;
