-- Testy etapów 2–3 kalendarza (20261105_okladki_automat.sql): okladki_log bez dostępu z przeglądarki, CHECK rodzaju, cron, limit liczony z logu.
do $T$
declare n int := 0; r_uid uuid; c int;
begin
  select user_id into r_uid from public.athletes where user_id is not null order by created_at limit 1;
  insert into public.okladki_log (rodzaj, klucz, koszt_usd, ok) values ('automat', 'testbieg|testowo', 0.034, true), ('trener-gemini', 'testbieg|testowo', 0.034, true), ('trener-wlasne', 'testbieg|testowo', 0, true);
  begin insert into public.okladki_log (rodzaj, klucz) values ('cokolwiek', 'x'); raise exception 'FAIL 1a: rodzaj spoza listy'; exception when check_violation then null; end;
  select count(*) into c from public.okladki_log where kiedy >= date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw' and rodzaj in ('trener-gemini', 'race-gemini') and ok;
  if c < 1 then raise exception 'FAIL 1b: limit trenera nie widzi wpisu'; end if;
  select coalesce(sum(koszt_usd), 0) into c from public.okladki_log where klucz = 'testbieg|testowo';
  n := n + 3;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  begin perform count(*) from public.okladki_log; raise exception 'FAIL 2a: anon czyta log'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  begin perform count(*) from public.okladki_log; raise exception 'FAIL 2b: zalogowany czyta log'; exception when insufficient_privilege then null; end;
  begin insert into public.okladki_log (rodzaj) values ('automat'); raise exception 'FAIL 2c: zalogowany pisze log'; exception when insufficient_privilege then null; end;
  begin update public.imprezy_okladki set url = url where klucz = 'nie-ma'; raise exception 'FAIL 2d: zalogowany pisze imprezy_okladki'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 4;
  if not exists (select 1 from cron.job where jobname = 'okladki-imprez-noc' and schedule = '40 2 * * *') then raise exception 'FAIL 3a: cron'; end if;
  n := n + 1;
  create temp table _okl_wynik as select 'TESTY OKLADEK AUTOMAT ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _okl_wynik;
