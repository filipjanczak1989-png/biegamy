-- Testy dnia 5 (20261102_akcja_dzien5.sql): wyprawa, zamknięcie doby, wyzwalacz pushu startu, reset próby.
-- Uruchamia tools/akcja-dzien5-test.sh — jedna transakcja, zawsze wycofana; żądania pg_net też się wycofują.
do $T$
declare
  F_UID constant uuid := 'bd9cbbac-c98d-4ac7-8610-9daf754b2de5';
  r_ath uuid; r_uid uuid; j jsonb; n int := 0; c0 int; c1 int; v_dzis date := (now() at time zone 'Europe/Warsaw')::date; a1 uuid; a2 uuid;
begin
  select id, user_id into r_ath, r_uid from public.athletes
   where user_id is not null and coach_id is not null and id not in ('9c2df65c-6a46-410e-ad5f-474e5d973ec9', '56092926-2cf1-44b6-952f-38614497fdc2')
     and not exists (select 1 from public.training_logs l where l.athlete_id = athletes.id) order by created_at limit 1;

  -- 1. dotarcie: anon/zwykły 42501, startujący przed startem 22023, po starcie raz
  begin execute 'set local role anon'; perform public.akcja_dotarlismy('dla-fabianka'); raise exception 'FAIL 1a'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  begin execute 'set local role authenticated'; perform public.akcja_dotarlismy('dla-fabianka'); raise exception 'FAIL 1b'; exception when insufficient_privilege then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_zamknij_dobe(); raise exception 'FAIL 1c: zamykanie z przeglądarki'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', F_UID, 'role', 'authenticated')::text, true);
  begin execute 'set local role authenticated'; perform public.akcja_dotarlismy('dla-fabianka'); raise exception 'FAIL 1d: przed startem'; exception when sqlstate '22023' then null; end;
  n := n + 4;

  -- 2. wyzwalacz pushu startu: pierwszy start → 1 żądanie pg_net, drugie ustawienie → nic
  select count(*) into c0 from net.http_request_queue;
  update public.akcje set wystartowala_at = now(), start = v_dzis where slug = 'dla-fabianka';
  select count(*) into c1 from net.http_request_queue;
  if c1 - c0 <> 1 then raise exception 'FAIL 2a: żądań po starcie % (oczekiwane 1)', c1 - c0; end if;
  update public.akcje set wystartowala_at = now() - interval '1 minute' where slug = 'dla-fabianka';
  select count(*) into c0 from net.http_request_queue;
  if c0 <> c1 then raise exception 'FAIL 2b: ponowne ustawienie wysłało push'; end if;
  n := n + 2;

  -- 3. dotarcie po starcie: raz
  execute 'set local role authenticated';
  j := public.akcja_dotarlismy('dla-fabianka');
  reset role;
  if j->'wyprawa_dotarla_at' = 'null'::jsonb then raise exception 'FAIL 3a: %', j; end if;
  update public.akcje set wyprawa_dotarla_at = now() - interval '1 hour' where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  perform public.akcja_dotarlismy('dla-fabianka');
  reset role;
  if (select wyprawa_dotarla_at from public.akcje where slug = 'dla-fabianka') > now() - interval '59 minutes' then raise exception 'FAIL 3b: drugie dotarcie nadpisało'; end if;
  n := n + 2;

  -- 4. zamknięcie doby: suma do wczoraj >= cel → koniec = wczoraj; poniżej celu — nic; drugi przebieg — nic
  insert into public.akcje (slug, start, cel_km, stawka_gr_filip, testowa, konta_testowe, wystartowala_at)
  values ('test-zam-a', v_dzis - 3, 5, 10, true, array[r_ath], now()) returning id into a1;
  insert into public.akcje (slug, start, cel_km, stawka_gr_filip, testowa, konta_testowe, wystartowala_at)
  values ('test-zam-b', v_dzis - 3, 100, 10, true, array[r_ath], now()) returning id into a2;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id)
  values (r_ath, 5, ((v_dzis - 1)::timestamp + time '10:00') at time zone 'Europe/Warsaw', 'Spokojny', 'intervals', 'test-akcja', 'z1');
  perform public.akcja_zamknij_dobe();
  if (select koniec from public.akcje where id = a1) is distinct from v_dzis - 1 then raise exception 'FAIL 4a: nie zamknięta'; end if;
  if (select koniec from public.akcje where id = a2) is not null then raise exception 'FAIL 4b: zamknięta poniżej celu'; end if;
  if exists (select 1 from public.akcja_zamknij_dobe() z where z.slug = 'test-zam-a') then raise exception 'FAIL 4c: zamknięta drugi raz'; end if;
  n := n + 3;

  -- 5. reset próby czyści flagi pushy i koniec
  update public.akcje set wystartowala_at = now(), start = v_dzis, push_start_at = now(), push_zamkniecie_at = now(), koniec = v_dzis where slug = 'proba';
  execute 'set local role authenticated';
  j := public.akcja_proba_reset();
  reset role;
  if exists (select 1 from public.akcje where slug = 'proba' and (push_start_at is not null or push_zamkniecie_at is not null or koniec is not null or wystartowala_at is not null)) then
    raise exception 'FAIL 5: reset nie wyczyścił'; end if;
  n := n + 1;

  raise exception 'TESTY DNIA 5 ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
