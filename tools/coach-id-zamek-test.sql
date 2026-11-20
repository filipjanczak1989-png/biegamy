-- Test po skutku 20261222 (zamek na athletes.coach_id). W transakcji z .sh, zawsze wycofanej. Nic nie wypisuje poza numerem kroku i liczbami.
-- Konta: dwaj trenerzy z coaches (wg id); A — najstarsze konto bez trenera i bez oczekującej prośby; C — najstarsze konto z trenerem (nie trener).
-- Ankieta próbna (status submitted, adres w domenie example.invalid) powstaje w tej transakcji. _coach_przed = athletes(id, coach_id) sprzed testu (z .sh).
do $test$
declare
  n int := 0; k int; t text; tr uuid[]; a_id uuid; a_u uuid; c_id uuid; c_u uuid; c_tr uuid; inny uuid; p uuid; f uuid; nowy uuid; przed int; u_cel uuid;
begin
  -- 0. wyzwalacz: jest i działa przed zapisem INSERT/UPDATE OF coach_id; funkcja BEZ security definer (inaczej current_user = właściciel
  --    i zamek przepuściłby każdego), stała search_path, niewywoływalna z przeglądarki; sama migracja nie zmieniła żadnego przypisania
  if not exists (select 1 from pg_trigger where tgrelid = 'public.athletes'::regclass and tgname = 'athletes_coach_id_zamek' and tgenabled = 'O') then
    raise exception 'FAIL 0a: brak włączonego wyzwalacza athletes_coach_id_zamek (migracja 20261222 nie weszła)'; end if;
  t := (select pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.athletes'::regclass and tgname = 'athletes_coach_id_zamek');
  if position('BEFORE INSERT OR UPDATE OF coach_id ON public.athletes FOR EACH ROW' in t) = 0 then raise exception 'FAIL 0b: wyzwalacz nie BEFORE INSERT OR UPDATE OF coach_id'; end if;
  if (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.athletes_coach_id_zamek()')) then raise exception 'FAIL 0c: funkcja zamka jest security definer'; end if;
  if coalesce((select array_to_string(p.proconfig, ',') from pg_proc p where p.oid = to_regprocedure('public.athletes_coach_id_zamek()')), '') not like '%search_path=public, pg_temp%' then
    raise exception 'FAIL 0d: funkcja zamka bez stałej search_path'; end if;
  if has_function_privilege('authenticated', 'public.athletes_coach_id_zamek()', 'execute') or has_function_privilege('anon', 'public.athletes_coach_id_zamek()', 'execute') then
    raise exception 'FAIL 0e: funkcję zamka da się wywołać z przeglądarki'; end if;
  if exists (select 1 from public.athletes x full join _coach_przed b on b.id = x.id where x.id is null or b.id is null or x.coach_id is distinct from b.coach_id) then
    raise exception 'FAIL 0f: migracja zmieniła przypisania'; end if;
  przed := (select count(*) from _coach_przed where coach_id is not null);
  n := n + 6;

  -- 1. konta do testu
  select array_agg(c.id order by c.id) into tr from public.coaches c;
  select a.id, a.user_id into a_id, a_u from public.athletes a
   where a.user_id is not null and a.coach_id is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
     and not exists (select 1 from public.prosby_trenera p where p.athlete_id = a.id and p.status = 'oczekuje')
   order by a.created_at, a.id limit 1;
  select a.id, a.user_id, a.coach_id into c_id, c_u, c_tr from public.athletes a
   where a.user_id is not null and a.coach_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id)
   order by a.created_at, a.id limit 1;
  if coalesce(array_length(tr, 1), 0) < 2 or a_id is null or c_id is null then raise exception 'FAIL 1-0: za mało kont do testu (2 trenerów, konto bez trenera, konto z trenerem)'; end if;
  inny := (select x from unnest(tr) x where x is distinct from c_tr limit 1);
  /* konto bez wiersza zawodnika (cel przestawienia user_id w 2h); bez takiego profilu losowy uid — wtedy przejście RLS skończyłoby się FK, też czerwono */
  select pr.id into u_cel from public.profiles pr where not exists (select 1 from public.athletes x where x.user_id = pr.id) order by pr.id limit 1;
  if u_cel is null then u_cel := gen_random_uuid(); end if;

  -- 2. A (bez trenera): nie ustawi trenera ani UPDATE-em, ani INSERT-em; NULL i zwykły zapis profilu przechodzą
  perform set_config('request.jwt.claims', json_build_object('sub', a_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.athletes set coach_id = tr[1] where id = a_id;
    raise exception 'FAIL 2a: zawodnik ustawił sobie trenera UPDATE-em';
  exception when insufficient_privilege then
    if sqlerrm not like 'Trenera nie ustawia się wprost%' then raise exception 'FAIL 2a: odrzucone, ale nie przez zamek (%)', sqlerrm; end if;
  end;
  begin
    update public.athletes set full_name = full_name, coach_id = tr[2] where id = a_id;
    raise exception 'FAIL 2b: trener razem z innym polem przeszedł';
  exception when insufficient_privilege then
    if sqlerrm not like 'Trenera nie ustawia się wprost%' then raise exception 'FAIL 2b: odrzucone, ale nie przez zamek (%)', sqlerrm; end if;
  end;
  update public.athletes set coach_id = null where id = a_id;
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'FAIL 2c: NULL nie przeszedł (%)', k; end if;
  update public.athletes set full_name = full_name where id = a_id;
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'FAIL 2d: zwykły zapis profilu nie przeszedł'; end if;
  begin
    insert into public.athletes (user_id, full_name, coach_id) values (a_u, 'Zamek test', tr[1]);
    raise exception 'FAIL 2e: INSERT z trenerem przeszedł';
  exception when insufficient_privilege then
    if sqlerrm not like 'Trenera nie ustawia się wprost%' then raise exception 'FAIL 2e: odrzucone, ale nie przez zamek (%)', sqlerrm; end if;
  end;
  begin
    insert into public.athletes (user_id, full_name, coach_id) values (a_u, 'Zamek test', null);
    raise exception 'FAIL 2f: drugi wiersz tego samego konta przeszedł';
  exception when unique_violation then null;   -- zamek przepuścił NULL, zatrzymała dopiero unikalność user_id
  end;
  /* 2h. user_id (20.11, sprawdzone na produkcji: „nie jest dziurą”): grant UPDATE(user_id) jest, ale athletes_update_own bez WITH CHECK
     sprawdza NOWY wiersz warunkiem USING (user_id = auth.uid()), więc przestawienie wiersza na inne konto odpada na RLS. Ma tak zostać. */
  begin
    update public.athletes set user_id = u_cel where id = a_id;
    raise exception 'FAIL 2h: konto przestawiło user_id swojego wiersza na inne konto';
  exception when insufficient_privilege then
    if sqlerrm not like 'new row violates row-level security policy%' then raise exception 'FAIL 2h: odrzucone, ale nie przez RLS (%)', sqlerrm; end if;
  end;
  execute 'reset role';
  if (select coach_id from public.athletes where id = a_id) is not null then raise exception 'FAIL 2g: A ma trenera'; end if;
  if (select user_id from public.athletes where id = a_id) is distinct from a_u then raise exception 'FAIL 2i: zmienił się user_id wiersza A'; end if;
  n := n + 9;

  -- 3. C (z trenerem): nie zmieni na innego; ten sam trener w zapisie i NULL przechodzą
  perform set_config('request.jwt.claims', json_build_object('sub', c_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.athletes set coach_id = inny where id = c_id;
    raise exception 'FAIL 3a: zawodnik zmienił sobie trenera';
  exception when insufficient_privilege then
    if sqlerrm not like 'Trenera nie ustawia się wprost%' then raise exception 'FAIL 3a: odrzucone, ale nie przez zamek (%)', sqlerrm; end if;
  end;
  update public.athletes set coach_id = c_tr where id = c_id;
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'FAIL 3b: zapis z tym samym trenerem nie przeszedł'; end if;
  update public.athletes set coach_id = null where id = c_id;
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'FAIL 3c: odejście od trenera (NULL) nie przeszło'; end if;
  execute 'reset role';
  if (select coach_id from public.athletes where id = c_id) is not null then raise exception 'FAIL 3d: C ma trenera po NULL'; end if;
  n := n + 4;

  -- 4. anon: nie ustawi trenera
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    update public.athletes set coach_id = tr[1] where id = a_id;
    get diagnostics k = row_count;
    if k > 0 then raise exception 'FAIL 4a: anon ustawił trenera'; end if;
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  n := n + 1;

  -- 5. prośba: A prosi trenera 2, trener przyjmuje — rozpatrz_prosbe (definer) przechodzi przez zamek
  perform set_config('request.jwt.claims', json_build_object('sub', a_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  p := public.popros_o_trenera(tr[2]);
  execute 'reset role';
  if p is null then raise exception 'FAIL 5a: prośba bez id'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.rozpatrz_prosbe(p, true) is distinct from 'przyjeta' then raise exception 'FAIL 5b: przyjęcie prośby nie przeszło'; end if;
  execute 'reset role';
  if (select coach_id from public.athletes where id = a_id) is distinct from tr[2] then raise exception 'FAIL 5c: przyjęta prośba nie ustawiła trenera'; end if;
  n := n + 3;

  -- 6. ankieta: trener 1 przyjmuje ankietę próbną — accept_intake_form (definer) zakłada konto z trenerem
  insert into public.athlete_intake_forms (full_name, email, status, session_token, submitted_at)
    values ('Test Zamka', 'zamek-' || gen_random_uuid() || '@example.invalid', 'submitted', md5(random()::text || clock_timestamp()::text), now())
    returning id into f;
  perform set_config('request.jwt.claims', json_build_object('sub', tr[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  nowy := public.accept_intake_form(f);
  execute 'reset role';
  if nowy is null or (select coach_id from public.athletes where id = nowy) is distinct from tr[1] then raise exception 'FAIL 6a: przyjęta ankieta nie założyła konta z trenerem'; end if;
  n := n + 1;

  -- 7. service_role (Edge Functions) przechodzi
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  update public.athletes set coach_id = tr[1] where id = c_id;
  get diagnostics k = row_count;
  execute 'reset role';
  if k <> 1 or (select coach_id from public.athletes where id = c_id) is distinct from tr[1] then raise exception 'FAIL 7a: service_role zatrzymany przez zamek'; end if;
  n := n + 1;

  -- 8. strażnik: poza kontami testu (A, C, konto z ankiety) przypisania bez zmian
  if exists (select 1 from public.athletes x join _coach_przed b on b.id = x.id where x.id not in (a_id, c_id) and x.coach_id is distinct from b.coach_id) then
    raise exception 'FAIL 8a: zmieniło się przypisanie innego zawodnika'; end if;
  if (select count(*) from public.athletes) <> (select count(*) from _coach_przed) + 1 then raise exception 'FAIL 8b: inna liczba zawodników niż przed testem + konto z ankiety'; end if;
  n := n + 2;

  raise exception 'TESTY ZAMKA COACH_ID ZIELONE: % sprawdzeń (przypisań przed testem: %)', n, przed;
end $test$;
