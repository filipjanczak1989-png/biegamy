-- Testy ZGŁOSZEŃ FIRM i EDYCJI W PANELU (20261105_akcja_firmy_zgloszenia.sql, 20261105_akcja_firmy_szyldy.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS).
-- Nic publicznie bez zatwierdzenia, zrzut znika po decyzji i po 14 dniach, e-mail 30 dni po końcu akcji, limit 3/h, przełącznik, Partner akcji bez potwierdzenia wpłaty, edycja tylko dozwolonych kolumn.
-- Jedna transakcja, zawsze wycofana (tools/akcja-firmy-zgloszenia-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; c int; j jsonb; t text; tr uuid; zw uuid; f1 uuid;
  id1 uuid := gen_random_uuid(); id2 uuid := gen_random_uuid(); id3 uuid := gen_random_uuid(); id4 uuid := gen_random_uuid();
  LOGO constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/00000000-0000-4000-8000-000000000009.webp';
  ADR_FIRMY constant text := 'https://firma.example.pl';
begin
  select id into tr from public.coaches limit 1;
  select a.user_id into zw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches k where k.id = a.user_id) order by a.created_at limit 1;
  if tr is null or zw is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', current_date, 100, 10, true, now()) on conflict (slug) do update set push_start_at = now(), wystartowala_at = now(), koniec = null;   -- push_start_at: trigger akcje_push_start nie ma czego wysyłać
  update public.akcje set firmy_zgloszenia = false where slug in ('dla-fabianka', 'proba');

  -- 1. przełącznik: wyłączony = odmowa; prawdziwa akcja przed startem = odmowa mimo włączonego; obca akcja = odmowa
  if (public.akcja_firmy_wpusc('ip-a', 'proba'))->>'powod' is distinct from 'wylaczone' then raise exception 'FAIL 1a: wyłączony przełącznik wpuszcza'; end if;
  update public.akcje set firmy_zgloszenia = true, wystartowala_at = null where slug = 'dla-fabianka';
  if (public.akcja_firmy_wpusc('ip-a', 'dla-fabianka'))->>'powod' is distinct from 'wylaczone' then raise exception 'FAIL 1b: formularz działa przed startem'; end if;
  update public.akcje set firmy_zgloszenia = false where slug = 'dla-fabianka';
  update public.akcje set firmy_zgloszenia = true where slug = 'proba';
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, wystartowala_at, firmy_zgloszenia) values ('test-obca', 'Test', current_date, 100, 10, true, now(), true);
  if (public.akcja_firmy_wpusc('ip-a', 'test-obca'))->>'powod' is distinct from 'wylaczone' then raise exception 'FAIL 1c: obca akcja z włączonym przełącznikiem'; end if;
  n := n + 3;

  -- 2. limit 3/h na IP, inny IP niezależnie, stare próby się nie liczą
  for c in 1..3 loop
    if not (public.akcja_firmy_wpusc('ip-b', 'proba')->>'ok')::boolean then raise exception 'FAIL 2a: próba % odrzucona', c; end if;
  end loop;
  if (public.akcja_firmy_wpusc('ip-b', 'proba'))->>'powod' is distinct from 'limit' then raise exception 'FAIL 2b: czwarta próba przeszła'; end if;
  if not (public.akcja_firmy_wpusc('ip-c', 'proba')->>'ok')::boolean then raise exception 'FAIL 2c: inny IP zablokowany'; end if;
  update public.akcja_firmy_proby set kiedy = now() - interval '61 minutes' where ip_skrot = 'ip-b';
  if not (public.akcja_firmy_wpusc('ip-b', 'proba')->>'ok')::boolean then raise exception 'FAIL 2d: limit nie mija po godzinie'; end if;
  n := n + 4;

  -- 3. zgłoszenie: nic publicznie przed zatwierdzeniem
  perform public.akcja_firmy_zgloszenie_dodaj(id1, 'proba', 'wiezowiec', 'Firma Zgloszona', ADR_FIRMY, 'kontakt@firma.example.pl', id1 || '/logo.webp', id1 || '/zrzut.png', 150000, true);
  perform public.akcja_firmy_zgloszenie_dodaj(id2, 'proba', 'domek', 'Firma Odrzucona', ADR_FIRMY, 'kontakt@firma.example.pl', id2 || '/logo.png', id2 || '/zrzut.jpg', 20000, false);
  j := public.akcja_licznik('proba');
  if j::text like '%Firma Zgloszona%' or j::text like '%kontakt@firma%' then raise exception 'FAIL 3a: zgłoszenie publiczne przed zatwierdzeniem'; end if;
  if exists (select 1 from public.akcja_firmy where nazwa = 'Firma Zgloszona') then raise exception 'FAIL 3b: firma przed zatwierdzeniem'; end if;
  j := public.akcja_firmy_zgloszenia_lista();
  if jsonb_array_length(j->'zgloszenia') < 2 or (j->'zgloszenia'->0->>'status') <> 'nowe' then raise exception 'FAIL 3c: lista dla panelu'; end if;
  if (select (x->>'proba')::boolean from jsonb_array_elements(j->'zgloszenia') x where x->>'id' = id1::text) is distinct from true then raise exception 'FAIL 3d: lista nie oznacza próby'; end if;
  n := n + 4;

  -- 4. CHECK-i: zły link, SVG, zły e-mail, wymyślony status
  begin perform public.akcja_firmy_zgloszenie_dodaj(gen_random_uuid(), 'proba', 'domek', 'Zla', 'http://a.pl', 'a@a.pl', null, null); raise exception 'FAIL 4a: http'; exception when check_violation then null; end;
  begin perform public.akcja_firmy_zgloszenie_dodaj(gen_random_uuid(), 'proba', 'domek', 'Zla', 'javascript:alert(1)', 'a@a.pl', null, null); raise exception 'FAIL 4b: javascript'; exception when check_violation then null; end;
  begin perform public.akcja_firmy_zgloszenie_dodaj(id3, 'proba', 'domek', 'Zla', ADR_FIRMY, 'a@a.pl', id3 || '/logo.svg', null); raise exception 'FAIL 4c: SVG'; exception when check_violation then null; end;
  begin perform public.akcja_firmy_zgloszenie_dodaj(gen_random_uuid(), 'proba', 'domek', 'Zla', ADR_FIRMY, 'bez-malpy', null, null); raise exception 'FAIL 4d: e-mail'; exception when check_violation then null; end;
  begin perform public.akcja_firmy_zgloszenie_dodaj(gen_random_uuid(), 'proba', 'cegielka', 'Zla', ADR_FIRMY, 'a@a.pl', null, null); raise exception 'FAIL 4e: rodzaj'; exception when check_violation then null; end;
  n := n + 5;

  -- 5. zatwierdzenie: firma na ulicy, pliki do kasowania, zrzut znika, drugi raz nie przejdzie
  j := public.akcja_firmy_zatwierdz(id1, LOGO, tr);
  if not (j->>'ok')::boolean then raise exception 'FAIL 5a: zatwierdzenie'; end if;
  if jsonb_array_length(j->'pliki') <> 2 or not (j->'pliki' ? (id1 || '/zrzut.png')) or not (j->'pliki' ? (id1 || '/logo.webp')) then raise exception 'FAIL 5b: pliki do skasowania'; end if;
  select firma_id into f1 from public.akcja_firmy_zgloszenia where id = id1 and status = 'zatwierdzone' and zrzut_sciezka is null and logo_sciezka is null and decyzja_kto = tr and decyzja_at is not null;
  if f1 is null then raise exception 'FAIL 5c: zgłoszenie po zatwierdzeniu'; end if;
  if not exists (select 1 from public.akcja_firmy where id = f1 and akcja_slug = 'proba' and rodzaj = 'wiezowiec' and wsparcie = 'wplata' and logo_url = LOGO and zgoda_na_wymienienie and potwierdzenie_widziane and not ukryta) then raise exception 'FAIL 5d: wpis firmy'; end if;
  j := public.akcja_licznik('proba');
  if not j::text like '%Firma Zgloszona%' or j::text like '%kontakt@firma%' then raise exception 'FAIL 5e: licznik po zatwierdzeniu'; end if;
  if (select x->>'rodzaj' from jsonb_array_elements(j->'firmy') x where x->>'nazwa' = 'Firma Zgloszona') is distinct from 'wiezowiec' then raise exception 'FAIL 5f: licznik bez rodzaju'; end if;
  if (select (x->>'kwota_gr')::int from jsonb_array_elements(j->'firmy') x where x->>'nazwa' = 'Firma Zgloszona') is distinct from 150000 then raise exception 'FAIL 5i: kwota przy zgodzie'; end if;
  perform public.akcja_firmy_zgloszenie_dodaj(gen_random_uuid(), 'proba', 'domek', 'Bez Zgody Na Kwote', ADR_FIRMY, 'b@firma.example.pl', null, null, 20000, false);
  perform public.akcja_firmy_zatwierdz((select id from public.akcja_firmy_zgloszenia where nazwa = 'Bez Zgody Na Kwote'), null, tr);
  j := public.akcja_licznik('proba');
  if (select x->>'kwota_gr' from jsonb_array_elements(j->'firmy') x where x->>'nazwa' = 'Bez Zgody Na Kwote') is not null then raise exception 'FAIL 5j: kwota bez zgody publiczna'; end if;
  if (public.akcja_firmy_zatwierdz((select id from public.akcja_firmy_zgloszenia where nazwa = 'Bez Zgody Na Kwote'), null, tr))->>'powod' is distinct from 'juz_decyzja' then raise exception 'FAIL 5k'; end if;
  if (public.akcja_firmy_zatwierdz(id1, LOGO, tr))->>'powod' is distinct from 'juz_decyzja' then raise exception 'FAIL 5g: drugie zatwierdzenie'; end if;
  if (public.akcja_firmy_odrzuc(id1, 'x', tr))->>'powod' is distinct from 'juz_decyzja' then raise exception 'FAIL 5h: odrzucenie po zatwierdzeniu'; end if;
  n := n + 8;

  -- 6. odrzucenie: powód, oba pliki do kasowania, bez firmy
  j := public.akcja_firmy_odrzuc(id2, 'Brak wpłaty', tr);
  if not (j->>'ok')::boolean or jsonb_array_length(j->'pliki') <> 2 then raise exception 'FAIL 6a: odrzucenie'; end if;
  if not exists (select 1 from public.akcja_firmy_zgloszenia where id = id2 and status = 'odrzucone' and powod = 'Brak wpłaty' and zrzut_sciezka is null and logo_sciezka is null and firma_id is null) then raise exception 'FAIL 6b: stan po odrzuceniu'; end if;
  if exists (select 1 from public.akcja_firmy where nazwa = 'Firma Odrzucona') then raise exception 'FAIL 6c: odrzucona na ulicy'; end if;
  if (public.akcja_firmy_zatwierdz(id2, LOGO, tr))->>'powod' is distinct from 'juz_decyzja' then raise exception 'FAIL 6d: zatwierdzenie po odrzuceniu'; end if;
  if (public.akcja_firmy_zatwierdz(gen_random_uuid(), LOGO, tr))->>'powod' is distinct from 'nie_ma' then raise exception 'FAIL 6e: nieistniejące zgłoszenie'; end if;
  n := n + 5;

  -- 7. sprzątanie: zrzut po 14 dniach, e-mail 30 dni po końcu akcji; młodsze zostają
  perform public.akcja_firmy_zgloszenie_dodaj(id3, 'proba', 'domek', 'Stare', ADR_FIRMY, 'stare@firma.example.pl', id3 || '/logo.png', id3 || '/zrzut.png');
  perform public.akcja_firmy_zgloszenie_dodaj(id4, 'proba', 'domek', 'Mlode', ADR_FIRMY, 'mlode@firma.example.pl', id4 || '/logo.png', id4 || '/zrzut.png');
  update public.akcja_firmy_zgloszenia set utworzono = now() - interval '15 days' where id = id3;
  update public.akcja_firmy_zgloszenia set utworzono = now() - interval '13 days' where id = id4;
  update public.akcje set start = (now() at time zone 'Europe/Warsaw')::date - 60, koniec = (now() at time zone 'Europe/Warsaw')::date - 29 where slug = 'proba';   -- start przed końcem: CHECK akcje_koniec_po_starcie
  j := public.akcja_firmy_sprzatanie();
  if not (j->'pliki' ? (id3 || '/zrzut.png')) or (j->'pliki' ? (id4 || '/zrzut.png')) then raise exception 'FAIL 7a: zrzuty do skasowania %', j; end if;
  if exists (select 1 from public.akcja_firmy_zgloszenia where id = id3 and zrzut_sciezka is not null) or not exists (select 1 from public.akcja_firmy_zgloszenia where id = id4 and zrzut_sciezka is not null) then raise exception 'FAIL 7b: zrzut w wierszu'; end if;
  if not exists (select 1 from public.akcja_firmy_zgloszenia where id = id3 and logo_sciezka is not null) then raise exception 'FAIL 7c: sprzątanie ruszyło logo czekające na decyzję'; end if;
  if exists (select 1 from public.akcja_firmy_zgloszenia where akcja_slug = 'proba' and email is null) then raise exception 'FAIL 7d: e-mail skasowany za wcześnie'; end if;
  update public.akcje set koniec = (now() at time zone 'Europe/Warsaw')::date - 31 where slug = 'proba';
  j := public.akcja_firmy_sprzatanie();
  if exists (select 1 from public.akcja_firmy_zgloszenia where akcja_slug = 'proba' and email is not null) then raise exception 'FAIL 7e: e-mail po terminie'; end if;
  update public.akcje set koniec = null where slug = 'proba';
  n := n + 5;

  -- 7b. licznik „Firmy do sprawdzenia”: trener liczba, zawodnik null, anon bez dostępu
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.akcja_firmy_do_sprawdzenia() is null then raise exception 'FAIL 7f: trener bez licznika'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  if public.akcja_firmy_do_sprawdzenia() is not null then raise exception 'FAIL 7g: zawodnik widzi licznik'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin perform public.akcja_firmy_do_sprawdzenia(); raise exception 'FAIL 7h: anon woła licznik'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 8. progi: wieżowiec wyżej niż domek; działa tylko na prawdziwej akcji
  if (public.akcja_firmy_progi(1000, 100, null))->>'powod' is distinct from 'progi' then raise exception 'FAIL 8a: odwrócone progi'; end if;
  if (public.akcja_firmy_progi(0, 100, null))->>'powod' is distinct from 'progi' then raise exception 'FAIL 8b: próg zero'; end if;
  perform public.akcja_firmy_progi(150, 1500, false);
  if not exists (select 1 from public.akcje where slug = 'dla-fabianka' and prog_domku_zl = 150 and prog_wiezowca_zl = 1500 and firmy_zgloszenia = false) then raise exception 'FAIL 8c: zapis progów'; end if;
  n := n + 3;

  -- 9. klient: żadnego dostępu do zgłoszeń ani funkcji, także trener spoza EF
  foreach t in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', t)::text, true);
    execute 'set local role ' || t;
    begin perform 1 from public.akcja_firmy_zgloszenia; raise exception 'FAIL 9a: % czyta zgłoszenia', t; exception when insufficient_privilege then null; end;
    begin perform 1 from public.akcja_firmy_proby; raise exception 'FAIL 9b: % czyta próby', t; exception when insufficient_privilege then null; end;
    begin perform public.akcja_firmy_zgloszenia_lista(); raise exception 'FAIL 9c: % woła listę', t; exception when insufficient_privilege then null; end;
    begin perform public.akcja_firmy_zatwierdz(id4, LOGO, tr); raise exception 'FAIL 9d: % zatwierdza', t; exception when insufficient_privilege then null; end;
    begin perform public.akcja_firmy_progi(1, 2, true); raise exception 'FAIL 9e: % zmienia progi', t; exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  n := n + 10;

  -- 10. panel ręczny: Partner akcji bez potwierdzenia wpłaty, wpłata z potwierdzeniem, edycja dozwolonych kolumn, reszta odmowa
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.akcja_firmy (akcja_slug, nazwa, link, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values ('proba', 'Partner Testowy', ADR_FIRMY, 'wiezowiec', 'rzeczowe', false, true) returning id into f1;
  begin insert into public.akcja_firmy (akcja_slug, nazwa, link, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values ('proba', 'Bez Wplaty', ADR_FIRMY, 'domek', 'wplata', false, true); raise exception 'FAIL 10a: wpłata bez potwierdzenia'; exception when check_violation then null; end;
  update public.akcja_firmy set rodzaj = 'domek', logo_url = LOGO, nazwa = 'Partner Zmieniony', link = ADR_FIRMY || '/x' where id = f1;
  get diagnostics c = row_count;
  if c <> 1 then raise exception 'FAIL 10b: trener nie edytuje'; end if;
  begin update public.akcja_firmy set wsparcie = 'wplata' where id = f1; raise exception 'FAIL 10c: wpłata bez potwierdzenia przez edycję'; exception when check_violation then null; end;
  begin update public.akcja_firmy set kwota_gr = 1 where id = f1; raise exception 'FAIL 10d: edycja kwoty'; exception when insufficient_privilege then null; end;
  begin update public.akcja_firmy set zgoda_na_kwote = true where id = f1; raise exception 'FAIL 10e: edycja zgody na kwotę'; exception when insufficient_privilege then null; end;
  begin update public.akcja_firmy set dodal = null where id = f1; raise exception 'FAIL 10f: edycja autora'; exception when insufficient_privilege then null; end;
  update public.akcja_firmy set ukryta = true where id = f1;
  execute 'reset role';
  j := public.akcja_licznik('proba');
  if j::text like '%Partner Zmieniony%' then raise exception 'FAIL 10g: ukryta w liczniku'; end if;
  update public.akcja_firmy set ukryta = false where id = f1;
  j := public.akcja_licznik('proba');
  if (select x->>'wsparcie' from jsonb_array_elements(j->'firmy') x where x->>'nazwa' = 'Partner Zmieniony') is distinct from 'rzeczowe' then raise exception 'FAIL 10h: licznik bez typu wsparcia'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.akcja_firmy set nazwa = 'Podrobiona' where id = f1;
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'FAIL 10i: zawodnik edytuje firmę'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin update public.akcja_firmy set nazwa = 'Podrobiona' where id = f1; raise exception 'FAIL 10j: anon edytuje firmę'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 10;

  -- 11. polityka edycji sama pilnuje trenera: polityka odczytu nie może być jedyną zaporą
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy' and policyname = 'akcja_firmy_trener_zmienia' and cmd = 'UPDATE' and qual like '%auth_is_coach%' and with_check like '%auth_is_coach%') then raise exception 'FAIL 11: polityka edycji bez trenera'; end if;
  n := n + 1;

  raise exception 'TESTY ZGLOSZEN FIRM ZIELONE: % asercji', n;
end $T$;
