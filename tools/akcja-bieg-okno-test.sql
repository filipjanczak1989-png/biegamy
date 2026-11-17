-- Test po skutku 20261207 (bieg przez cały okres: daty, automat z najlepszym treningiem okresu, jeden e-mail 3 dni przed końcem). W transakcji z .sh, zawsze wycofanej.
-- Bieg próbny 19 dni (jak prawdziwy 18.11–6.12) i treningi tylko w tej transakcji; trzy konta bez treningów z ostatnich 40 dni; imiona wymyślone.
do $test$
declare
  n int := 0; b uuid; b2 uuid; j jsonb; k jsonb; e jsonb; v text; i int; tr uuid; ka uuid[]; ku uuid[]; u uuid[]; l1 uuid; l2 uuid; l3 uuid; v_ile int; t timestamptz;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v2';
begin
  -- 0. strażnik: licznik prawdziwej ulicy identyczny przed i po migracji
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_licznik('dla-fabianka') is distinct from (select x.j from _licznik_przed x) then raise exception 'FAIL 0: licznik prawdziwej ulicy zmienił się po migracji'; end if;
  execute 'reset role';
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.akcja_biegi'::regclass and c.conname = 'akcja_biegi_dni') !~ '<= 31' then raise exception 'FAIL 1: CHECK dat biegu dalej 2 dni (migracja 20261207 nie weszła)'; end if;
  n := n + 2;

  -- 2. daty: 19 dni przechodzą, 33 dni nie; wynik_do dalej najwyżej 7 dni po końcu
  select c.id into tr from public.coaches c limit 1;
  select array_agg(x.id order by x.created_at, x.id), array_agg(x.user_id order by x.created_at, x.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 3) x;
  if tr is null or coalesce(array_length(ka, 1), 0) < 3 then raise exception 'FAIL 2-0: za mało kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-okno', 'Bieg próbny', DZIS - 10, DZIS + 8, DZIS + 10, '{5}', 'otwarty', W) returning id into b;
  begin
    insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja) values ('proba', 'proba-za-dlugi', 'Za długi', DZIS, DZIS + 32, DZIS + 33, '{5}', 'szkic', W);
    raise exception 'FAIL 2a: bieg 33 dni przeszedł';
  exception when check_violation then null; end;
  begin
    insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja) values ('proba', 'proba-wynik-pozno', 'Wynik późno', DZIS, DZIS + 18, DZIS + 26, '{5}', 'szkic', W);
    raise exception 'FAIL 2b: wynik_do 8 dni po końcu przeszedł';
  exception when check_violation then null; end;
  if public.akcja_bieg_faza((select x from public.akcja_biegi x where x.id = b)) <> 'trwa' then raise exception 'FAIL 2c: faza w środku okresu ma być trwa'; end if;
  n := n + 3;

  -- 3. zapis w trakcie okresu (faza trwa) i wynik od pierwszego dnia
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-okno', 5, true, true, W, 'Anna', true);
  execute 'reset role';
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 3a: zapis w fazie trwa: %', j; end if;
  u := array[(j->>'id')::uuid, null, null];
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[2], 'ja', 'Bogna', true, 2, 5, W, now()) returning id into l1;
  u[2] := l1;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[3], 'ja', 'Celina', true, 3, 5, W, now()) returning id into l1;
  u[3] := l1;
  -- trening przed okresem (nie liczy się), pierwszy dzień okresu 5,2 km 30:00
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[1], 6, '20:00', 'Spokojny', 'Run', ((DZIS - 11)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-okno', 'to-0');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[1], 5.2, '30:00', 'Spokojny', 'Run', ((DZIS - 10)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-okno', 'to-1') returning id into l1;
  j := public.akcja_bieg_wynik_z_treningu(u[1], null);
  if (j->>'ok')::boolean is not true or (j->>'log_id')::uuid <> l1 then raise exception 'FAIL 3b: wynik z pierwszego dnia okresu (trening sprzed okresu się nie liczy): %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  k := public.akcja_bieg_ukonczyli('proba-okno', 0, 50, 5);
  execute 'reset role';
  if (k->>'w_rankingu')::int <> 1 or (k->'lista'->0->>'czas_s')::int <> 1800 then raise exception 'FAIL 3c: ranking od pierwszego dnia: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-okno');
  j := public.akcja_bieg_zalicz_recznie(u[3], 5, 1700);
  execute 'reset role';
  if jsonb_array_length(k->'uczestnicy') <> 3 or (j->>'ok')::boolean is not true then raise exception 'FAIL 3d: panel i zaliczenie w fazie trwa: % %', k->'bieg', j; end if;
  n := n + 4;

  -- 4. AUTOMAT: lepszy trening później w okresie podmienia wynik ustalony automatem; wskazany i zaliczony przez organizatora zostają; drugi przebieg nic nie zmienia
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[1], 5.1, '25:00', 'Spokojny', 'Run', ((DZIS - 2)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw', 'manual', 'app', 'to-2') returning id into l2;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[2], 5.0, '35:00', 'Spokojny', 'Walk', ((DZIS - 5)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-okno', 'to-3') returning id into l3;
  j := public.akcja_bieg_wynik_z_treningu(u[2], l3);
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[2], 5.0, '28:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '9 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-okno', 'to-4');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[3], 5.0, '24:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '10 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-okno', 'to-5');
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  perform public.akcja_bieg_automat();
  execute 'reset role';
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u[1]) is distinct from l2 or (select wynik_s from public.akcja_bieg_uczestnicy where id = u[1]) <> 1500
    then raise exception 'FAIL 4a: automat ma podmienić wynik na lepszy z okresu (25:00)'; end if;
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u[2]) is distinct from l3 then raise exception 'FAIL 4b: wynik wskazany przez uczestnika zmieniony przez automat'; end if;
  if (select wynik_s from public.akcja_bieg_uczestnicy where id = u[3]) <> 1700 or (select zaliczony_przez from public.akcja_bieg_uczestnicy where id = u[3]) is distinct from tr then raise exception 'FAIL 4c: wynik organizatora zmieniony przez automat'; end if;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u[1]) is null then raise exception 'FAIL 4d: ukończenie po podmianie'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  v_ile := public.akcja_bieg_automat();
  k := public.akcja_bieg_ukonczyli('proba-okno', 0, 50, 5);
  execute 'reset role';
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u[1]) is distinct from l2 then raise exception 'FAIL 4e: drugi przebieg automatu zmienił wynik'; end if;
  if (k->'lista'->0->>'numer')::int <> 1 or (k->'lista'->0->>'czas_s')::int <> 1500 or (k->'lista'->0->>'reczny')::boolean is not true then raise exception 'FAIL 4f: ranking z najlepszym wynikiem okresu (ręczny, z dopiskiem): %', k; end if;
  n := n + 6;

  -- 5. E-MAIL: jeden, 3 dni przed końcem od 8:00 (dni_do_konca 3), następnego dnia tylko zaległe; wcześniej i później nic (bieg w dalekiej przyszłości)
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-okno-mail', 'Bieg próbny', DZIS + 400, DZIS + 418, DZIS + 420, '{5}', 'otwarty', W) returning id into b2;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, zgoda_email) values (b2, ka[1], 'ja', 'Anna', true, 1, 5, W, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  foreach v in array array['400 07:00:false', '414 20:00:false', '415 07:55:false', '415 08:05:true', '416 06:00:true', '417 08:05:false'] loop
    t := ((DZIS + split_part(v, ' ', 1)::int)::timestamp + (split_part(split_part(v, ' ', 2), ':', 1) || ' hours ' || split_part(split_part(v, ' ', 2), ':', 2) || ' minutes')::interval) at time zone 'Europe/Warsaw';
    j := public.akcja_bieg_do_przypomnienia(t);
    select x into e from jsonb_array_elements(j) x where (x->>'bieg_id')::uuid = b2;
    if (e is not null) <> split_part(v, ':', 3)::boolean then raise exception 'FAIL 5a: dzień +% %: na liście ma być %', split_part(v, ' ', 1), split_part(split_part(v, ' ', 2), ':', 1), split_part(v, ':', 3); end if;
    if e is not null and (e->>'dni_do_konca')::int <> 418 - split_part(v, ' ', 1)::int then raise exception 'FAIL 5b: dni_do_konca: %', e; end if;
    n := n + 1;
  end loop;
  i := public.akcja_bieg_mail_rezerwuj(b2, ka[1], ((DZIS + 415)::timestamp + interval '8 hours 6 minutes') at time zone 'Europe/Warsaw');
  j := public.akcja_bieg_do_przypomnienia(((DZIS + 416)::timestamp + interval '8 hours') at time zone 'Europe/Warsaw');
  execute 'reset role';
  if i is distinct from 1 or exists (select 1 from jsonb_array_elements(j) x where (x->>'bieg_id')::uuid = b2) then raise exception 'FAIL 5c: po wysyłce 3 dni przed końcem następnego dnia bez drugiego e-maila'; end if;
  if (select schedule from cron.job where jobname = 'akcja-bieg-przypomnienie') is distinct from null and (select schedule from cron.job where jobname = 'akcja-bieg-przypomnienie') <> '0,20,40 7 * * *'
    then raise exception 'FAIL 5d: cron e-maila uruchomiony ze starym harmonogramem (wieczór): popraw 20261128 przed uruchomieniem'; end if;
  n := n + 2;

  raise exception 'TESTY OKNA BIEGU ZIELONE: % sprawdzeń', n;
end $test$;
