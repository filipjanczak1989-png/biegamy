-- Testy WYPRAWY (20261104_akcja_wyprawa.sql): sekret celu w liczniku (przed dotarciem bez celu, po — z celem; próba to samo),
-- akcja_wyprawa_slad bez dostępu z przeglądarki, CHECK-i śladu. Jedna transakcja, zawsze wycofana (tools/akcja-wyprawa-test.sh).
do $T$
declare n int := 0; j jsonb; c int; v_akcja uuid; v_ath uuid;
begin
  -- 1. dla-fabianka: start → licznik bez celu, z wyprawa_trwa; dotarcie → cel (nazwa + km)
  update public.akcje set wystartowala_at = now() - interval '2 hours', start = (now() at time zone 'Europe/Warsaw')::date, wyprawa_cel_km = 240 where slug = 'dla-fabianka';
  j := public.akcja_licznik('dla-fabianka');
  if (j->>'wyprawa_trwa')::boolean is not true then raise exception 'FAIL 1a: wyprawa_trwa po starcie'; end if;
  if j->>'wyprawa_cel_nazwa' is not null or j->>'wyprawa_cel_km' is not null then raise exception 'FAIL 1b: cel widoczny przed dotarciem (%)', j->>'wyprawa_cel_nazwa'; end if;
  if j ? 'wyprawa_km' is not true then raise exception 'FAIL 1c: brak wyprawa_km'; end if;
  update public.akcje set wyprawa_dotarla_at = now() where slug = 'dla-fabianka';
  j := public.akcja_licznik('dla-fabianka');
  if (j->>'wyprawa_trwa')::boolean is not false then raise exception 'FAIL 1d: wyprawa_trwa po dotarciu'; end if;
  if j->>'wyprawa_cel_nazwa' <> 'Jasna Góra' or (j->>'wyprawa_cel_km')::numeric <> 240 then raise exception 'FAIL 1e: cel po dotarciu (%/%)', j->>'wyprawa_cel_nazwa', j->>'wyprawa_cel_km'; end if;
  n := n + 5;

  -- 2. próba: to samo
  update public.akcje set wystartowala_at = now() - interval '1 hour', start = (now() at time zone 'Europe/Warsaw')::date where slug = 'proba';
  j := public.akcja_licznik('proba');
  if j->>'wyprawa_cel_nazwa' is not null then raise exception 'FAIL 2a: próba zdradza cel przed dotarciem'; end if;
  update public.akcje set wyprawa_dotarla_at = now() where slug = 'proba';
  j := public.akcja_licznik('proba');
  if j->>'wyprawa_cel_nazwa' <> 'Jasna Góra' then raise exception 'FAIL 2b: próba bez celu po dotarciu'; end if;
  n := n + 2;

  -- 3. ślad: anon/authenticated nic; service pisze; CHECK-i
  select id, wyprawa_athlete_ids[1] into v_akcja, v_ath from public.akcje where slug = 'proba';
  insert into public.akcja_wyprawa_slad (akcja_id, athlete_id, intervals_activity_id, start_at, koniec_at, dystans_m, punkty)
    values (v_akcja, v_ath, 'i1', now() - interval '3 hours', now() - interval '2 hours', 5000, '[[52.4,16.9,0],[52.41,16.9,1100]]'::jsonb);
  begin insert into public.akcja_wyprawa_slad (akcja_id, athlete_id, intervals_activity_id, start_at, koniec_at) values (v_akcja, v_ath, 'i1', now(), now()); raise exception 'FAIL 3a: duplikat aktywności'; exception when unique_violation then null; end;
  begin insert into public.akcja_wyprawa_slad (akcja_id, athlete_id, intervals_activity_id, start_at, koniec_at, punkty) values (v_akcja, v_ath, 'i2', now(), now(), '{"a":1}'::jsonb); raise exception 'FAIL 3b: punkty nie-tablica'; exception when check_violation then null; end;
  begin insert into public.akcja_wyprawa_slad (akcja_id, athlete_id, intervals_activity_id, start_at, koniec_at) values (v_akcja, v_ath, 'zły id!', now(), now()); raise exception 'FAIL 3c: zły id aktywności'; exception when check_violation then null; end;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform count(*) from public.akcja_wyprawa_slad; raise exception 'FAIL 3d: anon czyta ślad'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.athletes where id = v_ath), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform count(*) from public.akcja_wyprawa_slad; raise exception 'FAIL 3e: zalogowany (nawet właściciel) czyta ślad wprost'; exception when insufficient_privilege then null; end;
  begin insert into public.akcja_wyprawa_slad (akcja_id, athlete_id, intervals_activity_id, start_at, koniec_at) values (v_akcja, v_ath, 'i9', now(), now()); raise exception 'FAIL 3f: zalogowany pisze ślad'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 6;

  create temp table _wyp_wynik as select 'TESTY WYPRAWY ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _wyp_wynik;
