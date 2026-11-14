-- Test po skutku 20261130 (regulamin_od w polu `bieg` licznika). W transakcji z .sh, zawsze wycofanej. Bieg próbny tylko w tej transakcji.
do $test$
declare b uuid; j jsonb; k jsonb; DZIS date := (now() at time zone 'Europe/Warsaw')::date; W text := '2026-11-v1';
begin
  -- 0. strażnik: prawdziwa ulica identyczna przed i po (prawdziwy bieg w szkicu nie wychodzi w liczniku), obie drogi produkcji
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_licznik('dla-fabianka') is distinct from (select t.j from _licznik_przed t) then raise exception 'FAIL 0: licznik prawdziwej ulicy zmienił się po migracji (service_role)'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', (select sub from _konto_straznika), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.akcja_licznik('dla-fabianka') is distinct from (select t.j from _licznik_przed_zal t) then raise exception 'FAIL 0b: licznik prawdziwej ulicy zmienił się po migracji (authenticated)'; end if;
  execute 'reset role';

  -- 1. kolumna
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'akcja_biegi' and column_name = 'regulamin_od' and data_type = 'date') then raise exception 'FAIL 1: brak kolumny regulamin_od (date)'; end if;

  -- 2. bieg próbny z datą: klucz w polu `bieg` (funkcja publiczna i licznik akcji próbnej)
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja, regulamin_od)
    values ('proba', 'proba-bieg', 'Bieg próbny', DZIS + 2, DZIS + 3, DZIS + 6, '{5,10}', 'otwarty', W, date '2026-11-18') returning id into b;
  j := public.akcja_bieg_publiczny('proba');
  if j->>'regulamin_od' is distinct from '2026-11-18' or j->>'regulamin_wersja' <> W then raise exception 'FAIL 2: akcja_bieg_publiczny: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  k := public.akcja_licznik('proba');
  execute 'reset role';
  if k->'bieg'->>'regulamin_od' is distinct from '2026-11-18' then raise exception 'FAIL 2b: licznik akcji próbnej bez regulamin_od: %', k->'bieg'; end if;

  -- 3. brak daty = klucz jest, wartość null (strona: „WKRÓTCE”)
  update public.akcja_biegi set regulamin_od = null where id = b;
  j := public.akcja_bieg_publiczny('proba');
  if not (j ? 'regulamin_od') or j->'regulamin_od' <> 'null'::jsonb then raise exception 'FAIL 3: pusta data: %', j; end if;

  -- 4. jedyna zmiana pola `bieg`: doszedł jeden klucz (porównanie z definicją sprzed migracji robi .sh: _klucze_przed)
  if (select array_agg(x order by x) from jsonb_object_keys(j) x) is distinct from (select array_agg(x order by x) from (select unnest(t.klucze) x from _klucze_przed t union all select 'regulamin_od') y)
    then raise exception 'FAIL 4: klucze pola bieg: %', (select array_agg(x order by x) from jsonb_object_keys(j) x); end if;

  -- 5. uprawnienia po create or replace: funkcja nadal niedostępna dla ról klienckich i nadal SECURITY DEFINER
  if has_function_privilege('anon', 'public.akcja_bieg_publiczny(text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_publiczny(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.akcja_bieg_publiczny(text)', 'EXECUTE') then raise exception 'FAIL 5: akcja_bieg_publiczny wykonywalna dla roli klienckiej'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.akcja_bieg_publiczny(text)'::regprocedure) then raise exception 'FAIL 5b: akcja_bieg_publiczny nie jest SECURITY DEFINER'; end if;

  raise exception 'TESTY REGULAMIN_OD ZIELONE: 9';
end $test$;
