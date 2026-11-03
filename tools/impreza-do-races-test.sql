-- Testy etapu 1 kalendarza (20261105_impreza_do_races.sql): zapis przez RPC jako zawodnik (approved, okładka przejęta), drugie kliknięcie
-- = ten sam wiersz (klucz; nazwa+data±1+miasto; dzielnica), trener też, anon/bez profilu 42501, walidacja (data, url, okładka), zapis na bieg po RPC.
do $T$
declare n int := 0; z_ath uuid; z_uid uuid; t_uid uuid; j1 jsonb; j2 jsonb; j3 jsonb; r public.races; c int;
begin
  select a.id, a.user_id into z_ath, z_uid from public.athletes a where a.user_id is not null and a.coach_id is not null order by a.created_at limit 1;
  select id into t_uid from public.coaches order by 1 limit 1;
  if z_ath is null or t_uid is null then raise exception 'FAIL 0: brak kont'; end if;

  -- 1. anon → 42501; zalogowany bez profilu → 42501
  begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
    perform public.impreza_do_races('kalendarz:x', 'Bieg Testowy', current_date + 30, 'Poznań', 10, null, null); raise exception 'FAIL 1a: anon'; exception when insufficient_privilege then null; end;
  reset role;
  begin perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    perform public.impreza_do_races('kalendarz:x', 'Bieg Testowy', current_date + 30, 'Poznań', 10, null, null); raise exception 'FAIL 1b: bez profilu'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 2;

  -- 2. zawodnik: nowy wiersz approved z okładką z imprezy_okladki; link tylko https; zły klucz → 22023
  perform set_config('request.jwt.claims', json_build_object('sub', z_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j1 := public.impreza_do_races('kalendarz:test-1', 'XII Bieg Testowy Śremski 2026', current_date + 30, 'Śrem', 10, 'http://bez-https.example', 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/race-covers/impreza-0123456789012345678901234567890123456789.jpg?v=1');
  if (j1->>'istniala')::boolean then raise exception 'FAIL 2a: istniała'; end if;
  select * into r from public.races where id = (j1->>'id')::uuid;
  if r.status <> 'approved' or r.added_by <> z_ath or r.impreza_klucz <> 'kalendarz:test-1' or r.cover_url is null or r.url_organizer is not null or r.distance_km <> 10 then
    raise exception 'FAIL 2b: wiersz % % % % %', r.status, r.impreza_klucz, r.cover_url is null, r.url_organizer, r.distance_km; end if;
  begin perform public.impreza_do_races('zly klucz', 'Bieg', current_date + 1, null, null, null, null); raise exception 'FAIL 2c: zły klucz'; exception when sqlstate '22023' then null; end;
  begin perform public.impreza_do_races(null, 'Bieg', current_date - 5, null, null, null, null); raise exception 'FAIL 2d: data wstecz'; exception when sqlstate '22023' then null; end;
  begin perform public.impreza_do_races(null, 'ab', current_date + 1, null, null, null, null); raise exception 'FAIL 2e: nazwa'; exception when sqlstate '22023' then null; end;
  n := n + 5;

  -- 3. bez duplikatów: ten sam klucz; inna edycja + data ±1 + dzielnica; brak klucza; link https uzupełnia
  j2 := public.impreza_do_races('kalendarz:test-1', 'XII Bieg Testowy Śremski 2026', current_date + 30, 'Śrem', 10, null, null);
  if not (j2->>'istniala')::boolean or j2->>'id' <> j1->>'id' then raise exception 'FAIL 3a: duplikat po kluczu'; end if;
  j3 := public.impreza_do_races(null, '13. Bieg Testowy Śremski', current_date + 31, 'Śrem-Centrum', 10, 'https://organizator.example/zapisy', null);
  if not (j3->>'istniala')::boolean or j3->>'id' <> j1->>'id' then raise exception 'FAIL 3b: duplikat po nazwie+data±1+miasto (%)', j3; end if;
  select * into r from public.races where id = (j1->>'id')::uuid;
  if r.url_organizer <> 'https://organizator.example/zapisy' then raise exception 'FAIL 3c: link https nieuzupełniony'; end if;
  j3 := public.impreza_do_races(null, 'Bieg Testowy Śremski', current_date + 33, 'Śrem', 10, null, null);
  if (j3->>'istniala')::boolean then raise exception 'FAIL 3d: 3 dni różnicy to NIE ten sam bieg'; end if;
  j3 := public.impreza_do_races(null, 'Bieg Testowy Śremski', current_date + 30, 'Kraków', 10, null, null);
  if (j3->>'istniala')::boolean then raise exception 'FAIL 3e: inne miasto tego dnia to inny bieg'; end if;
  n := n + 5;

  -- 4. zapis na bieg po RPC (zwykła ścieżka, RLS signups_insert) — licznik +1
  insert into public.race_signups (race_id, athlete_id) values ((j1->>'id')::uuid, z_ath);
  select signup_count into c from public.races where id = (j1->>'id')::uuid;
  if c <> 1 then raise exception 'FAIL 4a: signup_count % (trigger)', c; end if;
  reset role;
  n := n + 1;

  -- 5. trener (bez profilu zawodnika niekoniecznie): dodaje do naszych (added_by może być null), approved
  perform set_config('request.jwt.claims', json_build_object('sub', t_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j3 := public.impreza_do_races('kalendarz:test-2', 'Maraton Testowy', current_date + 60, 'Gdańsk', 42.195, null, null);
  select * into r from public.races where id = (j3->>'id')::uuid;
  if r.status <> 'approved' or r.impreza_klucz <> 'kalendarz:test-2' then raise exception 'FAIL 5a: trener'; end if;
  reset role;
  n := n + 1;

  create temp table _idr_wynik as select 'TESTY IMPREZA_DO_RACES ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _idr_wynik;
