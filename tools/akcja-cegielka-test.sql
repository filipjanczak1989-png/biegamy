-- Testy CEGIEŁKI OD OSOBY PRYWATNEJ (20261107_akcja_cegielka_zgloszenia.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS).
-- Zgłoszenie cegiełki zapisane jak w EF (klucz serwisowy), CHECK-i, nic publicznie przed decyzją, zatwierdzenie = wpis w murze tej akcji, imię tylko przy zgodzie,
-- odrzucenie, anon i zwykłe konto nic nie zgłoszą z pominięciem EF, nie zatwierdzą i nie dopiszą do muru, firmy bez zmian, licznik km bez zmian.
-- Jedna transakcja, zawsze wycofana (tools/akcja-cegielka-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; k int; j jsonb; tr uuid; zw uuid; km0 text; c1 uuid; f1 uuid; t text;
  id1 uuid := gen_random_uuid(); id2 uuid := gen_random_uuid(); id3 uuid := gen_random_uuid(); id4 uuid := gen_random_uuid();
  ADR_FIRMY constant text := 'https://firma.example.pl';
begin
  select id into tr from public.coaches limit 1;
  select a.user_id into zw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  if tr is null or zw is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', current_date, 100, 10, true, now()) on conflict (slug) do update set push_start_at = now(), wystartowala_at = now(), koniec = null;   -- push_start_at: trigger akcje_push_start nie ma czego wysyłać
  update public.akcje set firmy_zgloszenia = true where slug = 'proba';
  delete from public.akcja_cegielki where akcja_slug = 'proba';   -- czysty mur próby, tylko w tej wycofanej transakcji
  km0 := public.akcja_licznik('proba')->>'suma_km';

  -- 1. zgłoszenie cegiełki jak w EF firma-zgloszenie (klucz serwisowy): imię, bez linku i logo, ze zgodą na imię albo bez
  execute 'set local role service_role';
  insert into public.akcja_firmy_zgloszenia (id, akcja_slug, rodzaj, nazwa, email, zrzut_sciezka, zgoda_na_wymienienie)
    values (id1, 'proba', 'cegielka', 'Anna-Maria', null, id1 || '/zrzut.webp', true),
           (id2, 'proba', 'cegielka', 'Zenek', 'zenek@example.pl', id2 || '/zrzut.jpg', false),
           (id3, 'proba', 'cegielka', 'Odrzucony', null, id3 || '/zrzut.png', true);
  execute 'reset role';
  n := n + 1;

  -- 2. CHECK-i: cegiełka bez linku, logo i kwoty publicznie, imię jednym słowem; firma dalej z linkiem i zgodą
  begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, link, zgoda_na_wymienienie) values ('proba', 'cegielka', 'Ola', ADR_FIRMY, true); raise exception 'FAIL 2a: cegiełka z linkiem'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, logo_sciezka, zgoda_na_wymienienie) values ('proba', 'cegielka', 'Ola', gen_random_uuid() || '/logo.png', true); raise exception 'FAIL 2b: cegiełka z logo'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, zgoda_na_wymienienie) values ('proba', 'cegielka', 'Anna Kowalska', true); raise exception 'FAIL 2c: imię z nazwiskiem'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, zgoda_na_wymienienie) values ('proba', 'cegielka', 'Ola1', true); raise exception 'FAIL 2d: cyfra w imieniu'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, kwota_gr, zgoda_na_kwote, zgoda_na_wymienienie) values ('proba', 'cegielka', 'Ola', 5000, true, true); raise exception 'FAIL 2e: kwota publicznie przy cegiełce'; exception when check_violation then null; end;
  begin perform public.akcja_firmy_zgloszenie_dodaj(gen_random_uuid(), 'proba', 'domek', 'Firma Bez Linku', null, 'a@a.pl', null, null); raise exception 'FAIL 2f: firma bez linku'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, link, zgoda_na_wymienienie) values ('proba', 'domek', 'Firma Bez Zgody', ADR_FIRMY, false); raise exception 'FAIL 2g: firma bez zgody na wymienienie'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, link, zgoda_na_wymienienie) values ('proba', 'osiedle', 'Firma Rodzaj', ADR_FIRMY, true); raise exception 'FAIL 2h: nieznany rodzaj'; exception when check_violation then null; end;
  n := n + 8;

  -- 3. nic publicznie przed decyzją; lista dla panelu z rodzajem, zgodą na imię i próbą
  j := public.akcja_ulica_publiczna('proba');
  if j::text like '%Anna-Maria%' or coalesce((j->>'bez_imienia')::int, 0) <> 0 then raise exception 'FAIL 3a: cegiełka w murze przed zatwierdzeniem'; end if;
  j := public.akcja_firmy_zgloszenia_lista();
  if (select x->>'rodzaj' from jsonb_array_elements(j->'zgloszenia') x where x->>'id' = id1::text) is distinct from 'cegielka'
     or (select (x->>'zgoda_na_wymienienie')::boolean from jsonb_array_elements(j->'zgloszenia') x where x->>'id' = id2::text) is distinct from false
     or (select (x->>'proba')::boolean from jsonb_array_elements(j->'zgloszenia') x where x->>'id' = id1::text) is distinct from true then
    raise exception 'FAIL 3b: lista dla panelu: %', j;
  end if;
  n := n + 2;

  -- 4. zatwierdzenie ze zgodą: wpis w murze TEJ akcji, imię publicznie, zrzut do skasowania, żadnej firmy
  j := public.akcja_firmy_zatwierdz(id1, null, tr);
  if not coalesce((j->>'ok')::boolean, false) or j->>'cegla' is null or j ? 'firma' then raise exception 'FAIL 4a: zatwierdzenie cegiełki: %', j; end if;
  if jsonb_array_length(j->'pliki') <> 1 or not (j->'pliki' ? (id1 || '/zrzut.webp')) then raise exception 'FAIL 4b: zrzut do skasowania: %', j; end if;
  c1 := (j->>'cegla')::uuid;
  if not exists (select 1 from public.akcja_cegielki where id = c1 and akcja_slug = 'proba' and imie = 'Anna-Maria' and zgoda and potwierdzenie_widziane and dodal = tr) then raise exception 'FAIL 4c: wpis w murze'; end if;
  if not exists (select 1 from public.akcja_firmy_zgloszenia where id = id1 and status = 'zatwierdzone' and zrzut_sciezka is null and firma_id is null and decyzja_kto = tr and decyzja_at is not null) then raise exception 'FAIL 4d: zgłoszenie po zatwierdzeniu'; end if;
  if exists (select 1 from public.akcja_firmy where nazwa = 'Anna-Maria') then raise exception 'FAIL 4e: cegiełka jako firma'; end if;
  j := public.akcja_ulica_publiczna('proba');
  if not coalesce((j->'imiona') ? 'Anna-Maria', false) then raise exception 'FAIL 4f: imię nie stoi w murze próby: %', j; end if;
  if exists (select 1 from public.akcja_cegielki where akcja_slug = 'dla-fabianka' and imie = 'Anna-Maria') then raise exception 'FAIL 4g: cegiełka z próby w prawdziwym murze'; end if;
  n := n + 7;

  -- 5. bez zgody: cegła bez imienia; e-mail tylko dla EF (podziękowanie), nigdy publicznie
  j := public.akcja_firmy_zatwierdz(id2, null, tr);
  if not coalesce((j->>'ok')::boolean, false) or j->>'email' is distinct from 'zenek@example.pl' then raise exception 'FAIL 5a: %', j; end if;
  j := public.akcja_ulica_publiczna('proba');
  if coalesce((j->'imiona') ? 'Zenek', false) or (j->>'bez_imienia')::int <> 1 then raise exception 'FAIL 5b: imię bez zgody publiczne: %', j; end if;
  if j::text like '%zenek@%' or public.akcja_licznik('proba')::text like '%zenek@%' then raise exception 'FAIL 5c: e-mail publicznie'; end if;
  n := n + 3;

  -- 6. odrzucenie: bez wpisu w murze, zrzut do skasowania; po decyzji drugi raz nic
  j := public.akcja_firmy_odrzuc(id3, 'Brak wpłaty', tr);
  if not coalesce((j->>'ok')::boolean, false) or not (j->'pliki' ? (id3 || '/zrzut.png')) then raise exception 'FAIL 6a: %', j; end if;
  if exists (select 1 from public.akcja_cegielki where imie = 'Odrzucony') then raise exception 'FAIL 6b: odrzucona w murze'; end if;
  if (public.akcja_firmy_zatwierdz(id1, null, tr))->>'powod' is distinct from 'juz_decyzja' then raise exception 'FAIL 6c: drugie zatwierdzenie'; end if;
  if (select count(*) from public.akcja_cegielki where akcja_slug = 'proba') <> 2 then raise exception 'FAIL 6d: liczba wpisów w murze próby'; end if;
  n := n + 4;

  -- 7. firmy bez zmian: zgłoszenie z linkiem i logo, zatwierdzenie = firma, oba pliki do skasowania
  perform public.akcja_firmy_zgloszenie_dodaj(id4, 'proba', 'domek', 'Firma Po Migracji', ADR_FIRMY, 'k@firma.example.pl', id4 || '/logo.webp', id4 || '/zrzut.png', 20000, false);
  j := public.akcja_firmy_zatwierdz(id4, 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/00000000-0000-4000-8000-000000000009.webp', tr);
  f1 := (j->>'firma')::uuid;
  if f1 is null or j ? 'cegla' or not exists (select 1 from public.akcja_firmy where id = f1 and rodzaj = 'domek' and link = ADR_FIRMY and zgoda_na_wymienienie) then raise exception 'FAIL 7a: firma po migracji: %', j; end if;
  if jsonb_array_length(j->'pliki') <> 2 then raise exception 'FAIL 7b: pliki firmy'; end if;
  n := n + 2;

  -- 8. anon i zwykłe konto: nie zgłoszą z pominięciem EF, nie zatwierdzą, nie odrzucą, nie przeczytają listy, nie dopiszą i nie skasują wpisu w murze
  foreach t in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', t)::text, true);
    execute 'set local role ' || t;
    begin insert into public.akcja_firmy_zgloszenia (akcja_slug, rodzaj, nazwa, zgoda_na_wymienienie) values ('proba', 'cegielka', 'Wlamanie', true); raise exception 'FAIL 8a: % zgłasza z pominięciem EF', t; exception when insufficient_privilege then null; end;
    begin perform public.akcja_firmy_zatwierdz(id2, null, zw); raise exception 'FAIL 8b: % zatwierdza', t; exception when insufficient_privilege then null; end;
    begin perform public.akcja_firmy_odrzuc(id2, 'x', zw); raise exception 'FAIL 8c: % odrzuca', t; exception when insufficient_privilege then null; end;
    begin perform public.akcja_firmy_zgloszenia_lista(); raise exception 'FAIL 8d: % czyta listę', t; exception when insufficient_privilege then null; end;
    begin update public.akcja_firmy_zgloszenia set status = 'zatwierdzone' where id = id3; raise exception 'FAIL 8e: % zmienia zgłoszenie', t; exception when insufficient_privilege then null; end;
    begin insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane) values ('proba', 'Wlamanie', true, true); raise exception 'FAIL 8f: % dopisuje do muru', t; exception when insufficient_privilege then null; end;
    begin
      delete from public.akcja_cegielki where id = c1; get diagnostics k = row_count;
      if k <> 0 then raise exception 'FAIL 8g: % kasuje wpis w murze', t; end if;
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  n := n + 14;

  -- 9. trener w aplikacji też nie zatwierdza z pominięciem EF (funkcje tylko dla service_role); wpis w murze kasuje jak dotąd
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.akcja_firmy_zatwierdz(id2, null, tr); raise exception 'FAIL 9a: zatwierdzanie z pominięciem EF'; exception when insufficient_privilege then null; end;
  delete from public.akcja_cegielki where id = c1; get diagnostics k = row_count;
  if k <> 1 then raise exception 'FAIL 9b: trener nie usuwa wpisu z muru'; end if;
  execute 'reset role';
  n := n + 2;

  -- 10. licznik km bez zmian po zgłoszeniach, decyzjach i kasowaniu
  if public.akcja_licznik('proba')->>'suma_km' is distinct from km0 then raise exception 'FAIL 10: zmieniły się km akcji'; end if;
  n := n + 1;

  raise exception 'TESTY CEGIELEK ZIELONE: % asercji', n;
end $T$;
