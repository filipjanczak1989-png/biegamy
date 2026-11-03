-- Testy 20261105_okienko_kciuki.sql: właściciel ocenia swój świeży wpis (👍 bez komentarza, 👎 z komentarzem przyciętym), cudzy wpis → false,
-- stary wpis (> 24 h) → false, zła ocena → błąd, anon nie wykonuje, authenticated nie ma UPDATE na logu, kolumna odpowiedz istnieje.
do $T$
declare n int := 0; z_ath uuid; z_uid uuid; o_uid uuid; id_sw bigint; id_st bigint; ok boolean; c int; k text;
begin
  select a.id, a.user_id into z_ath, z_uid from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  select a.user_id into o_uid from public.athletes a where a.user_id is not null and a.id <> z_ath order by a.created_at desc limit 1;
  if z_ath is null or o_uid is null then raise exception 'FAIL 0: brak kont'; end if;
  insert into public.okienko_v2_log (athlete_id, tekst, tryb, odpowiedz) values (z_ath, 'test kciuków', 'router', 'Odpowiedź testowa.') returning id into id_sw;
  insert into public.okienko_v2_log (athlete_id, tekst, tryb, kiedy) values (z_ath, 'stary wpis', 'router', now() - interval '2 days') returning id into id_st;
  -- właściciel
  perform set_config('request.jwt.claims', json_build_object('sub', z_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select public.okienko_ocena(id_sw, 1::smallint, 'niepotrzebny komentarz') into ok; if not ok then raise exception 'FAIL 1a: właściciel nie ocenia swojego'; end if;
  select ocena, komentarz into c, k from public.okienko_v2_log where id = id_sw; if c <> 1 or k is not null then raise exception 'FAIL 1b: 👍 ma ocena=1 i komentarz null (%, %)', c, k; end if;
  select public.okienko_ocena(id_sw, (-1)::smallint, repeat('x', 500)) into ok; if not ok then raise exception 'FAIL 1c: zmiana na 👎'; end if;
  select ocena, char_length(komentarz) into c, n from public.okienko_v2_log where id = id_sw; if c <> -1 or n <> 300 then raise exception 'FAIL 1d: 👎 z komentarzem przyciętym do 300 (%, %)', c, n; end if;
  n := 0;
  select public.okienko_ocena(id_st, 1::smallint, null) into ok; if ok then raise exception 'FAIL 1e: wpis starszy niż 24 h oceniony'; end if;
  begin perform public.okienko_ocena(id_sw, 5::smallint, null); raise exception 'FAIL 1f: ocena 5 przeszła'; exception when check_violation then null; end;
  begin update public.okienko_v2_log set ocena = 1 where id = id_sw; raise exception 'FAIL 1g: właściciel zmienia log wprost'; exception when insufficient_privilege then null; end;
  reset role; n := n + 5;
  -- obcy
  perform set_config('request.jwt.claims', json_build_object('sub', o_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  select public.okienko_ocena(id_sw, 1::smallint, null) into ok; if ok then raise exception 'FAIL 2a: obcy ocenił cudzy wpis'; end if;
  reset role; n := n + 1;
  -- anon
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  begin perform public.okienko_ocena(id_sw, 1::smallint, null); raise exception 'FAIL 3a: anon wykonuje okienko_ocena'; exception when insufficient_privilege then null; end;
  reset role; n := n + 1;
  create temp table _ok_wynik as select 'TESTY OKIENKO_KCIUKI ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _ok_wynik;
