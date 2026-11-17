-- Test po skutku 20261206 (usunięcie wyniku, powiadomienie o zmianie wyniku przez organizatora, flaga „do sprawdzenia”). W transakcji z .sh, zawsze wycofanej.
-- Bieg próbny, zapisy i treningi tylko w tej transakcji; imiona wymyślone. Pięć kont dorosłych bez treningów z ostatnich 10 dni (prawdziwe treningi nie mieszają się z testowymi) i jeden trener.
do $test$
declare
  n int := 0; b uuid; j jsonb; k jsonb; e jsonb; v text; i int; tr uuid; ka uuid[]; ku uuid[]; l uuid[]; u uuid[]; v_log uuid; v_nowy uuid; v_ile int; wr record;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W constant text := '2026-11-v2';
  POWOD constant text := 'brak potwierdzenia z zegarka (§ 9 ust. 3)';
  -- treningi kont 1–4 (konto 5 bez treningu): zwykły 5,1 km 25:00 · 5 km 14:00 (2:48/km) · 5 km 12:00 (2:24/km) · 12 km 60:00 (5:00/km)
  KM constant numeric[] := array[5.1, 5.0, 5.0, 12];
  CZAS constant text[] := array['25:00', '14:00', '12:00', '60:00'];
  IMIONA constant text[] := array['Anna', 'Bogna', 'Celina', 'Dawid', 'Edek'];
begin
  -- 0. strażnik: licznik prawdziwej ulicy identyczny przed i po migracji
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_licznik('dla-fabianka') is distinct from (select t.j from _licznik_przed t) then raise exception 'FAIL 0: licznik prawdziwej ulicy zmienił się po migracji'; end if;
  execute 'reset role';
  n := n + 1;

  -- 1. nowe funkcje są; uprawnienia: „Usuń wynik” dla zalogowanych (bramka trenera w ciele), reguły nie dla przeglądarki, nowe kolumny niewidoczne, zmienione funkcje bez zmian
  if to_regprocedure('public.akcja_bieg_usun_wynik(uuid, text)') is null or to_regprocedure('public.akcja_bieg_wynik_powiadom(public.akcja_bieg_uczestnicy)') is null
     or to_regprocedure('public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)') is null then raise exception 'FAIL 1: brak funkcji akcja_bieg_usun_wynik (migracja 20261206 nie weszła)'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_usun_wynik(uuid, text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_bieg_usun_wynik(uuid, text)', 'execute') then raise exception 'FAIL 1a: akcja_bieg_usun_wynik: anon nie, authenticated tak'; end if;
  foreach v in array array['public.akcja_bieg_wynik_powiadom(public.akcja_bieg_uczestnicy)', 'public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy)', 'public.akcja_bieg_wynik_z_treningu(uuid, uuid)'] loop
    if has_function_privilege('anon', v, 'execute') or has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1b: % dostępna dla anon albo authenticated', v; end if;
  end loop;
  foreach v in array array['public.akcja_bieg_moi(text)', 'public.akcja_bieg_panel(text)', 'public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)', 'public.akcja_bieg_dziecko_ukoncz(uuid, numeric)', 'public.akcja_bieg_wynik_ustal(uuid, uuid)'] loop
    if has_function_privilege('anon', v, 'execute') or not has_function_privilege('authenticated', v, 'execute') then raise exception 'FAIL 1c: % uprawnienia inne niż przed migracją', v; end if;
  end loop;
  foreach v in array array['wynik_usuniety_at', 'wynik_usuniety_powod', 'wynik_usuniety_przez'] loop
    if has_column_privilege('anon', 'public.akcja_bieg_uczestnicy', v, 'SELECT') or has_column_privilege('authenticated', 'public.akcja_bieg_uczestnicy', v, 'SELECT') then raise exception 'FAIL 1d: kolumna % widoczna z przeglądarki', v; end if;
  end loop;
  n := n + 4;

  -- 2. bieg próbny w fazie wyniki (5 km); konta 1–4 z wynikiem z treningu (wskazany), dwoje dzieci konta 1 (25 km i 1,5 km), konto 5 bez wyniku
  select c.id into tr from public.coaches c limit 1;
  select array_agg(t.id order by t.created_at, t.id), array_agg(t.user_id order by t.created_at, t.id) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null
            and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs x where x.athlete_id = a.id and x.logged_at > now() - interval '10 days') order by a.created_at, a.id limit 5) t;
  if tr is null or coalesce(array_length(ka, 1), 0) < 5 then raise exception 'FAIL 2-0: za mało kont do testu (trener i 5 kont bez treningów z 10 dni)'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-bieg', 'Bieg próbny', DZIS - 2, DZIS - 1, DZIS + 1, '{5}', 'otwarty', W) returning id into b;
  l := array_fill(null::uuid, array[4]); u := array_fill(null::uuid, array[7]);
  for i in 1..5 loop
    insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at)
      values (b, ka[i], 'ja', IMIONA[i], true, case when i = 5 then 7 else i end, 5, W, now()) returning id into v_log;
    u[case when i = 5 then 7 else i end] := v_log;
  end loop;
  for i in 1..4 loop
    insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
      values (ka[i], KM[i], CZAS[i], 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '9 hours' + i * interval '1 minute') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tdf-' || i)
      returning id into v_log;
    l[i] := v_log;
    j := public.akcja_bieg_wynik_z_treningu(u[i], l[i]);
    if (j->>'ok')::boolean is not true then raise exception 'FAIL 2-1: wynik konta %: %', i, j; end if;
  end loop;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, oswiadczenie_rodzica_at, regulamin_wersja)
    values (b, ka[1], 'dziecko', 'Zosia', true, 5, now(), W) returning id into v_log;
  u[5] := v_log;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, oswiadczenie_rodzica_at, regulamin_wersja)
    values (b, ka[1], 'dziecko', 'Kuba', true, 6, now(), W) returning id into v_log;
  u[6] := v_log;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dziecko_ukoncz(u[5], 25);
  k := public.akcja_bieg_dziecko_ukoncz(u[6], 1.5);
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (k->>'ok')::boolean is not true then raise exception 'FAIL 2-2: dystans dzieci: % %', j, k; end if;
  if exists (select 1 from public.notifications x where x.athlete_id = any(ka) and x.type = 'bieg_wynik') then raise exception 'FAIL 2-3: powiadomienie o zmianie wyniku po własnym wyniku uczestnika'; end if;
  n := n + 3;

  -- 3. FLAGA w panelu trenera: tylko powody słownie, bez czasów; zwykły wynik i dziecko 1,5 km bez flagi, konto bez wyniku bez flagi
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-bieg');
  execute 'reset role';
  for i in 1..7 loop
    select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = i;
    if e is null or jsonb_typeof(e->'do_sprawdzenia') <> 'array' then raise exception 'FAIL 3a: panel bez do_sprawdzenia przy numerze %: %', i, e; end if;
    if e->'do_sprawdzenia' <> (case i when 2 then '["tempo szybsze niż 3:00/km"]' when 3 then '["tempo szybsze niż 3:00/km"]'
                                      when 4 then '["trening ponad 2 razy dłuższy niż dystans biegu"]' when 5 then '["dziecko: ponad 21 km"]' else '[]' end)::jsonb
      then raise exception 'FAIL 3b: flaga numeru %: %', i, e->'do_sprawdzenia'; end if;
    if (e->>'wynik_usuniety')::boolean is not false then raise exception 'FAIL 3c: wynik_usuniety przed usunięciem: %', e; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(k->'uczestnicy') x where jsonb_array_length(x->'do_sprawdzenia') > 0) <> 4 then raise exception 'FAIL 3d: cztery wyniki do sprawdzenia'; end if;
  v := replace(replace(k::text, '3:00/km', ''), '36:00/km', '');
  if v ~ '\d:\d\d' or v ~* '"wynik_s"|"czas|konto|"email"|oswiadczenie|wynik_log|trening_km' or v ~ ': (12|12\.0+|5\.1|5\.10)[,}]' then raise exception 'FAIL 3e: panel z czasem, dystansem treningu albo danymi konta'; end if;
  n := n + 7 * 3 + 2;
  -- 3f. progi na granicy (konto 1 i dziecko 1,5 km na chwilę zmienione, potem przywrócone): dokładnie 3:00/km, 36:00/km, 2 razy i 21 km jeszcze bez flagi
  for wr in select x from jsonb_array_elements('[[5, 900, []], [5, 899, ["tempo szybsze niż 3:00/km"]], [5, 890, ["tempo szybsze niż 3:00/km"]], [5, 10800, []],
      [5, 10801, ["tempo wolniejsze niż 36:00/km"]], [10, 3000, []], [10.01, 3002, ["trening ponad 2 razy dłuższy niż dystans biegu"]], [9, 2700, []],
      [12, 1800, ["tempo szybsze niż 3:00/km", "trening ponad 2 razy dłuższy niż dystans biegu"]]]'::jsonb) x loop
    e := wr.x;
    update public.training_logs set distance_km = (e->>0)::numeric where id = l[1];
    update public.akcja_bieg_uczestnicy set wynik_s = (e->>1)::int where id = u[1];
    if to_jsonb(public.akcja_bieg_do_sprawdzenia((select x from public.akcja_bieg_uczestnicy x where x.id = u[1]))) <> e->2 then
      raise exception 'FAIL 3f: % km w % s: % zamiast %', e->>0, e->>1, to_jsonb(public.akcja_bieg_do_sprawdzenia((select x from public.akcja_bieg_uczestnicy x where x.id = u[1]))), e->2; end if;
    n := n + 1;
  end loop;
  update public.training_logs set distance_km = 5.1 where id = l[1];
  update public.akcja_bieg_uczestnicy set wynik_s = 1500 where id = u[1];
  foreach v in array array['21', '21.01'] loop
    update public.akcja_bieg_uczestnicy set dystans_wlasny_km = v::numeric where id = u[6];
    if cardinality(public.akcja_bieg_do_sprawdzenia((select x from public.akcja_bieg_uczestnicy x where x.id = u[6]))) <> (case when v = '21' then 0 else 1 end) then raise exception 'FAIL 3g: dziecko % km', v; end if;
    n := n + 1;
  end loop;
  update public.akcja_bieg_uczestnicy set dystans_wlasny_km = 1.5 where id = u[6];

  -- 4. „Usuń wynik” tylko dla trenera; odmowy z polskim kodem
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.akcja_bieg_usun_wynik(u[2], POWOD); raise exception 'FAIL 4a: usunięcie wyniku przez zawodnika'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach v in array array['', '  ', 'ab', repeat('x', 201), E'dwie\nlinie'] loop
    j := public.akcja_bieg_usun_wynik(u[2], v);
    if (j->>'ok')::boolean or j->>'powod' <> 'zly_powod' then raise exception 'FAIL 4b: powód „%” ma być odrzucony: %', left(v, 20), j; end if;
  end loop;
  j := public.akcja_bieg_usun_wynik(u[2], null);
  if (j->>'ok')::boolean or j->>'powod' <> 'zly_powod' then raise exception 'FAIL 4c: bez powodu: %', j; end if;
  j := public.akcja_bieg_usun_wynik(u[7], POWOD);
  if (j->>'ok')::boolean or j->>'powod' <> 'bez_wyniku' then raise exception 'FAIL 4d: zapis bez wyniku: %', j; end if;
  j := public.akcja_bieg_usun_wynik(gen_random_uuid(), POWOD);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 4e: nieistniejący zapis: %', j; end if;
  execute 'reset role';
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u[2]) is null then raise exception 'FAIL 4f: odmowa zmieniła wynik'; end if;
  n := n + 5;

  -- 5. usunięcie wyniku dorosłego: bez ukończenia, dyplomu i miejsca; odznaka w kolekcji zostaje; jedno powiadomienie z powodem, bez czasu
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_usun_wynik(u[2], '  ' || POWOD || ' ');
  k := public.akcja_bieg_usun_wynik(u[2], POWOD);
  execute 'reset role';
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 5a: usunięcie wyniku: %', j; end if;
  if (k->>'ok')::boolean or k->>'powod' <> 'bez_wyniku' then raise exception 'FAIL 5b: drugie usunięcie: %', k; end if;
  if exists (select 1 from public.akcja_bieg_uczestnicy x where x.id = u[2] and (x.ukonczony_at is not null or x.wynik_s is not null or x.wynik_dystans_km is not null or x.wynik_log_id is not null
               or x.wynik_wskazany or x.wynik_usuniety_at is null or x.wynik_usuniety_powod is distinct from POWOD or x.wynik_usuniety_przez is distinct from tr or x.wycofany_at is not null)) then raise exception 'FAIL 5c: wiersz po usunięciu'; end if;
  if (select count(*) from public.achievements where athlete_id = ka[2] and badge_id = 'bieg-proba-bieg') <> 1 then raise exception 'FAIL 5d: odznaka w kolekcji ma zostać'; end if;
  if (select count(*) from public.notifications where athlete_id = ka[2] and type = 'bieg_wynik') <> 1
     or (select message from public.notifications where athlete_id = ka[2] and type = 'bieg_wynik') <> 'Organizator usunął Twój wynik w biegu „Bieg próbny” (powód: ' || POWOD || '). Dyplomu i miejsca na liście już nie ma. Jeśli to pomyłka, napisz do organizatora (kontakt na stronie biegu).'
    then raise exception 'FAIL 5e: powiadomienie o usunięciu: %', (select array_agg(message) from public.notifications where athlete_id = ka[2] and type = 'bieg_wynik'); end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50);
  execute 'reset role';
  if (j->>'razem')::int <> 5 or exists (select 1 from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 2) then raise exception 'FAIL 5f: usunięty wynik na liście „ukończyli”: %', j - 'lista'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  execute 'reset role';
  if jsonb_array_length(j) <> 1 or (j->0->>'wynik_usuniety')::boolean is not true or j->0->>'wynik_usuniety_powod' <> POWOD or j->0->'ukonczony_at' <> 'null'::jsonb or j->0->'wynik_s' <> 'null'::jsonb
    then raise exception 'FAIL 5g: moje zapisy po usunięciu: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  execute 'reset role';
  if exists (select 1 from jsonb_array_elements(j) x where (x->>'wynik_usuniety')::boolean is not false or x->'wynik_usuniety_powod' <> 'null'::jsonb) then raise exception 'FAIL 5h: moje zapisy bez usunięcia: %', j; end if;
  n := n + 8;

  -- 6. usuniętego wyniku nie przywraca automat ani wskazanie, także po wycofaniu i ponownym zapisie tego samego konta
  j := public.akcja_bieg_wynik_z_treningu(u[2], null);
  k := public.akcja_bieg_wynik_z_treningu(u[2], l[2]);
  if (j->>'ok')::boolean or j->>'powod' <> 'usuniety' or (k->>'ok')::boolean or k->>'powod' <> 'usuniety' then raise exception 'FAIL 6a: automat albo wskazanie po usunięciu: % %', j, k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(u[2], l[2]);
  if (j->>'ok')::boolean or j->>'powod' <> 'usuniety' then raise exception 'FAIL 6b: „Wskaż trening” po usunięciu: %', j; end if;
  j := public.akcja_bieg_wycofaj(u[2]);
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 6c: wycofanie zapisu bez wyniku (regulamin § 4 ust. 3): %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 5, true, false, W, 'Bogna');
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 6d: ponowny zapis: %', j; end if;
  v_nowy := (j->>'id')::uuid;
  j := public.akcja_bieg_wynik_ustal(v_nowy, null);
  k := public.akcja_bieg_wynik_ustal(v_nowy, l[2]);
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' <> 'usuniety' or (k->>'ok')::boolean or k->>'powod' <> 'usuniety' then raise exception 'FAIL 6e: ponowny zapis odzyskał usunięty wynik: % %', j, k; end if;
  if (select ukonczony_at from public.akcja_bieg_uczestnicy where id = v_nowy) is not null or (select count(*) from public.notifications where athlete_id = ka[2] and type = 'bieg_wynik') <> 1 then raise exception 'FAIL 6f: stan po próbach odzyskania'; end if;
  n := n + 6;

  -- 7. dziecko: usunięcie (powiadomienie z imieniem), rodzic nie wpisze dystansu od nowa; zaliczenie przez organizatora przywraca i czyści usunięcie, bez drugiej odznaki
  v_ile := (select count(*) from public.notifications where athlete_id = ka[1] and type = 'badge');
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_usun_wynik(u[5], 'dystans do potwierdzenia');
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (select dystans_wlasny_km from public.akcja_bieg_uczestnicy where id = u[5]) is not null then raise exception 'FAIL 7a: usunięcie wyniku dziecka: %', j; end if;
  if not exists (select 1 from public.notifications where athlete_id = ka[1] and type = 'bieg_wynik'
                   and message = 'Organizator usunął wynik dziecka Zosia w biegu „Bieg próbny” (powód: dystans do potwierdzenia). Dyplomu dziecka już nie ma. Jeśli to pomyłka, napisz do organizatora (kontakt na stronie biegu).')
    then raise exception 'FAIL 7b: powiadomienie o usunięciu wyniku dziecka'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dziecko_ukoncz(u[5], 2);
  execute 'reset role';
  if (j->>'ok')::boolean or j->>'powod' <> 'usuniety' then raise exception 'FAIL 7c: rodzic wpisał dystans po usunięciu: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(u[5], 2.5, null);
  k := public.akcja_bieg_panel('proba-bieg');
  execute 'reset role';
  if (j->>'ok')::boolean is not true or exists (select 1 from public.akcja_bieg_uczestnicy x where x.id = u[5] and (x.wynik_usuniety_at is not null or x.wynik_usuniety_powod is not null or x.wynik_usuniety_przez is not null or x.dystans_wlasny_km <> 2.5 or x.ukonczony_at is null))
    then raise exception 'FAIL 7d: zaliczenie przez organizatora ma przywrócić wynik i wyczyścić usunięcie: %', j; end if;
  if not exists (select 1 from public.notifications where athlete_id = ka[1] and type = 'bieg_wynik' and message = 'Organizator zaliczył bieg dziecka Zosia („Bieg próbny”). Dyplom pobierzesz na stronie biegu.') then raise exception 'FAIL 7e: powiadomienie o zaliczeniu dziecka'; end if;
  if (select count(*) from public.notifications where athlete_id = ka[1] and type = 'badge') <> v_ile then raise exception 'FAIL 7f: druga odznaka po przywróceniu'; end if;
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 5;
  if e->'do_sprawdzenia' <> '[]'::jsonb or (e->>'wynik_usuniety')::boolean then raise exception 'FAIL 7g: panel po przywróceniu: %', e; end if;
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 2;
  if (e->>'wynik_usuniety')::boolean is not true or e->>'wynik_usuniety_powod' <> POWOD or e->'do_sprawdzenia' <> '[]'::jsonb then raise exception 'FAIL 7h: panel z usuniętym wynikiem: %', e; end if;
  n := n + 8;

  -- 8. poprawka organizatora: nowy wynik w „moich zapisach” (dyplom z nowym dystansem i czasem), jedno powiadomienie; ta sama poprawka drugi raz nic nie wysyła
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(u[1], 5, 1600);
  k := public.akcja_bieg_zalicz_recznie(u[1], 5, 1600);
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (k->>'ok')::boolean is not true then raise exception 'FAIL 8a: poprawka: % %', j, k; end if;
  if (select count(*) from public.notifications where athlete_id = ka[1] and type = 'bieg_wynik' and message = 'Twój wynik w biegu „Bieg próbny” się zmienił (poprawka organizatora), pobierz dyplom jeszcze raz.') <> 1
    then raise exception 'FAIL 8b: jedno powiadomienie o poprawce (druga, ta sama, bez powiadomienia)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  execute 'reset role';
  select x into e from jsonb_array_elements(j) x where x->>'rodzaj' = 'ja';
  if (e->>'wynik_s')::int <> 1600 or (e->>'wynik_dystans_km')::int <> 5 or e->'wynik_trening_km' <> 'null'::jsonb or e->'ukonczony_at' = 'null'::jsonb then raise exception 'FAIL 8c: moje zapisy po poprawce: %', e; end if;
  select x into e from jsonb_array_elements(j) x where (x->>'numer')::int = 5;
  if (e->>'dystans_wlasny_km')::numeric <> 2.5 then raise exception 'FAIL 8d: dziecko po zaliczeniu: %', e; end if;
  n := n + 4;

  -- 9. zaliczenie zapisu bez wyniku: powiadomienie o zaliczeniu; własna zmiana uczestnika („Wskaż inny trening”) bez powiadomienia, flaga znika z wynikiem
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[4], 5.2, '26:00', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '15 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tdf-4b') returning id into v_log;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[4], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(u[4], v_log);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_zalicz_recznie(u[7], 5, null);
  e := public.akcja_bieg_panel('proba-bieg');
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (k->>'ok')::boolean is not true then raise exception 'FAIL 9a: % %', j, k; end if;
  if exists (select 1 from public.notifications where athlete_id = ka[4] and type = 'bieg_wynik') then raise exception 'FAIL 9b: powiadomienie po własnej zmianie uczestnika'; end if;
  if (select array_agg(message) from public.notifications where athlete_id = ka[5] and type = 'bieg_wynik') <> array['Organizator zaliczył Twój bieg „Bieg próbny”. Dyplom pobierzesz na stronie biegu.'] then raise exception 'FAIL 9c: powiadomienie o zaliczeniu'; end if;
  if (select x->'do_sprawdzenia' from jsonb_array_elements(e->'uczestnicy') x where (x->>'numer')::int = 4) <> '[]'::jsonb then raise exception 'FAIL 9d: flaga po wskazaniu zwykłego treningu'; end if;
  n := n + 4;

  -- 11. RANKING (17.11): wynik ręczny w rankingu z dopiskiem; tempo spoza 3:00–36:00/km (także z zegarka) do rankingu dopiero po „Zatwierdź”; „Odrzuć” = prośba o dowód;
  --     zmiana wyniku kasuje decyzję. Stan: konto 4 zegarek 5,2 km 26:00, konto 1 wynik ręczny organizatora 5 km 26:40, konto 3 zegarek 5 km 12:00 (2:24/km), konto 5 bez czasu
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  execute 'reset role';
  if (j->>'w_rankingu')::int <> 2 or (j->'lista'->0->>'numer')::int <> 4 or (j->'lista'->0->>'czas_s')::int <> 1560 or (j->'lista'->0->>'miejsce')::int <> 1 or (j->'lista'->0->>'reczny')::boolean
     or (j->'lista'->1->>'numer')::int <> 1 or (j->'lista'->1->>'czas_s')::int <> 1600 or (j->'lista'->1->>'miejsce')::int <> 2 or (j->'lista'->1->>'reczny')::boolean is not true
    then raise exception 'FAIL 11a: ranking: zegarek 26:00 i wynik ręczny 26:40 z dopiskiem, bez wyniku do weryfikacji: %', j; end if;
  if exists (select 1 from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 3 and (x ? 'czas_s' or x ? 'miejsce')) then raise exception 'FAIL 11b: wynik do weryfikacji z czasem na liście'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.akcja_bieg_panel('proba-bieg');
  execute 'reset role';
  if (select count(*) from jsonb_array_elements(k->'uczestnicy') x where (x->>'do_weryfikacji')::boolean) <> 1
     or (select x->>'weryfikacja' from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 3) is not null
     or (select (x->>'do_weryfikacji')::boolean from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 3) is not true then raise exception 'FAIL 11c: panel: do weryfikacji tylko konto 3: %', k->'uczestnicy'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  begin perform public.akcja_bieg_weryfikuj(u[3], 'zatwierdz'); raise exception 'FAIL 11d: weryfikacja przez zawodnika'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  if (j->0->>'do_weryfikacji')::boolean is not true or j->0->'weryfikacja' <> 'null'::jsonb then raise exception 'FAIL 11e: moje zapisy: do weryfikacji: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_weryfikuj(u[3], 'tak');
  if (j->>'ok')::boolean or j->>'powod' <> 'decyzja' then raise exception 'FAIL 11f: zła decyzja: %', j; end if;
  j := public.akcja_bieg_weryfikuj(u[6], 'zatwierdz');
  if (j->>'ok')::boolean or j->>'powod' <> 'dziecko' then raise exception 'FAIL 11g: dziecko: %', j; end if;
  j := public.akcja_bieg_weryfikuj(u[2], 'zatwierdz');
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 11h: wycofany: %', j; end if;
  j := public.akcja_bieg_weryfikuj(v_nowy, 'zatwierdz');
  if (j->>'ok')::boolean or j->>'powod' <> 'bez_wyniku' then raise exception 'FAIL 11i: bez wyniku: %', j; end if;
  j := public.akcja_bieg_weryfikuj(u[3], 'odrzuc');
  k := public.akcja_bieg_weryfikuj(u[3], 'odrzuc');
  execute 'reset role';
  if (j->>'ok')::boolean is not true or j->>'weryfikacja' <> 'odrzucony' or (k->>'ok')::boolean is not true then raise exception 'FAIL 11j: odrzucenie: % %', j, k; end if;
  if (select array_agg(message) from public.notifications where athlete_id = ka[3] and type = 'bieg_wynik')
     <> array['Organizator prosi o dowód Twojego wyniku w biegu „Bieg próbny” (np. zapis z zegarka, zrzut z aplikacji). Do czasu sprawdzenia wynik jest poza rankingiem; ukończenie i dyplom zostają. Kontakt na stronie biegu.']
    then raise exception 'FAIL 11k: jedno powiadomienie z prośbą o dowód'; end if;
  if (select weryfikacja_przez from public.akcja_bieg_uczestnicy where id = u[3]) is distinct from tr or (select ukonczony_at from public.akcja_bieg_uczestnicy where id = u[3]) is null then raise exception 'FAIL 11l: ślad decyzji, ukończenie zostaje'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  execute 'reset role';
  if (j->>'w_rankingu')::int <> 2 or exists (select 1 from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 3 and x ? 'czas_s') then raise exception 'FAIL 11m: odrzucony wynik poza rankingiem'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_weryfikuj(u[3], 'zatwierdz');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  k := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (k->>'w_rankingu')::int <> 3 or (k->'lista'->0->>'numer')::int <> 3 or (k->'lista'->0->>'czas_s')::int <> 720 or (k->'lista'->0->>'miejsce')::int <> 1
    then raise exception 'FAIL 11n: zatwierdzony wynik z zegarka 12:00 na pierwszym miejscu: % %', j, k; end if;
  if (select count(*) from public.notifications where athlete_id = ka[3] and type = 'bieg_wynik' and message like 'Organizator sprawdził Twój wynik%') <> 1 then raise exception 'FAIL 11o: powiadomienie o zatwierdzeniu'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
    values (ka[3], 5.0, '12:30', 'Spokojny', 'Run', ((DZIS - 1)::timestamp + interval '16 hours') at time zone 'Europe/Warsaw', 'intervals', 'test-bieg', 'tdf-3b') returning id into v_log;
  perform set_config('request.jwt.claims', json_build_object('sub', ku[3], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wynik_ustal(u[3], v_log);
  k := public.akcja_bieg_moi('proba-bieg');
  execute 'reset role';
  if (j->>'ok')::boolean is not true or (select weryfikacja from public.akcja_bieg_uczestnicy where id = u[3]) is not null or k->0->'weryfikacja' <> 'null'::jsonb or (k->0->>'do_weryfikacji')::boolean is not true
    then raise exception 'FAIL 11p: nowy wynik kasuje decyzję: % %', j, k; end if;
  if public.akcja_bieg_czas_rankingu((select x from public.akcja_bieg_uczestnicy x where x.id = u[3]), (select x from public.akcja_biegi x where x.id = b)) is not null then raise exception 'FAIL 11q: nowy wynik do weryfikacji bez decyzji w rankingu'; end if;
  -- wolne tempo: organizator wpisuje 5 km w 3:00:01 → do weryfikacji, poza rankingiem; powód w panelu
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zalicz_recznie(u[7], 5, 10801);
  k := public.akcja_bieg_panel('proba-bieg');
  execute 'reset role';
  select x into e from jsonb_array_elements(k->'uczestnicy') x where (x->>'numer')::int = 7;
  if (j->>'ok')::boolean is not true or (e->>'do_weryfikacji')::boolean is not true or e->'do_sprawdzenia' <> '["tempo wolniejsze niż 36:00/km"]'::jsonb
     or public.akcja_bieg_czas_rankingu((select x from public.akcja_bieg_uczestnicy x where x.id = u[7]), (select x from public.akcja_biegi x where x.id = b)) is not null then raise exception 'FAIL 11r: wolne tempo do weryfikacji: %', e; end if;
  -- progi weryfikacji na granicy (konto 1: wynik organizatora bez treningu, 5 km, na chwilę zmieniony): 15:00 i 3:00:00 jeszcze bez weryfikacji
  for wr in select x from jsonb_array_elements('[[899, true], [900, false], [10800, false], [10801, true]]'::jsonb) x loop
    e := wr.x;
    update public.akcja_bieg_uczestnicy set wynik_s = (e->>0)::int where id = u[1];
    if public.akcja_bieg_do_weryfikacji((select x from public.akcja_bieg_uczestnicy x where x.id = u[1])) is distinct from (e->>1)::boolean then raise exception 'FAIL 11s: 5 km w % s: do weryfikacji ma być %', e->>0, e->>1; end if;
    n := n + 1;
  end loop;
  update public.akcja_bieg_uczestnicy set wynik_s = 1600 where id = u[1];
  n := n + 18;

  -- 10. razem osiem powiadomień 'bieg_wynik' (usunięcie ×2, zaliczenie ×2, poprawka ×2, odrzucenie, zatwierdzenie), żadne z czasem
  if (select count(*) from public.notifications where athlete_id = any(ka) and type = 'bieg_wynik') <> 8 then raise exception 'FAIL 10a: liczba powiadomień: %', (select count(*) from public.notifications where athlete_id = any(ka) and type = 'bieg_wynik'); end if;
  if exists (select 1 from public.notifications where athlete_id = any(ka) and type = 'bieg_wynik' and (message ~ '\d:\d\d' or message ~ '1600')) then raise exception 'FAIL 10b: czas w powiadomieniu'; end if;
  n := n + 2;

  raise exception 'TESTY DYPLOMU I FLAG ZIELONE: % sprawdzeń', n;
end $test$;
