-- Test po skutku 20261223 (odznaki chronione). W transakcji z .sh, zawsze wycofanej. Nic nie wypisuje poza numerem kroku i liczbami.
-- Konto A: najstarsze konto zawodnika (nie trener) bez pierwsza_z_pierwszych, akcja-sponsor i pionier_biegamy. _odz_przed = achievements sprzed testu (z .sh).
-- Ścieżkę funkcji SECURITY DEFINER sprawdza pomocnicza funkcja tworzona w tej transakcji (znika z wycofaniem).
do $test$
declare
  n int := 0; k int; t text; a_id uuid; a_u uuid; zwykla text; okienna text; v text;
begin
  -- 0. wyzwalacz: jest, włączony, BEFORE INSERT; funkcja BEZ security definer (inaczej current_user = właściciel i nic nie byłoby chronione),
  --    stała search_path, niewywoływalna z przeglądarki; przed achievements_okno (kolejność nazw); migracja nie zmieniła odznak
  if not exists (select 1 from pg_trigger where tgrelid = 'public.achievements'::regclass and tgname = 'achievements_chronione' and tgenabled = 'O') then
    raise exception 'FAIL 0a: brak włączonego wyzwalacza achievements_chronione (migracja 20261223 nie weszła)'; end if;
  t := (select pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.achievements'::regclass and tgname = 'achievements_chronione');
  if position('BEFORE INSERT ON public.achievements FOR EACH ROW' in t) = 0 then raise exception 'FAIL 0b: wyzwalacz nie BEFORE INSERT'; end if;
  if (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.achievements_chronione()')) then raise exception 'FAIL 0c: funkcja jest security definer'; end if;
  if coalesce((select array_to_string(p.proconfig, ',') from pg_proc p where p.oid = to_regprocedure('public.achievements_chronione()')), '') not like '%search_path=public, pg_temp%' then
    raise exception 'FAIL 0d: funkcja bez stałej search_path'; end if;
  if has_function_privilege('authenticated', 'public.achievements_chronione()', 'execute') or has_function_privilege('anon', 'public.achievements_chronione()', 'execute') then
    raise exception 'FAIL 0e: funkcję da się wywołać z przeglądarki'; end if;
  if (select count(*) from public.achievements) <> (select count(*) from _odz_przed)
     or exists (select athlete_id, badge_id, earned_at from public.achievements except select athlete_id, badge_id, earned_at from _odz_przed) then
    raise exception 'FAIL 0f: migracja zmieniła odznaki'; end if;
  n := n + 6;

  -- 1. konto A, zwykła odznaka, której A nie ma, i odznaka z zamkniętego okna (wyzwanie wrześniowe)
  select a.id, a.user_id into a_id, a_u from public.athletes a
   where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id)
     and not exists (select 1 from public.achievements x where x.athlete_id = a.id and x.badge_id in ('pierwsza_z_pierwszych', 'akcja-sponsor', 'pionier_biegamy'))
   order by a.created_at, a.id limit 1;
  if a_id is null then raise exception 'FAIL 1-0: brak konta do testu'; end if;
  select z into zwykla from unnest(array['easter_egg', 'mr_13', 'pi_day', 'tylko_jeden', 'solo_artist', 'setka_dokladna', 'czterolistna_koniczyna', 'tempo_killer', 'interwalowiec', 'pierwszy_krok']) z
   where not exists (select 1 from public.achievements x where x.athlete_id = a_id and x.badge_id = z) limit 1;
  select z into okienna from unnest(array['100km_wrzesien_2026', 'razem_wrzesien_2026']) z
   where not exists (select 1 from public.achievements x where x.athlete_id = a_id and x.badge_id = z) limit 1;
  if zwykla is null then raise exception 'FAIL 1-1: konto A ma wszystkie zwykłe odznaki z listy'; end if;

  -- 2. A z przeglądarki: każda chroniona pominięta po cichu (0 wierszy, bez błędu)
  perform set_config('request.jwt.claims', json_build_object('sub', a_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach v in array array['bieg-test-zamka-odznak', 'bieg-bieg-mikolajki', 'akcja-sponsor', 'pierwsza_z_pierwszych', 'pionier_biegamy'] loop
    insert into public.achievements (athlete_id, badge_id) values (a_id, v);
    get diagnostics k = row_count;
    if k <> 0 then raise exception 'FAIL 2a: z przeglądarki weszła chroniona %', v; end if;
  end loop;
  -- 3. paczka jak w kliencie (upsert, ignoreDuplicates): chroniona pominięta, zwykła wchodzi — paczka się nie wywraca
  insert into public.achievements (athlete_id, badge_id) values (a_id, 'pionier_biegamy'), (a_id, zwykla), (a_id, 'akcja-sponsor')
    on conflict (athlete_id, badge_id) do nothing;
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'FAIL 3a: paczka: wstawionych % zamiast 1 (zwykła)', k; end if;
  -- 4. okno dalej działa: odznaka z zamkniętego okna pominięta (achievements_okno), zwykła odznaka sama wchodzi jak dotąd
  if okienna is not null then
    insert into public.achievements (athlete_id, badge_id) values (a_id, okienna);
    get diagnostics k = row_count;
    if k <> 0 then raise exception 'FAIL 4a: odznaka z zamkniętego okna weszła'; end if;
  end if;
  execute 'reset role';
  if exists (select 1 from public.achievements where athlete_id = a_id and (badge_id like 'bieg-%' or badge_id in ('akcja-sponsor', 'pierwsza_z_pierwszych', 'pionier_biegamy'))) then
    raise exception 'FAIL 2b: chroniona odznaka u A po zapisach z przeglądarki'; end if;
  if not exists (select 1 from public.achievements where athlete_id = a_id and badge_id = zwykla) then raise exception 'FAIL 3b: zwykła odznaka z paczki nie weszła'; end if;
  n := n + 5;

  -- 5. funkcja SECURITY DEFINER (jak akcja_bieg_odznaka / akcja_deklaruj) wołana przez A — przechodzi
  execute 'create function public._test_odznaka_definer(p uuid, b text) returns integer language plpgsql security definer set search_path to ''public'', ''pg_temp'' as '
       || '$f$ declare k int; begin insert into public.achievements (athlete_id, badge_id) values (p, b); get diagnostics k = row_count; return k; end $f$';
  execute 'gr' || 'ant execute on function public._test_odznaka_definer(uuid, text) to authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a_u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public._test_odznaka_definer(a_id, 'pionier_biegamy');
  execute 'reset role';
  if k <> 1 then raise exception 'FAIL 5a: funkcja definer zatrzymana przez wyzwalacz'; end if;
  -- 6. migracja / właściciel bazy: przechodzi
  insert into public.achievements (athlete_id, badge_id) values (a_id, 'pierwsza_z_pierwszych');
  get diagnostics k = row_count;
  if k <> 1 then raise exception 'FAIL 6a: zapis właściciela bazy zatrzymany'; end if;
  -- 7. service_role (Edge Functions): przechodzi
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  insert into public.achievements (athlete_id, badge_id) values (a_id, 'bieg-test-zamka-odznak');
  get diagnostics k = row_count;
  execute 'reset role';
  if k <> 1 then raise exception 'FAIL 7a: service_role zatrzymany'; end if;
  -- 8. anon: nic
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    insert into public.achievements (athlete_id, badge_id) values (a_id, zwykla || '_anon');
    get diagnostics k = row_count;
    if k > 0 then raise exception 'FAIL 8a: anon wstawił odznakę'; end if;
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  n := n + 4;

  -- 9. strażnik: poza wierszami testu u A odznaki bez zmian
  if exists (select athlete_id, badge_id, earned_at from _odz_przed except select athlete_id, badge_id, earned_at from public.achievements)
     or exists (select 1 from public.achievements x where x.athlete_id <> a_id and not exists (select 1 from _odz_przed p where p.athlete_id = x.athlete_id and p.badge_id = x.badge_id)) then
    raise exception 'FAIL 9a: zmieniły się odznaki poza kontem testu'; end if;
  n := n + 1;

  raise exception 'TESTY ODZNAK CHRONIONYCH ZIELONE: % sprawdzeń (odznak przed testem: %)', n, (select count(*) from _odz_przed);
end $test$;
