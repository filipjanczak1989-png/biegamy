-- Test po skutku (bez migracji, 19.11, blizna-305): wynik z treningu bez ważnego czasu i poprawa czasu w tym treningu.
-- Wyzwalacz z 20261212 (trg_akcja_bieg_trening_zmieniony, after update of duration) ma przeliczyć wynik z tego samego treningu. W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa), bieg próbny 'proba-czas-poprawa' na 5 km (regulamin z bieżącego biegu-wzorca v6), dwa konta bez treningów z 40 dni; imiona wymyślone.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; k jsonb; e jsonb; b uuid; ka uuid[]; ku uuid[]; uA uuid; uB uuid; lA uuid; lB uuid; v jsonb;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date;
begin
  -- 0. strażnik: licznik prawdziwej ulicy bez zmian
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne'; end if;
  n := n + 1;

  -- 1. bieg próbny, dwa zapisy ze zgodą na ranking; treningi 14 km z czasem „1” (jak nr 10) i 6 km bez czasu
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 2) y;
  if coalesce(array_length(ka, 1), 0) < 2 then raise exception 'FAIL 1-0: za mało kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-czas-poprawa', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', '2026-11-v6') returning id into b;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[1], 'ja', 'Anna', true, 1, 5, '2026-11-v6', now()) returning id into uA;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[2], 'ja', 'Bogna', true, 2, 5, '2026-11-v6', now()) returning id into uB;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 14, '1', 'Spacer', null, now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lA;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 6, null, 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lB;
  foreach v in array array[to_jsonb(uA), to_jsonb(uB)] loop
    if (public.akcja_bieg_wynik_z_treningu((v #>> '{}')::uuid, null)->>'ok')::boolean is not true then raise exception 'FAIL 1-1: wynik z treningu'; end if;
  end loop;
  if exists (select 1 from public.akcja_bieg_uczestnicy where id in (uA, uB) and (ukonczony_at is null or wynik_s is not null)) then raise exception 'FAIL 1a: przed poprawą ukończone bez czasu'; end if;
  n := n + 1;

  -- 2. „moje zapisy” przed poprawą: trening jest (wynik_trening_km), czasu nie ma — karta pokaże „Popraw czas w treningu…”
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-czas-poprawa');
  e := public.akcja_bieg_treningi_z_okna('proba-czas-poprawa');
  execute 'reset role';
  if k->0->'wynik_s' <> 'null'::jsonb or (k->0->>'wynik_trening_km')::numeric is distinct from 14 then raise exception 'FAIL 2a: moje zapisy przed poprawą: %', k; end if;
  if (e->0->>'km')::numeric is distinct from 14 or (e->0->>'czas_s')::int is distinct from 1 or e->0->>'dzien' is null then raise exception 'FAIL 2b: treningi z okna (link do dnia): %', e; end if;
  n := n + 2;

  -- 3. poprawa czasu w treningu: wyzwalacz przelicza wynik z tego samego treningu (bez nowego wskazania)
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);   -- poprawia właściciel (strażnik training_logs z 20260906)
  update public.training_logs set duration = '2:50:00' where id = lA;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  update public.training_logs set duration = '33:00' where id = lB;
  if (select wynik_s from public.akcja_bieg_uczestnicy where id = uA) is distinct from 10200 or (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uA) is distinct from lA
     or (select wynik_wskazany from public.akcja_bieg_uczestnicy where id = uA) is not false then raise exception 'FAIL 3a: 14 km po poprawie: wynik 2:50:00 z tego samego treningu, bez wskazania'; end if;
  if (select wynik_s from public.akcja_bieg_uczestnicy where id = uB) is distinct from 1980 then raise exception 'FAIL 3b: 6 km po dopisaniu czasu: 33:00'; end if;
  n := n + 2;

  -- 4. lista: czas na 5 km (v6: z tempa z 14 km, 6 km) i ranking z miejscami
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-czas-poprawa', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if (e->>'czas_s')::int is distinct from 1650 or (e->>'miejsce')::int is distinct from 1 then raise exception 'FAIL 4a: 6 km w 33:00 = 27:30 z tempa, miejsce 1: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
  if (e->>'czas_s')::int is distinct from 3643 or (e->>'miejsce')::int is distinct from 2 then raise exception 'FAIL 4b: 14 km w 2:50:00 = 1:00:43 z tempa, miejsce 2: %', e; end if;
  n := n + 2;

  raise exception 'TESTY POPRAWY CZASU ZIELONE: % sprawdzeń', n;
end $test$;
