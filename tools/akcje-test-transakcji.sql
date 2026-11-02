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

  -- ── 5. suma: doba warszawska, cap, __badge__, przyszłość, TYLKO bieg i chód (2.11 18:35), progi (cel 125 = skala 1:100) ──
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, konta_testowe, wystartowala_at)
  values ('test-suma', 'Test', date '2020-01-01', 125, 10, true, array[r_ath], now()) returning id into t_suma;
  insert into public.akcja_startujacy values (t_suma, F_ATH);
  if (public.akcja_licznik('test-suma')->>'suma_km')::numeric <> 0 then raise exception 'FAIL 5a: baza niezerowa % / logi: %', public.akcja_licznik('test-suma'), (select count(*) from public.training_logs where athlete_id = r_ath); end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id) values
    (r_ath, 10,   timestamp '2019-12-31 23:30' at time zone 'Europe/Warsaw', 'Spokojny',  'intervals', 'test-akcja', 't1'),
    (r_ath, 20,   timestamp '2020-01-01 00:30' at time zone 'Europe/Warsaw', 'Spacer',    'intervals', 'test-akcja', 't2'),
    (r_ath, 60,   timestamp '2020-01-02 08:00' at time zone 'Europe/Warsaw', 'Spokojny',  'intervals', 'test-akcja', 't3'),
    (r_ath, 60,   timestamp '2020-01-02 18:00' at time zone 'Europe/Warsaw', 'Spacer',    'intervals', 'test-akcja', 't4'),
    (r_ath, 50,   timestamp '2020-01-03 08:00' at time zone 'Europe/Warsaw', '__badge__x','intervals', 'test-akcja', 't5'),
    (r_ath, 30,   now() + interval '2 days',                                 'Spokojny',  'intervals', 'test-akcja', 't6'),
    (F_ATH, 40,   timestamp '2020-01-02 09:00' at time zone 'Europe/Warsaw', 'Spokojny',  'intervals', 'test-akcja', 't7'),
    (r_ath, 4.99, timestamp '2020-01-06 08:00' at time zone 'Europe/Warsaw', 'Regeneracja', 'intervals', 'test-akcja', 't8'),
    (r_ath, 50,   timestamp '2020-01-04 08:00' at time zone 'Europe/Warsaw', 'Rower',     'intervals', 'test-akcja', 't8r'),
    (r_ath, 7,    timestamp '2020-01-05 08:00' at time zone 'Europe/Warsaw', 'Zastępczy', 'intervals', 'test-akcja', 't8z');
  j := public.akcja_licznik('test-suma');
  if (j->>'suma_km')::numeric <> 124.99 then raise exception 'FAIL 5b: suma % (oczekiwane 124.99: 20 + cap 100 + 4.99)', j->>'suma_km'; end if;
  if (j->>'pct')::numeric <> 99.99 or (j->>'zamknieta')::boolean then raise exception 'FAIL 5c: 124.99 → %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id)
  values (r_ath, 0.01, timestamp '2020-01-07 08:00' at time zone 'Europe/Warsaw', 'Spokojny', 'intervals', 'test-akcja', 't9');
  j := public.akcja_licznik('test-suma');
  if (j->>'pct')::numeric <> 100 or not (j->>'zamknieta')::boolean or (j->>'filip_gr')::bigint <> 1250 then raise exception 'FAIL 5d: 125 → %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id)
  values (r_ath, 2.31, timestamp '2020-01-08 08:00' at time zone 'Europe/Warsaw', 'Wybieganie', 'intervals', 'test-akcja', 't10');
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

  -- ── 10. TYLKO bieg i chód (Filip 2.11 18:35): rower 50 km = 0, spacer 5 km = 5, nieznany typ = 0; wyprawa i dni odznaki też ──
  declare t_typy uuid; v_d date := (now() at time zone 'Europe/Warsaw')::date - 2; km numeric; km0 numeric; w0 numeric; d0 date[];
  begin
    insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, konta_testowe, wystartowala_at, wyprawa_athlete_ids)
    values ('test-typy', 'Test typów', v_d, 12500, 10, true, array[r_ath], now() - interval '3 days', array[r_ath]) returning id into t_typy;
    -- baza: wcześniejsze części testu zostawiają r_ath wpisy z ostatnich dni — liczymy PRZYROST od moich wpisów
    km0 := public.akcja_km_okna(t_typy, v_d, v_d + 10, array[r_ath]); w0 := (public.akcja_licznik('test-typy')->>'wyprawa_km')::numeric;
    perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated'; d0 := public.akcja_moje_dni('test-typy'); reset role;
    insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values
      (r_ath, 50, (v_d::timestamp + time '08:00') at time zone 'Europe/Warsaw', 'Rower',      'Ride',        'intervals', 'test-akcja', 'ty1'),
      (r_ath, 30, (v_d::timestamp + time '09:00') at time zone 'Europe/Warsaw', 'Rower',      'EBikeRide',   'intervals', 'test-akcja', 'ty2'),
      (r_ath, 20, (v_d::timestamp + time '10:00') at time zone 'Europe/Warsaw', 'Rower',      'VirtualRide', 'intervals', 'test-akcja', 'ty3'),
      (r_ath, 2,  (v_d::timestamp + time '11:00') at time zone 'Europe/Warsaw', 'Pływanie',   'Swim',        'intervals', 'test-akcja', 'ty4'),
      (r_ath, 9,  (v_d::timestamp + time '12:00') at time zone 'Europe/Warsaw', 'Kajak',      null,          'intervals', 'test-akcja', 'ty5'),
      (r_ath, 11, (v_d::timestamp + time '13:00') at time zone 'Europe/Warsaw', 'Spokojny',   'Ride',        'intervals', 'test-akcja', 'ty6'),
      (r_ath, 6,  (v_d::timestamp + time '14:00') at time zone 'Europe/Warsaw', 'Zastępczy',  null,          'intervals', 'test-akcja', 'ty7');
    km := public.akcja_km_okna(t_typy, v_d, v_d + 10, array[r_ath]);
    if km - km0 <> 0 then raise exception 'FAIL 10a: rower/pływanie/nieznany/Zastępczy/rower jako „Spokojny" dały % km (oczekiwane 0)', km - km0; end if;
    insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values
      (r_ath, 5, ((v_d + 1)::timestamp + time '08:00') at time zone 'Europe/Warsaw', 'Spacer', null, 'manual', 'test-akcja', 'ty8');
    km := public.akcja_km_okna(t_typy, v_d, v_d + 10, array[r_ath]);
    if km - km0 <> 5 then raise exception 'FAIL 10b: spacer 5 km = % (oczekiwane 5)', km - km0; end if;
    insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values
      (r_ath, 4,   ((v_d + 1)::timestamp + time '09:00') at time zone 'Europe/Warsaw', 'Spacer',         'Hike',      'intervals', 'test-akcja', 'ty9'),
      (r_ath, 3,   ((v_d + 1)::timestamp + time '10:00') at time zone 'Europe/Warsaw', 'Spokojny',       'Treadmill', 'intervals', 'test-akcja', 'ty10'),
      (r_ath, 2,   ((v_d + 1)::timestamp + time '11:00') at time zone 'Europe/Warsaw', 'Nordic walking', null,        'manual',    'test-akcja', 'ty11'),
      (r_ath, 1.5, ((v_d + 1)::timestamp + time '12:00') at time zone 'Europe/Warsaw', 'Wybieganie',     'TrailRun',  'intervals', 'test-akcja', 'ty12');
    km := public.akcja_km_okna(t_typy, v_d, v_d + 10, array[r_ath]);
    if km - km0 <> 15.5 then raise exception 'FAIL 10c: bieg i chód = % (oczekiwane 15.5)', km - km0; end if;
    j := public.akcja_licznik('test-typy');
    if (j->>'suma_km')::numeric <> round(km, 2) then raise exception 'FAIL 10d: licznik % (oczekiwane = akcja_km_okna %)', j->>'suma_km', km; end if;
    if (j->>'wyprawa_km')::numeric - w0 <> 15.5 then raise exception 'FAIL 10e: wyprawa % (oczekiwane 15.5 — rower jej nie wiezie)', j->>'wyprawa_km'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if not ((v_d + 1) = any (public.akcja_moje_dni('test-typy'))) or ((v_d = any (public.akcja_moje_dni('test-typy'))) and not (v_d = any (d0))) then
      raise exception 'FAIL 10f: dni odznaki % (oczekiwany tylko dzień spaceru — dzień roweru się nie liczy)', public.akcja_moje_dni('test-typy'); end if;
    if (public.akcja_moj_wklad('test-typy')->>'km')::numeric <> round(km, 2) then raise exception 'FAIL 10g: wkład %', public.akcja_moj_wklad('test-typy'); end if;
    reset role;
    begin execute 'set local role anon'; perform public.akcja_moje_dni('test-typy'); raise exception 'FAIL 10h: anon czyta dni'; exception when insufficient_privilege then null; end;
    reset role;
  end;
  n := n + 8;

  -- ── 11. plakat (tylko po starcie) + podmiana linku zbiórki przez startującego (Filip 2.11 19:00) ──
  update public.akcje set plakat_url = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/akcja/x.jpg', wystartowala_at = null where slug = 'proba';
  if public.akcja_licznik('proba') ? 'plakat_url' then raise exception 'FAIL 11a: plakat przed startem'; end if;
  update public.akcje set wystartowala_at = now(), wizerunek_zgoda = false where slug = 'proba';
  if public.akcja_licznik('proba')->>'plakat_url' is not null then raise exception 'FAIL 11b: plakat bez zgody mamy'; end if;
  update public.akcje set wizerunek_zgoda = true where slug = 'proba';
  if public.akcja_licznik('proba')->>'plakat_url' not like 'https://%' then raise exception 'FAIL 11b2: brak plakatu po starcie ze zgodą'; end if;
  begin execute 'set local role anon'; perform public.akcja_url_zbiorki('proba', 'https://www.siepomaga.pl/x'); raise exception 'FAIL 11c: anon'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  begin execute 'set local role authenticated'; perform public.akcja_url_zbiorki('proba', 'https://www.siepomaga.pl/x'); raise exception 'FAIL 11d: nie-startujący'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', F_UID, 'role', 'authenticated')::text, true);
  begin execute 'set local role authenticated'; perform public.akcja_url_zbiorki('proba', 'https://zrzutka.pl/abc'); raise exception 'FAIL 11e: obcy host'; exception when sqlstate '22023' then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_url_zbiorki('proba', 'http://www.siepomaga.pl/abc'); raise exception 'FAIL 11f: http'; exception when sqlstate '22023' then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_url_zbiorki('proba', 'https://www.siepomaga.pl/abc?x=<script>'); raise exception 'FAIL 11g: znaki'; exception when sqlstate '22023' then null; end;
  reset role;
  execute 'set local role authenticated';
  j := public.akcja_url_zbiorki('proba', ' https://www.siepomaga.pl/fabianek-2026 ');
  reset role;
  if j->>'url_zbiorki' <> 'https://www.siepomaga.pl/fabianek-2026' or (select url_zbiorki from public.akcje where slug = 'proba') <> 'https://www.siepomaga.pl/fabianek-2026' then
    raise exception 'FAIL 11h: link nie zapisany: %', j->>'url_zbiorki'; end if;
  n := n + 9;

  raise exception 'TESTY AKCJI ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
