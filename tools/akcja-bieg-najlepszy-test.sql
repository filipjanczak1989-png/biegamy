-- Test po skutku 20261211 (powiadomienie o nowym najlepszym wyniku z automatu; bramka zapisu na bieg akcji testowej). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa) z listą dwóch kont testu, bieg próbny 'proba-najlepszy'; akcja nietestowa 'test-najlepszy' z biegiem 'najlepszy-prawdziwy'; treningi tylko tutaj.
-- Trzy konta bez treningów z ostatnich 40 dni (jak w testach biegu); imiona wymyślone. now() w transakcji stałe.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; b uuid; bp uuid; ka uuid[]; ku uuid[]; u1 uuid; ud uuid; lA uuid; lB uuid; lC uuid; v text; ile int;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v3';
  WOLANIE constant text := 'akcja_bieg_najlepszy_powiadom(r.id, r.wynik_log_id, r.wynik_dystans_km, r.ukonczony_at is not null)';
  TRESC constant text := 'Masz nowy najlepszy wynik w biegu. Dyplom jest już zaktualizowany.';
begin
  if to_regprocedure('public.akcja_bieg_najlepszy_powiadom(uuid, uuid, numeric, boolean)') is null then raise exception 'FAIL 1: brak akcja_bieg_najlepszy_powiadom (migracja 20261211 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. definicje i uprawnienia
  v := pg_get_functiondef('public.akcja_bieg_automat()'::regprocedure);
  if (length(v) - length(replace(v, WOLANIE, ''))) / length(WOLANIE) <> 1 then raise exception 'FAIL 1a: automat bez jednego wołania powiadomienia'; end if;
  foreach v in array array['public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)', 'public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text)'] loop
    if pg_get_functiondef(v::regprocedure) !~ '''powod'', ''tylko_test''' then raise exception 'FAIL 1b: % bez bramki tylko_test', v; end if;
    if has_function_privilege('anon', v, 'execute') or not has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1c: % uprawnienia inne niż przed migracją', v; end if;
  end loop;
  foreach v in array array['public.akcja_bieg_najlepszy_powiadom(uuid, uuid, numeric, boolean)', 'public.akcja_bieg_automat()'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1d: % dostępna z przeglądarki', v; end if;
  end loop;
  n := n + 6;

  -- 2. konta, akcja testowa z listą dwóch kont, bieg próbny; akcja nietestowa z prawdziwym biegiem
  select array_agg(x.id order by x.created_at, x.id), array_agg(x.user_id order by x.created_at, x.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 3) x;
  if coalesce(array_length(ka, 1), 0) < 3 then raise exception 'FAIL 2-0: za mało kont do testu (3 konta bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  update public.akcje set konta_testowe = array[ka[1], ka[2]] where slug = 'proba';
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-najlepszy', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W) returning id into b;
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, wystartowala_at) values ('test-najlepszy', 'Test', DZIS, 100, 10, false, now());
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('test-najlepszy', 'najlepszy-prawdziwy', 'Bieg prawdziwy', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W) returning id into bp;

  -- 3. bramka: konto spoza listy dostaje tylko_test (siebie i dziecko); konto z listy się zapisuje; prawdziwy bieg bez bramki
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-najlepszy', 5, true, false, W, 'Celina', false);
  jp := public.akcja_bieg_dopisz_dziecko('proba-najlepszy', 'Zosia', true, true, W);
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' is distinct from 'tylko_test' then raise exception 'FAIL 3a: zapis spoza listy na bieg próbny: %', j; end if;
  if (jp->>'ok')::boolean or jp->>'powod' is distinct from 'tylko_test' then raise exception 'FAIL 3b: dziecko spoza listy na bieg próbny: %', jp; end if;
  if exists (select 1 from public.akcja_bieg_uczestnicy where bieg_id = b and konto_id = ka[3]) then raise exception 'FAIL 3c: zapis spoza listy w tabeli'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('najlepszy-prawdziwy', 5, true, false, W, 'Celina', false);
  execute 'reset role';
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 3d: prawdziwy bieg odmówił kontu: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-najlepszy', 5, true, false, W, 'Anna', false);
  jp := public.akcja_bieg_dopisz_dziecko('proba-najlepszy', 'Zosia', true, true, W);
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (jp->>'ok')::boolean is not true then raise exception 'FAIL 3e: konto z listy: % / %', j, jp; end if;
  u1 := (j->>'id')::uuid; ud := (jp->>'id')::uuid;
  update public.akcje set konta_testowe = null where slug = 'proba';
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-najlepszy', 5, true, false, W, 'Bogna', false);
  execute 'reset role';
  if j->>'powod' is distinct from 'tylko_test' then raise exception 'FAIL 3f: akcja testowa bez listy kont przyjęła zapis: %', j; end if;
  update public.akcje set konta_testowe = array[ka[1], ka[2]] where slug = 'proba';
  n := n + 6;

  -- 4. automat: pierwszy wynik bez powiadomienia; podmiana na lepszy = jedno powiadomienie bez czasu; ten sam albo gorszy trening nic; skasowany lepszy → powrót bez powiadomienia
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.1, '30:00', 'Spokojny', 'Run', now() - interval '3 days', 'manual', now() - interval '3 days') returning id into lA;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is distinct from lA then raise exception 'FAIL 4a: automat nie dał pierwszego wyniku'; end if;
  if exists (select 1 from public.notifications where athlete_id = ka[1] and message = TRESC) then raise exception 'FAIL 4b: powiadomienie przy pierwszym wyniku'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.0, '25:00', 'Spokojny', 'Run', now() - interval '1 day', 'manual', now() - interval '1 day') returning id into lB;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is distinct from lB then raise exception 'FAIL 4c: automat nie podmienił na lepszy'; end if;
  select count(*) into ile from public.notifications where athlete_id = ka[1] and type = 'bieg_wynik' and message = TRESC and read = false;
  if ile <> 1 then raise exception 'FAIL 4d: po podmianie % powiadomień zamiast 1', ile; end if;
  if exists (select 1 from public.notifications where athlete_id = ka[1] and message = TRESC and message ~ '[0-9]') then raise exception 'FAIL 4e: czas w powiadomieniu'; end if;
  perform public.akcja_bieg_automat();
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at)
    values (ka[1], 5.2, '33:00', 'Spokojny', 'Run', now() - interval '2 hours', 'manual', now() - interval '2 hours') returning id into lC;
  perform public.akcja_bieg_automat();
  if (select count(*) from public.notifications where athlete_id = ka[1] and message = TRESC) <> 1 or (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is distinct from lB then
    raise exception 'FAIL 4f: bez zmiany albo wolniejszy trening dał powiadomienie albo podmianę'; end if;
  delete from public.training_logs where id = lB;
  perform public.akcja_bieg_automat();
  if (select wynik_log_id from public.akcja_bieg_uczestnicy where id = u1) is not distinct from lB then raise exception 'FAIL 4g: automat został przy skasowanym treningu'; end if;
  if (select count(*) from public.notifications where athlete_id = ka[1] and message = TRESC) <> 1 then raise exception 'FAIL 4h: powiadomienie po skasowaniu lepszego treningu (podmiana z musu)'; end if;
  n := n + 8;

  -- 5. powiadomienie wprost: bez poprzedniego wyniku, bez starego treningu, dziecko, krótszy dystans → nic
  if public.akcja_bieg_najlepszy_powiadom(u1, lC, 5, false) or public.akcja_bieg_najlepszy_powiadom(u1, null, 5, true) or public.akcja_bieg_najlepszy_powiadom(ud, lA, 5, true)
     or public.akcja_bieg_najlepszy_powiadom(u1, lC, 10, true) then raise exception 'FAIL 5: powiadomienie wbrew regule'; end if;
  if (select count(*) from public.notifications where athlete_id = ka[1] and message = TRESC) <> 1 then raise exception 'FAIL 5a: dodatkowe powiadomienie'; end if;
  n := n + 2;

  raise exception 'TESTY NAJLEPSZEGO WYNIKU I BIEGU PRÓBNEGO ZIELONE: % sprawdzeń', n;
end $test$;
