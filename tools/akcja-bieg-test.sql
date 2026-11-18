-- Testy BIEGU WIRTUALNEGO (20261120_akcja_bieg.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS). Bieg próbny przy ulicy próbnej.
-- Strażnik licznika (prawdziwa ulica przed/po migracji identyczna poza kluczem bieg, obiema drogami produkcji: service_role jak EF i authenticated jak RPC zalogowanych), uprawnienia (tabele bez dostępu z przeglądarki, funkcje tylko dla authenticated,
-- lista „ukończyli” tylko dla roli serwisowej), imiona (Łucja, Żaneta, Anna-Maria tak; dwa słowa, cyfry, znaczniki nie), zapis raz na konto, dystans i regulamin, dziecko z oświadczeniem
-- i limitem, nabijanie numerów (3 zapisy „ja”, 3 × limit dzieci łącznie z wycofanymi), moje zapisy tylko własne, licznik tylko z liczbami zbiorczymi, lista ze stronicowaniem,
-- wycofanie tylko własnych, fazy z dat (zapis także w „wyniki”, do wynik_do), CHECK weekendu, kolumna w zgłoszeniach cegiełek, RANKING (13.11: zgoda osobna od imienia, dzieci i niepełnoletni nigdy, miejsce osobno 5 i 10 km). Jedna transakcja, zawsze wycofana (tools/akcja-bieg-test.sh).
do $T$
declare
  n int := 0; j jsonb; k jsonb; j0 jsonb; zw uuid; zw2 uuid; zwa uuid; b uuid; u1 uuid; dz uuid; dz2 uuid; zg uuid; x record; i int; v text; ka uuid[]; ku uuid[]; nr int;
  W constant text := '2026-11-v1'; DZIS constant date := (now() at time zone 'Europe/Warsaw')::date;   -- doba warszawska jak w akcja_bieg_faza (data bazy jest w UTC: między 0:00 a 1:00 w Polsce dawała wczoraj i test fazy padał)
begin
  select a.user_id into zw from public.athletes a where a.user_id is not null and a.full_name is not null and btrim(a.full_name) ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]{2,20}( |$)'
    and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  select a.user_id into zw2 from public.athletes a where a.user_id is not null and a.user_id <> zw and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at desc limit 1;
  if zw is null or zw2 is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  select a.id into zwa from public.athletes a where a.user_id = zw;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', DZIS, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  update public.akcje set konta_testowe = coalesce(konta_testowe, '{}'::uuid[]) || array(select a.id from public.athletes a) where slug = 'proba';   -- 20261211: bieg akcji testowej przyjmuje tylko konta_testowe; konta testu dopisane w tej transakcji
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, termin_zapasowy_od, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-bieg', 'Bieg próbny', DZIS + 2, DZIS + 3, DZIS + 6, DZIS + 9, '{5,10}', 'otwarty', W) returning id into b;

  -- 0. strażnik licznika: prawdziwa ulica przed migracją (temp z .sh, jako service_role) i po niej, tą samą rolą: identyczne poza kluczem bieg; akcja_licznik jest SECURITY DEFINER
  if not (select prosecdef from pg_proc where oid = 'public.akcja_licznik(text)'::regprocedure) then raise exception 'FAIL 0a: akcja_licznik nie jest SECURITY DEFINER'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  select t.j into j0 from _licznik_przed t;
  if j0 is null then raise exception 'FAIL 0b: brak stanu licznika sprzed migracji (_licznik_przed)'; end if;
  if (j - 'bieg') <> (j0 - 'bieg') then raise exception 'FAIL 0c: licznik prawdziwej ulicy zmienił się poza kluczem bieg: %', (select string_agg(key, ', ') from (select key from jsonb_each(j - 'bieg') except select key from jsonb_each(j0 - 'bieg') union select key from jsonb_each(j0 - 'bieg') except select key from jsonb_each(j - 'bieg')) d); end if;
  if j ? 'bieg' = false then raise exception 'FAIL 0d: licznik bez klucza bieg'; end if;
  -- druga droga: zalogowani (RPC jako authenticated), to samo konto co przed migracją
  select t.j into j0 from _licznik_przed_zal t;
  if j0 is null then raise exception 'FAIL 0e: brak stanu licznika zalogowanego sprzed migracji (_licznik_przed_zal)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', (select sub from _konto_straznika), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_licznik('dla-fabianka');
  execute 'reset role';
  if (j - 'bieg') <> (j0 - 'bieg') then raise exception 'FAIL 0f: licznik prawdziwej ulicy dla zalogowanego zmienił się poza kluczem bieg: %', (select string_agg(key, ', ') from (select key from jsonb_each(j - 'bieg') except select key from jsonb_each(j0 - 'bieg') union select key from jsonb_each(j0 - 'bieg') except select key from jsonb_each(j - 'bieg')) d); end if;
  if j ? 'bieg' = false then raise exception 'FAIL 0g: licznik zalogowanego bez klucza bieg'; end if;
  n := n + 7;

  -- 1. uprawnienia: tabele bez dostępu z przeglądarki; anon nie wykona funkcji; publiczna i lista tylko dla licznika / roli serwisowej
  if has_table_privilege('anon', 'public.akcja_biegi', 'SELECT') or has_table_privilege('authenticated', 'public.akcja_biegi', 'SELECT')
     or has_table_privilege('anon', 'public.akcja_bieg_uczestnicy', 'SELECT') or has_table_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'SELECT')
     or has_table_privilege('authenticated', 'public.akcja_bieg_uczestnicy', 'INSERT') then raise exception 'FAIL 1a: tabele biegu dostępne z przeglądarki'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_publiczny(text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_publiczny(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.akcja_bieg_ukonczyli(text, integer, integer, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_moi(text)', 'EXECUTE') then raise exception 'FAIL 1b: uprawnienia funkcji biegu'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin perform public.akcja_bieg_zapisz('proba-bieg', 5, false, false, W); raise exception 'FAIL 1c: anon zapisuje się'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 2. zapis siebie: złe imiona odrzucone (dwa słowa, cyfry, znaczniki), „Łucja” przechodzi z numerem 1; drugi raz odrzucony; zły dystans, zły regulamin
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach v in array array['Jan Kowalski', 'Ola2', '<b>x</b>', 'A']::text[] loop
    j := public.akcja_bieg_zapisz('proba-bieg', 5, false, false, W, v);
    if (j->>'ok')::boolean or j->>'powod' <> 'imie' then raise exception 'FAIL 2a: imię „%” miało być odrzucone: %', v, j; end if;
  end loop;
  j := public.akcja_bieg_zapisz('proba-bieg', 5, true, true, W, 'Łucja');
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 1 or j->>'imie' <> 'Łucja' then raise exception 'FAIL 2b: zapis Łucja: %', j; end if;
  u1 := (j->>'id')::uuid;
  j := public.akcja_bieg_zapisz('proba-bieg', 10, false, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'juz_zapisany' or (j->>'numer')::int <> 1 then raise exception 'FAIL 2c: drugi zapis tego konta: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 7, false, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'dystans' then raise exception 'FAIL 2d: dystans spoza listy: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 5, false, false, 'stara');
  if (j->>'ok')::boolean or j->>'powod' <> 'regulamin' or j->>'regulamin_wersja' <> W then raise exception 'FAIL 2e: stary regulamin: %', j; end if;
  j := public.akcja_bieg_zapisz('nie-ma-takiego', 5, false, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 2f: nieistniejący bieg: %', j; end if;
  execute 'reset role';
  n := n + 9;

  -- 3. drugie konto: numer 2, dystans 10, imię z profilu (bez p_imie) albo podane
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-bieg', 10, false, false, W, 'Ola');
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 2 or j->>'imie' <> 'Ola' then raise exception 'FAIL 3a: zapis drugiego konta: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 10, false, false, W, 'Ola');
  if (j->>'ok')::boolean or j->>'powod' <> 'juz_zapisany' then raise exception 'FAIL 3b: %', j; end if;
  execute 'reset role';
  n := n + 2;

  -- 4. dziecko: bez oświadczenia nie; „Żaneta” numer 3 i „Anna-Maria” numer 4; imię z nazwiskiem nie; limit aktywnych na konto
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Żaneta', true, false, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'oswiadczenie' then raise exception 'FAIL 4a: dziecko bez oświadczenia: %', j; end if;
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Żaneta', true, true, W);
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 3 or j->>'imie' <> 'Żaneta' then raise exception 'FAIL 4b: dziecko Żaneta: %', j; end if;
  dz := (j->>'id')::uuid;
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Anna-Maria', false, true, W);
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 4 or j->>'imie' <> 'Anna-Maria' then raise exception 'FAIL 4c: dziecko Anna-Maria (łącznik): %', j; end if;
  dz2 := (j->>'id')::uuid;
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Zosia Kowalska', true, true, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'imie' then raise exception 'FAIL 4d: imię z nazwiskiem: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set limit_dzieci = 2 where id = b;
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Kuba', false, true, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'limit' or (j->>'limit')::int <> 2 then raise exception 'FAIL 4e: limit dzieci: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set limit_dzieci = 6 where id = b;
  select * into x from public.akcja_bieg_uczestnicy where id = dz;
  if x.rodzaj <> 'dziecko' or x.dystans_km is not null or x.oswiadczenie_rodzica_at is null or x.konto_id is distinct from zwa or x.zgoda_email then raise exception 'FAIL 4f: wiersz dziecka'; end if;
  n := n + 6;

  -- 5. moje zapisy: tylko własne konto (ja + dzieci), bez cudzych i bez konta
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  if jsonb_array_length(j) <> 3 or not exists (select 1 from jsonb_array_elements(j) e where e->>'rodzaj' = 'dziecko' and e->>'imie' = 'Żaneta' and (e->>'numer')::int = 3)
     or exists (select 1 from jsonb_array_elements(j) e where e->>'imie' = 'Ola') then raise exception 'FAIL 5a: moje zapisy: %', j; end if;
  if exists (select 1 from jsonb_array_elements(j) e where e ? 'konto_id') then raise exception 'FAIL 5b: konto w odpowiedzi'; end if;
  execute 'reset role';
  n := n + 2;

  -- 6. licznik próby: pole bieg tylko z liczbami zbiorczymi (bez listy, bez terminu zapasowego, bez danych prywatnych); lista „ukończyli” osobno, ze stronicowaniem, imię tylko za zgodą
  j := public.akcja_licznik('proba');
  k := j->'bieg';
  if k is null or k = 'null'::jsonb then raise exception 'FAIL 6a: licznik bez pola bieg: %', left(j::text, 200); end if;
  if k->>'slug' <> 'proba-bieg' or k->>'faza' <> 'zapisy' or (k->>'zapisani')::int <> 4 or (k->>'dzieci')::int <> 2 or (k->'zapisani_na'->>'5')::int <> 1 or (k->'zapisani_na'->>'10')::int <> 1
     or (k->>'ukonczyli_n')::int <> 0 or k->'dystanse_km' <> '[5, 10]'::jsonb or k->'wsparcie_kwoty_zl' <> '[20, 30, 50]'::jsonb then raise exception 'FAIL 6b: pole bieg: %', k; end if;
  if k ? 'ukonczyli' or k ? 'termin_zapasowy_od' then raise exception 'FAIL 6c: w liczniku ma być tylko zbiorczo: %', k; end if;
  if k::text ~* 'konto|wynik_s|email|oswiadczenie|@' then raise exception 'FAIL 6d: w polu bieg dane prywatne: %', k; end if;
  update public.akcja_bieg_uczestnicy set ukonczony_at = now() - interval '2 minutes', wynik_s = 1800, wynik_dystans_km = 5, odznaka = 'zwykla' where id = u1;
  update public.akcja_bieg_uczestnicy set ukonczony_at = now() - interval '1 minute', dystans_wlasny_km = 1.5, odznaka = 'zwykla' where id = dz;
  update public.akcja_bieg_uczestnicy set ukonczony_at = now(), wynik_s = 3000, wynik_dystans_km = 10 where bieg_id = b and imie = 'Ola';
  if (public.akcja_licznik('proba')->'bieg'->>'ukonczyli_n')::int <> 3 then raise exception 'FAIL 6e: ukonczyli_n'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  k := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50);
  j := public.akcja_bieg_ukonczyli('proba-bieg', 1, 1);
  execute 'reset role';
  if (k->>'razem')::int <> 3 or jsonb_array_length(k->'lista') <> 3 or (k->'lista'->0->>'numer')::int <> 2 then raise exception 'FAIL 6f: lista ukończyli (najnowsi pierwsi): %', k; end if;
  if (j->>'razem')::int <> 3 or jsonb_array_length(j->'lista') <> 1 or (j->'lista'->0->>'numer')::int <> 3 or (j->>'od')::int <> 1 then raise exception 'FAIL 6g: stronicowanie: %', j; end if;
  if exists (select 1 from jsonb_array_elements(k->'lista') e where (e->>'numer')::int = 2 and e->>'imie' is not null) then raise exception 'FAIL 6h: imię bez zgody publicznie'; end if;
  if not exists (select 1 from jsonb_array_elements(k->'lista') e where (e->>'numer')::int = 3 and e->>'imie' = 'Żaneta' and (e->>'dziecko')::boolean and (e->>'dystans_km')::numeric = 1.5) then raise exception 'FAIL 6i: dziecko na liście: %', k; end if;
  if k::text ~ '1800|3000' or k::text ~* 'konto|email' then raise exception 'FAIL 6j: czas albo konto publicznie'; end if;
  if public.akcja_bieg_ukonczyli('nie-ma', 0, 10) is not null then raise exception 'FAIL 6k: lista nieistniejącego biegu'; end if;
  n := n + 11;

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
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Żaneta', false, true, W);
  if not (j->>'ok')::boolean or (j->>'numer')::int <> 5 then raise exception 'FAIL 7e: numer po wycofaniu ma być 5: %', j; end if;
  execute 'reset role';
  if (public.akcja_licznik('proba')->'bieg'->>'zapisani')::int <> 4 then raise exception 'FAIL 7f: wycofany liczony'; end if;
  n := n + 6;

  -- 8. fazy z dat i statusu: zapis także w „wyniki” (do wynik_do), po wynik_do zamknięte; szkic niewidoczny; CHECK weekendu
  update public.akcja_biegi set dzien_od = DZIS, dzien_do = DZIS + 1, wynik_do = DZIS + 3 where id = b;
  if public.akcja_licznik('proba')->'bieg'->>'faza' <> 'trwa' then raise exception 'FAIL 8a: faza trwa'; end if;
  update public.akcja_biegi set dzien_od = DZIS - 3, dzien_do = DZIS - 2, wynik_do = DZIS where id = b;
  if public.akcja_licznik('proba')->'bieg'->>'faza' <> 'wyniki' then raise exception 'FAIL 8b: faza wyniki'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Ala', false, true, W);
  if not (j->>'ok')::boolean then raise exception 'FAIL 8c: zapis w fazie wyniki ma przejść: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set wynik_do = DZIS - 1 where id = b;
  if public.akcja_licznik('proba')->'bieg'->>'faza' <> 'zakonczony' then raise exception 'FAIL 8d: faza zakonczony'; end if;
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Ela', false, true, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'zamkniete' or j->>'faza' <> 'zakonczony' then raise exception 'FAIL 8e: zapis po wynik_do: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set status = 'szkic' where id = b;
  if public.akcja_licznik('proba')->'bieg' is not null and public.akcja_licznik('proba')->'bieg' <> 'null'::jsonb then raise exception 'FAIL 8f: szkic widoczny'; end if;
  update public.akcja_biegi set status = 'otwarty', dzien_od = DZIS + 2, dzien_do = DZIS + 3, wynik_do = DZIS + 6 where id = b;
  begin
    update public.akcja_biegi set dzien_do = DZIS + 40, wynik_do = DZIS + 42 where id = b;
    raise exception 'FAIL 8g: bieg dłuższy niż 32 dni przeszedł (20261207: do 32 dni; wcześniej 2)';
  exception when check_violation then null;
  end;
  n := n + 7;

  -- 9. zgłoszenia cegiełek: kolumna bieg_uczestnik_id z kluczem obcym; wpis z biegu; usunięty uczestnik → NULL (zgłoszenie zostaje)
  insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, email, zgoda_na_wymienienie, kwota_gr, bieg_uczestnik_id)
    values ('proba', 'cegielka', 'Zosia', null, true, 2000, dz2) returning id into zg;
  if (select bieg_uczestnik_id from public.akcja_firmy_zgloszenia where id = zg) is null then raise exception 'FAIL 9a: powiązanie zgłoszenia z uczestnikiem'; end if;
  begin
    insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, zgoda_na_wymienienie, bieg_uczestnik_id) values ('proba', 'cegielka', 'Kuba', true, gen_random_uuid());
    raise exception 'FAIL 9b: zgłoszenie z nieistniejącym uczestnikiem przeszło';
  exception when foreign_key_violation then null;
  end;
  delete from public.akcja_bieg_uczestnicy where id = dz2;
  if (select bieg_uczestnik_id from public.akcja_firmy_zgloszenia where id = zg) is not null then raise exception 'FAIL 9c: po usunięciu uczestnika powiązanie ma być NULL'; end if;
  n := n + 3;

  -- 10. nabijanie numerów: „ja” najwyżej 3 zapisy łącznie z wycofanymi; dzieci najwyżej 3 × limit_dzieci łącznie z wycofanymi (zapis Oli z sekcji 6 cofnięty z ukończenia, żeby dało się go wycofać)
  update public.akcja_bieg_uczestnicy set ukonczony_at = null, wynik_s = null, wynik_dystans_km = null where bieg_id = b and imie = 'Ola' and rodzaj = 'ja';
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_moi('proba-bieg');
  perform public.akcja_bieg_wycofaj((select (e->>'id')::uuid from jsonb_array_elements(j) e where e->>'rodzaj' = 'ja'));
  for i in 1..2 loop
    j := public.akcja_bieg_zapisz('proba-bieg', 5, false, false, W, 'Ola');
    if not (j->>'ok')::boolean then raise exception 'FAIL 10a: ponowny zapis nr % ma przejść: %', i + 1, j; end if;
    perform public.akcja_bieg_wycofaj((j->>'id')::uuid);
  end loop;
  j := public.akcja_bieg_zapisz('proba-bieg', 5, false, false, W, 'Ola');
  if (j->>'ok')::boolean or j->>'powod' <> 'limit_zapisow' then raise exception 'FAIL 10b: czwarty zapis „ja” ma być odrzucony: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set limit_dzieci = 1 where id = b;
  select id into dz from public.akcja_bieg_uczestnicy where bieg_id = b and konto_id = (select id from public.athletes where user_id = zw2) and rodzaj = 'dziecko' and wycofany_at is null;   -- jako postgres: tabela bez SELECT dla authenticated
  execute 'set local role authenticated';
  perform public.akcja_bieg_wycofaj(dz);
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Basia', false, true, W);
  if not (j->>'ok')::boolean then raise exception 'FAIL 10c: drugie dziecko po wycofaniu (limit 1) ma przejść: %', j; end if;
  perform public.akcja_bieg_wycofaj((j->>'id')::uuid);
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Celina', false, true, W);
  if not (j->>'ok')::boolean then raise exception 'FAIL 10d: trzecie dziecko (3 × limit) ma przejść: %', j; end if;
  perform public.akcja_bieg_wycofaj((j->>'id')::uuid);
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Dorota', false, true, W);
  if (j->>'ok')::boolean or j->>'powod' <> 'limit' then raise exception 'FAIL 10e: czwarte dziecko ponad 3 × limit ma być odrzucone: %', j; end if;
  execute 'reset role';
  update public.akcja_biegi set limit_dzieci = 6 where id = b;
  n := n + 5;

  -- 11. RANKING (decyzja 13.11): zgoda osobna od imienia, domyślnie wyłączona; dzieci nigdy (CHECK); niepełnoletni z daty urodzenia nigdy (zapis, zgoda, lista);
  --     czas i miejsce tylko u zgodzonych dorosłych, miejsce osobno dla 5 i 10 km (remis = to samo miejsce); bez zgody bez czasu i bez wpływu na miejsca.
  --     Konta: 7 bez daty urodzenia (dorośli z oświadczenia przy zgodzie); dwóm w tej wycofanej transakcji ustawiamy datę poniżej 18 lat. Imiona wymyślone.
  select array_agg(t.id order by t.created_at), array_agg(t.user_id order by t.created_at) into ka, ku
    from (select a.id, a.user_id, a.created_at from public.athletes a where a.user_id is not null and a.date_of_birth is null
            and not exists (select 1 from public.coaches c where c.id = a.user_id)
            and not exists (select 1 from public.akcja_bieg_uczestnicy u where u.bieg_id = b and u.konto_id = a.id)
          order by a.created_at limit 7) t;
  if coalesce(array_length(ka, 1), 0) < 7 then raise exception 'FAIL 11-0: za mało kont do testu rankingu'; end if;
  select coalesce(max(numer), 0) into nr from public.akcja_bieg_uczestnicy where bieg_id = b;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, wynik_s, wynik_dystans_km, ukonczony_at, ranking_zgoda_at) values
    (b, ka[1], 'ja', 'Anna', true, nr + 1, 5, W, 1500, 5, now(), now()),
    (b, ka[2], 'ja', 'Bogna', false, nr + 2, 5, W, 1400, 5, now(), now()),
    (b, ka[3], 'ja', 'Celina', true, nr + 3, 5, W, 1500, 5, now(), now()),
    (b, ka[4], 'ja', 'Dawid', true, nr + 4, 5, W, 1300, 5, now(), null),
    (b, ka[5], 'ja', 'Edek', true, nr + 5, 10, W, 2800, 10, now(), now()),
    (b, ka[6], 'ja', 'Franek', true, nr + 6, 10, W, 2900, 10, now(), now());
  -- 16.11 (20261203): ranking tylko z treningu z zegarka, więc wyniki z tego punktu wskazują trening ze źródłem 'intervals' (przed 20261203 bez znaczenia; regułę sprawdza tools/akcja-bieg-ranking-gps-test.sql)
  for i in 1..6 loop
    with t as (insert into public.training_logs (athlete_id, distance_km, duration, training_type, external_type, logged_at, source, external_source, external_id)
                 values (ka[i], case when i > 4 then 10 else 5 end, '30:00', 'Spokojny', 'Run', now(), 'intervals', 'test-bieg', 'tb-rank-' || i) returning id)
    update public.akcja_bieg_uczestnicy u set wynik_log_id = t.id from t where u.bieg_id = b and u.numer = nr + i;
  end loop;
  update public.athletes set date_of_birth = (DZIS - interval '17 years')::date where id = ka[5];   -- 17 lat w dniu startu (DZIS + 2): niepełnoletni
  begin
    insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, numer, oswiadczenie_rodzica_at, regulamin_wersja, ukonczony_at, ranking_zgoda_at)
      values (b, ka[1], 'dziecko', 'Zosia', nr + 7, now(), W, now(), now());
    raise exception 'FAIL 11a: dziecko ze zgodą na ranking przeszło (CHECK)';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 5);
  k := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 10);
  v := public.akcja_bieg_ukonczyli('proba-bieg', 0, 100)::text;
  j0 := public.akcja_bieg_ukonczyli('proba-bieg', 0, 50, 7);
  execute 'reset role';
  if (j->>'w_rankingu')::int <> 3 then raise exception 'FAIL 11b: w rankingu 5 km mają być 3 osoby ze zgodą: %', j->>'w_rankingu'; end if;
  if j->'lista'->0->>'numer' <> (nr + 2)::text or (j->'lista'->0->>'miejsce')::int <> 1 or (j->'lista'->0->>'czas_s')::int <> 1400 then raise exception 'FAIL 11c: pierwsze miejsce 5 km = najszybszy ze zgodą: %', j->'lista'->0; end if;
  if j->'lista'->0->>'imie' is not null then raise exception 'FAIL 11d: zgoda na ranking nie daje zgody na imię'; end if;
  if (j->'lista'->1->>'miejsce')::int <> 2 or (j->'lista'->2->>'miejsce')::int <> 2 or j->'lista'->1->>'imie' is null then raise exception 'FAIL 11e: remis 1500 s = dwa drugie miejsca, imię za zgodą: %', j->'lista'; end if;
  if exists (select 1 from jsonb_array_elements(j->'lista') e where e->>'numer' = (nr + 4)::text and (e ? 'czas_s' or e ? 'miejsce'))
     or not exists (select 1 from jsonb_array_elements(j->'lista') e where e->>'numer' = (nr + 4)::text) then raise exception 'FAIL 11f: bez zgody na liście, ale bez czasu i miejsca (najszybszy nie przesuwa miejsc)'; end if;
  if (k->>'w_rankingu')::int <> 1 or k->'lista'->0->>'numer' <> (nr + 6)::text or (k->'lista'->0->>'miejsce')::int <> 1 then raise exception 'FAIL 11g: 10 km osobno, niepełnoletni szybszy nie zajmuje miejsca: %', k; end if;
  if exists (select 1 from jsonb_array_elements(k->'lista') e where e->>'numer' = (nr + 5)::text and e ? 'czas_s') then raise exception 'FAIL 11h: niepełnoletni z daty urodzenia z czasem'; end if;
  if exists (select 1 from jsonb_array_elements((v::jsonb)->'lista') e where (e->>'dziecko')::boolean and (e ? 'czas_s' or e ? 'miejsce')) then raise exception 'FAIL 11i: dziecko z czasem'; end if;
  if v ~ '"(konto_id|wynik_s|email|ranking_zgoda_at)"' or position('"czas_s": 1300' in v) > 0 then raise exception 'FAIL 11j: lista ogólna z polami kont albo czasem bez zgody'; end if;
  if j0 is not null then raise exception 'FAIL 11k: dystans spoza biegu ma dać NULL'; end if;
  if not exists (select 1 from jsonb_array_elements((v::jsonb)->'lista') e where e->>'numer' = (nr + 6)::text and (e->>'miejsce')::int = 1)
     or not exists (select 1 from jsonb_array_elements((v::jsonb)->'lista') e where e->>'numer' = (nr + 2)::text and (e->>'miejsce')::int = 1) then raise exception 'FAIL 11k2: w liście ogólnej miejsca osobno dla 5 i 10 km (dwa pierwsze miejsca)'; end if;
  update public.athletes set date_of_birth = (DZIS - interval '16 years')::date where id = ka[7];
  perform set_config('request.jwt.claims', json_build_object('sub', ku[7], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-bieg', 5, false, false, W, 'Gosia', true);
  if (j->>'ok')::boolean or j->>'powod' <> 'ranking_wiek' then raise exception 'FAIL 11l: niepełnoletni z rankingiem przy zapisie ma dostać ranking_wiek: %', j; end if;
  j := public.akcja_bieg_zapisz('proba-bieg', 5, false, false, W, 'Gosia');
  if not (j->>'ok')::boolean then raise exception 'FAIL 11m: zapis bez rankingu (domyślnie) ma przejść: %', j; end if;
  j := public.akcja_bieg_moi('proba-bieg');
  if (j->0->>'ranking_zgoda')::boolean is distinct from false then raise exception 'FAIL 11n: zgoda na ranking domyślnie wyłączona: %', j->0; end if;
  j := public.akcja_bieg_ranking_zgoda('proba-bieg', true);
  if (j->>'ok')::boolean or j->>'powod' <> 'ranking_wiek' then raise exception 'FAIL 11o: włączenie rankingu przez niepełnoletniego: %', j; end if;
  execute 'reset role';
  update public.athletes set date_of_birth = null where id = ka[7];
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-bieg', 'Hela', false, true, W);
  if not (j->>'ok')::boolean then raise exception 'FAIL 11p: dziecko do testu: %', j; end if;
  j := public.akcja_bieg_ranking_zgoda('proba-bieg', true);
  if not (j->>'ok')::boolean then raise exception 'FAIL 11q: włączenie rankingu przez dorosłego: %', j; end if;
  j := public.akcja_bieg_moi('proba-bieg');
  if not exists (select 1 from jsonb_array_elements(j) e where e->>'rodzaj' = 'ja' and (e->>'ranking_zgoda')::boolean) then raise exception 'FAIL 11r: zgoda nie zapisana: %', j; end if;
  if exists (select 1 from jsonb_array_elements(j) e where e->>'rodzaj' = 'dziecko' and (e->>'ranking_zgoda')::boolean) then raise exception 'FAIL 11s: dziecko dostało zgodę razem z rodzicem'; end if;
  perform public.akcja_bieg_ranking_zgoda('proba-bieg', false);
  j := public.akcja_bieg_moi('proba-bieg');
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'ranking_zgoda')::boolean) then raise exception 'FAIL 11t: wyłączenie zgody nie działa'; end if;
  execute 'reset role';
  if has_function_privilege('anon', 'public.akcja_bieg_ranking_zgoda(text, boolean)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.akcja_bieg_ranking_zgoda(text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_niepelnoletni(uuid, date)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_niepelnoletni(uuid, date)', 'EXECUTE')
     then raise exception 'FAIL 11u: uprawnienia funkcji rankingu'; end if;
  n := n + 22;

  raise exception 'TESTY BIEGU ZIELONE: % sprawdzeń', n;
end $T$;
