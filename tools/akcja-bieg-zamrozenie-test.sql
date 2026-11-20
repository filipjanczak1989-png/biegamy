-- Test po skutku 20261219 (zamrożenie wyniku po końcu biegu, automat 24 h dla zegarka). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa): bieg próbny 'proba-zamrozenie' (v8, 5 km) zakończony godzinę temu, 'proba-trwa' (v8) w trakcie (kontrola) i 'proba-stary' zakończony 25 h temu.
-- Siedem kont bez treningów z ostatnich 40 dni i trener; imiona wymyślone. now() w transakcji stałe, koniec_at i created_at ustawiane względem now().
-- Automatu (akcja_bieg_automat) nie wołamy (przechodzi po prawdziwym biegu): jego warunek sprawdzamy w treści funkcji, wybór treningu przez akcja_bieg_wynik_z_treningu.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; k jsonb; e jsonb; v text; bz uuid; bt uuid; bs uuid; tr uuid; ka uuid[]; ku uuid[]; z public.akcja_bieg_uczestnicy;
  uA uuid; uB uuid; uC uuid; uD uuid; uF uuid; uG uuid; uH uuid; uT uuid; lA uuid; lB uuid; lC uuid; lD uuid; lF uuid; lG uuid; lH uuid; lT uuid;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v8';
begin
  if to_regprocedure('public.akcja_bieg_po_koncu(uuid)') is null then raise exception 'FAIL 1: brak akcja_bieg_po_koncu (migracja 20261219 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. uprawnienia: nowe funkcje i tabela bez przeglądarki; kolumna niewidoczna
  foreach v in array array['public.akcja_bieg_po_koncu(uuid)', 'public.akcja_bieg_zamrozony_wyczysc()', 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)', 'public.akcja_bieg_automat()'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1a: % dostępna z przeglądarki', v; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.akcja_bieg_treningi_po_koncu', 'select') or has_table_privilege('anon', 'public.akcja_bieg_treningi_po_koncu', 'select')
     or has_column_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'wynik_zamrozony', 'select') then raise exception 'FAIL 1b: tabela albo kolumna dostępna z przeglądarki'; end if;
  if position('now() < b.koniec_at + interval ''24 hours'' and u.ukonczony_at is null' in pg_get_functiondef('public.akcja_bieg_automat()'::regprocedure)) = 0 then raise exception 'FAIL 1c: automat bez okna 24 h tylko dla zapisów bez wyniku'; end if;
  n := n + 6;

  -- 2. biegi próbne i zapisy: A, B, C, D, F, G w biegu zakończonym godzinę temu; H w biegu zakończonym 25 h temu; T w biegu trwającym (kontrola)
  select c.id into tr from public.coaches c limit 1;
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 7) y;
  if tr is null or coalesce(array_length(ka, 1), 0) < 7 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 7 kont bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS - 5, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja, koniec_at, zalicz_do)
    values ('proba', 'proba-zamrozenie', 'Bieg próbny', DZIS - 5, DZIS, DZIS, '{5}', 'otwarty', W, now() - interval '1 hour', DZIS + 7) returning id into bz;
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja, koniec_at, zalicz_do)
    values ('proba', 'proba-trwa', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W, now() + interval '1 day', DZIS + 7) returning id into bt;
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja, koniec_at, zalicz_do)
    values ('proba', 'proba-stary', 'Bieg próbny', DZIS - 5, DZIS, DZIS, '{5}', 'otwarty', W, now() - interval '25 hours', DZIS + 7) returning id into bs;
  if not public.akcja_bieg_po_koncu(bz) or public.akcja_bieg_po_koncu(bt) or not public.akcja_bieg_po_koncu(bs) then raise exception 'FAIL 2-1: po końcu: zakończone tak, trwający nie'; end if;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (bz, ka[1], 'ja', 'Anna', true, 1, 5, W, now()) returning id into uA;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (bz, ka[2], 'ja', 'Bogna', true, 2, 5, W, now()) returning id into uB;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (bz, ka[3], 'ja', 'Celina', true, 3, 5, W) returning id into uC;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (bz, ka[4], 'ja', 'Dawid', true, 4, 5, W) returning id into uD;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (bz, ka[5], 'ja', 'Filip', true, 5, 5, W) returning id into uF;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (bz, ka[6], 'ja', 'Gosia', true, 6, 5, W) returning id into uG;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (bs, ka[7], 'ja', 'Hania', true, 1, 5, W) returning id into uH;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja) values (bt, ka[1], 'ja', 'Anna', true, 1, 5, W) returning id into uT;
  -- treningi przed końcem: A 5 km 25:00 ręczny (2 dni temu); B 16 km 1:20:00 z zegarka; C 5 km BEZ czasu ręczny (2 dni temu); T 5 km 26:00 w biegu trwającym
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 5, '25:00', 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lA;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 16, '1:20:00', 'Spokojny', 'Run', now() - interval '2 days', 'intervals', now() - interval '2 days') returning id into lB;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[3], 5, null, 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lC;
  if (public.akcja_bieg_wynik_z_treningu(uA, null)->>'ok')::boolean is not true or (public.akcja_bieg_wynik_z_treningu(uB, null)->>'ok')::boolean is not true then raise exception 'FAIL 2-2: wyniki A i B sprzed końca'; end if;
  if (public.akcja_bieg_wynik_z_treningu(uC, null)->>'ok')::boolean then raise exception 'FAIL 2-3: C bez czasu zaliczył (v7)'; end if;
  n := n + 2;

  -- 3. EDYCJA po końcu przez zawodnika: wynik A bez zmian; trening zapisany jako zmieniony po końcu
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  update public.training_logs set duration = '20:00' where id = lA;
  if (select wynik_s from public.akcja_bieg_uczestnicy where id = uA) is distinct from 1500 or (select wynik_log_id from public.akcja_bieg_uczestnicy where id = uA) is distinct from lA then raise exception 'FAIL 3a: edycja po końcu zmieniła wynik A'; end if;
  if not exists (select 1 from public.akcja_bieg_treningi_po_koncu where log_id = lA and bieg_id = bz) then raise exception 'FAIL 3b: trening zmieniony po końcu niezapisany'; end if;
  update public.training_logs set duration = '1' where id = lA;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = uA) is null then raise exception 'FAIL 3c: zepsuty czas po końcu zdjął ukończenie A'; end if;
  n := n + 3;

  -- 4. kontrola: w biegu trwającym edycja dalej przelicza wynik (T)
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 5.1, '26:00', 'Spokojny', 'Run', now() - interval '3 hours', 'manual', now() - interval '3 hours') returning id into lT;
  perform public.akcja_bieg_wynik_z_treningu(uT, lT);
  update public.training_logs set duration = '24:00' where id = lT;
  if (select wynik_s from public.akcja_bieg_uczestnicy where id = uT) is distinct from 1440 then raise exception 'FAIL 4: w trwającym biegu edycja nie przeliczyła wyniku'; end if;
  if exists (select 1 from public.akcja_bieg_treningi_po_koncu where log_id = lT and bieg_id = bt) then raise exception 'FAIL 4b: trening zapisany jako zmieniony po końcu biegu, który trwa'; end if;
  if not exists (select 1 from public.akcja_bieg_treningi_po_koncu where log_id = lT and bieg_id = bz) then raise exception 'FAIL 4c: ten sam trening dla biegu już zakończonego (to samo konto) niezapisany'; end if;
  n := n + 3;

  -- 5. USUNIĘCIE po końcu: B (16 km z zegarka, zatwierdzony) zostaje ukończony z czasem z tempa, „zegarek”, decyzją organizatora i dystansem treningu
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_weryfikuj(uB, 'zatwierdz');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  delete from public.training_logs where id = lB;
  select * into z from public.akcja_bieg_uczestnicy where id = uB;
  if z.ukonczony_at is null or z.wynik_s is distinct from 4800 or z.wynik_log_id is not null or (z.wynik_zamrozony->>'km')::numeric is distinct from 16 or (z.wynik_zamrozony->>'zegarek')::boolean is not true then raise exception 'FAIL 5a: usunięcie po końcu: wynik B % / zamrożony %', z.wynik_s, z.wynik_zamrozony; end if;
  if public.akcja_bieg_km_wyniku(z) is distinct from 16 or public.akcja_bieg_czas_biegu(z, (select x from public.akcja_biegi x where x.id = bz)) is distinct from 1500
     or not public.akcja_bieg_z_tempa(z, (select x from public.akcja_biegi x where x.id = bz)) or not public.akcja_bieg_wynik_z_zegarka(z) then raise exception 'FAIL 5b: km, czas z tempa albo zegarek po usunięciu'; end if;
  if z.weryfikacja is distinct from 'zatwierdzony' then raise exception 'FAIL 5c: decyzja organizatora zniknęła po usunięciu treningu'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-zamrozenie');
  execute 'reset role';
  if (k->0->>'wynik_trening_km')::numeric is distinct from 16 or (k->0->>'czas_biegu_s')::int is distinct from 1500 or (k->0->>'z_tempa')::boolean is not true or (k->0->>'wynik_reczny')::boolean then raise exception 'FAIL 5d: karta B po usunięciu: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-zamrozenie', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2;
  if (e->>'czas_s')::int is distinct from 1500 or (e->>'z_tempa')::boolean is not true or (e->>'reczny')::boolean then raise exception 'FAIL 5e: lista B po usunięciu: %', e; end if;
  n := n + 5;

  -- 6. organizator po końcu (do zalicz_do): „Popraw” B czyści zamrożenie; zaliczenie C bez treningu
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(uB, 5, 1490);
  jp := public.akcja_bieg_zalicz_recznie(uC, 5, null);
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (jp->>'ok')::boolean is not true then raise exception 'FAIL 6a: organizator po końcu: % %', j, jp; end if;
  select * into z from public.akcja_bieg_uczestnicy where id = uB;
  if z.wynik_zamrozony is not null or z.wynik_s is distinct from 1490 or public.akcja_bieg_km_wyniku(z) is distinct from 5 then raise exception 'FAIL 6b: „Popraw” nie wyczyścił zamrożenia'; end if;
  n := n + 2;

  -- 7. automat po końcu (w 24 h), wybór treningu: zegarek sprzed końca zsynchronizowany po końcu TAK; ręczny po końcu NIE; ręczny sprzed końca poprawiony po końcu NIE;
  --    zegarek poprawiony po końcu przez zawodnika NIE, przez synchronizację TAK; zegarek po 24 h od końca NIE
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[4], 5, '27:00', 'Spokojny', 'Run', now() - interval '2 hours', 'intervals', now() - interval '10 minutes') returning id into lD;
  if (public.akcja_bieg_wynik_z_treningu(uD, null)->>'log_id')::uuid is distinct from lD then raise exception 'FAIL 7a: zegarek sprzed końca, zsynchronizowany po końcu: wynik ma wejść'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[5], 5, '28:00', 'Spokojny', 'Run', now() - interval '2 hours', 'manual', now() - interval '10 minutes') returning id into lF;
  if (public.akcja_bieg_wynik_z_treningu(uF, null)->>'ok')::boolean then raise exception 'FAIL 7b: wpis ręczny po końcu dał wynik'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[6], 5, null, 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lG;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[6], 'role', 'authenticated')::text, true);
  update public.training_logs set duration = '29:00' where id = lG;
  if (public.akcja_bieg_wynik_z_treningu(uG, null)->>'ok')::boolean then raise exception 'FAIL 7c: ręczny sprzed końca z czasem dopisanym po końcu dał wynik'; end if;
  perform set_config('request.jwt.claims', '', true);
  delete from public.akcja_bieg_treningi_po_koncu where log_id = lG;
  update public.training_logs set duration = '29:30' where id = lG;   -- bez użytkownika (jak synchronizacja): nie zapisuje się jako zmieniony po końcu
  if exists (select 1 from public.akcja_bieg_treningi_po_koncu where log_id = lG) then raise exception 'FAIL 7d: zmiana bez użytkownika zapisana jako poprawka po końcu'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[7], 5, '26:30', 'Spokojny', 'Run', now() - interval '26 hours', 'intervals', now() - interval '10 minutes') returning id into lH;
  if (public.akcja_bieg_wynik_z_treningu(uH, null)->>'ok')::boolean then raise exception 'FAIL 7e: zegarek zsynchronizowany po 24 h od końca dał wynik'; end if;
  n := n + 5;

  -- 8. prawdziwy bieg (gdy jest): przed końcem nic się nie zmienia — tyle samo ukończonych co przed migracją, nikt nie ma zamrożenia; w wyniku same liczby
  if exists (select 1 from public.akcja_biegi where slug = 'bieg-mikolajki') then
    if (select count(*) from public.akcja_bieg_uczestnicy u join public.akcja_biegi y on y.id = u.bieg_id where y.slug = 'bieg-mikolajki' and u.ukonczony_at is not null and u.wycofany_at is null)
       is distinct from (select c from _ukonczeni_przed) then raise exception 'FAIL 8a: bieg-mikolajki: inna liczba ukończonych niż przed migracją'; end if;
    if exists (select 1 from public.akcja_bieg_uczestnicy u join public.akcja_biegi y on y.id = u.bieg_id where y.slug = 'bieg-mikolajki' and u.wynik_zamrozony is not null) then raise exception 'FAIL 8b: zamrożenie w trwającym biegu'; end if;
    raise notice 'bieg-mikolajki: po końcu %, ukończonych %', public.akcja_bieg_po_koncu((select id from public.akcja_biegi where slug = 'bieg-mikolajki')), (select c from _ukonczeni_przed);
    n := n + 2;
  end if;

  raise exception 'TESTY ZAMROZENIA PO KONCU ZIELONE: % sprawdzeń', n;
end $test$;
