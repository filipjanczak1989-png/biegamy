-- Testy zachowania migracji 20261112_athletes_widok_i_funkcje.sql (krok 3) i 20261114_athletes_polityka_i_log_comments.sql (krok 4). Uruchamia tools/athletes-cudze-profile-test.sh:
-- (migracja, gdy ATHLETES_Z_MIGRACJA=1) + ten blok w JEDNEJ transakcji; blok ZAWSZE kończy się wyjątkiem, więc nic nie zostaje
-- w bazie, także przy zielonym wyniku. Komunikat wyjątku = wynik. Bez literałów osób: konta wybierane zapytaniem.
do $T$
declare
  v_a uuid; v_a_uid uuid;          -- zawodnik A (zalogowany w teście; zwykłe konto, bez roli trenera)
  v_b uuid; v_b_uid uuid;          -- zawodnik B: publiczny profil, inne konto
  v_c uuid; v_c_uid uuid; v_p uuid; -- trener C i jego podopieczny P
  n int := 0; k int; t text; v_log_pub uuid; v_wlasc uuid;
begin
  select id, user_id into v_b, v_b_uid from public.athletes where is_public = true and user_id is not null order by created_at limit 1;
  select id, user_id into v_a, v_a_uid from public.athletes a where a.user_id is not null and a.id <> v_b
     and not exists (select 1 from public.athletes x where x.coach_id = a.user_id) order by created_at limit 1;
  select a.coach_id, a.id into v_c_uid, v_p from public.athletes a where a.coach_id is not null and a.user_id is not null order by created_at limit 1;
  select id into v_c from public.athletes where user_id = v_c_uid limit 1;
  if v_a is null or v_b is null or v_p is null then raise exception 'FAIL: brak kont do testu (A, publiczny B, trener z podopiecznym)'; end if;

  -- A jako authenticated
  perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 1. A czyta WŁASNY wiersz z kolumnami osobowymi (jak dziś)
  select count(*) into k from public.athletes where id = v_a and user_id = v_a_uid;
  if k <> 1 then raise exception 'FAIL 1: A nie widzi własnego wiersza'; end if;
  perform email, date_of_birth, lat, lon, phone, coach_message from public.athletes where id = v_a;
  n := n + 1;
  -- 2. A NIE czyta żadnej kolumny publicznego B z tabeli athletes (RLS: 0 wierszy, nie błąd)
  select count(*) into k from public.athletes where id = v_b;
  if k <> 0 then raise exception 'FAIL 2: A widzi wiersz publicznego B w athletes'; end if;
  n := n + 1;
  -- 3. A czyta B przez public_athletes (widok działa dla zalogowanych)
  select count(*) into k from public.public_athletes where id = v_b;
  if k <> 1 then raise exception 'FAIL 3: public_athletes nie oddaje publicznego B zalogowanemu'; end if;
  n := n + 1;
  -- 4. A przez widok NIE dostanie kolumn osobowych (42703 = kolumny nie ma w widoku)
  foreach t in array array['email', 'phone', 'date_of_birth', 'lat', 'lon', 'gender', 'coach_message', 'coach_message_at', 'coach_id',
                           'f6_runner_key', 'strava_athlete_id', 'intervals_athlete_id', 'terms_accepted_at', 'user_id', 'klaudiusz_brief',
                           'link_facebook', 'link_instagram', 'link_strava', 'link_garmin', 'morning_push_enabled', 'email_reports_enabled'] loop
    begin
      execute format('select %I from public.public_athletes where id = $1', t) using v_b;
      raise exception 'FAIL 4: public_athletes ma kolumnę %', t;
    exception when undefined_column then null;
    end;
  end loop;
  n := n + 1;
  -- 5. A nie czyta prywatnego podopiecznego P (nie jest jego trenerem)
  if v_p <> v_a then
    select count(*) into k from public.athletes where id = v_p;
    if k <> 0 and (select is_public from public.athletes where id = v_p) is distinct from true then
      raise exception 'FAIL 5: A widzi cudzego prywatnego zawodnika';
    end if;
  end if;
  n := n + 1;

  -- trener C jako authenticated
  perform set_config('request.jwt.claims', json_build_object('sub', v_c_uid, 'role', 'authenticated')::text, true);
  -- 6. trener czyta podopiecznego z kolumnami osobowymi (panel trenera jak dziś)
  select count(*) into k from public.athletes where id = v_p and coach_id = v_c_uid;
  if k <> 1 then raise exception 'FAIL 6: trener nie widzi podopiecznego w athletes'; end if;
  perform email, date_of_birth, city, coach_message from public.athletes where id = v_p;
  n := n + 1;
  -- 7. trener nie czyta publicznego B, który nie jest jego podopiecznym (chyba że przypadkiem jest)
  select count(*) into k from public.athletes where id = v_b and coach_id is distinct from v_c_uid;
  if k <> 0 then raise exception 'FAIL 7: trener widzi w athletes publicznego B, który nie jest jego podopiecznym'; end if;
  n := n + 1;

  -- anon
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  -- 8. anon czyta public_athletes jak dziś, tabeli nie (42501)
  select count(*) into k from public.public_athletes where id = v_b;
  if k <> 1 then raise exception 'FAIL 8: anon nie widzi publicznego B w public_athletes'; end if;
  begin
    perform 1 from public.athletes where id = v_b;
    raise exception 'FAIL 8b: anon czyta tabelę athletes';
  exception when insufficient_privilege then null;
  end;
  n := n + 1;
  -- 9. polityka athletes_read_public nie istnieje
  execute 'reset role';
  select count(*) into k from pg_policies where schemaname = 'public' and tablename = 'athletes' and policyname = 'athletes_read_public';
  if k <> 0 then raise exception 'FAIL 9: polityka athletes_read_public nadal istnieje'; end if;
  n := n + 1;

  -- 10. log_comments: A nie czyta komentarzy pod cudzym wpisem (nie jest autorem, właścicielem ani trenerem)
  perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into k from public.log_comments c
   where c.athlete_id <> v_a
     and not exists (select 1 from public.training_logs l where l.id = c.log_id and l.athlete_id = v_a)
     and not exists (select 1 from public.training_logs l join public.athletes x on x.id = l.athlete_id where l.id = c.log_id and x.coach_id = v_a_uid)
     and not exists (select 1 from public.public_training_logs v where v.id = c.log_id);
  if k <> 0 then raise exception 'FAIL 10: A widzi % komentarzy pod prywatnymi cudzymi wpisami (ani autor, ani właściciel, ani trener)', k; end if;
  n := n + 1;
  -- 10b. osoba trzecia widzi komentarze pod wpisem PUBLICZNYM (gdy jakiś istnieje), a po przestawieniu wpisu na prywatny już nie
  execute 'reset role';
  select c.log_id, l.athlete_id into v_log_pub, v_wlasc from public.log_comments c join public.public_training_logs l on l.id = c.log_id
   where l.athlete_id <> v_a and c.athlete_id <> v_a
     and not exists (select 1 from public.athletes x where x.id = l.athlete_id and x.coach_id = v_a_uid) limit 1;
  if v_log_pub is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into k from public.log_comments where log_id = v_log_pub;
    if k = 0 then raise exception 'FAIL 10b: osoba trzecia nie widzi komentarzy pod wpisem publicznym'; end if;
    execute 'reset role';
    update public.athletes set is_public = false where id = v_wlasc;   -- w tej transakcji, wycofane na końcu
    perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into k from public.log_comments where log_id = v_log_pub;
    if k <> 0 then raise exception 'FAIL 10c: po przestawieniu profilu na prywatny osoba trzecia nadal widzi % komentarzy', k; end if;
    execute 'reset role';
    update public.athletes set is_public = true where id = v_wlasc;
  end if;
  n := n + 1;
  -- 11. trener czyta komentarze pod wpisami podopiecznego (gdy jakieś są)
  execute 'reset role';
  select count(*) into k from public.log_comments c join public.training_logs l on l.id = c.log_id join public.athletes x on x.id = l.athlete_id where x.coach_id = v_c_uid;
  if k > 0 then
    perform set_config('request.jwt.claims', json_build_object('sub', v_c_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform 1 from public.log_comments c join public.training_logs l on l.id = c.log_id join public.athletes x on x.id = l.athlete_id where x.coach_id = v_c_uid limit 1;
    if not found then raise exception 'FAIL 11: trener nie widzi komentarzy pod wpisem podopiecznego'; end if;
    execute 'reset role';
  end if;
  n := n + 1;
  -- 12. polityka read_comments zdjęta, nowa istnieje
  select count(*) into k from pg_policies where schemaname = 'public' and tablename = 'log_comments' and policyname = 'read_comments';
  if k <> 0 then raise exception 'FAIL 12: polityka read_comments nadal istnieje'; end if;
  select count(*) into k from pg_policies where schemaname = 'public' and tablename = 'log_comments' and policyname = 'log_comments_read_relacja';
  if k <> 1 then raise exception 'FAIL 12b: brak polityki log_comments_read_relacja'; end if;
  n := n + 1;

  raise exception 'TESTY ATHLETES ZIELONE: % (A własny wiersz, A nie widzi B, widok bez kolumn osobowych, trener podopiecznych, polityka zdjęta, komentarze w relacji albo pod wpisem publicznym)', n;
end $T$;
