-- Test po skutku 20261217 (regulamin v7: bieg zalicza trening z czasem; „Usuń wynik” blokuje tylko usunięty trening w tej postaci). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa): bieg próbny 'proba-v7' (v7) i kontrolny 'proba-v6b' (v6), oba na 5 km; sześć kont bez treningów z ostatnich 40 dni i jeden trener; imiona wymyślone.
-- Automat = akcja_bieg_wynik_z_treningu(zapis, null), jak cron (akcja_bieg_automat nie wołamy, przechodzi po prawdziwym biegu). Wskazanie = akcja_bieg_wynik_ustal jak strona.
-- Na końcu prawdziwy bieg-mikolajki (gdy jest): wersja v7 i tyle samo ukończonych co przed migracją; w wyniku same liczby.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; k jsonb; e jsonb; b7 uuid; b6 uuid; tr uuid; ka uuid[]; ku uuid[]; v text;
  uA uuid; uB uuid; uC uuid; uD uuid; uE uuid; uE2 uuid; uF uuid; lA uuid; lB2 uuid; lC1 uuid; lC2 uuid; lD uuid; lE uuid; lE2 uuid; lF uuid; z public.akcja_bieg_uczestnicy;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W7 constant text := '2026-11-v7'; W6 constant text := '2026-11-v6';
begin
  if to_regprocedure('public.akcja_bieg_po_usunieciu(public.akcja_bieg_uczestnicy)') is null then raise exception 'FAIL 1: brak akcja_bieg_po_usunieciu (migracja 20261217 nie weszła)'; end if;

  -- 0. strażnik: licznik prawdziwej ulicy — suma km i procent te same co przed migracją
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  jp := (select y.j from _licznik_przed y);
  if (j->'suma_km') is distinct from (jp->'suma_km') or (j->'pct') is distinct from (jp->'pct') then raise exception 'FAIL 0: suma km albo procent ulicy inne (% / % · % / %)', j->'suma_km', jp->'suma_km', j->'pct', jp->'pct'; end if;
  n := n + 1;

  -- 1. uprawnienia: nowe funkcje i kolumna bez przeglądarki; moi i panel dla zalogowanych
  foreach v in array array['public.akcja_bieg_slad(public.training_logs)', 'public.akcja_bieg_po_usunieciu(public.akcja_bieg_uczestnicy)', 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1a: % dostępna z przeglądarki', v; end if;
  end loop;
  if has_column_privilege('anon', 'public.akcja_bieg_uczestnicy', 'wynik_usuniete_treningi', 'select') or has_column_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'wynik_usuniete_treningi', 'select') then raise exception 'FAIL 1b: kolumna blokad czytelna z przeglądarki'; end if;
  if not has_function_privilege('authenticated', 'public.akcja_bieg_moi(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_panel(text)', 'execute') or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'execute') then raise exception 'FAIL 1c: moi/panel'; end if;
  n := n + 3;

  -- 2. dwa biegi próbne i siedem zapisów (E dwa razy: przed i po wycofaniu)
  select c.id into tr from public.coaches c limit 1;
  select array_agg(y.id order by y.created_at, y.id), array_agg(y.user_id order by y.created_at, y.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 6) y;
  if tr is null or coalesce(array_length(ka, 1), 0) < 6 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 6 kont bez treningów z 40 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-v7', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W7) returning id into b7;
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-v6b', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W6) returning id into b6;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b7, ka[1], 'ja', 'Anna', true, 1, 5, W7, now()) returning id into uA;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b7, ka[2], 'ja', 'Bogna', true, 2, 5, W7, now()) returning id into uB;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b7, ka[3], 'ja', 'Celina', true, 3, 5, W7, now()) returning id into uC;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b7, ka[4], 'ja', 'Dawid', true, 4, 5, W7, now()) returning id into uD;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b7, ka[5], 'ja', 'Ewa', true, 5, 5, W7, now()) returning id into uE;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b6, ka[6], 'ja', 'Filip', true, 1, 5, W6, now()) returning id into uF;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[1], 6, '1', 'Spacer', null, now() - interval '3 days', 'manual', now() - interval '3 days') returning id into lA;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 10, null, 'Spokojny', 'Run', now() - interval '3 days', 'manual', now() - interval '3 days');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[2], 5.2, '26:00', 'Spokojny', 'Run', now() - interval '2 days', 'manual', now() - interval '2 days') returning id into lB2;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[3], 5, '25:00', 'Spokojny', 'Run', now() - interval '3 days', 'intervals', now() - interval '3 days') returning id into lC1;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[4], 5, '24:00', 'Spokojny', 'Run', now() - interval '3 days', 'intervals', now() - interval '3 days') returning id into lD;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[5], 5, '27:00', 'Spokojny', 'Run', now() - interval '3 days', 'intervals', now() - interval '3 days') returning id into lE;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[6], 5, null, 'Spokojny', 'Run', now() - interval '3 days', 'manual', now() - interval '3 days') returning id into lF;
  n := n + 1;

  -- 3. A: 6 km z czasem „1” nie daje ukończenia; wskazanie = 'bez_czasu'; poprawa czasu = ukończenie; czas zepsuty w ukończonym treningu = wynik znika (wyzwalacz 20261212)
  j := public.akcja_bieg_wynik_z_treningu(uA, null);
  if (j->>'ok')::boolean or j->>'powod' <> 'brak_treningu' or (select ukonczony_at from public.akcja_bieg_uczestnicy where id = uA) is not null then raise exception 'FAIL 3a: trening bez czasu zaliczył bieg: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(uA, lA);
  e := public.akcja_bieg_treningi_z_okna('proba-v7');
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' is distinct from 'bez_czasu' then raise exception 'FAIL 3b: wskazanie treningu bez czasu: %', j; end if;
  if (e->0->>'czas_s')::int is distinct from 1 then raise exception 'FAIL 3c: treningi z okna (front wyszarza „bez czasu”): %', e; end if;
  update public.training_logs set duration = '33:00' where id = lA;   -- właściciel (claims z kroku wyżej), strażnik training_logs przepuszcza
  j := public.akcja_bieg_wynik_z_treningu(uA, null);
  if not (j->>'ok')::boolean or (select wynik_s from public.akcja_bieg_uczestnicy where id = uA) is distinct from 1980 then raise exception 'FAIL 3d: po poprawie czasu ukończenie 33:00: %', j; end if;
  update public.training_logs set duration = '33' where id = lA;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = uA) is not null then raise exception 'FAIL 3e: czas zepsuty w treningu wyniku, a ukończenie zostało'; end if;
  update public.training_logs set duration = '33:00' where id = lA;
  j := public.akcja_bieg_wynik_z_treningu(uA, null);
  if not (j->>'ok')::boolean or (select po_usun from (select public.akcja_bieg_po_usunieciu(u) as po_usun from public.akcja_bieg_uczestnicy u where u.id = uA) q) then raise exception 'FAIL 3f: ponowne ukończenie bez flagi usunięcia: %', j; end if;
  n := n + 6;

  -- 4. B: automat pomija 10 km bez czasu i bierze 5,2 km z czasem
  j := public.akcja_bieg_wynik_z_treningu(uB, null);
  if (j->>'log_id')::uuid is distinct from lB2 or (j->>'wynik_s')::int is distinct from 1560 then raise exception 'FAIL 4: automat wziął trening bez czasu: %', j; end if;
  n := n + 1;

  -- 5. C: „Usuń wynik” blokuje tylko ten trening; nowy trening przywraca ukończenie z flagą; ranking dopiero po „Zatwierdź”
  perform public.akcja_bieg_wynik_z_treningu(uC, null);
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_usun_wynik(uC, 'test blokady');
  execute 'reset role';
  if not (j->>'ok')::boolean or (select ukonczony_at from public.akcja_bieg_uczestnicy where id = uC) is not null
     or (select wynik_usuniete_treningi from public.akcja_bieg_uczestnicy where id = uC) is distinct from array[lC1::text || ':' || (select public.akcja_bieg_slad(l) from public.training_logs l where l.id = lC1)] then raise exception 'FAIL 5a: usunięcie i blokada treningu: %', j; end if;
  j := public.akcja_bieg_wynik_z_treningu(uC, null);
  if (j->>'ok')::boolean or (select wynik_usuniety_at from public.akcja_bieg_uczestnicy where id = uC) is null then raise exception 'FAIL 5b: usunięty trening wrócił automatem: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(uC, lC1);
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' is distinct from 'usuniety' then raise exception 'FAIL 5c: wskazanie usuniętego treningu: %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[3], 5.5, '28:00', 'Spokojny', 'Run', now() - interval '1 day', 'intervals', now() - interval '1 day') returning id into lC2;
  j := public.akcja_bieg_wynik_z_treningu(uC, null);
  if not (j->>'ok')::boolean or (j->>'log_id')::uuid is distinct from lC2 or (select wynik_usuniety_at from public.akcja_bieg_uczestnicy where id = uC) is not null then raise exception 'FAIL 5d: nowy trening nie przywrócił wyniku: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_moi('proba-v7');
  execute 'reset role';
  if (k->0->>'po_usunieciu')::boolean is not true or (k->0->>'do_weryfikacji')::boolean is not true or (k->0->>'wynik_usuniety')::boolean then raise exception 'FAIL 5e: karta po przywróceniu: %', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-v7');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 3;
  if not (e->'do_sprawdzenia' ? 'wynik po usunięciu') or (e->>'do_weryfikacji')::boolean is not true or k->'bieg'->>'regulamin_wersja' is distinct from W7 then raise exception 'FAIL 5f: panel: flaga i „Zatwierdź”: % / %', e, k->'bieg'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-v7', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 3;
  if e ? 'czas_s' or e ? 'miejsce' then raise exception 'FAIL 5g: wynik po usunięciu w rankingu przed „Zatwierdź”: %', e; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_weryfikuj(uC, 'zatwierdz');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-v7', 0, 50, null);
  execute 'reset role';
  select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 3;
  if (e->>'czas_s')::int is distinct from 1527 or e->>'miejsce' is null then raise exception 'FAIL 5h: po „Zatwierdź” w rankingu (5,5 km w 28:00 = 25:27 z tempa): %', e; end if;
  n := n + 8;

  -- 6. D: zatwierdzony wynik usunięty; poprawa czasu w TYM SAMYM treningu przywraca (inny ślad), decyzja o rankingu od nowa
  perform public.akcja_bieg_wynik_z_treningu(uD, null);
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.akcja_bieg_weryfikuj(uD, 'zatwierdz');
  j := public.akcja_bieg_usun_wynik(uD, 'test poprawy');
  execute 'reset role';
  if (select weryfikacja from public.akcja_bieg_uczestnicy where id = uD) is not null then raise exception 'FAIL 6a: zatwierdzenie przetrwało usunięcie'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[4], 'role', 'authenticated')::text, true);
  update public.training_logs set duration = '24:30' where id = lD;
  j := public.akcja_bieg_wynik_z_treningu(uD, null);
  select * into z from public.akcja_bieg_uczestnicy where id = uD;
  if not (j->>'ok')::boolean or z.wynik_log_id is distinct from lD or z.wynik_s is distinct from 1470 or not public.akcja_bieg_czeka_na_weryfikacje(z) or z.weryfikacja is not null then raise exception 'FAIL 6b: poprawiony usunięty trening: %', j; end if;
  n := n + 2;

  -- 7. E: wycofanie po usunięciu i ponowny zapis — blokada idzie za kontem w tym biegu, nowy trening przywraca z flagą
  perform public.akcja_bieg_wynik_z_treningu(uE, null);
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.akcja_bieg_usun_wynik(uE, 'test zapisu');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ku[5], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wycofaj(uE);
  execute 'reset role';
  if not (j->>'ok')::boolean then raise exception 'FAIL 7-0: wycofanie: %', j; end if;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at) values (b7, ka[5], 'ja', 'Ewa', true, 6, 5, W7, now()) returning id into uE2;
  j := public.akcja_bieg_wynik_z_treningu(uE2, null);
  if (j->>'ok')::boolean then raise exception 'FAIL 7a: usunięty trening wrócił przez ponowny zapis: %', j; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[5], 5, '29:00', 'Spokojny', 'Run', now() - interval '1 day', 'intervals', now() - interval '1 day') returning id into lE2;
  j := public.akcja_bieg_wynik_z_treningu(uE2, null);
  select * into z from public.akcja_bieg_uczestnicy where id = uE2;
  if not (j->>'ok')::boolean or z.wynik_log_id is distinct from lE2 or not public.akcja_bieg_po_usunieciu(z) then raise exception 'FAIL 7b: nowy trening po ponownym zapisie bez flagi: %', j; end if;
  n := n + 2;

  -- 8. kontrola v6: trening bez czasu dalej zalicza, „Usuń wynik” dalej blokuje do „Zalicz ręcznie”
  j := public.akcja_bieg_wynik_z_treningu(uF, null);
  if not (j->>'ok')::boolean or (j->>'log_id')::uuid is distinct from lF then raise exception 'FAIL 8a: v6: trening bez czasu przestał zaliczać: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.akcja_bieg_usun_wynik(uF, 'test v6');
  execute 'reset role';
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, created_at) values (ka[6], 5, '30:00', 'Spokojny', 'Run', now() - interval '1 day', 'intervals', now() - interval '1 day');
  j := public.akcja_bieg_wynik_z_treningu(uF, null);
  if (j->>'ok')::boolean or j->>'powod' is distinct from 'usuniety' then raise exception 'FAIL 8b: v6: usunięty wynik wrócił: %', j; end if;
  n := n + 2;

  -- 9. prawdziwy bieg (gdy jest): co najmniej v7 (blizna-309) i tyle samo ukończonych co przed migracją (nikogo nie cofamy); w wyniku same liczby
  if exists (select 1 from public.akcja_biegi where slug = 'bieg-mikolajki') then
    if not public.akcja_bieg_wersja_od((select regulamin_wersja from public.akcja_biegi where slug = 'bieg-mikolajki'), 7) then raise exception 'FAIL 9a: bieg-mikolajki poniżej v7'; end if;
    if (select count(*) from public.akcja_bieg_uczestnicy u join public.akcja_biegi y on y.id = u.bieg_id where y.slug = 'bieg-mikolajki' and u.ukonczony_at is not null and u.wycofany_at is null)
       is distinct from (select c from _ukonczeni_przed) then raise exception 'FAIL 9b: bieg-mikolajki: inna liczba ukończonych niż przed migracją'; end if;
    raise notice 'bieg-mikolajki: v7, ukończonych % (przed migracją %)', (select count(*) from public.akcja_bieg_uczestnicy u join public.akcja_biegi y on y.id = u.bieg_id where y.slug = 'bieg-mikolajki' and u.ukonczony_at is not null and u.wycofany_at is null), (select c from _ukonczeni_przed);
    n := n + 2;
  end if;

  raise exception 'TESTY V7 ZIELONE: % sprawdzeń', n;
end $test$;
