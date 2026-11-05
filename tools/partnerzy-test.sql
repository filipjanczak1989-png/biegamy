-- Testy PARTNERÓW POPRZEDNICH WYZWAŃ (20261106_partnerzy.sql) PO SKUTKU, z set local role i request.jwt.claims. Jedna transakcja, zawsze wycofana; wynikiem jest treść wyjątku na końcu. Adresy i nazwy zmyślone.
do $T$
declare
  n int := 0; j jsonb; v_trener uuid; v_konto uuid; v_id uuid; v_akcja uuid; f jsonb;
  L constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/11111111-1111-4111-8111-111111111111.png';
  P constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/22222222-2222-4222-8222-222222222222.webp';
begin
  select c.id into v_trener from public.coaches c limit 1;
  select a.user_id into v_konto from public.athletes a where a.user_id is not null and a.user_id is distinct from v_trener order by a.created_at limit 1;
  if v_trener is null or v_konto is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa) values ('test-part', 'Test', 'Test', current_date, 100, 10, false) returning id into v_akcja;
  update public.akcje set wystartowala_at = now() where id = v_akcja;

  -- 1. wpis partnera bez zgody: stoi z samą nazwą, licznik nie oddaje logo, plakatu ani tekstu
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie, logo_zgoda, plakat_url, plakat_tekst)
    values ('test-part', 'Fabryka Testowa', 'https://example.com', L, 'fabryka', 'poprzednie', false, true, false, P, 'Tekst plakatu') returning id into v_id;
  j := public.akcja_licznik('test-part'); select e into f from jsonb_array_elements(j->'firmy') e where e->>'nazwa' = 'Fabryka Testowa';
  if f->>'rodzaj' is distinct from 'fabryka' or f->>'wsparcie' is distinct from 'poprzednie' then raise exception 'FAIL 1a: wpis %', f; end if;
  if f->>'logo_url' is not null or f->>'plakat_url' is not null or f->>'plakat_tekst' is not null then raise exception 'FAIL 1b: bez zgody wychodzi %', f; end if;
  if j::text like '%22222222%' or j::text like '%11111111%' or j::text like '%Tekst plakatu%' then raise exception 'FAIL 1c: adres gdzieś w liczniku'; end if;
  n := n + 3;

  -- 2. przełącznik: po zgodzie wszystko wychodzi, cofnięcie zgody chowa
  update public.akcja_firmy set logo_zgoda = true where id = v_id;
  select e into f from jsonb_array_elements(public.akcja_licznik('test-part')->'firmy') e where e->>'nazwa' = 'Fabryka Testowa';
  if f->>'logo_url' is distinct from L or f->>'plakat_url' is distinct from P or f->>'plakat_tekst' is distinct from 'Tekst plakatu' then raise exception 'FAIL 2a: po zgodzie %', f; end if;
  update public.akcja_firmy set logo_zgoda = false where id = v_id;
  select e into f from jsonb_array_elements(public.akcja_licznik('test-part')->'firmy') e where e->>'nazwa' = 'Fabryka Testowa';
  if f->>'logo_url' is not null then raise exception 'FAIL 2b: cofnięta zgoda %', f; end if;
  n := n + 2;

  -- 3. firma akcji bez zmian: logo wychodzi jak dotąd, domyślna zgoda true
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie)
    values ('test-part', 'Domek Testowy', 'https://example.com', L, 'domek', 'wplata', true, true);
  select e into f from jsonb_array_elements(public.akcja_licznik('test-part')->'firmy') e where e->>'nazwa' = 'Domek Testowy';
  if f->>'logo_url' is distinct from L then raise exception 'FAIL 3a: firma akcji straciła logo %', f; end if;
  n := n + 1;

  -- 4. rodzaj i wsparcie razem, bez kwoty, adres tylko z kubełka
  begin insert into public.akcja_firmy (akcja_slug, nazwa, link, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values ('test-part', 'Zla Para', 'https://example.com', 'fabryka', 'wplata', true, true); raise exception 'FAIL 4a: fabryka jako firma akcji'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, nazwa, link, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values ('test-part', 'Zla Para', 'https://example.com', 'domek', 'poprzednie', false, true); raise exception 'FAIL 4b: domek jako poprzedni'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, nazwa, link, rodzaj, wsparcie, kwota_gr, potwierdzenie_widziane, zgoda_na_wymienienie) values ('test-part', 'Zla Kwota', 'https://example.com', 'galeria', 'poprzednie', 100, false, true); raise exception 'FAIL 4c: kwota u poprzedniego'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, nazwa, link, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values ('test-part', 'Zly Rodzaj', 'https://example.com', 'zamek', 'poprzednie', false, true); raise exception 'FAIL 4d: obcy rodzaj'; exception when check_violation then null; end;
  begin update public.akcja_firmy set plakat_url = 'https://zly.example/x.png' where id = v_id; raise exception 'FAIL 4e: plakat spoza kubełka'; exception when check_violation then null; end;
  begin update public.akcja_firmy set plakat_tekst = 'x' where id = v_id; raise exception 'FAIL 4f: za krótki tekst'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, nazwa, link, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values ('test-part', 'Bez Potwierdzenia', 'https://example.com', 'domek', 'wplata', false, true); raise exception 'FAIL 4g: wpłata bez potwierdzenia'; exception when check_violation then null; end;
  n := n + 7;

  -- 5. panel: trener zmienia zgodę; zwykłe konto i anon nie widzą ani nie zmieniają
  perform set_config('request.jwt.claims', json_build_object('sub', v_trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.akcja_firmy set logo_zgoda = true where id = v_id;
  if not (select x.logo_zgoda from public.akcja_firmy x where x.id = v_id) then raise exception 'FAIL 5a: trener nie ustawił zgody'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_konto, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.akcja_firmy x where x.id = v_id) then raise exception 'FAIL 5b: zwykłe konto widzi wpis'; end if;
  update public.akcja_firmy set logo_zgoda = false where id = v_id;
  execute 'reset role';
  if not (select x.logo_zgoda from public.akcja_firmy x where x.id = v_id) then raise exception 'FAIL 5c: zwykłe konto zmieniło zgodę'; end if;
  execute 'set local role anon';
  begin perform 1 from public.akcja_firmy; raise exception 'FAIL 5d: anon czyta firmy'; exception when insufficient_privilege then null; end;
  begin update public.akcja_firmy set logo_zgoda = true; raise exception 'FAIL 5e: anon zmienia zgodę'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_licznik('test-part'); raise exception 'FAIL 5f: anon woła licznik z pominięciem EF'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 6;

  raise exception 'TESTY PARTNEROW ZIELONE: % asercji', n;
end $T$;
