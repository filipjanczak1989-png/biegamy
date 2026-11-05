-- Testy ŚCIEŻKI FABIANKA (20261105_akcja_sciezka.sql) PO SKUTKU, z `set local role` i request.jwt.claims. Prawdziwa akcja nietknięta, odmowa dla anona i zawodnika, od zera wraca do stanu sprzed naciśnięcia, symulacja tylko na próbie, firmy testowe nigdy na prawdziwej akcji, limit wyprawy tylko dla kont wyprawy.
-- Jedna transakcja, zawsze wycofana (tools/akcja-sciezka-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; c int; j jsonb; tr uuid; zw uuid; zw_ath uuid; ak public.akcje; realny_przed jsonb; firmy_przed int; ath_wyprawa uuid; ath_zwykly uuid; km numeric; km_reszta numeric; ath uuid;
  DZIEN constant date := date '2000-01-03';
  LOGO constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/00000000-0000-4000-8000-000000000009.webp';
begin
  select id into tr from public.coaches limit 1;
  select a.user_id, a.id into zw, zw_ath from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches k where k.id = a.user_id) order by a.created_at limit 1;
  if tr is null or zw is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa) values ('proba', 'Próba', current_date, 12500, 10, true) on conflict (slug) do nothing;
  update public.akcje set testowa = true, push_start_at = now(), wystartowala_at = now(), wyprawa_dotarla_at = now(), konta_testowe = array[zw_ath]::uuid[] where slug = 'proba';
  insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane) values ('proba', 'Ola', true, true);
  insert into public.akcja_ulica (akcja_slug, kwota_zl, cel_zl) values ('proba', 10, 100) on conflict (akcja_slug) do update set kwota_zl = 10;
  insert into public.akcja_firmy (akcja_slug, nazwa, link, potwierdzenie_widziane, zgoda_na_wymienienie) values ('proba', 'Stara Firma Proby', 'https://a.pl', true, true);
  begin insert into public.achievements (athlete_id, badge_id) values (zw_ath, 'akcja-1km'); exception when others then null; end;   -- wyzwalacz okna może odmówić, wtedy nie ma czego kasować
  realny_przed := public.akcja_licznik('dla-fabianka');
  select count(*) into firmy_przed from public.akcja_firmy where akcja_slug = 'dla-fabianka';

  -- 1. odmowa: anon bez funkcji, zawodnik z odmową 42501, także trener podrobiony w metadanych
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin perform public.akcja_sciezka_stan(); raise exception 'FAIL 1a: anon stan'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_proba_od_zera(); raise exception 'FAIL 1b: anon od zera'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_proba_symuluj(1, 1); raise exception 'FAIL 1c: anon symulacja'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_proba_firmy(true); raise exception 'FAIL 1d: anon firmy'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated', 'user_metadata', json_build_object('role', 'coach'))::text, true);
  execute 'set local role authenticated';
  begin perform public.akcja_sciezka_stan(); raise exception 'FAIL 1e: zawodnik stan'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_proba_od_zera(); raise exception 'FAIL 1f: zawodnik od zera'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_proba_symuluj(1, 1); raise exception 'FAIL 1g: zawodnik symulacja'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_proba_firmy(true); raise exception 'FAIL 1h: zawodnik firmy'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 8;

  -- 2. symulacja na próbie: suma z suwaka, procent odblokowuje elementy, odpowiedź prawdziwej akcji bez zmian
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_symuluj(3125, 25);
  execute 'reset role';
  if (j->>'sym_km')::numeric <> 3125 or (j->>'kwota_proc')::numeric <> 25 then raise exception 'FAIL 2a: stan po symulacji %', j; end if;
  j := public.akcja_licznik('proba');
  select public.akcja_km_okna(x.id, x.start, (now() at time zone 'Europe/Warsaw')::date) into km from public.akcje x where x.slug = 'proba';
  if (j->>'suma_km')::numeric <> round(3125 + km, 2) then raise exception 'FAIL 2b: licznik próby % zamiast suwak + km %', j->>'suma_km', km; end if;
  if not (j->'ulica'->'odblokowane' ? 'latarnie') or j->'ulica'->'odblokowane' ? 'plac_zabaw' then raise exception 'FAIL 2c: progi przy 25%%: %', j->'ulica'; end if;
  if public.akcja_licznik('dla-fabianka') is distinct from realny_przed then raise exception 'FAIL 2d: prawdziwa akcja się zmieniła'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_symuluj(12500, 100);
  execute 'reset role';
  j := public.akcja_licznik('proba');
  if not (j->>'zamknieta')::boolean or not (j->'ulica'->'odblokowane' ? 'park') then raise exception 'FAIL 2e: koniec akcji %', j->>'zamknieta'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.akcja_proba_symuluj(12501, null); raise exception 'FAIL 2f: km poza zakresem'; exception when invalid_parameter_value then null; end;
  begin perform public.akcja_proba_symuluj(1, 101); raise exception 'FAIL 2g: procent poza zakresem'; exception when invalid_parameter_value then null; end;
  execute 'reset role';
  begin update public.akcje set proba_sym_km = 1 where slug = 'dla-fabianka'; raise exception 'FAIL 2h: symulacja na prawdziwej akcji'; exception when check_violation then null; end;
  n := n + 8;

  -- 3. firmy testowe: tylko na próbie, usunięcie oddaje tylko własne pliki
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_firmy(true);
  j := public.akcja_proba_firmy(true);
  execute 'reset role';
  select count(*) into c from public.akcja_firmy where akcja_slug = 'proba' and nazwa in ('Partner Próbny', 'Wieżowiec Próbny', 'Domek Próbny');
  if c <> 3 then raise exception 'FAIL 3a: firm testowych % po dwóch dodaniach', c; end if;
  if (select count(*) from public.akcja_firmy where akcja_slug = 'dla-fabianka') <> firmy_przed then raise exception 'FAIL 3b: firma testowa na prawdziwej akcji'; end if;
  if public.akcja_licznik('dla-fabianka')::text like '%Próbny%' then raise exception 'FAIL 3c: firma testowa w liczniku prawdziwej akcji'; end if;
  if not public.akcja_licznik('proba')::text like '%Partner Próbny%' then raise exception 'FAIL 3d: brak firmy testowej w liczniku próby'; end if;
  update public.akcja_firmy set logo_url = LOGO where akcja_slug = 'proba' and nazwa = 'Domek Próbny';
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_firmy(false);
  execute 'reset role';
  if not (j->'pliki' ? '00000000-0000-4000-8000-000000000009.webp') then raise exception 'FAIL 3e: plik do skasowania %', j->'pliki'; end if;
  if exists (select 1 from public.akcja_firmy where akcja_slug = 'proba') then raise exception 'FAIL 3f: firmy próby zostały'; end if;
  insert into public.akcja_firmy (akcja_slug, nazwa, link, potwierdzenie_widziane, zgoda_na_wymienienie) values ('proba', 'Stara Firma Proby', 'https://a.pl', true, true);
  n := n + 6;

  -- 4. od zera: stan sprzed naciśnięcia, licznik 0 po ponownym starcie, push może polecieć jeszcze raz, prawdziwa akcja nietknięta
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_proba_od_zera();
  execute 'reset role';
  select * into ak from public.akcje where slug = 'proba';
  if ak.wystartowala_at is not null or ak.push_start_at is not null or ak.wyprawa_dotarla_at is not null or ak.koniec is not null or ak.push_zamkniecie_at is not null then raise exception 'FAIL 4a: stan akcji po resecie'; end if;
  if ak.proba_sym_km is distinct from 0 then raise exception 'FAIL 4b: licznik nie zerowy'; end if;
  if exists (select 1 from public.akcja_cegielki where akcja_slug = 'proba') or exists (select 1 from public.akcja_ulica where akcja_slug = 'proba') then raise exception 'FAIL 4c: ulica próby została'; end if;
  if exists (select 1 from public.akcja_firmy where akcja_slug = 'proba' and not ukryta) then raise exception 'FAIL 4d: firma próby nie ukryta'; end if;
  if not exists (select 1 from public.akcja_firmy where akcja_slug = 'proba') then raise exception 'FAIL 4e: firmy skasowane zamiast ukryte'; end if;
  if exists (select 1 from public.achievements where athlete_id = zw_ath and badge_id = 'akcja-1km') then raise exception 'FAIL 4i: odznaka akcji została'; end if;
  j := public.akcja_licznik('proba');
  if (j->>'wystartowala')::boolean then raise exception 'FAIL 4f: licznik po resecie'; end if;
  if public.akcja_licznik('dla-fabianka') is distinct from realny_przed then raise exception 'FAIL 4g: prawdziwa akcja się zmieniła'; end if;
  update public.akcje set push_start_at = now(), wystartowala_at = now() where slug = 'proba';
  j := public.akcja_licznik('proba');
  select public.akcja_km_okna(x.id, x.start, (now() at time zone 'Europe/Warsaw')::date) into km from public.akcje x where x.slug = 'proba';
  if (j->>'suma_km')::numeric <> round(km, 2) then raise exception 'FAIL 4h: licznik po ponownym starcie % zamiast samych km %', j->>'suma_km', km; end if;
  n := n + 8;

  -- 5. limit dobowy przez prawdziwy filtr typów: konto wyprawy 300 km, reszta 100. Dzień sprzed istnienia aplikacji: nikt nie ma wtedy prawdziwych treningów, więc wynik ma się zgadzać co do kilometra.
  if not public.akcja_typ_liczy('Spokojny', 'Run') or public.akcja_typ_liczy('Rower', 'Ride') then raise exception 'FAIL 5a: filtr typów inny, niż zakłada test'; end if;
  select a.id into ath_wyprawa from public.athletes a where a.id <> zw_ath order by a.created_at limit 1;
  ath_zwykly := zw_ath;
  if ath_wyprawa is null then raise exception 'FAIL 5b: brak drugiego konta do testu'; end if;
  update public.akcje set konta_testowe = array[ath_wyprawa, ath_zwykly]::uuid[], wyprawa_athlete_ids = array[ath_wyprawa]::uuid[], proba_sym_km = null, start = DZIEN, koniec = null where slug = 'proba';
  select * into ak from public.akcje where slug = 'proba';
  if ak.cap_km_doba <> 100 or ak.cap_km_doba_wyprawa <> 300 then raise exception 'FAIL 5c: limity % i %', ak.cap_km_doba, ak.cap_km_doba_wyprawa; end if;
  insert into public.training_logs (athlete_id, distance_km, training_type, external_type, logged_at) values
    (ath_wyprawa, 250, 'Spokojny', 'Run', (DZIEN + time '12:00') at time zone 'Europe/Warsaw'),
    (ath_zwykly, 250, 'Spokojny', 'Run', (DZIEN + time '12:00') at time zone 'Europe/Warsaw'),
    (ath_wyprawa, 180, 'Wybieganie', 'Run', (DZIEN + 1 + time '08:00') at time zone 'Europe/Warsaw'),
    (ath_wyprawa, 220, 'Wybieganie', 'Run', (DZIEN + 1 + time '18:00') at time zone 'Europe/Warsaw'),
    (ath_zwykly, 60, 'Wybieganie', 'Run', (DZIEN + 1 + time '08:00') at time zone 'Europe/Warsaw'),
    (ath_zwykly, 70, 'Wybieganie', 'Run', (DZIEN + 1 + time '18:00') at time zone 'Europe/Warsaw'),
    (ath_wyprawa, 40, 'Spacer', 'Walk', (DZIEN + 2 + time '12:00') at time zone 'Europe/Warsaw'),
    (ath_zwykly, 40, 'Spacer', 'Walk', (DZIEN + 2 + time '12:00') at time zone 'Europe/Warsaw'),
    (ath_wyprawa, 50, 'Rower', 'Ride', (DZIEN + 3 + time '12:00') at time zone 'Europe/Warsaw');
  km := public.akcja_km_okna(ak.id, DZIEN, DZIEN, array[ath_wyprawa]::uuid[]);
  if km <> 250 then raise exception 'FAIL 5d: konto wyprawy obcięte do %', km; end if;
  km := public.akcja_km_okna(ak.id, DZIEN + 1, DZIEN + 1, array[ath_wyprawa]::uuid[]);
  if km <> 300 then raise exception 'FAIL 5e: dwa treningi jednego dnia na koncie wyprawy: %', km; end if;
  km := public.akcja_km_okna(ak.id, DZIEN, DZIEN, array[ath_zwykly]::uuid[]);
  if km <> 100 then raise exception 'FAIL 5f: zwykłe konto bez limitu %', km; end if;
  km := public.akcja_km_okna(ak.id, DZIEN + 1, DZIEN + 1, array[ath_zwykly]::uuid[]);
  if km <> 100 then raise exception 'FAIL 5g: dwa treningi jednego dnia na zwykłym koncie: %', km; end if;
  km := public.akcja_km_okna(ak.id, DZIEN + 2, DZIEN + 2, array[ath_wyprawa]::uuid[]);
  if km <> 40 then raise exception 'FAIL 5h: spacer poniżej limitu %', km; end if;
  km := public.akcja_km_okna(ak.id, DZIEN + 3, DZIEN + 3, array[ath_wyprawa]::uuid[]);
  if km <> 0 then raise exception 'FAIL 5i: rower liczy się do akcji %', km; end if;
  km_reszta := public.akcja_km_okna(ak.id, DZIEN + 4, (now() at time zone 'Europe/Warsaw')::date);   -- prawdziwe treningi obu kont, nie z tego testu
  j := public.akcja_licznik('proba');
  if (j->>'suma_km')::numeric <> round(590 + 240 + km_reszta, 2) then raise exception 'FAIL 5j: licznik % zamiast %', j->>'suma_km', round(590 + 240 + km_reszta, 2); end if;

  -- 5k. prawdziwa akcja z prawdziwą listą kont wyprawy. Wszystko wycofane razem z transakcją.
  select * into ak from public.akcje where slug = 'dla-fabianka';
  if coalesce(cardinality(ak.wyprawa_athlete_ids), 0) = 0 then raise exception 'FAIL 5k: prawdziwa akcja bez kont wyprawy'; end if;
  select a.id into ath_zwykly from public.athletes a where not (a.id = any(ak.wyprawa_athlete_ids)) order by a.created_at limit 1;
  update public.akcje set start = DZIEN where slug = 'dla-fabianka';
  insert into public.training_logs (athlete_id, distance_km, training_type, external_type, logged_at)
    select x, 400, 'Spokojny', 'Run', (DZIEN + 5 + time '12:00') at time zone 'Europe/Warsaw' from unnest(ak.wyprawa_athlete_ids || ath_zwykly) x;
  foreach ath in array ak.wyprawa_athlete_ids loop
    km := public.akcja_km_okna(ak.id, DZIEN + 5, DZIEN + 5, array[ath]::uuid[]);
    if km <> 300 then raise exception 'FAIL 5l: konto wyprawy prawdziwej akcji: %', km; end if;
  end loop;
  km := public.akcja_km_okna(ak.id, DZIEN + 5, DZIEN + 5, array[ath_zwykly]::uuid[]);
  if km <> 100 then raise exception 'FAIL 5m: zwykłe konto prawdziwej akcji: %', km; end if;
  n := n + 13;

  raise exception 'TESTY SCIEZKI ZIELONE: % asercji', n;
end $T$;
