-- Testy zachowania migracji 20261102_akcje.sql. Uruchamia tools/akcje-test-transakcji.sh:
-- migracja (bez begin/commit) + ten blok w JEDNEJ transakcji; blok kończy się wyjątkiem ZAWSZE,
-- więc nic nie zostaje w bazie — także przy zielonym wyniku. Komunikat wyjątku = wynik.
do $T$
declare
  F_UID  constant uuid := 'bd9cbbac-c98d-4ac7-8610-9daf754b2de5';   -- GŁÓWNE konto Filipa (startujący; poprawka 2.11)
  F_ATH  constant uuid := '56092926-2cf1-44b6-952f-38614497fdc2';
  T_ATH  constant uuid := '9c2df65c-6a46-410e-ad5f-474e5d973ec9';   -- konto testowe (konta_testowe próby)
  r_uid uuid; r_ath uuid; j jsonb; n int := 0; t_suma uuid;
begin
  select id, user_id into r_ath, r_uid from public.athletes
   where user_id is not null and id <> F_ATH and coach_id is not null
     and not exists (select 1 from public.training_logs l where l.athlete_id = athletes.id) order by created_at limit 1;
  if r_ath is null then raise exception 'FAIL: brak zwykłego zawodnika do testu'; end if;

  -- ── 1. licznik przed startem przez service_role (tak woła EF akcja-licznik) — tylko teaser, zero nazwy dziecka ──
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  reset role;
  if (j->>'wystartowala')::boolean is distinct from false then raise exception 'FAIL 1a: wystartowala %', j; end if;
  if not (j ? 'suma_km') or j->'suma_km' <> 'null'::jsonb then raise exception 'FAIL 1b: suma_km nie null %', j; end if;
  if j::text ~* 'fabian' then raise exception 'FAIL 1c: nazwa dziecka w odpowiedzi %', j; end if;
  if j::text ~* 'athlete' then raise exception 'FAIL 1d: klucz osobowy %', j; end if;
  n := n + 4;

  -- ── 2. anon: WSZYSTKO → 42501, także licznik (wariant b: niezalogowani tylko przez EF) ──
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin execute 'set local role anon'; perform public.akcja_licznik('dla-fabianka'); raise exception 'FAIL 2-: anon czyta licznik'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform public.akcja_start('dla-fabianka', now()); raise exception 'FAIL 2a: anon wystartował'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform public.akcja_moj_wklad('dla-fabianka'); raise exception 'FAIL 2b'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform public.akcja_tydzien('dla-fabianka', date '2026-11-09'); raise exception 'FAIL 2c'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform public.akcja_proba_reset(); raise exception 'FAIL 2d'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform public.akcja_km_okna(gen_random_uuid(), current_date, current_date); raise exception 'FAIL 2e'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform count(*) from public.akcje; raise exception 'FAIL 2f'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform count(*) from public.akcja_sponsorzy; raise exception 'FAIL 2g'; exception when insufficient_privilege then null; end;
  n := n + 8;

  -- ── 3. zwykły zawodnik → 42501 na guziku, rozliczeniu, resecie, tabelach ──
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  begin execute 'set local role authenticated'; perform public.akcja_start('dla-fabianka', now()); raise exception 'FAIL 3a: zawodnik wystartował'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_start('proba', now()); raise exception 'FAIL 3b'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_tydzien('dla-fabianka', date '2026-11-09'); raise exception 'FAIL 3c'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_proba_reset(); raise exception 'FAIL 3d'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_km_okna(gen_random_uuid(), current_date, current_date); raise exception 'FAIL 3e'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; perform count(*) from public.akcje; raise exception 'FAIL 3f'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; perform count(*) from public.akcja_startujacy; raise exception 'FAIL 3g'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; insert into public.akcja_sponsorzy (akcja_id, athlete_id, stawka_gr) select id, r_ath, 5 from public.akcje limit 1; raise exception 'FAIL 3h'; exception when insufficient_privilege then null; end;
  execute 'set local role authenticated';
  j := public.akcja_moj_wklad('dla-fabianka');
  reset role;
  if j->'km' <> 'null'::jsonb or (j->>'wystartowala')::boolean then raise exception 'FAIL 3i: wkład przed startem %', j; end if;
  n := n + 9;

  -- ── 4. Filip: dziś (2.11) poza oknem guzika dla-fabianka ──
  perform set_config('request.jwt.claims', json_build_object('sub', F_UID, 'role', 'authenticated')::text, true);
  begin execute 'set local role authenticated'; perform public.akcja_start('dla-fabianka', now()); raise exception 'FAIL 4a: start poza oknem przeszedł'; exception when sqlstate '22023' then null; end;
  if (select wystartowala_at from public.akcje where slug = 'dla-fabianka') is not null then raise exception 'FAIL 4b'; end if;
  n := n + 2;

  -- ── 5. suma: doba warszawska, cap, __badge__, przyszłość, wszystkie typy, progi (cel 125 = skala 1:100 dla 12 500) ──
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, konta_testowe, wystartowala_at)
  values ('test-suma', 'Test', date '2020-01-01', 125, 10, true, array[r_ath], now()) returning id into t_suma;
  insert into public.akcja_startujacy values (t_suma, F_ATH);
  if (public.akcja_licznik('test-suma')->>'suma_km')::numeric <> 0 then raise exception 'FAIL 5a: baza niezerowa % / logi: %', public.akcja_licznik('test-suma'), (select count(*) from public.training_logs where athlete_id = r_ath); end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id) values
    (r_ath, 10,   timestamp '2019-12-31 23:30' at time zone 'Europe/Warsaw', 'Spokojny',  'intervals', 'test-akcja', 't1'),
    (r_ath, 20,   timestamp '2020-01-01 00:30' at time zone 'Europe/Warsaw', 'Rower',     'intervals', 'test-akcja', 't2'),
    (r_ath, 60,   timestamp '2020-01-02 08:00' at time zone 'Europe/Warsaw', 'Spokojny',  'intervals', 'test-akcja', 't3'),
    (r_ath, 60,   timestamp '2020-01-02 18:00' at time zone 'Europe/Warsaw', 'Spacer',    'intervals', 'test-akcja', 't4'),
    (r_ath, 50,   timestamp '2020-01-03 08:00' at time zone 'Europe/Warsaw', '__badge__x','intervals', 'test-akcja', 't5'),
    (r_ath, 30,   now() + interval '2 days',                                 'Spokojny',  'intervals', 'test-akcja', 't6'),
    (F_ATH, 40,   timestamp '2020-01-02 09:00' at time zone 'Europe/Warsaw', 'Spokojny',  'intervals', 'test-akcja', 't7'),
    (r_ath, 4.99, timestamp '2020-01-06 08:00' at time zone 'Europe/Warsaw', 'Zastępczy', 'intervals', 'test-akcja', 't8');
  j := public.akcja_licznik('test-suma');
  if (j->>'suma_km')::numeric <> 124.99 then raise exception 'FAIL 5b: suma % (oczekiwane 124.99: 20 + cap 100 + 4.99)', j->>'suma_km'; end if;
  if (j->>'pct')::numeric <> 99.99 or (j->>'zamknieta')::boolean then raise exception 'FAIL 5c: 124.99 → %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id)
  values (r_ath, 0.01, timestamp '2020-01-07 08:00' at time zone 'Europe/Warsaw', 'Spokojny', 'intervals', 'test-akcja', 't9');
  j := public.akcja_licznik('test-suma');
  if (j->>'pct')::numeric <> 100 or not (j->>'zamknieta')::boolean or (j->>'filip_gr')::bigint <> 1250 then raise exception 'FAIL 5d: 125 → %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id)
  values (r_ath, 2.31, timestamp '2020-01-08 08:00' at time zone 'Europe/Warsaw', 'Pływanie', 'intervals', 'test-akcja', 't10');
  j := public.akcja_licznik('test-suma');
  if (j->>'suma_km')::numeric <> 127.31 or (j->>'pct')::numeric <> 100 or (j->>'filip_gr')::bigint <> 1250
     or (j->>'filip_max_gr')::bigint <> 1250 then raise exception 'FAIL 5e: 127.31 → %', j; end if;
  if j::text ~* 'athlete' then raise exception 'FAIL 5f: klucz osobowy po starcie'; end if;
  n := n + 6;

  -- ── 6. rozliczenie tygodni: suma ≤ cel × stawka, ostatni przycięty ──
  perform set_config('request.jwt.claims', json_build_object('sub', F_UID, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_tydzien('test-suma', date '2019-12-30');
  reset role;
  if (j->>'km')::numeric <> 120 or (j->>'kwota_gr')::bigint <> 1200 or (j->>'przycieta')::boolean then raise exception 'FAIL 6a: %', j; end if;
  execute 'set local role authenticated';
  j := public.akcja_tydzien('test-suma', date '2020-01-06');
  reset role;
  if (j->>'km')::numeric <> 7.31 or (j->>'kwota_gr')::bigint <> 50 or not (j->>'przycieta')::boolean then raise exception 'FAIL 6b: %', j; end if;
  begin execute 'set local role authenticated'; perform public.akcja_tydzien('test-suma', date '2020-01-07'); raise exception 'FAIL 6c: wtorek przyjęty'; exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_moj_wklad('test-suma');
  reset role;
  if (j->>'km')::numeric <> 127.31 then raise exception 'FAIL 6d: wkład %', j; end if;
  n := n + 4;

  -- ── 7. guzik: czas klienta, okno, idempotencja (now() = czas transakcji, stały) ──
  perform set_config('request.jwt.claims', json_build_object('sub', F_UID, 'role', 'authenticated')::text, true);
  insert into public.akcje (slug, start, cel_km, stawka_gr_filip, okno_startu_od, okno_startu_do) values
    ('test-okno-a', current_date, 100, 10, now() - interval '1 hour', now() + interval '1 hour'),
    ('test-okno-b', current_date, 100, 10, now() - interval '1 hour', now() + interval '1 hour'),
    ('test-okno-c', current_date, 100, 10, now() - interval '1 hour', now() + interval '1 hour'),
    ('test-okno-d', current_date, 100, 10, now() + interval '1 hour', now() + interval '2 hours');
  insert into public.akcja_startujacy select id, F_ATH from public.akcje where slug like 'test-okno-%';
  execute 'set local role authenticated';
  perform public.akcja_start('test-okno-a', now() + interval '10 minutes');      -- z przyszłości → czas serwera
  perform public.akcja_start('test-okno-a', now() - interval '5 minutes');       -- drugi raz → bez zmiany
  perform public.akcja_start('test-okno-b', now() - interval '5 minutes');       -- offline w oknie → czas klienta
  perform public.akcja_start('test-okno-c', now() - interval '2 hours');         -- klient spoza okna → czas serwera
  reset role;
  if (select wystartowala_at from public.akcje where slug = 'test-okno-a') <> now() then raise exception 'FAIL 7a: przyszły czas klienta przyjęty / drugi start zmienił'; end if;
  if (select wystartowala_at from public.akcje where slug = 'test-okno-b') <> now() - interval '5 minutes' then raise exception 'FAIL 7b: czas klienta odrzucony'; end if;
  if (select wystartowala_at from public.akcje where slug = 'test-okno-c') <> now() then raise exception 'FAIL 7c: czas spoza okna przyjęty'; end if;
  begin execute 'set local role authenticated'; perform public.akcja_start('test-okno-d', now() + interval '70 minutes'); raise exception 'FAIL 7d: start przed oknem'; exception when sqlstate '22023' then null; end;
  n := n + 4;

  -- ── 8. próba: start w dowolnej chwili, liczy tylko konta testowe, reset; dla-fabianka nietknięta ──
  execute 'set local role authenticated';
  j := public.akcja_start('proba', null);
  reset role;
  if not (j->>'wystartowala')::boolean or (j->>'start')::date <> (now() at time zone 'Europe/Warsaw')::date
     then raise exception 'FAIL 8a: próba %', j; end if;
  if (j->>'suma_km')::numeric <> public.akcja_km_okna((select id from public.akcje where slug = 'proba'),
        (now() at time zone 'Europe/Warsaw')::date, (now() at time zone 'Europe/Warsaw')::date, array[T_ATH])
    then raise exception 'FAIL 8a2: próba liczy coś poza kontem testowym %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id)
  values (r_ath, 7, now() - interval '1 minute', 'Spokojny', 'intervals', 'test-akcja', 't11');
  if (public.akcja_licznik('proba')->>'suma_km')::numeric <> (j->>'suma_km')::numeric then raise exception 'FAIL 8a3: wpis zwykłego konta wszedł do próby'; end if;
  if (public.akcja_licznik('dla-fabianka')->>'wystartowala')::boolean then raise exception 'FAIL 8b: próba ruszyła prawdziwą akcję'; end if;
  execute 'set local role authenticated';
  j := public.akcja_proba_reset();
  reset role;
  if (j->>'wystartowala')::boolean then raise exception 'FAIL 8c: reset nie zadziałał'; end if;
  n := n + 5;

  -- ── 9. wizerunek: url tylko za zgodą ──
  begin update public.akcje set wizerunek_url = 'https://x.example/f.jpg' where id = t_suma; raise exception 'FAIL 9a: url bez zgody'; exception when check_violation then null; end;
  update public.akcje set wizerunek_zgoda = true, wizerunek_url = 'https://x.example/f.jpg' where id = t_suma;
  if public.akcja_licznik('test-suma')->>'wizerunek' <> 'https://x.example/f.jpg' then raise exception 'FAIL 9b'; end if;
  update public.akcje set wizerunek_zgoda = false, wizerunek_url = null where id = t_suma;
  if public.akcja_licznik('test-suma')->'wizerunek' <> 'null'::jsonb then raise exception 'FAIL 9c'; end if;
  n := n + 3;

  raise exception 'TESTY AKCJI ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
