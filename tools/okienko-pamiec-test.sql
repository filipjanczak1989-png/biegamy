-- Testy 20261105_okienko_pamiec.sql: właściciel czyta/dodaje (tylko profil, nie zdrowie)/zmienia/usuwa SWOJE fakty; trener NIC; obcy NIC;
-- anon NIC; zapis z okienka i zdrowie tylko service; limit 30; kolumny treści rozmowy istnieją i authenticated ich nie czyta.
do $T$
declare n int := 0; z_ath uuid; z_uid uuid; t_uid uuid; o_uid uuid; c int; i int;
begin
  select a.id, a.user_id, a.coach_id into z_ath, z_uid, t_uid from public.athletes a where a.user_id is not null and a.coach_id is not null order by a.created_at limit 1;
  select a.user_id into o_uid from public.athletes a where a.user_id is not null and a.id <> z_ath and (a.coach_id is null or a.coach_id <> t_uid) and a.user_id <> t_uid order by a.created_at desc limit 1;
  if z_ath is null or o_uid is null then raise exception 'FAIL 0: brak kont'; end if;
  -- service (postgres): zapis z okienka i zdrowie
  insert into public.okienko_pamiec (athlete_id, fakt, kategoria, zrodlo, potwierdzono) values (z_ath, 'biegam rano', 'rytm', 'okienko', now());
  insert into public.okienko_pamiec (athlete_id, fakt, kategoria, zrodlo, potwierdzono) values (z_ath, 'kolano po kontuzji', 'zdrowie', 'okienko-zdrowie', now());
  begin insert into public.okienko_pamiec (athlete_id, fakt, kategoria) values (z_ath, 'x', 'dziwna'); raise exception 'FAIL 1a: kategoria spoza listy'; exception when check_violation then null; end;
  n := n + 1;
  -- właściciel
  perform set_config('request.jwt.claims', json_build_object('sub', z_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into c from public.okienko_pamiec where athlete_id = z_ath; if c <> 2 then raise exception 'FAIL 2a: właściciel nie widzi swoich (%)', c; end if;
  insert into public.okienko_pamiec (athlete_id, fakt, kategoria) values (z_ath, 'mam Garmina', 'sprzet');   -- zrodlo domyślne = profil
  begin insert into public.okienko_pamiec (athlete_id, fakt, kategoria, zrodlo) values (z_ath, 'y', 'inne', 'okienko'); raise exception 'FAIL 2b: właściciel udaje okienko'; exception when insufficient_privilege or check_violation then null; end;
  begin insert into public.okienko_pamiec (athlete_id, fakt, kategoria) values (z_ath, 'astma', 'zdrowie'); raise exception 'FAIL 2c: zdrowie z przeglądarki'; exception when insufficient_privilege or check_violation then null; end;
  update public.okienko_pamiec set fakt = 'mam Garmina Forerunner' where athlete_id = z_ath and kategoria = 'sprzet';
  begin update public.okienko_pamiec set kategoria = 'zdrowie' where athlete_id = z_ath and kategoria = 'sprzet'; raise exception 'FAIL 2d: zmiana na zdrowie z przeglądarki'; exception when insufficient_privilege or check_violation then null; end;
  delete from public.okienko_pamiec where athlete_id = z_ath and kategoria = 'zdrowie';
  select count(*) into c from public.okienko_pamiec where athlete_id = z_ath; if c <> 2 then raise exception 'FAIL 2e: po usunięciu % zamiast 2', c; end if;
  begin perform 1 from public.okienko_v2_rozmowa; raise exception 'FAIL 2f: właściciel czyta treść rozmowy'; exception when insufficient_privilege then null; end;
  reset role; n := n + 6;
  -- trener
  perform set_config('request.jwt.claims', json_build_object('sub', t_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into c from public.okienko_pamiec where athlete_id = z_ath; if c <> 0 then raise exception 'FAIL 3a: trener widzi pamięć zawodnika'; end if;
  reset role; n := n + 1;
  -- obcy i anon
  perform set_config('request.jwt.claims', json_build_object('sub', o_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into c from public.okienko_pamiec where athlete_id = z_ath; if c <> 0 then raise exception 'FAIL 4a: obcy widzi'; end if;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  begin perform count(*) from public.okienko_pamiec; raise exception 'FAIL 4b: anon czyta'; exception when insufficient_privilege then null; end;
  reset role; n := n + 1;
  -- limit 30 (service)
  for i in 1..28 loop insert into public.okienko_pamiec (athlete_id, fakt, kategoria, zrodlo) values (z_ath, 'fakt ' || i, 'inne', 'okienko'); end loop;
  begin insert into public.okienko_pamiec (athlete_id, fakt, kategoria, zrodlo) values (z_ath, 'za dużo', 'inne', 'okienko'); raise exception 'FAIL 5a: 31. fakt przeszedł'; exception when check_violation then null; end;
  n := n + 1;
  create temp table _op_wynik as select 'TESTY OKIENKO_PAMIEC ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _op_wynik;
