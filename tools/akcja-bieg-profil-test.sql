-- Test po skutku 20261218 (regulamin v8: imię na liście „Ukończyli” prowadzi do publicznego profilu). W transakcji z .sh, zawsze wycofanej.
-- Akcja 'proba' (testowa): bieg próbny 'proba-v8' (v8) i kontrolny 'proba-v7p' (v7), oba na 5 km; sześć kont bez treningów z ostatnich 40 dni i dziecko; imiona wymyślone.
-- Profil publiczny i data urodzenia kont testowych ustawiane tylko w tej transakcji. Na końcu prawdziwy bieg-mikolajki (gdy jest): same liczby, bez id i imion.
do $test$
declare
  n int := 0; j jsonb; jp jsonb; e jsonb; b8 uuid; b7 uuid; ka uuid[]; i int; v text;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date; W8 constant text := '2026-11-v8'; W7 constant text := '2026-11-v7';
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
  if has_function_privilege('anon', LISTA, 'execute') or has_function_privilege('authenticated', LISTA, 'execute') or not has_function_privilege('service_role', LISTA, 'execute') then raise exception 'FAIL 1: uprawnienia listy'; end if;
  n := n + 1;

  -- 2. konta: 1 Anna publiczny, bez daty, ranking · 2 Bogna publiczny, bez daty, bez rankingu · 3 Celina publiczny, ranking, bez zgody na imię
  --    · 4 Dawid prywatny, dorosły · 5 Ewa publiczny, 30 lat, bez rankingu · 6 Filip publiczny, 17 lat · 7 dziecko Ewy (każdy wykluczony jednym warunkiem)
  select array_agg(y.id order by y.created_at, y.id) into ka
    from (select a.id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.training_logs l where l.athlete_id = a.id and l.logged_at > now() - interval '40 days') order by a.created_at, a.id limit 6) y;
  if coalesce(array_length(ka, 1), 0) < 6 then raise exception 'FAIL 2-0: za mało kont do testu (6 kont bez treningów z 40 dni)'; end if;
  update public.athletes set is_public = true where id in (ka[1], ka[2], ka[3], ka[5], ka[6]);
  update public.athletes set is_public = false, date_of_birth = DZIS - interval '40 years' where id = ka[4];
  update public.athletes set date_of_birth = DZIS - interval '30 years' where id = ka[5];
  update public.athletes set date_of_birth = DZIS - interval '17 years' where id = ka[6];
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-v8', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W8) returning id into b8;
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-v7p', 'Bieg próbny', DZIS - 5, DZIS + 1, DZIS + 1, '{5}', 'otwarty', W7) returning id into b7;
  for i in 1..6 loop
    insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at, ukonczony_at, wynik_dystans_km, odznaka)
      values (b8, ka[i], 'ja', (array['Anna', 'Bogna', 'Celina', 'Dawid', 'Ewa', 'Filip'])[i], i <> 3, i, 5, W8, case when i in (1, 3, 6) then now() end, now(), 5, 'zwykla');
  end loop;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_wlasny_km, regulamin_wersja, oswiadczenie_rodzica_at, ukonczony_at, odznaka)
    values (b8, ka[5], 'dziecko', 'Zosia', true, 7, 1.5, W8, now(), now(), 'zwykla');
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, ranking_zgoda_at, ukonczony_at, wynik_dystans_km, odznaka)
    values (b7, ka[1], 'ja', 'Anna', true, 1, 5, W7, now(), now(), 5, 'zwykla');
  n := n + 1;

  -- 3. lista v8: link tylko u pełnoletnich z publicznym profilem i imieniem (data → 18+, bez daty → zgoda na ranking)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-v8', 0, 50, null);
  jp := public.akcja_bieg_ukonczyli('proba-v7p', 0, 50, null);
  execute 'reset role';
  for i in 1..7 loop
    select x into e from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = i;
    if e is null then raise exception 'FAIL 3-0: brak numeru % na liście', i; end if;
    if i in (1, 5) and (e->>'profil')::uuid is distinct from ka[i] then raise exception 'FAIL 3a: numer % bez linku do własnego profilu: %', i, e; end if;
    if i not in (1, 5) and e ? 'profil' then raise exception 'FAIL 3b: numer % z linkiem, a nie powinien (%)', i, (array['', 'bez daty i bez rankingu', 'bez zgody na imię', 'profil prywatny', '', '17 lat', 'dziecko'])[i]; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(j->'lista') x where x ? 'profil' and x->>'imie' is null) > 0 then raise exception 'FAIL 3c: link bez imienia'; end if;
  if (select count(*) from jsonb_array_elements(jp->'lista') x where x ? 'profil') > 0 then raise exception 'FAIL 3d: bieg na v7 z linkiem do profilu'; end if;
  n := n + 9;

  -- 4. profil zmieniony na prywatny: link znika od razu (liczony na bieżąco)
  update public.athletes set is_public = false where id = ka[1];
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-v8', 0, 50, null);
  execute 'reset role';
  if (select count(*) from jsonb_array_elements(j->'lista') x where (x->>'numer')::int = 1 and x ? 'profil') > 0 then raise exception 'FAIL 4: profil prywatny dalej z linkiem'; end if;
  n := n + 1;

  -- 5. prawdziwy bieg (gdy jest): co najmniej v8 (blizna-309); link tylko przy imieniu, nie u dzieci, zawsze do publicznego profilu; w wyniku same liczby
  if exists (select 1 from public.akcja_biegi where slug = 'bieg-mikolajki') then
    if not public.akcja_bieg_wersja_od((select regulamin_wersja from public.akcja_biegi where slug = 'bieg-mikolajki'), 8) then raise exception 'FAIL 5a: bieg-mikolajki poniżej v8'; end if;
    execute 'set local role service_role';
    j := public.akcja_bieg_ukonczyli('bieg-mikolajki', 0, 100, null);
    execute 'reset role';
    if exists (select 1 from jsonb_array_elements(j->'lista') x where x ? 'profil' and (x->>'imie' is null or (x->>'dziecko')::boolean
                 or not exists (select 1 from public.athletes a where a.id = (x->>'profil')::uuid and a.is_public))) then raise exception 'FAIL 5b: bieg-mikolajki: link bez imienia, u dziecka albo do niepublicznego profilu'; end if;
    raise notice 'bieg-mikolajki: % na liście, % z linkiem do profilu', j->>'razem', (select count(*) from jsonb_array_elements(j->'lista') x where x ? 'profil');
    n := n + 2;
  end if;

  raise exception 'TESTY PROFILU NA LISCIE ZIELONE: % sprawdzeń', n;
end $test$;
