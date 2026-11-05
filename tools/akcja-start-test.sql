-- Testy STARTU AKCJI Z PRZEŁĄCZNIKAMI (20261106_akcja_start_przelaczniki.sql) PO SKUTKU, z set local role i request.jwt.claims. Jedna transakcja, zawsze wycofana; wynikiem jest treść wyjątku na końcu.
-- Start włącza, próba niczego nie włącza na prawdziwej akcji, ponowny start nic nie psuje, plakat tylko po starcie i przy zgodzie, partnerzy próby bez logo.
do $T$
declare
  n int := 0; j jsonb; u1 uuid; a1 uuid; tr uuid; f record; a public.akcje; pr public.akcje; v_t timestamptz; c int;
  P constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/plakat-akcji.webp?token=test';
begin
  select x.user_id, x.id into u1, a1 from public.athletes x where x.user_id is not null order by x.created_at limit 1;
  select c0.id into tr from public.coaches c0 limit 1;
  if u1 is null or tr is null then raise exception 'FAIL 0: za mało kont do testu'; end if;
  insert into public.akcja_startujacy (akcja_id, athlete_id) select x.id, a1 from public.akcje x where x.slug in ('dla-fabianka', 'proba') and not exists (select 1 from public.akcja_startujacy s where s.akcja_id = x.id and s.athlete_id = a1);
  update public.akcje set wystartowala_at = null, push_start_at = now(), okno_startu_od = null, okno_startu_do = null, koniec = null where slug in ('dla-fabianka', 'proba');
  if (select count(*) from public.akcje where slug in ('dla-fabianka', 'proba')) <> 2 then raise exception 'FAIL 0b: brak wierszy akcji'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

  -- 1. plakat: przed startem nic, nawet przy zgodzie
  update public.akcje set wizerunek_zgoda = true, plakat_url = P, gra_aktywna = false, fabianek_postac_gra = false, rowerzysta_wlaczony = false, rowerzysta_opis = 'Testowy na rowerze' where slug = 'dla-fabianka';
  j := public.akcja_licznik('dla-fabianka');
  if j ? 'plakat_url' or j::text like '%plakat-akcji%' then raise exception 'FAIL 1a: licznik przed startem zna plakat %', j; end if;
  n := n + 1;

  -- 2. próba nic nie włącza: ani na prawdziwej akcji, ani u siebie
  update public.akcje set gra_aktywna = false, fabianek_postac_gra = false, rowerzysta_wlaczony = false, rowerzysta_opis = 'Testowy na rowerze' where slug = 'proba';
  execute 'set local role authenticated'; j := public.akcja_start('proba'); execute 'reset role';
  if (j->>'wystartowala')::boolean is distinct from true then raise exception 'FAIL 2a: próba nie ruszyła %', j; end if;
  select * into a from public.akcje where slug = 'dla-fabianka'; select * into pr from public.akcje where slug = 'proba';
  if a.gra_aktywna or a.fabianek_postac_gra or a.rowerzysta_wlaczony or a.wystartowala_at is not null then raise exception 'FAIL 2b: próba ruszyła prawdziwą akcję'; end if;
  if pr.gra_aktywna or pr.fabianek_postac_gra or pr.rowerzysta_wlaczony then raise exception 'FAIL 2c: próba włączyła swoje przełączniki'; end if;
  n := n + 3;

  -- 3. start prawdziwej akcji: wszystko włączone jedną odpowiedzią, plakat już w tej odpowiedzi
  execute 'set local role authenticated'; j := public.akcja_start('dla-fabianka'); execute 'reset role';
  select * into a from public.akcje where slug = 'dla-fabianka';
  if a.wystartowala_at is null or not a.gra_aktywna or not a.fabianek_postac_gra or not a.rowerzysta_wlaczony then raise exception 'FAIL 3a: start nie włączył: gra % koparka % rower %', a.gra_aktywna, a.fabianek_postac_gra, a.rowerzysta_wlaczony; end if;
  if j->>'plakat_url' is distinct from P then raise exception 'FAIL 3b: plakat po starcie %', j->>'plakat_url'; end if;
  n := n + 2;

  -- 4. ponowny start nic nie psuje: wyłączone przez Filipa zostaje wyłączone, czas bez zmiany
  v_t := a.wystartowala_at;
  update public.akcje set wystartowala_at = v_t - interval '1 hour', gra_aktywna = false, fabianek_postac_gra = false, rowerzysta_wlaczony = false where slug = 'dla-fabianka';
  execute 'set local role authenticated'; j := public.akcja_start('dla-fabianka'); execute 'reset role';
  select * into a from public.akcje where slug = 'dla-fabianka';
  if a.gra_aktywna or a.fabianek_postac_gra or a.rowerzysta_wlaczony then raise exception 'FAIL 4a: ponowny start włączył wyłączone'; end if;
  if a.wystartowala_at is distinct from v_t - interval '1 hour' then raise exception 'FAIL 4b: ponowny start zmienił czas'; end if;
  if j->>'wystartowala' is distinct from 'true' then raise exception 'FAIL 4c: ponowny start bez licznika %', j; end if;
  n := n + 3;

  -- 5. rowerzysta tylko z opisem; włączony wcześniej zostaje
  for f in select * from (values
      ('bez opisu', null::text, false, false), ('pusty', '', false, false), ('same spacje', '   ', false, false), ('z opisem', 'Testowy na rowerze', false, true), ('włączony bez opisu zostaje', '', true, true)
    ) v(opis, tekst, przed, po)
  loop
    update public.akcje set wystartowala_at = null, gra_aktywna = false, fabianek_postac_gra = false, rowerzysta_opis = f.tekst, rowerzysta_wlaczony = f.przed where slug = 'dla-fabianka';
    execute 'set local role authenticated'; j := public.akcja_start('dla-fabianka'); execute 'reset role';
    select * into a from public.akcje where slug = 'dla-fabianka';
    if a.rowerzysta_wlaczony is distinct from f.po then raise exception 'FAIL 5a (%): rowerzysta %', f.opis, a.rowerzysta_wlaczony; end if;
    if not a.gra_aktywna or not a.fabianek_postac_gra then raise exception 'FAIL 5b (%): gra lub koparka nie ruszyły', f.opis; end if;
    n := n + 2;
  end loop;

  -- 6. bez zgody plakatu nie ma także po starcie
  update public.akcje set wizerunek_url = null, koparka_url = null, koparka_arkusz_url = null, film_akcji_url = null, wizerunek_zgoda = false, wystartowala_at = null where slug = 'dla-fabianka';
  execute 'set local role authenticated'; j := public.akcja_start('dla-fabianka'); execute 'reset role';
  if j->>'plakat_url' is not null then raise exception 'FAIL 6a: plakat bez zgody %', j->>'plakat_url'; end if;
  n := n + 1;

  -- 7. odmowa nie zostawia śladu: obcy i poza oknem
  update public.akcje set wystartowala_at = null, gra_aktywna = false, fabianek_postac_gra = false, rowerzysta_wlaczony = false, rowerzysta_opis = 'Testowy na rowerze' where slug = 'dla-fabianka';
  delete from public.akcja_startujacy where athlete_id = a1 and akcja_id = (select x.id from public.akcje x where x.slug = 'dla-fabianka');
  execute 'set local role authenticated';
  begin perform public.akcja_start('dla-fabianka'); raise exception 'FAIL 7a: obcy nacisnął'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  insert into public.akcja_startujacy (akcja_id, athlete_id) select x.id, a1 from public.akcje x where x.slug = 'dla-fabianka';
  update public.akcje set okno_startu_od = now() + interval '1 hour', okno_startu_do = now() + interval '2 hours' where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  begin perform public.akcja_start('dla-fabianka'); raise exception 'FAIL 7b: start poza oknem'; exception when invalid_parameter_value then null; end;
  execute 'reset role';
  select * into a from public.akcje where slug = 'dla-fabianka';
  if a.gra_aktywna or a.fabianek_postac_gra or a.rowerzysta_wlaczony or a.wystartowala_at is not null then raise exception 'FAIL 7c: odmowa coś włączyła'; end if;
  update public.akcje set okno_startu_od = null, okno_startu_do = null where slug = 'dla-fabianka';
  execute 'set local role anon';
  begin perform public.akcja_start('dla-fabianka'); raise exception 'FAIL 7d: anon nacisnął'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 4;

  -- 8. partnerzy próby: budynki stoją, logo nie, tylko na próbie, dwa dodania bez podwójnych wpisów
  update public.akcje set wystartowala_at = now() where slug = 'proba';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_firmy(true); j := public.akcja_proba_firmy(true);
  execute 'reset role';
  select count(*) into c from public.akcja_firmy where akcja_slug = 'proba' and wsparcie = 'poprzednie';
  if c <> 3 then raise exception 'FAIL 8a: partnerów próby %', c; end if;
  if (select count(*) from public.akcja_firmy where akcja_slug = 'proba' and wsparcie = 'poprzednie' and logo_zgoda) <> 0 then raise exception 'FAIL 8b: partner próby ze zgodą'; end if;
  j := public.akcja_licznik('proba');
  if (select count(*) from jsonb_array_elements(j->'firmy') e where e->>'rodzaj' in ('osiedle', 'galeria', 'fabryka')) <> 3 then raise exception 'FAIL 8c: budynki partnerów %', j->'firmy'; end if;
  if exists (select 1 from jsonb_array_elements(j->'firmy') e where e->>'rodzaj' in ('osiedle', 'galeria', 'fabryka') and (e->>'logo_url' is not null or e->>'plakat_url' is not null)) then raise exception 'FAIL 8d: partner próby z logo %', j->'firmy'; end if;
  if public.akcja_licznik('dla-fabianka')::text ~ 'Fabryka Próbna|Osiedle Próbne|Galeria Próbna' then raise exception 'FAIL 8e: partner próby na prawdziwej akcji'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; j := public.akcja_proba_firmy(false); execute 'reset role';
  if exists (select 1 from public.akcja_firmy where akcja_slug = 'proba') then raise exception 'FAIL 8f: firmy próby zostały'; end if;
  n := n + 6;

  raise exception 'TESTY STARTU ZIELONE: % asercji', n;
end $T$;
