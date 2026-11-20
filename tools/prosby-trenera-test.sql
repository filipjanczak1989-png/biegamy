-- Test po skutku 20261221 (prośby o trenera). W transakcji z .sh, zawsze wycofanej. Nic nie wypisuje poza numerem kroku.
-- Konta: dwaj trenerzy z coaches (wg id) i dwa najstarsze konta zawodników bez trenera i bez próśb. _coach_przed = athletes(id, coach_id) sprzed testu (z .sh).
do $test$
declare
  n int := 0; f text; tr uuid[]; ka uuid[]; ku uuid[]; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; t text; k int;
begin
  -- 0. funkcje: istnieją, security definer ze stałą search_path, wykonuje zalogowany, anon nie
  if to_regclass('public.prosby_trenera') is null then raise exception 'FAIL 0a: brak tabeli prosby_trenera (migracja 20261221 nie weszła)'; end if;
  foreach f in array array['public.popros_o_trenera(uuid)', 'public.wycofaj_prosbe_o_trenera()', 'public.prosby_do_mnie()', 'public.rozpatrz_prosbe(uuid, boolean)'] loop
    if to_regprocedure(f) is null then raise exception 'FAIL 0b: brak %', f; end if;
    if not (select p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%' from pg_proc p where p.oid = to_regprocedure(f)) then raise exception 'FAIL 0c: % bez security definer albo stałej search_path', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then raise exception 'FAIL 0d: % — wykonanie: zalogowany tak, anon nie', f; end if;
  end loop;
  n := n + 4;

  -- 1. tabela: RLS włączone, przeglądarka tylko czyta (zalogowany), anon nic
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.prosby_trenera'::regclass) then raise exception 'FAIL 1a: RLS wyłączone'; end if;
  if not has_table_privilege('authenticated', 'public.prosby_trenera', 'select') then raise exception 'FAIL 1b: zalogowany nie czyta'; end if;
  foreach f in array array['insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('authenticated', 'public.prosby_trenera', f) or has_table_privilege('anon', 'public.prosby_trenera', f) then raise exception 'FAIL 1c: % z przeglądarki', f; end if;
  end loop;
  if has_table_privilege('anon', 'public.prosby_trenera', 'select') then raise exception 'FAIL 1d: anon czyta prośby'; end if;
  n := n + 4;

  -- 2. konta do testu
  select array_agg(c.id order by c.id) into tr from public.coaches c;
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a
           where a.user_id is not null and a.coach_id is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
             and not exists (select 1 from public.prosby_trenera p where p.athlete_id = a.id)
           order by a.created_at, a.id limit 2) y;
  if coalesce(array_length(tr, 1), 0) < 2 or coalesce(array_length(ka, 1), 0) < 2 then raise exception 'FAIL 2-0: za mało kont do testu (2 trenerów i 2 zawodników bez trenera)'; end if;

  -- 3. zawodnik A: prośba, ta sama drugi raz, widzi tylko swoje, nie pisze wprost, nie rozpatruje, zła prośba odrzucona, nowa zastępuje starą
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  p1 := public.popros_o_trenera(tr[1]);
  if p1 is null then raise exception 'FAIL 3a: prośba A do trenera 1 bez id'; end if;
  if public.popros_o_trenera(tr[1]) is distinct from p1 then raise exception 'FAIL 3b: ta sama prośba drugi raz dała inną'; end if;
  if (select count(*) from public.prosby_trenera) <> 1 then raise exception 'FAIL 3c: A nie widzi swojej prośby albo widzi cudze'; end if;
  begin
    insert into public.prosby_trenera (athlete_id, coach_id) values (ka[1], tr[1]);
    raise exception 'FAIL 3d: zawodnik wpisał prośbę wprost';
  exception when insufficient_privilege then null; end;
  begin
    update public.prosby_trenera set status = 'przyjeta', rozpatrzono = now() where id = p1;
    raise exception 'FAIL 3e: zawodnik zmienił prośbę wprost';
  exception when insufficient_privilege then null; end;
  begin
    perform public.rozpatrz_prosbe(p1, true);
    raise exception 'FAIL 3f: zawodnik rozpatrzył prośbę';
  exception when insufficient_privilege then null; end;
  begin
    perform public.popros_o_trenera(gen_random_uuid());
    raise exception 'FAIL 3g: prośba do nieistniejącego trenera';
  exception when no_data_found then null; end;
  begin
    perform public.popros_o_trenera(null);
    raise exception 'FAIL 3h: prośba bez trenera';
  exception when no_data_found then null; end;
  p2 := public.popros_o_trenera(tr[2]);
  if p2 is null or p2 = p1 then raise exception 'FAIL 3i: prośba do trenera 2 nie zastąpiła poprzedniej'; end if;
  if (select status from public.prosby_trenera where id = p1) <> 'wycofana' or (select count(*) from public.prosby_trenera where status = 'oczekuje') <> 1 then
    raise exception 'FAIL 3j: stara prośba nie wycofana albo dwie oczekujące'; end if;
  execute 'reset role';
  if (select coach_id from public.athletes where id = ka[1]) is not null then raise exception 'FAIL 3k: sama prośba ustawiła trenera'; end if;
  n := n + 11;

  -- 4. zawodnik B: nie widzi cudzych próśb, nie dostaje listy trenera
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.prosby_trenera) <> 0 then raise exception 'FAIL 4a: B widzi cudze prośby'; end if;
  if (select count(*) from public.prosby_do_mnie()) <> 0 then raise exception 'FAIL 4b: B (nie trener) dostał listę próśb'; end if;
  execute 'reset role';
  n := n + 2;

  -- 5. trener 1 (nie adresat p2): nie widzi jej i nie rozpatruje; widzi wycofaną p1 do siebie
  perform set_config('request.jwt.claims', json_build_object('sub', tr[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.prosby_trenera where id = p2) then raise exception 'FAIL 5a: trener 1 widzi prośbę do trenera 2'; end if;
  if exists (select 1 from public.prosby_do_mnie() x where x.id = p2) then raise exception 'FAIL 5b: trener 1 ma na liście prośbę do trenera 2'; end if;
  if not exists (select 1 from public.prosby_trenera where id = p1) then raise exception 'FAIL 5c: trener 1 nie widzi prośby do siebie'; end if;
  begin
    perform public.rozpatrz_prosbe(p2, true);
    raise exception 'FAIL 5d: trener 1 przyjął prośbę do trenera 2';
  exception when no_data_found then null; end;
  execute 'reset role';
  n := n + 4;

  -- 6. trener 2: widzi prośbę A z imieniem, przyjmuje; drugi raz nie; nieznana prośba nie
  perform set_config('request.jwt.claims', json_build_object('sub', tr[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.prosby_do_mnie() x where x.id = p2 and x.athlete_id = ka[1]) <> 1 then raise exception 'FAIL 6a: trener 2 nie ma prośby A na liście'; end if;
  t := (select x.imie from public.prosby_do_mnie() x where x.id = p2);
  if public.rozpatrz_prosbe(p2, true) is distinct from 'przyjeta' then raise exception 'FAIL 6b: przyjęcie nie oddało przyjeta'; end if;
  begin
    perform public.rozpatrz_prosbe(p2, false);
    raise exception 'FAIL 6c: rozpatrzył drugi raz';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    perform public.rozpatrz_prosbe(gen_random_uuid(), true);
    raise exception 'FAIL 6d: rozpatrzył nieistniejącą prośbę';
  exception when no_data_found then null; end;
  execute 'reset role';
  if t is distinct from (select a.full_name from public.athletes a where a.id = ka[1]) then raise exception 'FAIL 6e: imię na liście trenera inne niż w profilu'; end if;
  if (select coach_id from public.athletes where id = ka[1]) is distinct from tr[2] then raise exception 'FAIL 6f: przyjęcie nie ustawiło trenera'; end if;
  if (select p.status = 'przyjeta' and p.rozpatrzono is not null from public.prosby_trenera p where p.id = p2) is not true then raise exception 'FAIL 6g: prośba nie przyjęta z datą'; end if;
  n := n + 7;

  -- 7. odrzucenie: B prosi trenera 2, trener odrzuca; B bez trenera; decyzja pusta odrzucona
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  p3 := public.popros_o_trenera(tr[2]);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', tr[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.rozpatrz_prosbe(p3, null);
    raise exception 'FAIL 7a: rozpatrzenie bez decyzji';
  exception when null_value_not_allowed then null; end;
  if public.rozpatrz_prosbe(p3, false) is distinct from 'odrzucona' then raise exception 'FAIL 7b: odrzucenie nie oddało odrzucona'; end if;
  execute 'reset role';
  if (select coach_id from public.athletes where id = ka[2]) is not null then raise exception 'FAIL 7c: odrzucenie ustawiło trenera'; end if;
  n := n + 3;

  -- 8. wycofanie: A (już u trenera 2) prosi o zmianę na trenera 1; B prosi trenera 1 (po odrzuceniu wolno) i wycofuje swoją —
  --    prośba A zostaje; drugie wycofanie nic nie robi
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  p5 := public.popros_o_trenera(tr[1]);
  if p5 is null then raise exception 'FAIL 8-0: prośba A o zmianę trenera'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  p4 := public.popros_o_trenera(tr[1]);
  if p4 is null or p4 = p3 then raise exception 'FAIL 8a: nowa prośba po odrzuceniu'; end if;
  k := public.wycofaj_prosbe_o_trenera();
  if k <> 1 then raise exception 'FAIL 8b: wycofanie oddało %', k; end if;
  if public.wycofaj_prosbe_o_trenera() <> 0 then raise exception 'FAIL 8c: drugie wycofanie coś zmieniło'; end if;
  if (select status from public.prosby_trenera where id = p4) <> 'wycofana' then raise exception 'FAIL 8d: prośba nie wycofana'; end if;
  execute 'reset role';
  if (select status from public.prosby_trenera where id = p5) <> 'oczekuje' then raise exception 'FAIL 8e: wycofanie B ruszyło prośbę A'; end if;
  n := n + 6;

  -- 9. prośba do obecnego trenera: bez nowej prośby, a oczekująca prośba o zmianę (A → trener 1) wycofana
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.popros_o_trenera(tr[2]) is not null then raise exception 'FAIL 9a: prośba do obecnego trenera'; end if;
  if exists (select 1 from public.prosby_trenera where status = 'oczekuje') then raise exception 'FAIL 9b: została oczekująca prośba po wyborze obecnego trenera'; end if;
  execute 'reset role';
  if (select status from public.prosby_trenera where id = p5) <> 'wycofana' or (select coach_id from public.athletes where id = ka[1]) is distinct from tr[2] then
    raise exception 'FAIL 9c: prośba o zmianę nie wycofana albo zmienił się trener A'; end if;
  n := n + 3;

  -- 10. bez konta: anon nie prosi i nie czyta; zalogowany bez sub nie prosi
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform public.popros_o_trenera(tr[1]);
    raise exception 'FAIL 10a: anon poprosił';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.prosby_trenera;
    raise exception 'FAIL 10b: anon czyta prośby';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.popros_o_trenera(tr[1]);
    raise exception 'FAIL 10c: bez sub poprosił';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 11. ograniczenia tabeli: rozpatrzona musi mieć datę, jedna oczekująca na zawodnika
  begin
    insert into public.prosby_trenera (athlete_id, coach_id, status) values (ka[2], tr[1], 'przyjeta');
    raise exception 'FAIL 11a: rozpatrzona bez daty';
  exception when check_violation then null; end;
  begin
    insert into public.prosby_trenera (athlete_id, coach_id) values (ka[2], tr[1]);
    insert into public.prosby_trenera (athlete_id, coach_id) values (ka[2], tr[2]);
    raise exception 'FAIL 11b: dwie oczekujące prośby jednego zawodnika';
  exception when unique_violation then null; end;
  n := n + 2;

  -- 12. strażnik: poza A (przyjęty w kroku 6) żaden zawodnik nie zmienił trenera, liczba wierszy ta sama
  if exists (select 1 from public.athletes a join _coach_przed b on b.id = a.id where a.id <> ka[1] and a.coach_id is distinct from b.coach_id) then raise exception 'FAIL 12a: zmienił się trener innego zawodnika'; end if;
  if (select count(*) from public.athletes) <> (select count(*) from _coach_przed) then raise exception 'FAIL 12b: zmieniła się liczba zawodników'; end if;
  n := n + 2;

  raise exception 'TESTY PROSB O TRENERA ZIELONE: % sprawdzeń', n;
end $test$;
