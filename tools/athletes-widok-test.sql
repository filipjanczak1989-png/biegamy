-- Testy KROKU 3 (20261112_athletes_widok_i_funkcje.sql: sam CREATE) PO SKUTKU, w JEDNEJ transakcji zawsze wycofanej (tools/athletes-widok-test.sh).
-- Sprawdza: widok public_athletes ma dokładnie zaplanowane kolumny (bez osobowych), ACL widoku bez zmian, widok oddaje tylko profile publiczne; trzy funkcje istnieją,
-- EXECUTE tylko authenticated; zawodnik dostaje swojego trenera i NIC po e-mailu ani z nowych kont; trener znajduje zawodnika po e-mailu i widzi nowe konta; anon nic.
-- Bez literałów osób: konta wybierane zapytaniem. Komunikat wyjątku = wynik.
do $T$
declare
  n int := 0; k int; v_pub int; v_coach_uid uuid; v_coach_row uuid; v_pupil_id uuid; v_pupil_email text; v_pupil_uid uuid; t text;
  KOLUMNY constant text[] := array['id','full_name','avatar_url','goal','race_goals','pb_marathon','pb_half','pb_10k','pb_5k','target_date','pb_marathon_year','pb_half_year','pb_10k_year','pb_5k_year','created_at','city','hr_public'];
  STARE constant text[] := array['id','full_name','avatar_url','goal','race_goals','pb_marathon','pb_half','pb_10k','pb_5k'];
  NOWE constant text[] := array['target_date','pb_marathon_year','pb_half_year','pb_10k_year','pb_5k_year','created_at','city','hr_public'];
  OSOBOWE constant text[] := array['email','phone','date_of_birth','lat','lon','gender','f6_runner_key','coach_message','klaudiusz_brief','strava_athlete_id','intervals_athlete_id','user_id','coach_id','link_facebook','link_instagram','link_strava','link_garmin'];
begin
  select count(*) into v_pub from public.athletes where is_public;   -- liczone jako właściciel, zanim zmienimy rolę
  -- 1. kolumny widoku: dokładnie zaplanowane, w tej kolejności; żadnej osobowej
  if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'public_athletes') <> KOLUMNY then
    raise exception 'FAIL 1a: kolumny widoku inne niż plan: %', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'public_athletes');
  end if;
  foreach t in array OSOBOWE loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'public_athletes' and column_name = t) then raise exception 'FAIL 1b: widok ma kolumnę osobową %', t; end if;
  end loop;
  n := n + 2;

  -- 2. ACL widoku (poprawka 12.11): anon dokładnie 9 starych kolumn (grant kolumnowy, bez SELECT na całym widoku), authenticated cały widok; tabela athletes dla anon nadal nic
  if has_table_privilege('anon', 'public.public_athletes', 'SELECT') then raise exception 'FAIL 2a: anon ma SELECT na całym widoku (8 nowych kolumn bez sesji)'; end if;
  if not has_table_privilege('authenticated', 'public.public_athletes', 'SELECT') then raise exception 'FAIL 2a2: authenticated bez SELECT na widoku'; end if;
  foreach t in array STARE loop if not has_column_privilege('anon', 'public.public_athletes', t, 'SELECT') then raise exception 'FAIL 2d: anon stracił starą kolumnę %', t; end if; end loop;
  foreach t in array NOWE loop if has_column_privilege('anon', 'public.public_athletes', t, 'SELECT') then raise exception 'FAIL 2e: anon ma nową kolumnę %', t; end if; end loop;
  n := n + 2;
  if has_table_privilege('anon', 'public.public_athletes', 'INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', 'public.public_athletes', 'INSERT, UPDATE, DELETE') then raise exception 'FAIL 2b: zapis przez widok'; end if;
  if has_table_privilege('anon', 'public.athletes', 'SELECT') or has_any_column_privilege('anon', 'public.athletes', 'SELECT') then raise exception 'FAIL 2c: anon czyta athletes'; end if;
  n := n + 3;

  -- 3. widok oddaje dokładnie profile publiczne (security_invoker = off: liczy jako właściciel)
  select count(*) into k from public.public_athletes;
  if k <> v_pub then raise exception 'FAIL 3: widok % wierszy, publicznych %', k, v_pub; end if;
  n := n + 1;

  -- 4. funkcje istnieją, EXECUTE tylko authenticated
  foreach t in array array['public.moj_trener_id()', 'public.znajdz_zawodnika_po_emailu(text)', 'public.nowe_konta_trenera()'] loop
    if has_function_privilege('anon', t, 'EXECUTE') then raise exception 'FAIL 4a: anon ma EXECUTE na %', t; end if;
    if not has_function_privilege('authenticated', t, 'EXECUTE') then raise exception 'FAIL 4b: authenticated bez EXECUTE na %', t; end if;
  end loop;
  n := n + 3;

  -- konta do prób: trener (coaches) z podopiecznym mającym e-mail i wiersz trenera w athletes; zawodnik A = ten podopieczny
  select c.id into v_coach_uid from public.coaches c where exists (select 1 from public.athletes p where p.coach_id = c.id and p.email is not null and p.user_id is not null) and exists (select 1 from public.athletes t where t.user_id = c.id) limit 1;
  if v_coach_uid is null then raise exception 'FAIL 0: brak trenera z podopiecznym do próby'; end if;
  select t.id into v_coach_row from public.athletes t where t.user_id = v_coach_uid limit 1;
  select p.id, p.user_id, p.email into v_pupil_id, v_pupil_uid, v_pupil_email from public.athletes p where p.coach_id = v_coach_uid and p.email is not null and p.user_id is not null order by p.created_at limit 1;

  -- 5. zawodnik (podopieczny): swój trener tak; po e-mailu 0 wierszy; nowe konta 0 wierszy; widok działa
  perform set_config('request.jwt.claims', json_build_object('sub', v_pupil_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.moj_trener_id() is distinct from v_coach_row then raise exception 'FAIL 5a: moj_trener_id oddaje % zamiast wiersza trenera', public.moj_trener_id(); end if;
  select count(*) into k from public.znajdz_zawodnika_po_emailu(v_pupil_email); if k <> 0 then raise exception 'FAIL 5b: zawodnik znajduje po e-mailu (% wierszy)', k; end if;
  select count(*) into k from public.nowe_konta_trenera(); if k <> 0 then raise exception 'FAIL 5c: zawodnik widzi nowe konta (%)', k; end if;
  execute 'select ' || array_to_string(KOLUMNY, ', ') || ' from public.public_athletes limit 1';   -- 17 kolumn czyta się naprawdę
  select count(*) into k from public.public_athletes; if k <> v_pub then raise exception 'FAIL 5d: zalogowany nie widzi wszystkich publicznych w widoku'; end if;
  execute 'reset role';
  n := n + 5;

  -- 6. trener: po e-mailu dokładnie podopieczny (bez względu na wielkość liter i spacje), nowe konta ≤ 10 od najnowszych, tylko kolumny minimalne
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into k from public.znajdz_zawodnika_po_emailu(upper(' ' || v_pupil_email || ' ')); if k <> 1 then raise exception 'FAIL 6a: trener nie znajduje podopiecznego po e-mailu (% wierszy)', k; end if;
  if (select z.id from public.znajdz_zawodnika_po_emailu(v_pupil_email) z) <> v_pupil_id then raise exception 'FAIL 6b: znaleziony inny wiersz'; end if;
  select count(*) into k from public.znajdz_zawodnika_po_emailu('nie-ma-takiego@example.invalid'); if k <> 0 then raise exception 'FAIL 6c: obcy e-mail daje wiersz'; end if;
  select count(*) into k from public.nowe_konta_trenera(); if k < 1 or k > 10 then raise exception 'FAIL 6d: nowe konta: % wierszy', k; end if;
  if (select string_agg(p.parameter_name, ',' order by p.ordinal_position) from information_schema.parameters p join information_schema.routines r on r.specific_name = p.specific_name where r.routine_schema = 'public' and r.routine_name = 'nowe_konta_trenera' and p.parameter_mode = 'OUT') <> 'id,full_name,created_at,goal' then
    raise exception 'FAIL 6e: nowe_konta_trenera oddaje inne kolumny';
  end if;
  if (select string_agg(p.parameter_name, ',' order by p.ordinal_position) from information_schema.parameters p join information_schema.routines r on r.specific_name = p.specific_name where r.routine_schema = 'public' and r.routine_name = 'znajdz_zawodnika_po_emailu' and p.parameter_mode = 'OUT') <> 'id,full_name,coach_id,user_id' then
    raise exception 'FAIL 6f: znajdz_zawodnika_po_emailu oddaje inne kolumny';
  end if;
  execute 'reset role';
  n := n + 6;

  -- 7. anon: funkcje odmawiają, widok działa
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform public.moj_trener_id(); raise exception 'FAIL 7a: anon woła moj_trener_id'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.znajdz_zawodnika_po_emailu('x@example.invalid'); raise exception 'FAIL 7b: anon woła znajdz_zawodnika_po_emailu'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.nowe_konta_trenera(); raise exception 'FAIL 7c: anon woła nowe_konta_trenera'; exception when insufficient_privilege then null; end;
  select count(*) into k from public.public_athletes; if k <> v_pub then raise exception 'FAIL 7d: anon nie widzi publicznych w widoku'; end if;
  foreach t in array STARE loop
    begin execute 'select ' || t || ' from public.public_athletes limit 1'; exception when insufficient_privilege then raise exception 'FAIL 7e: anon nie przeczyta starej kolumny %', t; end;
  end loop;
  foreach t in array NOWE loop
    begin execute 'select ' || t || ' from public.public_athletes limit 1'; raise exception 'FAIL 7f: anon przeczytał nową kolumnę %', t; exception when insufficient_privilege then null; end;
  end loop;
  execute 'reset role';
  n := n + 6;

  -- 8. polityki athletes NIETKNIĘTE w kroku 3 (athletes_read_public nadal jest; znika w kroku 4)
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'athletes') <> 6 or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'athletes' and policyname = 'athletes_read_public') then
    raise exception 'FAIL 8: krok 3 zmienił polityki athletes';
  end if;
  n := n + 1;

  raise exception 'TESTY WIDOKU ATHLETES ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
