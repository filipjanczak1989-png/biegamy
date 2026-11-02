-- Testy etapu 2 (20261102_wyniki_zgloszone.sql): RLS PO SKUTKU dla 3 kont (własne, trener swojego, obcy), strażnik kolumn
-- systemowych, RPC dopasowania, CHECK tempa/UNIQUE/przyszłość, klucz k:… w ustaw_f6_runner_key, delete_my_account.
do $T$
declare n int := 0; w_ath uuid; w_uid uuid; tr_uid uuid; o_uid uuid; o_ath uuid; id1 uuid; c int; j jsonb;
begin
  -- własny: zawodnik z user_id i trenerem; obcy: inny zawodnik z user_id (bez relacji z trenerem własnego)
  select a.id, a.user_id, a.coach_id into w_ath, w_uid, tr_uid from public.athletes a
   where a.user_id is not null and a.coach_id is not null and a.id <> '9c2df65c-6a46-410e-ad5f-474e5d973ec9' order by a.created_at limit 1;
  select a.id, a.user_id into o_ath, o_uid from public.athletes a where a.user_id is not null and a.id <> w_ath and (a.coach_id is null or a.coach_id <> tr_uid) order by a.created_at desc limit 1;
  if w_ath is null or o_ath is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  update public.athletes set is_public = false where id = w_ath;

  -- 1. własny wpis (RLS insert_own), CHECK tempa, UNIQUE, przyszłość, strażnik stanu
  perform set_config('request.jwt.claims', json_build_object('sub', w_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (w_ath, 'Test Bieg', current_date - 3, 10, 2700, 'zawodnik') returning id into id1;
  begin insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (w_ath, 'Test Bieg', current_date - 3, 10, 2800, 'zawodnik'); raise exception 'FAIL 1a: drugi wynik na ten start'; exception when unique_violation then null; end;
  begin insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (w_ath, 'Test Bieg', current_date - 4, 10, 1200, 'zawodnik'); raise exception 'FAIL 1b: tempo 2:00/km'; exception when check_violation then null; end;
  begin insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (w_ath, 'Test Bieg', current_date + 1, 10, 2700, 'zawodnik'); raise exception 'FAIL 1c: z przyszłości'; exception when check_violation then null; end;
  begin insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo, stan) values (w_ath, 'Test Bieg', current_date - 5, 10, 2700, 'zawodnik', 'zastapiony'); raise exception 'FAIL 1d: stan przy insercie'; exception when insufficient_privilege then null; end;
  begin update public.wyniki_zgloszone set stan = 'zastapiony' where id = id1; raise exception 'FAIL 1e: stan przez update'; exception when insufficient_privilege then null; end;
  begin update public.wyniki_zgloszone set oficjalny_czas_s = 2650 where id = id1; raise exception 'FAIL 1f: oficjalny przez update'; exception when insufficient_privilege then null; end;
  update public.wyniki_zgloszone set czas_s = 2710 where id = id1;   -- zwykła poprawka wolno
  begin insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (o_ath, 'Cudzy', current_date - 3, 10, 2700, 'zawodnik'); raise exception 'FAIL 1g: wpis cudzemu'; exception when insufficient_privilege then null; end;
  n := n + 7;

  -- 2. obcy: prywatny → 0 wierszy; publiczny → widzi, ale nie pisze/nie kasuje
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.wyniki_zgloszone where id = id1; if c <> 0 then raise exception 'FAIL 2a: obcy widzi prywatny'; end if;
  reset role; update public.athletes set is_public = true where id = w_ath;
  execute 'set local role authenticated';
  select count(*) into c from public.wyniki_zgloszone where id = id1; if c <> 1 then raise exception 'FAIL 2b: obcy nie widzi publicznego'; end if;
  update public.wyniki_zgloszone set czas_s = 1 where id = id1; select czas_s into c from public.wyniki_zgloszone where id = id1; if c = 1 then raise exception 'FAIL 2c: obcy zmienił'; end if;
  delete from public.wyniki_zgloszone where id = id1; select count(*) into c from public.wyniki_zgloszone where id = id1; if c <> 1 then raise exception 'FAIL 2d: obcy skasował'; end if;
  begin perform public.wynik_zgloszony_dopasuj(id1, 'x:1', 2650); raise exception 'FAIL 2e: obcy dopasował'; exception when insufficient_privilege then null; end;
  reset role; update public.athletes set is_public = false where id = w_ath;
  n := n + 5;

  -- 3. trener swojego: widzi prywatny, może wpisać jako 'trener', nie jako 'zawodnik'
  perform set_config('request.jwt.claims', json_build_object('sub', tr_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.wyniki_zgloszone where id = id1; if c <> 1 then raise exception 'FAIL 3a: trener nie widzi swojego'; end if;
  insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (w_ath, 'Trenerski', current_date - 10, 5, 1500, 'trener');
  begin insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (w_ath, 'Trenerski2', current_date - 11, 5, 1500, 'zawodnik'); raise exception 'FAIL 3b: trener jako zawodnik'; exception when insufficient_privilege then null; end;
  begin insert into public.wyniki_zgloszone (athlete_id, nazwa_imprezy, data, dystans_km, czas_s, zrodlo) values (o_ath, 'Trenerski3', current_date - 12, 5, 1500, 'trener'); raise exception 'FAIL 3c: trener cudzemu'; exception when insufficient_privilege then null; end;
  reset role;
  n := n + 3;

  -- 4. RPC dopasowania (własny): stan, oficjalny, różnica; złe dane
  perform set_config('request.jwt.claims', json_build_object('sub', w_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.wynik_zgloszony_dopasuj(id1, 'datasport:r1', 2650);
  select count(*) into c from public.wyniki_zgloszone where id = id1 and stan = 'zastapiony' and oficjalny_czas_s = 2650 and roznica_pct = round(60::numeric / 2650 * 100, 2); if c <> 1 then raise exception 'FAIL 4a: dopasowanie'; end if;
  begin perform public.wynik_zgloszony_dopasuj(id1, 'zły klucz!', 2650); raise exception 'FAIL 4b: zły result_id'; exception when sqlstate '22023' then null; end;
  -- 5. klucz k:<nazwisko>|<rocznik> w ustaw_f6_runner_key
  perform public.ustaw_f6_runner_key('k:jan kowalski|1990');
  select count(*) into c from public.athletes where id = w_ath and f6_runner_key = 'k:jan kowalski|1990'; if c <> 1 then raise exception 'FAIL 5a: klucz k: nie zapisany'; end if;
  begin perform public.ustaw_f6_runner_key('k:|1990'); raise exception 'FAIL 5b: pusty k:'; exception when sqlstate '22023' then null; end;
  perform public.ustaw_f6_runner_key(null);
  reset role;
  n := n + 4;

  -- 6. anon nic; delete_my_account zna tabelę
  begin execute 'set local role anon'; perform count(*) from public.wyniki_zgloszone; raise exception 'FAIL 6a: anon czyta'; exception when insufficient_privilege then null; end;
  reset role;
  if position('wyniki_zgloszone' in pg_get_functiondef('public.delete_my_account()'::regprocedure)) = 0 then raise exception 'FAIL 6b: delete_my_account'; end if;
  n := n + 2;
  raise exception 'TESTY WZ ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
