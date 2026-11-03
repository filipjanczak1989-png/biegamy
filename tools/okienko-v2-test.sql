-- Testy E0 (20261105_okienko_v2_przelacznik.sql): RPC okienko_wersja() PO SKUTKU dla trzech kont (Filip z listy, obcy, anon),
-- brak odczytu tabel przełącznika z przeglądarki, log v2 tylko własny i tylko do odczytu, oba przełączniki, powrót.
do $T$
declare n int := 0; f_ath uuid := '56092926-2cf1-44b6-952f-38614497fdc2'; f_uid uuid; o_uid uuid; o_ath uuid; w text; c int;
begin
  select user_id into f_uid from public.athletes where id = f_ath;
  select a.id, a.user_id into o_ath, o_uid from public.athletes a
   where a.user_id is not null and a.id not in (select athlete_id from public.okienko_v2_konta) order by a.created_at desc limit 1;
  if f_uid is null or o_uid is null then raise exception 'FAIL 0: brak kont do testu'; end if;

  -- 1. konto z listy → v2; tabel przełącznika i rozmowy nie czyta; logu nie pisze
  perform set_config('request.jwt.claims', json_build_object('sub', f_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.okienko_wersja() into w; if w <> 'v2' then raise exception 'FAIL 1a: konto z listy dostało %', w; end if;
  begin perform 1 from public.okienko_ustawienia; raise exception 'FAIL 1b: authenticated czyta okienko_ustawienia'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.okienko_v2_konta; raise exception 'FAIL 1c: authenticated czyta okienko_v2_konta'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.okienko_v2_rozmowa; raise exception 'FAIL 1d: authenticated czyta okienko_v2_rozmowa'; exception when insufficient_privilege then null; end;
  begin insert into public.okienko_v2_log (athlete_id, tekst, tryb) values (f_ath, 'x', 'router'); raise exception 'FAIL 1e: authenticated pisze okienko_v2_log'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 5;

  -- 2. obcy → v1; nie widzi logu cudzego, widzi własny
  insert into public.okienko_v2_log (athlete_id, tekst, tryb, ms) values (f_ath, 'test rls', 'router', 12);
  insert into public.okienko_v2_log (athlete_id, tekst, tryb, ms, intencja, pewnosc) values (o_ath, 'test rls obcy', 'v2', 950, 'moj_plan', 0.83);
  perform set_config('request.jwt.claims', json_build_object('sub', o_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.okienko_wersja() into w; if w <> 'v1' then raise exception 'FAIL 2a: obcy dostał %', w; end if;
  select count(*) into c from public.okienko_v2_log where athlete_id = f_ath; if c <> 0 then raise exception 'FAIL 2b: obcy widzi cudzy log v2'; end if;
  select count(*) into c from public.okienko_v2_log where athlete_id = o_ath; if c <> 1 then raise exception 'FAIL 2c: właściciel nie widzi swojego logu v2'; end if;
  begin update public.okienko_v2_log set ocena = 1 where athlete_id = o_ath; raise exception 'FAIL 2d: właściciel zmienia log wprost (ocena idzie przez RPC w E7)'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 4;

  -- 3. przełączniki: dla wszystkich → obcy v2; wyłączone → nawet lista dostaje v1 (POWRÓT JEDNYM PRZEŁĄCZNIKIEM)
  update public.okienko_ustawienia set wartosc = 'true' where klucz = 'v2_dla_wszystkich';
  perform set_config('request.jwt.claims', json_build_object('sub', o_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.okienko_wersja() into w; if w <> 'v2' then raise exception 'FAIL 3a: v2_dla_wszystkich nie działa (%)', w; end if;
  reset role;
  update public.okienko_ustawienia set wartosc = 'false' where klucz = 'v2_wlaczone';
  perform set_config('request.jwt.claims', json_build_object('sub', f_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.okienko_wersja() into w; if w <> 'v1' then raise exception 'FAIL 3b: v2_wlaczone=false, a konto z listy dostało %', w; end if;
  reset role;
  n := n + 2;

  -- 4. anon nie woła RPC i nic nie czyta
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform public.okienko_wersja(); raise exception 'FAIL 4a: anon woła okienko_wersja'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.okienko_v2_log; raise exception 'FAIL 4b: anon czyta okienko_v2_log'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 2;

  -- 5. CHECK-i logu: tryb spoza listy, pewność > 1, ocena 2 — odrzucone
  begin insert into public.okienko_v2_log (athlete_id, tekst, tryb) values (f_ath, 'x', 'cokolwiek'); raise exception 'FAIL 5a: tryb spoza listy'; exception when check_violation then null; end;
  begin insert into public.okienko_v2_log (athlete_id, tekst, tryb, pewnosc) values (f_ath, 'x', 'v2', 1.5); raise exception 'FAIL 5b: pewność > 1'; exception when check_violation then null; end;
  begin insert into public.okienko_v2_log (athlete_id, tekst, tryb, ocena) values (f_ath, 'x', 'v2', 2); raise exception 'FAIL 5c: ocena 2'; exception when check_violation then null; end;
  n := n + 3;

  create temp table _ov2_wynik as select 'TESTY V2 ZIELONE: ' || n || ' asercji' as wynik;   -- CLI pokazuje wiersze ostatniego SELECT, nie NOTICE
end $T$;
select wynik from _ov2_wynik;
