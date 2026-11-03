-- Testy WYPRAWY (20261104_akcja_wyprawa.sql): sekret celu w liczniku (przed dotarciem bez celu, po — z celem; próba to samo),
-- akcja_wyprawa_slad bez dostępu z przeglądarki, CHECK-i śladu. Jedna transakcja, zawsze wycofana (tools/akcja-wyprawa-test.sh).
do $T$
declare n int := 0; j jsonb; c int; v_akcja uuid; v_ath uuid; v_f uuid; v_k uuid; v_przed numeric; v_dzis timestamptz := now() - interval '90 minutes';
begin
  -- 1. dla-fabianka: start → licznik bez celu, z wyprawa_trwa; dotarcie → cel (nazwa + km)
  update public.akcje set wystartowala_at = now() - interval '2 hours', start = (now() at time zone 'Europe/Warsaw')::date where slug = 'dla-fabianka';
  -- A0: wyprawa = dystans trasy z JEDNEGO konta per dzień; suma akcji z OBU. Obaj po 100 km dziś (training_logs — ślad pusty) → wiersz 100, akcja +200.
  select wyprawa_athlete_ids[1], wyprawa_athlete_ids[2], id into v_f, v_k, v_akcja from public.akcje where slug = 'dla-fabianka';
  j := public.akcja_licznik('dla-fabianka'); v_przed := (j->>'suma_km')::numeric;
  insert into public.training_logs (athlete_id, logged_at, training_type, distance_km, duration) values (v_f, v_dzis, 'Spokojny', 100, '10:00:00'), (v_k, v_dzis, 'Spokojny', 100, '10:00:00');
  j := public.akcja_licznik('dla-fabianka');
  if (j->>'wyprawa_km')::numeric <> 100 then raise exception 'FAIL 0a: wyprawa_km = % (ma być 100 — jedno konto, nie suma)', j->>'wyprawa_km'; end if;
  if (j->>'suma_km')::numeric - v_przed <> 200 then raise exception 'FAIL 0b: akcja +% (ma być +200)', (j->>'suma_km')::numeric - v_przed; end if;
  -- ślad ma pierwszeństwo przed logami: główny 50 km w śladzie → wiersz 50 (zapas 100 w śladzie nie dolicza się)
  insert into public.akcja_wyprawa_slad (akcja_id, athlete_id, intervals_activity_id, start_at, koniec_at, dystans_m) values (v_akcja, v_f, 'iF', v_dzis, v_dzis + interval '1 hour', 50000), (v_akcja, v_k, 'iK', v_dzis, v_dzis + interval '1 hour', 100000);
  j := public.akcja_licznik('dla-fabianka');
  if (j->>'wyprawa_km')::numeric <> 50 then raise exception 'FAIL 0c: ślad: wyprawa_km = % (ma być 50)', j->>'wyprawa_km'; end if;
  -- dzień bez aktywności głównego → zapas liczy: dodajemy drugi dzień tylko Kasi (30 km) → 80
  insert into public.akcja_wyprawa_slad (akcja_id, athlete_id, intervals_activity_id, start_at, koniec_at, dystans_m) values (v_akcja, v_k, 'iK2', v_dzis + interval '1 day', v_dzis + interval '1 day 1 hour', 30000);
  update public.akcje set wyprawa_dotarla_at = null where slug = 'dla-fabianka';
  j := public.akcja_licznik('dla-fabianka');
  if (j->>'wyprawa_km')::numeric <> 80 then raise exception 'FAIL 0d: zapas w dniu bez głównego: % (ma być 80)', j->>'wyprawa_km'; end if;
  delete from public.akcja_wyprawa_slad where akcja_id = v_akcja;
  n := n + 4;
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
