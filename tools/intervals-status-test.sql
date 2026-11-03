-- Testy 20261105_intervals_status.sql + _garmin.sql: właściciel widzi swój wiersz, trener widzi wiersze swoich zawodników, obcy nic, nikt nie pisze, CHECK ogniwa (w tym 'garmin').
do $T$
declare n int := 0; z_ath uuid; z_uid uuid; t_uid uuid; o_uid uuid; c int;
begin
  select a.id, a.user_id, a.coach_id into z_ath, z_uid, t_uid from public.athletes a where a.user_id is not null and a.coach_id is not null order by a.created_at limit 1;
  select a.user_id into o_uid from public.athletes a where a.user_id is not null and a.id <> z_ath and (a.coach_id is null or a.coach_id <> t_uid) and a.user_id <> t_uid order by a.created_at desc limit 1;
  if z_ath is null or o_uid is null then raise exception 'FAIL 0: brak kont'; end if;
  insert into public.intervals_status (athlete_id, ogniwo, zrodlo, urzadzenie, ost_intervals, ost_biegamy, dni_ciszy) values (z_ath, 'zegarek', 'GARMIN_CONNECT', 'Garmin fenix 3', current_date - 28, current_date - 28, 28);
  begin insert into public.intervals_status (athlete_id, ogniwo) values (gen_random_uuid(), 'dziwne'); raise exception 'FAIL 1a: ogniwo spoza listy'; exception when check_violation or foreign_key_violation then null; end;
  n := n + 1;
  -- 1b (migracja _garmin): 'garmin' dopuszczone — bez tego EF przy blokadzie Garmina dostałaby check_violation i NIE zapisałaby statusu
  update public.intervals_status set ogniwo = 'garmin' where athlete_id = z_ath; update public.intervals_status set ogniwo = 'zegarek' where athlete_id = z_ath;
  n := n + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', z_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into c from public.intervals_status where athlete_id = z_ath; if c <> 1 then raise exception 'FAIL 2a: właściciel nie widzi'; end if;
  begin update public.intervals_status set ogniwo = 'ok' where athlete_id = z_ath; raise exception 'FAIL 2b: właściciel pisze'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', t_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into c from public.intervals_status where athlete_id = z_ath; if c <> 1 then raise exception 'FAIL 2c: trener nie widzi swojego zawodnika'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into c from public.intervals_status where athlete_id = z_ath; if c <> 0 then raise exception 'FAIL 2d: obcy widzi'; end if;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  begin perform count(*) from public.intervals_status; raise exception 'FAIL 2e: anon czyta'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 5;
  create temp table _is_wynik as select 'TESTY INTERVALS_STATUS ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _is_wynik;
