-- Test po skutku 20261210 (kamienie milowe co 1000 km: akcja_progi, cron akcja-progi, pole prog w akcja_licznik). W transakcji z .sh, zawsze wycofanej.
-- Akcje próbne „test-progi-*” i ich kamienie tylko w tej transakcji. now() jest w transakcji stałe: „48 h temu” ustawiamy, przesuwając przekroczony_at.
-- Z flagą (_z_migracja, migracja w tej samej transakcji) historia prawdziwej ulicy porównana z niezależnym odtworzeniem z training_logs.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; t uuid; u uuid; w uuid; x uuid; v text; s numeric; c numeric; ile int; k numeric[]; r record; o jsonb;
  flaga constant boolean := to_regclass('pg_temp._z_migracja') is not null;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date;
  KOTWICA constant text := '''prog'', public.akcja_prog_publiczny(a.id)';
begin
  if to_regclass('public.akcja_progi') is null then raise exception 'FAIL 1: brak tabeli akcja_progi (migracja 20261210 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy poza polem prog identyczny przed i po migracji; suma km i procent te same
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j - 'prog') is distinct from (jp - 'prog') then raise exception 'FAIL 0: licznik prawdziwej ulicy zmienił się po migracji (poza polem prog)'; end if;
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') or j->'suma_km' is null then raise exception 'FAIL 0a: suma km albo procent inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  if flaga and jp ? 'prog' then raise exception 'FAIL 0b: licznik miał pole prog jeszcze przed migracją'; end if;
  if not (j ? 'prog') then raise exception 'FAIL 0c: licznik bez pola prog'; end if;
  n := n + 4;

  -- 1. struktura, uprawnienia, cron
  if not (select c2.relrowsecurity from pg_class c2 where c2.oid = 'public.akcja_progi'::regclass) then raise exception 'FAIL 1a: akcja_progi bez RLS'; end if;
  if has_table_privilege('anon', 'public.akcja_progi', 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', 'public.akcja_progi', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'FAIL 1b: akcja_progi dostępna z przeglądarki'; end if;
  foreach v in array array['public.akcja_progi_zapisz()', 'public.akcja_prog_publiczny(uuid)', 'public.akcja_progi_lista(numeric, numeric)'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1c: % dostępna z przeglądarki', v; end if;
  end loop;
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_licznik(text)', 'execute')
     or not has_function_privilege('service_role', 'public.akcja_licznik(text)', 'execute') then raise exception 'FAIL 1d: uprawnienia akcja_licznik inne niż przed migracją'; end if;
  v := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  if (length(v) - length(replace(v, KOTWICA, ''))) / length(KOTWICA) <> 1 then raise exception 'FAIL 1e: akcja_licznik bez jednego pola prog'; end if;
  if not exists (select 1 from cron.job cj where cj.jobname = 'akcja-progi' and cj.schedule = '*/5 * * * *' and cj.command ~ 'select public\.akcja_progi_zapisz\(\)') then
    raise exception 'FAIL 1f: brak crona akcja-progi co 5 min'; end if;
  n := n + 6;

  -- 2. prawdziwa ulica: kamienie = pełne tysiące ≤ suma poniżej celu (+ cel); chwile rosną, żadna w przyszłości
  select a.id, a.cel_km into t, c from public.akcje a where a.slug = 'dla-fabianka';
  ile := public.akcja_progi_zapisz();
  if flaga and ile <> 0 then raise exception 'FAIL 2a: cron zaraz po migracji dopisał % kamieni (historia niepełna)', ile; end if;
  s := (public.akcja_licznik('dla-fabianka')->>'suma_km')::numeric;
  select array_agg(p order by p) into k from public.akcja_progi_lista(c, s) p;
  if (select array_agg(p.prog_km order by p.prog_km) from public.akcja_progi p where p.akcja_id = t) is distinct from k then
    raise exception 'FAIL 2b: kamienie ulicy % zamiast % (suma %)', (select array_agg(p.prog_km order by p.prog_km) from public.akcja_progi p where p.akcja_id = t), k, s; end if;
  if exists (select 1 from (select p.przekroczony_at, lag(p.przekroczony_at) over (order by p.prog_km) poprz from public.akcja_progi p where p.akcja_id = t) y
              where y.przekroczony_at < y.poprz or y.przekroczony_at > now()) then raise exception 'FAIL 2c: chwile kamieni ulicy nie rosną albo są w przyszłości'; end if;
  n := n + 3;
  if flaga then
    -- niezależne odtworzenie: wkład wpisu = min(limit, dzień do wpisu włącznie) − min(limit, dzień przed wpisem); kolejność created_at
    for r in
      with a as (select a2.* from public.akcje a2 where a2.id = t),
      l as (select l2.id, l2.created_at, l2.distance_km,
                   case when l2.athlete_id = any(coalesce(a.wyprawa_athlete_ids, '{}'::uuid[])) then a.cap_km_doba_wyprawa else a.cap_km_doba end lim,
                   coalesce(sum(l2.distance_km) over (partition by l2.athlete_id, (l2.logged_at at time zone 'Europe/Warsaw')::date order by l2.created_at, l2.id rows between unbounded preceding and 1 preceding), 0) przed
              from public.training_logs l2, a
             where l2.distance_km > 0 and coalesce(l2.training_type, '') not like '\_\_badge\_\_%' and public.akcja_typ_liczy(l2.training_type, l2.external_type)
               and (l2.logged_at at time zone 'Europe/Warsaw')::date between a.start and least(coalesce(a.koniec, DZIS), DZIS)),
      z as (select l.created_at, sum(least(l.lim, l.przed + l.distance_km) - least(l.lim, l.przed)) over (order by l.created_at, l.id rows unbounded preceding) narast from l)
      select p.prog_km, p.przekroczony_at, p.zrodlo, (select min(z.created_at) from z where z.narast >= p.prog_km) oczek, (select round(max(z.narast), 2) from z) razem
        from public.akcja_progi p where p.akcja_id = t order by p.prog_km
    loop
      if r.razem is distinct from s then raise exception 'FAIL 2d: odtworzenie daje % km, licznik %', r.razem, s; end if;
      if r.zrodlo <> 'historia' or r.przekroczony_at is distinct from r.oczek then raise exception 'FAIL 2e: kamień % z chwilą % (%), z historii wychodzi %', r.prog_km, r.przekroczony_at, r.zrodlo, r.oczek; end if;
    end loop;
    n := n + 2;
  end if;

  -- 3. licznik ulicy: prog = ostatni kamień, tylko gdy od przekroczenia < 48 h
  o := public.akcja_licznik('dla-fabianka')->'prog';
  select p.* into r from public.akcja_progi p where p.akcja_id = t order by p.prog_km desc limit 1;
  if r is null or r.przekroczony_at <= now() - interval '48 hours' then
    if o is distinct from 'null'::jsonb then raise exception 'FAIL 3a: licznik ulicy pokazuje kamień % po 48 h', o; end if;
  elsif (o->>'km')::numeric is distinct from r.prog_km or (o->>'at')::timestamptz is distinct from r.przekroczony_at or (o->>'cel')::boolean is distinct from (r.prog_km >= c) then
    raise exception 'FAIL 3b: licznik ulicy: % zamiast kamienia %', o, r.prog_km;
  end if;
  n := n + 1;

  -- 4. akcja próbna (testowa, bez kont: suma = proba_sym_km)
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, konta_testowe, wystartowala_at, proba_sym_km)
    values ('test-progi-a', 'Test kamieni', DZIS - 3, 12500, 10, true, '{}', now() - interval '1 day', 999) returning id into u;
  ile := public.akcja_progi_zapisz();
  if ile <> 0 or exists (select 1 from public.akcja_progi where akcja_id = u) or (public.akcja_licznik('test-progi-a')->'prog') is distinct from 'null'::jsonb then raise exception 'FAIL 4a: 999 km dało kamień'; end if;
  update public.akcje set proba_sym_km = 1000 where id = u;
  ile := public.akcja_progi_zapisz();
  o := public.akcja_licznik('test-progi-a')->'prog';
  if ile <> 1 or (select array_agg(prog_km::text || ':' || zrodlo || ':' || (przekroczony_at = now())::text) from public.akcja_progi where akcja_id = u) is distinct from array['1000:cron:true']
     or o is distinct from jsonb_build_object('km', 1000, 'at', now(), 'cel', false) then raise exception 'FAIL 4b: 1000 km: % kamieni, licznik %', ile, o; end if;
  update public.akcja_progi set przekroczony_at = now() - interval '1 hour' where akcja_id = u;
  ile := public.akcja_progi_zapisz();
  if ile <> 0 or (select przekroczony_at from public.akcja_progi where akcja_id = u and prog_km = 1000) is distinct from now() - interval '1 hour' then raise exception 'FAIL 4c: kamień 1000 zapisany drugi raz albo z nową chwilą'; end if;
  update public.akcje set proba_sym_km = 3500 where id = u;
  ile := public.akcja_progi_zapisz();
  if ile <> 2 or (select array_agg(prog_km order by prog_km) from public.akcja_progi where akcja_id = u) is distinct from array[1000, 2000, 3000]::numeric[]
     or (public.akcja_licznik('test-progi-a')->'prog'->>'km')::numeric is distinct from 3000 then raise exception 'FAIL 4d: 3500 km: % nowych, licznik %', ile, public.akcja_licznik('test-progi-a')->'prog'; end if;
  n := n + 4;
  -- 48 h od przekroczenia; po 48 h nic, choć kamień 2000 jest „świeższy” (pokazujemy tylko ostatni)
  update public.akcja_progi set przekroczony_at = now() - interval '47 hours 59 minutes' where akcja_id = u and prog_km = 3000;
  if (public.akcja_licznik('test-progi-a')->'prog'->>'km')::numeric is distinct from 3000 then raise exception 'FAIL 4e: kamień 3000 zniknął przed 48 h'; end if;
  update public.akcja_progi set przekroczony_at = now() - interval '48 hours' where akcja_id = u and prog_km = 3000;
  if (public.akcja_licznik('test-progi-a')->'prog') is distinct from 'null'::jsonb then raise exception 'FAIL 4f: po 48 h licznik pokazuje %', public.akcja_licznik('test-progi-a')->'prog'; end if;
  n := n + 2;
  -- cel 12 500 = ostatni kamień; nic ponad cel
  update public.akcje set proba_sym_km = 12499.99 where id = u;
  perform public.akcja_progi_zapisz();
  if (select count(*) from public.akcja_progi where akcja_id = u) <> 12 or (public.akcja_licznik('test-progi-a')->'prog') is distinct from jsonb_build_object('km', 12000, 'at', now(), 'cel', false) then
    raise exception 'FAIL 4g: 12 499,99 km: % kamieni, licznik %', (select count(*) from public.akcja_progi where akcja_id = u), public.akcja_licznik('test-progi-a')->'prog'; end if;
  update public.akcje set proba_sym_km = 12500 where id = u;
  perform public.akcja_progi_zapisz();
  if (select count(*) from public.akcja_progi where akcja_id = u) <> 13 or (public.akcja_licznik('test-progi-a')->'prog') is distinct from jsonb_build_object('km', 12500, 'at', now(), 'cel', true) then
    raise exception 'FAIL 4h: cel 12 500: licznik %', public.akcja_licznik('test-progi-a')->'prog'; end if;
  update public.akcje set proba_sym_km = 13600 where id = u;
  perform public.akcja_progi_zapisz();
  if (select count(*) from public.akcja_progi where akcja_id = u) <> 13 then raise exception 'FAIL 4i: kamień ponad cel'; end if;
  n := n + 3;
  -- próba: reset sumy kasuje kamienie powyżej, świętowanie da się powtórzyć
  update public.akcje set proba_sym_km = 500 where id = u;
  perform public.akcja_progi_zapisz();
  if exists (select 1 from public.akcja_progi where akcja_id = u) then raise exception 'FAIL 4j: reset próby zostawił kamienie'; end if;
  update public.akcje set proba_sym_km = 1000 where id = u;
  perform public.akcja_progi_zapisz();
  if (public.akcja_licznik('test-progi-a')->'prog'->>'km')::numeric is distinct from 1000 then raise exception 'FAIL 4k: po resecie próby kamień 1000 nie wrócił'; end if;
  n := n + 2;

  -- 5. prawdziwa akcja: raz zapisany kamień zostaje, choć suma spadła; akcja przed startem bez kamieni
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('test-progi-b', 'Test kamieni B', DZIS + 30, 12500, 10, false, now() - interval '1 day') returning id into w;
  insert into public.akcja_progi (akcja_id, prog_km, przekroczony_at, zrodlo) values (w, 1000, now() - interval '10 days', 'historia');
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, konta_testowe, proba_sym_km)
    values ('test-progi-c', 'Test kamieni C', DZIS - 3, 12500, 10, true, '{}', 5000) returning id into x;
  ile := public.akcja_progi_zapisz();
  if ile <> 0 or not exists (select 1 from public.akcja_progi where akcja_id = w and prog_km = 1000) then raise exception 'FAIL 5a: kamień prawdziwej akcji skasowany przy sumie 0'; end if;
  if (public.akcja_licznik('test-progi-b')->'prog') is distinct from 'null'::jsonb then raise exception 'FAIL 5b: kamień sprzed 10 dni w liczniku'; end if;
  if exists (select 1 from public.akcja_progi where akcja_id = x) then raise exception 'FAIL 5c: akcja przed startem dostała kamienie'; end if;
  n := n + 3;

  -- 6. lista kamieni
  if (select count(*) from public.akcja_progi_lista(12500, 999.99)) <> 0 or (select array_agg(p order by p) from public.akcja_progi_lista(3000, 5000) p) is distinct from array[1000, 2000, 3000]::numeric[]
     or (select array_agg(p order by p) from public.akcja_progi_lista(12000, 12000) p) is distinct from array[1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000]::numeric[] then
    raise exception 'FAIL 6: lista kamieni'; end if;
  n := n + 1;

  raise exception 'TESTY KAMIENI ZIELONE: % sprawdzeń', n;
end $test$;
