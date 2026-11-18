-- Test po skutku 20261213 (czas dłuższego treningu na liście bez miejsca; szczegóły wyniku w panelu organizatora). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa), bieg próbny 'proba-czas', zapisy i treningi tylko tutaj; cztery konta bez treningów z ostatnich 40 dni i jeden trener; imiona wymyślone.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; k jsonb; e jsonb; b uuid; tr uuid; ka uuid[]; ku uuid[]; uA uuid; uB uuid; uC uuid; uD uuid; uz uuid; lA uuid; lB uuid; lC uuid; lD uuid; v text;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v4';
begin
  if to_regprocedure('public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi)') is null then raise exception 'FAIL 1: brak akcja_bieg_czas_bez_miejsca (migracja 20261213 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. uprawnienia: nowe funkcje bez przeglądarki; lista tylko service_role (EF); panel tylko zalogowani (bramka trenera w środku)
  foreach v in array array['public.akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'public.akcja_bieg_zrodlo_wyniku(public.akcja_bieg_uczestnicy)', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1a: % dostępna z przeglądarki', v; end if;
  end loop;
  if not has_function_privilege('service_role', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'execute') then raise exception 'FAIL 1b: EF straciła listę'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_panel(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_panel(text)', 'execute') then raise exception 'FAIL 1c: uprawnienia panelu'; end if;
  n := n + 5;

  -- 2. bieg próbny 5 km, cztery zapisy „ja” i dziecko
  select c.id into tr from public.coaches c limit 1;
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 4) y;
  if tr is null or coalesce(array_length(ka, 1), 0) < 4 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 4 konta bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-czas', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W) returning id into b;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[1], 'ja', 'Anna', true, 1, 5, W, now()) returning id into uA;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[2], 'ja', 'Bogna', true, 2, 5, W, now()) returning id into uB;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (b, ka[3], 'ja', 'Celina', true, 3, 5, W) returning id into uC;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b, ka[4], 'ja', 'Dawid', true, 4, 5, W, now()) returning id into uD;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, oswiadczenie_rodzica_at, regulamin_wersja, dystans_wlasny_km, ukonczony_at) values (b, ka[1], 'dziecko', 'Zosia', true, 5, now(), W, 1.0, now()) returning id into uz;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 5.2, '26:00', 'Spokojny', 'Run', now() - interval '3 days', 'intervals', now() - interval '3 days') returning id into lA;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 10.2, '52:10', 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lB;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[3], 6.0, '33:00', 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lC;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[4], 6.0, '15:00', 'Spokojny', 'Run', now() - interval '1 day', 'manual', now() - interval '1 day') returning id into lD;
  foreach v in array array[uA::text, uB::text, uC::text, uD::text] loop
    if (public.akcja_bieg_wynik_z_treningu(v::uuid, null)->>'ok')::boolean is not true then raise exception 'FAIL 2-1: wynik z treningu dla %', v; end if;
  end loop;

  -- 3. lista publiczna: miejsce tylko 5,00–5,49 km; dłuższy trening ze zgodą = czas i prawdziwy dystans bez miejsca; bez zgody, do weryfikacji, dziecko = bez czasu
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-czas', 0, 50, null);
  jp := public.akcja_bieg_ukonczyli('proba-czas', 0, 50, 5);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
  if (e->>'czas_s')::int is distinct from 1560 or (e->>'miejsce')::int is distinct from 1 or e ? 'trening_km' then raise exception 'FAIL 3a: 5,2 km z zegarka: czas i miejsce: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if (e->>'czas_s')::int is distinct from 3130 or (e->>'trening_km')::numeric is distinct from 10.2 or e ? 'miejsce' or (e->>'reczny')::boolean is not true then raise exception 'FAIL 3b: 10,2 km ze zgodą: czas i dystans bez miejsca: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 3;
  if e is null or e ? 'czas_s' or e ? 'trening_km' or e ? 'miejsce' then raise exception 'FAIL 3c: bez zgody na ranking czas na liście: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 4;
  if e is null or e ? 'czas_s' or e ? 'trening_km' then raise exception 'FAIL 3d: tempo do weryfikacji, czas przed zatwierdzeniem: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 5;
  if e is null or e ? 'czas_s' or e ? 'trening_km' then raise exception 'FAIL 3e: dziecko z czasem: %', e; end if;
  if (j->>'w_rankingu')::int <> 1 or (jp->>'w_rankingu')::int <> 1 then raise exception 'FAIL 3f: w rankingu tylko 5,00–5,49 km: % / %', j->'w_rankingu', jp->'w_rankingu'; end if;
  select x into e from jsonb_array_elements(jp->'lista') x where (x->>'numer')::int = 2;
  if (e->>'czas_s')::int is distinct from 3130 or e ? 'miejsce' or (jp->'lista'->0->>'numer')::int <> 1 then raise exception 'FAIL 3g: lista 5 km: na górze miejsce 1, dłuższy bez miejsca: %', jp; end if;
  update public.akcja_bieg_uczestnicy set weryfikacja = 'zatwierdzony', weryfikacja_at = now(), weryfikacja_przez = tr where id = uD;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-czas', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 4;
  if (e->>'czas_s')::int is distinct from 900 or (e->>'trening_km')::numeric is distinct from 6 or e ? 'miejsce' then raise exception 'FAIL 3h: po zatwierdzeniu czas bez miejsca: %', e; end if;
  update public.akcja_bieg_uczestnicy set weryfikacja = 'odrzucony' where id = uD;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-czas', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 4;
  if e ? 'czas_s' then raise exception 'FAIL 3i: odrzucony wynik z czasem: %', e; end if;
  -- regulamin v3 w bazie (przed 34f): czasu bez miejsca nie ma; ranking z miejscem jak dotąd
  update public.akcja_biegi set regulamin_wersja = '2026-11-v3' where id = b;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-czas', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if e ? 'czas_s' or e ? 'trening_km' then raise exception 'FAIL 3j: przy regulaminie v3 czas dłuższego treningu na liście: %', e; end if;
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1;
  if (e->>'miejsce')::int is distinct from 1 then raise exception 'FAIL 3k: przy v3 ranking z miejscem zniknął: %', e; end if;
  update public.akcja_biegi set regulamin_wersja = W where id = b;
  n := n + 11;

  -- 4. panel organizatora: czas, prawdziwy dystans treningu i źródło, także bez zgody na ranking; dziecko i bez wyniku bez tych pól
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-czas');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 1;
  if (e->>'wynik_s')::int is distinct from 1560 or (e->>'trening_km')::numeric is distinct from 5.2 or e->>'zrodlo' is distinct from 'zegarek' then raise exception 'FAIL 4a: panel, zegarek: %', e; end if;
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 2;
  if (e->>'wynik_s')::int is distinct from 3130 or (e->>'trening_km')::numeric is distinct from 10.2 or e->>'zrodlo' is distinct from 'wpis ręczny' then raise exception 'FAIL 4b: panel, wpis ręczny: %', e; end if;
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 3;
  if (e->>'wynik_s')::int is distinct from 1980 or (e->>'trening_km')::numeric is distinct from 6 then raise exception 'FAIL 4c: panel pokazuje wynik także bez zgody na ranking: %', e; end if;
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 5;
  if e->'wynik_s' <> 'null'::jsonb or e->'trening_km' <> 'null'::jsonb or e->'zrodlo' <> 'null'::jsonb then raise exception 'FAIL 4d: dziecko w panelu z polami wyniku: %', e; end if;
  update public.akcja_bieg_uczestnicy set zaliczony_przez = tr, wynik_log_id = null where id = uC;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-czas');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 3;
  if e->>'zrodlo' is distinct from 'organizator' or (e->>'trening_km')::numeric is distinct from 5 then raise exception 'FAIL 4e: zaliczenie przez organizatora: %', e; end if;
  n := n + 5;

  raise exception 'TESTY CZASU BEZ MIEJSCA ZIELONE: % sprawdzeń', n;
end $test$;
