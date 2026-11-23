-- Test po skutku 20261225 (przełącznik nowego Dziś, E0). W transakcji z .sh, zawsze wycofanej. Nie wypisuje kont, tylko numer kroku i liczbę sprawdzeń.
-- Odpowiedź RPC jako konkretne konto sprawdza pomocnicza funkcja tworzona w tej transakcji (znika z wycofaniem).
create function public._test_dzis_jako(u uuid, rola text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', rola)::text end, true);
  execute format('set local role %I', rola);
  v := public.dzis_wersja();
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $f$;

do $test$
declare
  n int := 0; a uuid; b uuid; v text;
begin
  -- 0. struktura: dwie tabele i funkcja; funkcja security definer ze stałą search_path; z przeglądarki tylko EXECUTE dla zalogowanych;
  --    tabele bez uprawnień i bez polityk; lista kont kasowana razem z kontem (ON DELETE CASCADE do auth.users)
  if to_regclass('public.dzis_ustawienia') is null or to_regclass('public.dzis_nowe_konta') is null or to_regprocedure('public.dzis_wersja()') is null then
    raise exception 'FAIL 0a: brak tabel albo funkcji (migracja 20261225 nie weszła)'; end if;
  if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.dzis_wersja()')) then raise exception 'FAIL 0b: funkcja nie jest security definer'; end if;
  if coalesce((select array_to_string(p.proconfig, ',') from pg_proc p where p.oid = to_regprocedure('public.dzis_wersja()')), '') not like '%search_path=public, pg_temp%' then
    raise exception 'FAIL 0c: funkcja bez stałej search_path'; end if;
  if has_function_privilege('anon', 'public.dzis_wersja()', 'execute') or not has_function_privilege('authenticated', 'public.dzis_wersja()', 'execute') then
    raise exception 'FAIL 0d: uprawnienia funkcji (anon nie, authenticated tak)'; end if;
  if has_table_privilege('anon', 'public.dzis_ustawienia', 'select, insert, update, delete') or has_table_privilege('authenticated', 'public.dzis_ustawienia', 'select, insert, update, delete')
     or has_table_privilege('anon', 'public.dzis_nowe_konta', 'select, insert, update, delete') or has_table_privilege('authenticated', 'public.dzis_nowe_konta', 'select, insert, update, delete') then
    raise exception 'FAIL 0e: tabele przełącznika dostępne z przeglądarki'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('dzis_ustawienia', 'dzis_nowe_konta')) then raise exception 'FAIL 0f: polityki na tabelach przełącznika'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dzis_nowe_konta'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass and confdeltype = 'c') then
    raise exception 'FAIL 0g: lista kont bez ON DELETE CASCADE do auth.users'; end if;
  n := n + 7;

  -- 1. dwa konta z logowaniem (nie wypisujemy); stan wyjściowy w tej transakcji: wyłączone, A i B poza listą
  select u.id into a from auth.users u order by u.created_at, u.id limit 1;
  select u.id into b from auth.users u where u.id <> a order by u.created_at, u.id limit 1;
  if a is null or b is null then raise exception 'FAIL 1: za mało kont do testu'; end if;
  delete from public.dzis_nowe_konta where user_id in (a, b);
  update public.dzis_ustawienia set wartosc = 'false' where klucz in ('nowe_wlaczone', 'nowe_dla_wszystkich');
  n := n + 1;

  -- 2. A na liście, ale przełącznik wyłączony → stary
  insert into public.dzis_nowe_konta (user_id, kto) values (a, 'test');
  if public._test_dzis_jako(a, 'authenticated') <> 'stary' then raise exception 'FAIL 2: wyłączony przełącznik, a A dostaje nowy'; end if;
  n := n + 1;

  -- 3. włączone: A (na liście) → nowy, B (poza listą) → stary, bez sesji → stary
  update public.dzis_ustawienia set wartosc = 'true' where klucz = 'nowe_wlaczone';
  if public._test_dzis_jako(a, 'authenticated') <> 'nowy' then raise exception 'FAIL 3a: A na liście nie dostaje nowego'; end if;
  if public._test_dzis_jako(b, 'authenticated') <> 'stary' then raise exception 'FAIL 3b: B spoza listy dostaje nowy'; end if;
  if public.dzis_wersja() <> 'stary' then raise exception 'FAIL 3c: bez sesji nowy'; end if;
  n := n + 3;

  -- 4. POWRÓT jednym poleceniem (bez migracji): nowe_wlaczone = false → A stary
  update public.dzis_ustawienia set wartosc = 'false' where klucz = 'nowe_wlaczone';
  if public._test_dzis_jako(a, 'authenticated') <> 'stary' then raise exception 'FAIL 4: po wyłączeniu A dalej nowy'; end if;
  n := n + 1;

  -- 5. dla wszystkich: nowe_wlaczone + nowe_dla_wszystkich → B nowy; samo nowe_dla_wszystkich bez nowe_wlaczone → stary
  update public.dzis_ustawienia set wartosc = 'true' where klucz = 'nowe_dla_wszystkich';
  if public._test_dzis_jako(b, 'authenticated') <> 'stary' then raise exception 'FAIL 5a: dla_wszystkich bez wlaczone daje nowy'; end if;
  update public.dzis_ustawienia set wartosc = 'true' where klucz = 'nowe_wlaczone';
  if public._test_dzis_jako(b, 'authenticated') <> 'nowy' then raise exception 'FAIL 5b: dla_wszystkich nie obejmuje B'; end if;
  n := n + 2;

  -- 6. z przeglądarki: zalogowany nie czyta ani nie pisze tabel; anon nie woła funkcji
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform 1 from public.dzis_ustawienia limit 1;
    raise exception 'FAIL 6a: zalogowany czyta dzis_ustawienia';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.dzis_nowe_konta (user_id, kto) values (b, 'test');
    raise exception 'FAIL 6b: zalogowany dopisuje konto do listy';
  exception when insufficient_privilege then null; end;
  begin
    update public.dzis_ustawienia set wartosc = 'true' where klucz = 'nowe_dla_wszystkich';
    raise exception 'FAIL 6c: zalogowany przełącza ustawienia';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    perform public.dzis_wersja();
    raise exception 'FAIL 6d: anon woła dzis_wersja';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 4;

  raise exception 'TESTY PRZEŁĄCZNIKA DZIŚ ZIELONE: % sprawdzeń', n;
end $test$;
