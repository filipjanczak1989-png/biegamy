-- Test po skutku 20261216 (kolejność „Ukończyli”: najpierw ranking z miejscami w każdym dystansie, potem reszta od najnowszego ukończenia). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa), bieg próbny 'proba-kolejnosc' na 5 i 10 km (v6), pięć kont bez treningów z ostatnich 40 dni i dziecko jednego z nich; imiona wymyślone.
-- Na końcu prawdziwy bieg-mikolajki (gdy jest): tylko kształt kolejności, bez danych osób, w wyniku same liczby.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; b uuid; ka uuid[]; u uuid[] := '{}'; x uuid; v text; kol int[]; mie int[]; i int; nr int; jest_bez boolean;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v6';
  LISTA constant text := 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)';
begin
  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. uprawnienia: lista tylko dla service_role (EF bieg-ukonczyli)
  if has_function_privilege('anon', LISTA, 'execute') or has_function_privilege('authenticated', LISTA, 'execute') then raise exception 'FAIL 1a: lista dostępna z przeglądarki'; end if;
  if not has_function_privilege('service_role', LISTA, 'execute') then raise exception 'FAIL 1b: EF straciła listę'; end if;
  n := n + 2;

  -- 2. bieg próbny 5 i 10 km; numer: 1 Anna 5 km 25:00 (5 h temu) · 2 Bogna 5 km 22:00 (4 h) · 3 Celina 5 km 20:00 bez zgody na ranking (1 h)
  --    · 4 Dawid 10 km 50:00 (3 h) · 5 Ewa 5 km 25:00 (2 h, remis z Anną) · 6 dziecko Anny 1,5 km (30 min)
  select array_agg(y.id order by y.created_at, y.id) into ka
    from (select a.id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 5) y;
  if coalesce(array_length(ka, 1), 0) < 5 then raise exception 'FAIL 2-0: za mało kont do testu (5 kont bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-kolejnosc', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5,10}', 'otwarty', W) returning id into b;
  for i in 1..5 loop
    insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at)
      values (b, ka[i], 'ja', (array['Anna', 'Bogna', 'Celina', 'Dawid', 'Ewa'])[i], true, i, case when i = 4 then 10 else 5 end, W, case when i = 3 then null else now() end) returning id into x;
    u := u || x;
    insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
      values (ka[i], (array[5.1, 5, 5, 10, 5])[i], (array['25:00', '22:00', '20:00', '50:00', '25:00'])[i], 'Spokojny', 'Run', now() - interval '1 day', 'intervals', now() - interval '1 day');
    if (public.akcja_bieg_wynik_z_treningu(x, null)->>'ok')::boolean is not true then raise exception 'FAIL 2-1: wynik z treningu dla numeru %', i; end if;
    update public.akcja_bieg_uczestnicy set ukonczony_at = now() - make_interval(hours => (array[5, 4, 1, 3, 2])[i]) where id = x;
  end loop;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_wlasny_km, regulamin_wersja, oswiadczenie_rodzica_at, ukonczony_at)
    values (b, ka[1], 'dziecko', 'Zosia', true, 6, 1.5, W, now(), now() - interval '30 minutes');
  n := n + 1;

  -- 3. lista „Wszyscy” (jedyna przy jednym dystansie): ranking 5 km od 1. miejsca (remis: nowsze ukończenie wyżej), ranking 10 km, potem reszta od najnowszego
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-kolejnosc', 0, 50, null);
  execute 'reset role';
  select array_agg((e->>'numer')::int order by o), array_agg((e->>'miejsce')::int order by o) into kol, mie from jsonb_array_elements(j->'lista') with ordinality as t(e, o);
  if kol is distinct from array[2, 5, 1, 4, 6, 3] then raise exception 'FAIL 3a: kolejność „Wszyscy” % (oczekiwano {2,5,1,4,6,3})', kol; end if;
  if mie is distinct from array[1, 2, 2, 1, null, null]::int[] then raise exception 'FAIL 3b: miejsca % (oczekiwano {1,2,2,1,NULL,NULL})', mie; end if;
  if (j->>'razem')::int is distinct from 6 or (j->>'w_rankingu')::int is distinct from 4 then raise exception 'FAIL 3c: razem % / w rankingu %', j->>'razem', j->>'w_rankingu'; end if;
  n := n + 3;

  -- 4. stronicowanie: porcja od 2, po 2 = numery 1 i 4 (pozycje liczone na całej liście)
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-kolejnosc', 2, 2, null);
  execute 'reset role';
  select array_agg((e->>'numer')::int order by o) into kol from jsonb_array_elements(j->'lista') with ordinality as t(e, o);
  if kol is distinct from array[1, 4] then raise exception 'FAIL 4: porcja od 2 po 2 % (oczekiwano {1,4})', kol; end if;
  n := n + 1;

  -- 5. zakładka dystansu bez zmian: 5 km = ranking 5 km, potem reszta tego dystansu; 10 km = sam Dawid
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-kolejnosc', 0, 50, 5);
  jp := public.akcja_bieg_ukonczyli('proba-kolejnosc', 0, 50, 10);
  execute 'reset role';
  select array_agg((e->>'numer')::int order by o) into kol from jsonb_array_elements(j->'lista') with ordinality as t(e, o);
  if kol is distinct from array[2, 5, 1, 3] then raise exception 'FAIL 5a: zakładka 5 km % (oczekiwano {2,5,1,3})', kol; end if;
  select array_agg((e->>'numer')::int order by o) into kol from jsonb_array_elements(jp->'lista') with ordinality as t(e, o);
  if kol is distinct from array[4] then raise exception 'FAIL 5b: zakładka 10 km % (oczekiwano {4})', kol; end if;
  n := n + 2;

  -- 6. prawdziwy bieg (gdy jest): wszystkie wiersze z miejscem przed wierszami bez miejsca, miejsca w dystansie rosną; w wyniku same liczby
  if exists (select 1 from public.akcja_biegi where slug = 'bieg-mikolajki') then
    execute 'set local role service_role';
    j := public.akcja_bieg_ukonczyli('bieg-mikolajki', 0, 100, null);
    execute 'reset role';
    jest_bez := false; nr := 0; jp := null;
    for i in 0 .. coalesce(jsonb_array_length(j->'lista'), 0) - 1 loop
      if j->'lista'->i->>'miejsce' is null then jest_bez := true;
      elsif jest_bez then raise exception 'FAIL 6a: bieg-mikolajki: wiersz z miejscem po wierszu bez miejsca (pozycja %)', i + 1;
      elsif jp is not null and (j->'lista'->i->>'dystans_km')::numeric < (jp #>> '{}')::numeric then raise exception 'FAIL 6b: bieg-mikolajki: dystanse rankingu nie rosną (pozycja %)', i + 1;
      elsif (j->'lista'->i->'dystans_km') = jp and (j->'lista'->i->>'miejsce')::int < nr then raise exception 'FAIL 6b: bieg-mikolajki: miejsca w dystansie nie rosną (pozycja %)', i + 1;
      else nr := (j->'lista'->i->>'miejsce')::int; jp := j->'lista'->i->'dystans_km'; end if;
    end loop;
    raise notice 'bieg-mikolajki: % na liście, % w rankingu', j->>'razem', j->>'w_rankingu';
    n := n + 2;
  end if;

  raise exception 'TESTY KOLEJNOSCI UKONCZYLI ZIELONE: % sprawdzeń', n;
end $test$;
