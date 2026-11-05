-- Testy BONUSU ZA TRENING (20261107_gra_bonus_trening.sql) PO SKUTKU, z set local role i request.jwt.claims. Jedna transakcja, zawsze wycofana; wynikiem jest treść wyjątku na końcu.
-- Prawdziwe typy i akcja_typ_liczy. Konto bez importów z ostatnich dni, żeby prawdziwe treningi nie mieszały w liczbach.
do $T$
declare
  n int := 0; j jsonb; u1 uuid; a1 uuid; u2 uuid; a2 uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date; v_ile bigint; v_km numeric; v_runda jsonb; i int;
begin
  select a.user_id, a.id into u1, a1 from public.athletes a where a.user_id is not null and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '12 days') order by a.created_at limit 1;
  select a.user_id, a.id into u2, a2 from public.athletes a where a.user_id is not null and a.id <> a1 and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '12 days') order by a.created_at limit 1;
  if u1 is null or u2 is null then raise exception 'FAIL 0: za mało kont do testu'; end if;
  delete from public.gra_konto where athlete_id in (a1, a2);
  delete from public.gra_trening_dni where athlete_id in (a1, a2);
  update public.akcje set gra_aktywna = true where slug = 'dla-fabianka';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

  -- 1. bez treningu nic; ręczny wpis bez bonusu; rower z zegarka bez bonusu
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if not (j->>'ok')::boolean or (j->>'dni')::int <> 0 then raise exception 'FAIL 1a: bez treningu %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source, external_source, external_id) values (a1, 10, (v_dzis::timestamp + time '09:00') at time zone 'Europe/Warsaw', 'Spokojny', 'manual', 'app', 'tb-app');
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, source) values (a1, 10, (v_dzis::timestamp + time '09:30') at time zone 'Europe/Warsaw', 'Spokojny', 'manual');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 then raise exception 'FAIL 1b: ręczny wpis dał bonus %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, 50, (v_dzis::timestamp + time '10:00') at time zone 'Europe/Warsaw', 'Rower', 'Ride', 'intervals', 'intervals', 'tb-rower');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 then raise exception 'FAIL 1c: rower dał bonus %', j; end if;
  if (j->>'saldo')::int <> 0 or j->'plecak' <> '{}'::jsonb then raise exception 'FAIL 1d: nagroda bez bonusu %', j; end if;
  n := n + 4;

  -- 2. dwa treningi jednego dnia = jeden bonus; drugie dotknięcie nic; bez warunku na km; km nic nie zmieniają
  v_ile := (select count(*) from public.training_logs where athlete_id = a1); v_km := (select coalesce(sum(distance_km), 0) from public.training_logs where athlete_id = a1);
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values
    (a1, 5, (v_dzis::timestamp + time '07:00') at time zone 'Europe/Warsaw', 'Spokojny', 'Run', 'intervals', 'intervals', 'tb-1'),
    (a1, 42, (v_dzis::timestamp + time '18:00') at time zone 'Europe/Warsaw', 'Wybieganie', 'Run', 'intervals', 'intervals', 'tb-2');
  v_ile := v_ile + 2; v_km := v_km + 47;
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 1 or (j->>'saldo')::int <> 1 or (j #>> '{plecak,kask}')::int <> 1 or (j->>'seria')::int <> 1 then raise exception 'FAIL 2a: dwa treningi %', j; end if;
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 or (j->>'saldo')::int <> 1 or (j #>> '{plecak,kask}')::int <> 1 then raise exception 'FAIL 2b: drugi odbiór %', j; end if;
  if (select count(*) from public.training_logs where athlete_id = a1) <> v_ile or (select sum(distance_km) from public.training_logs where athlete_id = a1) <> v_km then raise exception 'FAIL 2c: bonus ruszył treningi'; end if;
  n := n + 3;

  -- 3. usunięty i dodany ponownie: bonus zostaje, drugi raz nie przychodzi; zmiana też
  delete from public.training_logs where athlete_id = a1 and external_id in ('tb-1', 'tb-2');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 or (j->>'saldo')::int <> 1 or (j #>> '{plecak,kask}')::int <> 1 then raise exception 'FAIL 3a: po usunięciu %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, 8, (v_dzis::timestamp + time '20:00') at time zone 'Europe/Warsaw', 'Spokojny', 'Run', 'intervals', 'intervals', 'tb-3');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 or (j->>'saldo')::int <> 1 then raise exception 'FAIL 3b: dodany ponownie dał drugi bonus %', j; end if;
  update public.training_logs set distance_km = 80 where athlete_id = a1 and external_id = 'tb-3';
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 then raise exception 'FAIL 3c: zmiana dała bonus %', j; end if;
  n := n + 3;

  -- 4. spacer się liczy; wydmuszka bez dystansu się liczy; późna synchronizacja domyka serię; bidon przy 3; poza oknem nic
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, 3, ((v_dzis - 1)::timestamp + time '12:00') at time zone 'Europe/Warsaw', 'Spacer', 'Walk', 'intervals', 'intervals', 'tb-4');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 1 or (j->>'saldo')::int <> 2 or (j->>'seria')::int <> 2 then raise exception 'FAIL 4a: spacer wczoraj, seria domknięta %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, null, ((v_dzis - 2)::timestamp + time '12:00') at time zone 'Europe/Warsaw', 'Spokojny', 'Run', 'intervals', 'intervals', 'tb-5');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 1 or (j->>'bidon')::int <> 1 or (j #>> '{plecak,bidon}')::int <> 1 or (j->>'seria')::int <> 3 then raise exception 'FAIL 4b: seria 3 dni daje bidon %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, 9, ((v_dzis - 3)::timestamp + time '12:00') at time zone 'Europe/Warsaw', 'Spokojny', 'Run', 'intervals', 'intervals', 'tb-6');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 then raise exception 'FAIL 4c: poza oknem %', j; end if;
  n := n + 3;

  -- 5. czas polski: 00:30 dziś w Warszawie to dziś, choć w UTC to wczoraj
  delete from public.gra_trening_dni where athlete_id = a1; delete from public.training_logs where athlete_id = a1 and external_id like 'tb-%';
  update public.gra_konto set saldo = 0, plecak = '{}' where athlete_id = a1;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, 4, (v_dzis::timestamp + time '00:30') at time zone 'Europe/Warsaw', 'Spokojny', 'Run', 'intervals', 'intervals', 'tb-7');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if not exists (select 1 from public.gra_trening_dni t where t.athlete_id = a1 and t.dzien = v_dzis) then raise exception 'FAIL 5a: dzień nie po polsku'; end if;
  n := n + 1;

  -- 6. seria przerwana: dziura w dniach zaczyna od 1, bidon nie przychodzi
  delete from public.gra_trening_dni where athlete_id = a1; delete from public.training_logs where athlete_id = a1 and external_id like 'tb-%';
  update public.gra_konto set saldo = 0, plecak = '{}' where athlete_id = a1;
  insert into public.gra_trening_dni (athlete_id, dzien, seria) values (a1, v_dzis - 5, 1), (a1, v_dzis - 4, 2);
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, 4, (v_dzis::timestamp + time '09:00') at time zone 'Europe/Warsaw', 'Spokojny', 'Run', 'intervals', 'intervals', 'tb-8');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'seria')::int <> 1 or (j->>'bidon')::int <> 0 then raise exception 'FAIL 6a: przerwana seria %', j; end if;
  n := n + 1;

  -- 7. seria 7 dni: Kamizelka raz; nie do kupienia, także po złotych cegłach
  delete from public.gra_trening_dni where athlete_id = a1; delete from public.training_logs where athlete_id = a1 and external_id like 'tb-%';
  update public.gra_konto set saldo = 500, plecak = '{}', kupione = '[]' where athlete_id = a1;
  execute 'set local role authenticated'; j := public.gra_kup('kamizelka-wytrwalych'); execute 'reset role';
  if (j->>'ok')::boolean then raise exception 'FAIL 7a: kamizelka do kupienia %', j; end if;
  for i in 2..6 loop insert into public.gra_trening_dni (athlete_id, dzien, seria) values (a1, v_dzis - 7 + i, i - 1); end loop;
  insert into public.training_logs (athlete_id, distance_km, logged_at, training_type, external_type, source, external_source, external_id) values (a1, 4, (v_dzis::timestamp + time '09:00') at time zone 'Europe/Warsaw', 'Spokojny', 'Run', 'intervals', 'intervals', 'tb-9');
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'seria')::int <> 6 or (j->>'kamizelka')::boolean or (j->'kupione') ? 'kamizelka-wytrwalych' then raise exception 'FAIL 7a2: kamizelka przed siódmym dniem %', j; end if;
  delete from public.gra_trening_dni where athlete_id = a1;
  for i in 1..6 loop insert into public.gra_trening_dni (athlete_id, dzien, seria) values (a1, v_dzis - 7 + i, i); end loop;
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'seria')::int <> 7 or not (j->>'kamizelka')::boolean or not (j->'kupione') ? 'kamizelka-wytrwalych' then raise exception 'FAIL 7b: seria 7 %', j; end if;
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'kamizelka')::boolean or jsonb_array_length(j->'kupione') <> 1 then raise exception 'FAIL 7c: kamizelka drugi raz %', j; end if;
  delete from public.gra_trening_dni where athlete_id = a1 and dzien = v_dzis;
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 1 or (j->>'seria')::int <> 7 or (j->>'kamizelka')::boolean or jsonb_array_length(j->'kupione') <> 1 then raise exception 'FAIL 7d: kolejny dzień serii, kamizelka już jest %', j; end if;
  n := n + 5;

  -- 8. cudzy trening nie liczy się; konto bez profilu odmawia
  delete from public.gra_trening_dni where athlete_id = a2;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if (j->>'dni')::int <> 0 then raise exception 'FAIL 8a: cudzy trening %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; j := public.bonus_treningu_odbierz(); execute 'reset role';
  if j->>'powod' is distinct from 'brak_profilu' then raise exception 'FAIL 8b: bez profilu %', j; end if;
  n := n + 2;

  -- 9. plecak na starcie rundy: najpierw plecak bez złotych cegieł, pusty znów za cegły
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  update public.gra_konto set saldo = 7, plecak = '{"kask":1,"bidon":0}' where athlete_id = a1;
  delete from public.gra_rundy where athlete_id = a1;
  execute 'set local role authenticated'; v_runda := public.gra_start_rundy('kask'); execute 'reset role';
  if v_runda->>'ulepszenie' is distinct from 'kask' or (v_runda->>'saldo')::int <> 7 or (v_runda #>> '{plecak,kask}')::int <> 0 then raise exception 'FAIL 9a: kask z plecaka %', v_runda; end if;
  execute 'set local role authenticated'; v_runda := public.gra_start_rundy('kask'); execute 'reset role';
  if v_runda->>'ulepszenie' is distinct from 'kask' or (v_runda->>'saldo')::int <> 2 then raise exception 'FAIL 9b: pusty plecak za cegły %', v_runda; end if;
  n := n + 2;

  -- 10. prywatność i zamki: ranking bez treningów, klient bez dostępu do dni i plecaka, anon bez funkcji
  j := public.gra_ranking();
  if j::text ~* 'trening|seria_dni|plecak|gra_trening' then raise exception 'FAIL 10a: ranking mówi o treningach'; end if;
  execute 'set local role authenticated';
  begin perform 1 from public.gra_trening_dni; raise exception 'FAIL 10b: klient czyta dni'; exception when insufficient_privilege then null; end;
  begin insert into public.gra_trening_dni (athlete_id, dzien, seria) values (a1, v_dzis, 7); raise exception 'FAIL 10c: klient wpisuje dzień'; exception when insufficient_privilege then null; end;
  begin update public.gra_konto set plecak = '{"kask":99}'; raise exception 'FAIL 10d: klient zmienia plecak'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.bonus_treningu_odbierz(); raise exception 'FAIL 10e: anon woła bonus'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  if pg_get_functiondef('public.bonus_treningu_odbierz()'::regprocedure) ~* '(insert into|update|delete from) +public\.(training_logs|akcje|achievements|athlete_stats)' then raise exception 'FAIL 10f: funkcja pisze poza grę'; end if;
  if pg_get_functiondef('public.gra_start_rundy(text)'::regprocedure) ~* 'training_logs' then raise exception 'FAIL 10g: funkcja gra_ zna treningi'; end if;
  n := n + 6;

  raise exception 'TESTY BONUSU ZIELONE: % asercji', n;
end $T$;
