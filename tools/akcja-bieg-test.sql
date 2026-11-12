-- Testy BIEGU WIRTUALNEGO (20261120_akcja_bieg.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS). Bieg próbny przy ulicy próbnej.
-- Uprawnienia (tabele bez dostępu z przeglądarki, funkcje tylko dla authenticated), zapis raz na konto, dystans i regulamin, imię, dziecko z oświadczeniem i limitem,
-- numery rosną i nie wracają, moje zapisy tylko własne, licznik: liczby zbiorcze bez kont/czasów, wycofanie tylko własnych, faza z dat, kolumna w zgłoszeniach cegiełek.
-- Jedna transakcja, zawsze wycofana (tools/akcja-bieg-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; j jsonb; k jsonb; zw uuid; zw2 uuid; b uuid; u1 uuid; dz uuid; zg uuid; x record;
  W constant text := '2026-11-v1';
begin
  select a.user_id into zw from public.athletes a where a.user_id is not null and a.full_name is not null and btrim(a.full_name) ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]{2,20}( |$)'
    and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  select a.user_id into zw2 from public.athletes a where a.user_id is not null and a.user_id <> zw and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at desc limit 1;
  if zw is null or zw2 is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', current_date, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-bieg', 'Bieg próbny', current_date + 2, current_date + 3, current_date + 6, '{5,10}', 'otwarty', W) returning id into b;

  -- 1. uprawnienia: tabele bez dostępu z przeglądarki; anon nie wykona funkcji; publiczna funkcja tylko dla licznika
  if has_table_privilege('anon', 'public.akcja_biegi', 'SELECT') or has_table_privilege('authenticated', 'public.akcja_biegi', 'SELECT')
     or has_table_privilege('anon', 'public.akcja_bieg_uczestnicy', 'SELECT') or has_table_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'SELECT')
     or has_table_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'INSERT') then raise exception 'FAIL 1a: tabele biegu dostępne z przeglądarki'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_publiczny(text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_publiczny(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'EXECUTE') then raise exception 'FAIL 1b: funkcje biegu otwarte dla anon albo publiczna dla przeglądarki'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin perform public.akcja_bieg_zapisz('proba-bieg', 5, false, false, W); raise exception 'FAIL 1c: anon zapisuje się'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 2. zapis siebie: ok z numerem 1; drugi raz odrzucony; zły dystans, zły regulamin; imię z profilu
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-bieg', 5, true, true, W);
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 1 or j->>'imie' !~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]{2,20}$' then raise exception 'FAIL 2a: zapis: %', j; end if;
  u1 := (j->>'id')::uuid;
  j := public.akcja_bieg_zapisz('proba-bieg', 10, false, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'juz_zapisany' or (j->>'numer')::int <> 1 then raise exception 'FAIL 2b: drugi zapis tego konta: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 7, false, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'dystans' then raise exception 'FAIL 2c: dystans spoza listy: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 5, false, false, 'stara');
  if (j->>'ok')::boolean or j->>'powod' <> 'regulamin' or j->>'regulamin_wersja' <> W then raise exception 'FAIL 2d: stary regulamin: %', j; end if;
  j := public.akcja_bieg_zapisz('nie-ma-takiego', 5, false, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 2e: nieistniejący bieg: %', j; end if;
  execute 'reset role';
  n := n + 5;

  -- 3. drugie konto: numer 2, dystans 10, imię podane
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-bieg', 10, false, false, W, 'Ola');
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 2 or j->>'imie' <> 'Ola' then raise exception 'FAIL 3a: zapis drugiego konta: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 10, false, false, W, 'Ola');
  if (j->>'ok')::boolean or j->>'powod' <> 'juz_zapisany' then raise exception 'FAIL 3b: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 10, false, false, W, 'Jan Kowalski');
  if (j->>'ok')::boolean or j->>'powod' <> 'imie' then raise exception 'FAIL 3c: imię z nazwiskiem ma być odrzucone przed sprawdzeniem zapisu: %', j; end if;
  execute 'reset role';
  n := n + 3;

  -- 4. dziecko: bez oświadczenia nie; z oświadczeniem numer 3; imię z nazwiskiem nie; limit na konto
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Zosia', true, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'oswiadczenie' then raise exception 'FAIL 4a: dziecko bez oświadczenia: %', j; end if;
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Zosia', true, true, W);
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 3 then raise exception 'FAIL 4b: dziecko: %', j; end if;
  dz := (j->>'id')::uuid;
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Zosia Kowalska', true, true, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'imie' then raise exception 'FAIL 4c: imię z nazwiskiem: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set limit_dzieci = 1 where id = b;
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Kuba', false, true, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'limit' then raise exception 'FAIL 4d: limit dzieci: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set limit_dzieci = 6 where id = b;
  select * into x from public.akcja_bieg_uczestnicy where id = dz;
  if x.rodzaj <> 'dziecko' or x.dystans_km is not null or x.oswiadczenie_rodzica_at is null or x.konto_id is distinct from (select a.id from public.athletes a where a.user_id = zw) or x.zgoda_email then raise exception 'FAIL 4e: wiersz dziecka'; end if;
  n := n + 5;

  -- 5. moje zapisy: tylko własne konto (ja + dziecko), bez cudzych
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  if jsonb_array_length(j) <> 2 or not exists (select 1 from jsonb_array_elements(j) e where e->>'rodzaj' = 'dziecko' and e->>'imie' = 'Zosia' and (e->>'numer')::int = 3)
     or exists (select 1 from jsonb_array_elements(j) e where e->>'imie' = 'Ola') then raise exception 'FAIL 5a: moje zapisy: %', j; end if;
  if exists (select 1 from jsonb_array_elements(j) e where e ? 'konto_id') then raise exception 'FAIL 5b: konto w odpowiedzi'; end if;
  execute 'reset role';
  n := n + 2;

  -- 6. licznik próby: pole bieg z liczbami zbiorczymi; bez kont, czasów, e-maili; ukończyli puste; imię tylko za zgodą po ukończeniu
  j := public.akcja_licznik('proba');
  k := j->'bieg';
  if k is null or k = 'null'::jsonb then raise exception 'FAIL 6a: licznik bez pola bieg: %', left(j::text, 200); end if;
  if k->>'slug' <> 'proba-bieg' or k->>'faza' <> 'zapisy' or (k->>'zapisani')::int <> 3 or (k->>'dzieci')::int <> 1 or (k->'zapisani_na'->>'5')::int <> 1 or (k->'zapisani_na'->>'10')::int <> 1
     or (k->>'ukonczyli_n')::int <> 0 or jsonb_array_length(k->'ukonczyli') <> 0 or k->'dystanse_km' <> '[5, 10]'::jsonb or k->'wsparcie_kwoty_zl' <> '[20, 30, 50]'::jsonb then raise exception 'FAIL 6b: pole bieg: %', k; end if;
  if k::text ~* 'konto|wynik_s|email|oswiadczenie|@' then raise exception 'FAIL 6c: w polu bieg dane prywatne: %', k; end if;
  update public.akcja_bieg_uczestnicy set ukonczony_at = now(), wynik_s = 1800, wynik_dystans_km = 5, odznaka = 'zwykla' where id = u1;
  update public.akcja_bieg_uczestnicy set ukonczony_at = now(), dystans_wlasny_km = 1.5, odznaka = 'zwykla' where id = dz;
  update public.akcja_bieg_uczestnicy set ukonczony_at = now(), wynik_s = 3000, wynik_dystans_km = 10 where bieg_id = b and imie = 'Ola';
  k := public.akcja_licznik('proba')->'bieg';
  if (k->>'ukonczyli_n')::int <> 3 or jsonb_array_length(k->'ukonczyli') <> 3 then raise exception 'FAIL 6d: ukończyli: %', k->'ukonczyli'; end if;
  if exists (select 1 from jsonb_array_elements(k->'ukonczyli') e where (e->>'numer')::int = 2 and e->>'imie' is not null) then raise exception 'FAIL 6e: imię bez zgody publicznie'; end if;
  if not exists (select 1 from jsonb_array_elements(k->'ukonczyli') e where (e->>'numer')::int = 3 and e->>'imie' = 'Zosia' and (e->>'dziecko')::boolean and (e->>'dystans_km')::numeric = 1.5) then raise exception 'FAIL 6f: dziecko na liście: %', k->'ukonczyli'; end if;
  if k::text ~ '1800|3000' then raise exception 'FAIL 6g: czas publicznie'; end if;
  n := n + 7;

  -- 7. wycofanie: cudzego nie; własnego ukończonego nie; własnego dziecka po cofnięciu ukończenia tak; numer nie wraca
  update public.akcja_bieg_uczestnicy set ukonczony_at = null where id = dz;
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wycofaj(dz);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_twoj' then raise exception 'FAIL 7a: cudze wycofanie: %', j; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_wycofaj(u1);
  if (j->>'ok')::boolean or j->>'powod' <> 'ukonczony' then raise exception 'FAIL 7b: wycofanie po ukończeniu: %', j; end if;
  j := public.akcja_bieg_wycofaj(dz);
  if not (j->>'ok')::boolean then raise exception 'FAIL 7c: wycofanie dziecka: %', j; end if;
  j := public.akcja_bieg_wycofaj(dz);
  if (j->>'ok')::boolean or j->>'powod' <> 'juz_wycofany' then raise exception 'FAIL 7d: podwójne wycofanie: %', j; end if;
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Zosia', false, true, W);
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 4 then raise exception 'FAIL 7e: numer po wycofaniu ma być 4: %', j; end if;
  execute 'reset role';
  if (public.akcja_licznik('proba')->'bieg'->>'zapisani')::int <> 3 then raise exception 'FAIL 7f: wycofany liczony'; end if;
  n := n + 6;

  -- 8. faza z dat i statusu; zapis tylko w zapisy/trwa; szkic niewidoczny w liczniku
  update public.akcja_biegi set dzien_od = current_date, dzien_do = current_date + 1, wynik_do = current_date + 3 where id = b;
  if public.akcja_licznik('proba')->'bieg'->>'faza' <> 'trwa' then raise exception 'FAIL 8a: faza trwa'; end if;
  update public.akcja_biegi set dzien_od = current_date - 3, dzien_do = current_date - 2, wynik_do = current_date where id = b;
  if public.akcja_licznik('proba')->'bieg'->>'faza' <> 'wyniki' then raise exception 'FAIL 8b: faza wyniki'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Ala', false, true, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'zamkniete' or j->>'faza' <> 'wyniki' then raise exception 'FAIL 8c: zapis po weekendzie: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set wynik_do = current_date - 1 where id = b;
  if public.akcja_licznik('proba')->'bieg'->>'faza' <> 'zakonczony' then raise exception 'FAIL 8d: faza zakonczony'; end if;
  update public.akcja_biegi set status = 'szkic' where id = b;
  if public.akcja_licznik('proba')->'bieg' is not null and public.akcja_licznik('proba')->'bieg' <> 'null'::jsonb then raise exception 'FAIL 8e: szkic widoczny'; end if;
  update public.akcja_biegi set status = 'otwarty', dzien_od = current_date + 2, dzien_do = current_date + 3, wynik_do = current_date + 6 where id = b;
  begin
    update public.akcja_biegi set dzien_do = current_date + 5 where id = b;
    raise exception 'FAIL 8f: weekend dłuższy niż 2 dni przeszedł';
  exception when check_violation then null;
  end;
  n := n + 6;

  -- 9. zgłoszenia cegiełek: kolumna bieg_uczestnik_id z kluczem obcym; wpis z biegu; usunięty uczestnik → NULL (zgłoszenie zostaje)
  insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, email, zgoda_na_wymienienie, kwota_gr, bieg_uczestnik_id)
    values ('proba', 'cegielka', 'Zosia', null, true, 2000, (select id from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 4)) returning id into zg;
  if (select bieg_uczestnik_id from public.akcja_firmy_zgloszenia where id = zg) is null then raise exception 'FAIL 9a: powiązanie zgłoszenia z uczestnikiem'; end if;
  begin
    insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, zgoda_na_wymienienie, bieg_uczestnik_id) values ('proba', 'cegielka', 'Kuba', true, gen_random_uuid());
    raise exception 'FAIL 9b: zgłoszenie z nieistniejącym uczestnikiem przeszło';
  exception when foreign_key_violation then null;
  end;
  delete from public.akcja_bieg_uczestnicy where bieg_id = b and numer = 4;
  if (select bieg_uczestnik_id from public.akcja_firmy_zgloszenia where id = zg) is not null then raise exception 'FAIL 9c: po usunięciu uczestnika powiązanie ma być NULL'; end if;
  if not has_column_privilege('authenticated', 'public.akcja_firmy_zgloszenia', 'bieg_uczestnik_id', 'SELECT') then
    null;   -- zgłoszenia nie mają SELECT z przeglądarki (EF service role): brak grantu to stan oczekiwany
  end if;
  n := n + 3;

  raise exception 'TESTY BIEGU ZIELONE: % sprawdzeń', n;
end $T$;
