-- Testy PO STARCIE AKCJI (20261109_akcja_po_starcie.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS).
-- Złota cegła: flaga w murze, kolejność (złote, potem najnowsze), imię tylko przy zgodzie, kwota nigdy publicznie, przełącznik tylko dla trenera,
-- zatwierdzenie zgłoszenia z kwotą od 100 zł = złota; „Ukryj” kafla na koncie: tylko własne konto, tabela bez dostępu z przeglądarki; licznik km bez zmian.
-- Jedna transakcja, zawsze wycofana (tools/akcja-po-starcie-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; j jsonb; tr uuid; zw uuid; zw2 uuid; km0 text; km_f0 text; c1 uuid; c2 uuid; c3 uuid; c4 uuid; b boolean; t text;
  z1 uuid := gen_random_uuid(); z2 uuid := gen_random_uuid(); z3 uuid := gen_random_uuid();
begin
  select id into tr from public.coaches limit 1;
  select a.user_id into zw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  select a.user_id into zw2 from public.athletes a where a.user_id is not null and a.user_id <> zw and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  if tr is null or zw is null or zw2 is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', current_date, 100, 10, true, now()) on conflict (slug) do update set push_start_at = now(), wystartowala_at = now(), koniec = null;   -- push_start_at: trigger akcje_push_start nie ma czego wysyłać
  delete from public.akcja_cegielki where akcja_slug = 'proba';   -- czysty mur próby, tylko w tej wycofanej transakcji
  km0 := public.akcja_licznik('proba')->>'suma_km';
  km_f0 := public.akcja_licznik('dla-fabianka')->>'suma_km';

  -- 1. kolumna: domyślnie zwykła; mur pusty oddaje pustą listę
  j := public.akcja_ulica_publiczna('proba');
  if j->'cegly' is distinct from '[]'::jsonb or (j->>'cegly_n')::int <> 0 then raise exception 'FAIL 1a: pusty mur: %', j; end if;
  insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane, dodal, dodano) values ('proba', 'Stara', true, true, tr, now() - interval '3 hours') returning id into c1;
  insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane, dodal, dodano) values ('proba', 'Ukryty', false, true, tr, now() - interval '2 hours') returning id into c2;
  insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane, dodal, dodano) values ('proba', 'Nowa', true, true, tr, now() - interval '1 hour') returning id into c3;
  if (select zlota from public.akcja_cegielki where id = c1) is distinct from false then raise exception 'FAIL 1b: nowa cegła domyślnie złota'; end if;
  n := n + 2;

  -- 2. przełącznik: anon i zwykłe konto nie mogą, trener może; nic poza flagą
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.akcja_cegla_zlota(c1, true); raise exception 'FAIL 2a: zwykłe konto przełącza złotą'; exception when insufficient_privilege then null; end;
  begin update public.akcja_cegielki set zlota = true where id = c1; raise exception 'FAIL 2b: UPDATE zlota z przeglądarki'; exception when insufficient_privilege then null; end;
  begin insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane, zlota) values ('proba', 'Wpycha', true, true, true); raise exception 'FAIL 2c: INSERT zlota z przeglądarki'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform public.akcja_cegla_zlota(c1, true); raise exception 'FAIL 2d: anon przełącza złotą'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_ulica_publiczna('proba'); raise exception 'FAIL 2e: anon woła akcja_ulica_publiczna wprost'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b := public.akcja_cegla_zlota(c1, true);
  if b is distinct from true then raise exception 'FAIL 2f: trener nie przełączył'; end if;
  b := public.akcja_cegla_zlota(gen_random_uuid(), true);
  if b is distinct from false then raise exception 'FAIL 2g: nieistniejąca cegła'; end if;
  begin perform public.akcja_cegla_zlota(c1, null); raise exception 'FAIL 2h: null jako wartość'; exception when null_value_not_allowed then null; end;
  if (select zlota from public.akcja_cegielki where id = c1) is distinct from true then raise exception 'FAIL 2i: trener nie widzi złotej w panelu'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.akcja_cegielki where id = c1 and (imie <> 'Stara' or not zgoda)) then raise exception 'FAIL 2j: przełącznik ruszył coś poza flagą'; end if;
  n := n + 10;

  -- 3. publicznie: najpierw złote, potem najnowsze; imię tylko przy zgodzie; bez kwoty, bez id
  j := public.akcja_licznik('proba')->'ulica';
  if j->'cegly' is distinct from '[{"i": "Stara", "z": true}, {"i": "Nowa", "z": false}, {"i": null, "z": false}]'::jsonb then raise exception 'FAIL 3a: kolejność i treść: %', j->'cegly'; end if;
  if (j->>'cegly_n')::int <> 3 or (j->>'bez_imienia')::int <> 1 or j->'imiona' is distinct from '["Stara", "Nowa"]'::jsonb then raise exception 'FAIL 3b: stare pola dla starego frontu: %', j; end if;
  if j::text ~* ('kwota|Ukryty|' || c1::text) then raise exception 'FAIL 3c: kwota, imię bez zgody albo id publicznie: %', j; end if;
  n := n + 3;

  -- 4. zatwierdzenie zgłoszenia cegiełki: kwota od 100 zł = złota, 99,99 zł i brak kwoty = zwykła; kwota nie idzie do muru
  execute 'set local role service_role';
  insert into public.akcja_firmy_zgloszenia (id, akcja_slug, rodzaj, nazwa, email, zrzut_sciezka, zgoda_na_wymienienie, kwota_gr)
    values (z1, 'proba', 'cegielka', 'Sto', null, z1 || '/zrzut.webp', true, 10000),
           (z2, 'proba', 'cegielka', 'Prawie', null, z2 || '/zrzut.webp', true, 9999),
           (z3, 'proba', 'cegielka', 'Bezkwoty', null, z3 || '/zrzut.webp', false, null);
  execute 'reset role';
  j := public.akcja_firmy_zatwierdz(z1, null, tr);
  if not coalesce((j->>'ok')::boolean, false) or (j->>'zlota')::boolean is distinct from true then raise exception 'FAIL 4a: 100 zł nie dało złotej: %', j; end if;
  c4 := (j->>'cegla')::uuid;
  if (select zlota from public.akcja_cegielki where id = c4) is distinct from true then raise exception 'FAIL 4b: złota w murze'; end if;
  j := public.akcja_firmy_zatwierdz(z2, null, tr);
  if (j->>'zlota')::boolean is distinct from false or (select zlota from public.akcja_cegielki where id = (j->>'cegla')::uuid) then raise exception 'FAIL 4c: 99,99 zł dało złotą: %', j; end if;
  j := public.akcja_firmy_zatwierdz(z3, null, tr);
  if (j->>'zlota')::boolean is distinct from false then raise exception 'FAIL 4d: brak kwoty dał złotą: %', j; end if;
  j := public.akcja_ulica_publiczna('proba');
  if j->'cegly'->0 is distinct from '{"i": "Sto", "z": true}'::jsonb or j->'cegly'->1 is distinct from '{"i": "Stara", "z": true}'::jsonb then raise exception 'FAIL 4e: nowa złota nie z przodu: %', j->'cegly'; end if;
  if j::text ~ '10000|9999' then raise exception 'FAIL 4f: kwota w murze: %', j; end if;
  if exists (select 1 from public.akcja_firmy where nazwa in ('Sto', 'Prawie', 'Bezkwoty')) then raise exception 'FAIL 4g: cegiełka jako firma'; end if;
  j := public.akcja_firmy_zatwierdz(gen_random_uuid(), null, tr);
  if j->>'powod' is distinct from 'nie_ma' then raise exception 'FAIL 4h: brak zgłoszenia: %', j; end if;
  n := n + 8;

  -- 5. Ukryj kafel: tylko własne konto, tabela bez dostępu z przeglądarki
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.akcja_kafel_ukryty('dla-fabianka') then raise exception 'FAIL 5a: ukryty przed ukryciem'; end if;
  b := public.akcja_kafel_ukryj('dla-fabianka', true);   -- osobne zapytania: funkcja STABLE widzi stan sprzed zapytania
  if b is distinct from true or not public.akcja_kafel_ukryty('dla-fabianka') then raise exception 'FAIL 5b: ukrycie'; end if;
  perform public.akcja_kafel_ukryj('dla-fabianka', true);   -- drugi raz bez błędu
  begin perform 1 from public.akcja_ukryte limit 1; raise exception 'FAIL 5c: SELECT akcja_ukryte z przeglądarki'; exception when insufficient_privilege then null; end;
  begin insert into public.akcja_ukryte (user_id, akcja_slug) values (zw2, 'dla-fabianka'); raise exception 'FAIL 5d: INSERT za cudze konto'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_kafel_ukryj('nie-ma-takiej', true); raise exception 'FAIL 5e: nieznana akcja'; exception when invalid_parameter_value then null; end;
  begin perform public.akcja_kafel_ukryj('dla-fabianka', null); raise exception 'FAIL 5f: null'; exception when null_value_not_allowed then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.akcja_kafel_ukryty('dla-fabianka') then raise exception 'FAIL 5g: ukrycie jednego konta ukrywa innym'; end if;
  perform public.akcja_kafel_ukryj('dla-fabianka', true);   -- drugie konto też ukrywa: „Pokaż” pierwszego nie może tego zdjąć
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform public.akcja_kafel_ukryj('dla-fabianka', true); raise exception 'FAIL 5h: anon ukrywa'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_kafel_ukryty('dla-fabianka'); raise exception 'FAIL 5i: anon czyta'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b := public.akcja_kafel_ukryj('dla-fabianka', false);
  if b is distinct from false or public.akcja_kafel_ukryty('dla-fabianka') then raise exception 'FAIL 5j: „Pokaż akcję” nie przywraca'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  if (select count(*) from public.akcja_ukryte where user_id = zw) <> 0 then raise exception 'FAIL 5k: wpis po przywróceniu'; end if;
  if not exists (select 1 from public.akcja_ukryte where user_id = zw2 and akcja_slug = 'dla-fabianka') then raise exception 'FAIL 5l: „Pokaż” jednego konta zdjął ukrycie innemu'; end if;
  n := n + 12;

  -- 6. RLS muru bez zmian, licznik km bez zmian, Patryk złoty (jeśli akcja wystartowała i wpis jest)
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'akcja_cegielki') <> 3 then raise exception 'FAIL 6a: polityki muru'; end if;
  if public.akcja_licznik('proba')->>'suma_km' is distinct from km0 or public.akcja_licznik('dla-fabianka')->>'suma_km' is distinct from km_f0 then raise exception 'FAIL 6b: licznik km się zmienił'; end if;
  if exists (select 1 from public.akcja_cegielki where id = 'd4b837fd-a4e9-488d-9586-b87a7491dfe3' and not zlota) then raise exception 'FAIL 6c: Patryk nie jest złoty'; end if;
  j := public.akcja_licznik('dla-fabianka')->'ulica';
  if exists (select 1 from public.akcja_cegielki where id = 'd4b837fd-a4e9-488d-9586-b87a7491dfe3' and zgoda)
     and not coalesce(j->'cegly' @> jsonb_build_array(jsonb_build_object('i', (select imie from public.akcja_cegielki where id = 'd4b837fd-a4e9-488d-9586-b87a7491dfe3'), 'z', true)), false) then
    raise exception 'FAIL 6d: Patryk nie świeci na złoto publicznie: %', j->'cegly';
  end if;
  n := n + 4;

  t := (select string_agg(x->>'z', ',') from jsonb_array_elements(public.akcja_ulica_publiczna('proba')->'cegly') x);
  raise exception 'TESTY PO STARCIE ZIELONE: % asercji | mur próby (z = złota): % | licznik próby % km bez zmian', n, t, km0;
end $T$;
