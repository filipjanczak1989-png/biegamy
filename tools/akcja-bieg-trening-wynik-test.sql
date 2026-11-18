-- Test po skutku 20261212 (wynik po usunięciu albo zmianie treningu, który był wynikiem; jednorazowe sprzątanie wiszących wyników). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa), bieg próbny 'proba-trening', zapisy i treningi tylko tutaj; trzy konta bez treningów z ostatnich 40 dni i jeden trener; imiona wymyślone.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; b uuid; tr uuid; ka uuid[]; ku uuid[]; u1 uuid; u2 uuid; u3 uuid; ud uuid; t1 uuid; t2 uuid; t3 uuid; t4 uuid; ta uuid; tb uuid; t5 uuid; x record; a0 int; ile int; v text;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v3';
begin
  if to_regprocedure('public.akcja_bieg_wiszace_wyczysc()') is null then raise exception 'FAIL 1: brak akcja_bieg_wiszace_wyczysc (migracja 20261212 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. triggery (BEFORE DELETE: 1+2+8 = 11; AFTER UPDATE: 1+16 = 17), uprawnienia, klucz obcy bez zmian, zero wiszących wyników
  if (select t.tgtype from pg_trigger t where t.tgrelid = 'public.training_logs'::regclass and t.tgname = 'trg_akcja_bieg_trening_usuniety') is distinct from 11 then raise exception 'FAIL 1a: brak triggera BEFORE DELETE'; end if;
  if (select t.tgtype from pg_trigger t where t.tgrelid = 'public.training_logs'::regclass and t.tgname = 'trg_akcja_bieg_trening_zmieniony') is distinct from 17 then raise exception 'FAIL 1b: brak triggera AFTER UPDATE'; end if;
  foreach v in array array['public.akcja_bieg_wynik_wyczysc(uuid)', 'public.akcja_bieg_trening_usuniety()', 'public.akcja_bieg_trening_zmieniony()', 'public.akcja_bieg_wiszace_wyczysc()'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1c: % dostępna z przeglądarki', v; end if;
  end loop;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'akcja_bieg_uczestnicy_wynik_log_id_fkey') !~ 'ON DELETE SET NULL' then raise exception 'FAIL 1d: klucz obcy wynik_log_id zmieniony'; end if;
  if exists (select 1 from public.akcja_bieg_uczestnicy u where u.rodzaj = 'ja' and u.ukonczony_at is not null and u.wynik_log_id is null and u.zaliczony_przez is null and u.wynik_usuniety_at is null) then
    raise exception 'FAIL 1e: są wiszące wyniki (ukończenie bez treningu i bez zaliczenia przez organizatora)'; end if;
  n := n + 5;

  -- 2. bieg próbny i zapisy (wprost w tabeli: test nie zależy od zapisu przez stronę)
  select c.id into tr from public.coaches c limit 1;
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 3) y;
  if tr is null or coalesce(array_length(ka, 1), 0) < 3 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 3 konta bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-trening', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W) returning id into b;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (b, ka[1], 'ja', 'Anna', true, 1, 5, W) returning id into u1;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (b, ka[2], 'ja', 'Bogna', true, 2, 5, W) returning id into u2;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (b, ka[3], 'ja', 'Celina', true, 3, 5, W) returning id into u3;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, oswiadczenie_rodzica_at, regulamin_wersja) values (b, ka[1], 'dziecko', 'Zosia', true, 4, now(), W) returning id into ud;

  -- 3. usunięcie treningu-wyniku: wynik czyszczony (z weryfikacją), odznaka zostaje; automat bierze inny pasujący trening
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.1, '30:00', 'Spokojny', 'Run', now() - interval '3 days', 'manual', now() - interval '3 days') returning id into t1;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.0, '35:00', 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into t2;
  j := public.akcja_bieg_wynik_z_treningu(u1, null);
  if (j->>'log_id')::uuid is distinct from t1 then raise exception 'FAIL 3-0: wynik z treningu: %', j; end if;
  update public.akcja_bieg_uczestnicy set weryfikacja = 'zatwierdzony', weryfikacja_at = now(), weryfikacja_przez = tr where id = u1;
  select count(*) into a0 from public.achievements where athlete_id = ka[1];
  delete from public.training_logs where id = t1;
  select * into x from public.akcja_bieg_uczestnicy where id = u1;
  if x.ukonczony_at is not null or x.wynik_log_id is not null or x.wynik_s is not null or x.wynik_dystans_km is not null or x.wynik_wskazany then raise exception 'FAIL 3a: po usunięciu treningu wynik został'; end if;
  if x.weryfikacja is not null or x.weryfikacja_at is not null or x.weryfikacja_przez is not null then raise exception 'FAIL 3b: po usunięciu treningu weryfikacja została'; end if;
  if x.odznaka <> 'zwykla' or (select count(*) from public.achievements where athlete_id = ka[1]) <> a0 or x.wynik_usuniety_at is not null then raise exception 'FAIL 3c: odznaka albo znacznik usunięcia'; end if;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is distinct from t2 then raise exception 'FAIL 3d: automat nie wziął innego pasującego treningu'; end if;
  n := n + 4;

  -- 4. zmiana treningu-wyniku (wynik z automatu): czas → przeliczony; dystans albo data poza biegiem → wyczyszczony; gorszy czas → najlepszy inny trening
  update public.training_logs set duration = '28:00' where id = t2;
  if (select wynik_s from public.akcja_bieg_uczestnicy where id = u1) is distinct from 1680 then raise exception 'FAIL 4a: czas po zmianie treningu nie przeliczony'; end if;
  update public.training_logs set distance_km = 3.0 where id = t2;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u1) is not null then raise exception 'FAIL 4b: trening 3 km został wynikiem 5 km'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.0, '26:00', 'Spokojny', 'Run', now() - interval '1 day', 'manual', now() - interval '1 day') returning id into t3;
  perform public.akcja_bieg_automat();
  update public.training_logs set logged_at = now() - interval '30 days' where id = t3;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u1) is not null then raise exception 'FAIL 4c: trening z datą poza biegiem został wynikiem'; end if;
  update public.training_logs set distance_km = 5.0 where id = t2;
  perform public.akcja_bieg_automat();
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.0, '25:00', 'Spokojny', 'Run', now() - interval '20 hours', 'manual', now() - interval '20 hours') returning id into t4;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is distinct from t4 then raise exception 'FAIL 4d-0: automat nie wziął najlepszego'; end if;
  update public.training_logs set duration = '40:00' where id = t4;
  select * into x from public.akcja_bieg_uczestnicy where id = u1;
  if x.wynik_log_id is distinct from t4 or x.wynik_s is distinct from 2400 or x.wynik_wskazany then raise exception 'FAIL 4d: po zmianie czasu wynik z tego samego treningu (40:00), wskazanie bez zmian'; end if;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is distinct from t2 or (select wynik_s from public.akcja_bieg_uczestnicy where id = u1) is distinct from 1680 then
    raise exception 'FAIL 4e: automat nie wziął potem lepszego treningu'; end if;
  update public.training_logs set training_type = 'Rower', external_type = 'Ride' where id = t2;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u1) is not null then raise exception 'FAIL 4f: trening zmieniony na rower został wynikiem'; end if;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is distinct from t4 then raise exception 'FAIL 4g: po wyczyszczeniu automat nie wziął innego pasującego treningu'; end if;
  n := n + 7;

  -- 5. trening wskazany przez zawodnika: zmiana czasu → ten sam trening z nowym czasem; data poza biegiem → wyczyszczony, potem automat
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[2], 5.0, '24:00', 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into ta;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[2], 5.0, '30:00', 'Spokojny', 'Run', now() - interval '1 day', 'manual', now() - interval '1 day') returning id into tb;
  j := public.akcja_bieg_wynik_z_treningu(u2, tb);
  update public.training_logs set duration = '29:00' where id = tb;
  select * into x from public.akcja_bieg_uczestnicy where id = u2;
  if x.wynik_log_id is distinct from tb or x.wynik_s is distinct from 1740 or not x.wynik_wskazany then raise exception 'FAIL 5a: wskazany trening po zmianie czasu: log %, czas %, wskazany %', x.wynik_log_id = tb, x.wynik_s, x.wynik_wskazany; end if;
  update public.training_logs set logged_at = now() - interval '20 days' where id = tb;
  select * into x from public.akcja_bieg_uczestnicy where id = u2;
  if x.ukonczony_at is not null or x.wynik_wskazany then raise exception 'FAIL 5b: wskazany trening poza biegiem został wynikiem'; end if;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u2) is distinct from ta then raise exception 'FAIL 5c: po wyczyszczeniu automat nie wziął innego treningu'; end if;
  n := n + 3;

  -- 6. weryfikacja: zmiana wyniku przez zmianę treningu kasuje decyzję organizatora (reguła 20261206: decyzja dotyczy tego jednego wyniku); pole spoza wyniku nic nie rusza
  update public.akcja_bieg_uczestnicy set weryfikacja = 'zatwierdzony', weryfikacja_at = now(), weryfikacja_przez = tr where id = u2;
  update public.training_logs set duration = '24:30' where id = ta;
  if (select weryfikacja from public.akcja_bieg_uczestnicy where id = u2) is not null then raise exception 'FAIL 6a: zatwierdzenie zostało po zmianie wyniku'; end if;
  update public.akcja_bieg_uczestnicy set weryfikacja = 'odrzucony', weryfikacja_at = now(), weryfikacja_przez = tr where id = u2;
  update public.training_logs set duration = '25:00' where id = ta;
  if (select weryfikacja from public.akcja_bieg_uczestnicy where id = u2) is not null or (select wynik_s from public.akcja_bieg_uczestnicy where id = u2) is distinct from 1500 then
    raise exception 'FAIL 6b: po zmianie wyniku decyzja została albo czas nie przeliczony'; end if;
  update public.akcja_bieg_uczestnicy set weryfikacja = 'odrzucony', weryfikacja_at = now(), weryfikacja_przez = tr where id = u2;
  update public.training_logs set external_source = 'test-pole' where id = ta;
  if (select weryfikacja from public.akcja_bieg_uczestnicy where id = u2) is distinct from 'odrzucony' or (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u2) is distinct from ta then
    raise exception 'FAIL 6c: zmiana pola spoza wyniku ruszyła wynik'; end if;
  n := n + 3;

  -- 7. zaliczenie ręczne przez organizatora (bez treningu) i ukończenie dziecka: bez zmian, także w sprzątaniu
  update public.akcja_bieg_uczestnicy set wynik_dystans_km = 5, wynik_s = 1800, ukonczony_at = now(), zaliczony_przez = tr, odznaka = 'zwykla' where id = u3;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[3], 5.0, '31:00', 'Spokojny', 'Run', now() - interval '1 day', 'manual', now() - interval '1 day') returning id into t5;
  delete from public.training_logs where id = t5;
  update public.akcja_bieg_uczestnicy set dystans_wlasny_km = 1.0, ukonczony_at = now() where id = ud;
  ile := public.akcja_bieg_wiszace_wyczysc();
  select * into x from public.akcja_bieg_uczestnicy where id = u3;
  if x.ukonczony_at is null or x.wynik_s is distinct from 1800 or x.zaliczony_przez is distinct from tr then raise exception 'FAIL 7a: zaliczenie przez organizatora zmienione'; end if;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = ud) is null then raise exception 'FAIL 7b: ukończenie dziecka wyczyszczone'; end if;
  if ile <> 0 then raise exception 'FAIL 7c: sprzątanie ruszyło % wyników bez usterki', ile; end if;
  n := n + 3;

  -- 8. jednorazowe sprzątanie: wynik po dawnym SET NULL (odnośnik pusty, czas i ukończenie zostały) → wyczyszczony
  update public.akcja_bieg_uczestnicy set wynik_log_id = null where id = u1;
  ile := public.akcja_bieg_wiszace_wyczysc();
  if ile <> 1 or (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u1) is not null or (select wynik_s from public.akcja_bieg_uczestnicy where id = u1) is not null then
    raise exception 'FAIL 8: sprzątanie wiszącego wyniku (%)', ile; end if;
  n := n + 1;

  raise exception 'TESTY WYNIKU Z TRENINGU ZIELONE: % sprawdzeń', n;
end $test$;
