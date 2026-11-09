-- Testy FILMÓW AKCJI RAZ NA KONTO (20261109_akcja_filmy.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS).
-- Film startu i progi raz na konto, zapis tylko własny, tabela bez dostępu z przeglądarki, adresy tylko po starcie i przy zgodzie na wizerunek, próba po „od zera” od nowa.
-- Jedna transakcja, zawsze wycofana (tools/akcja-filmy-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; j jsonb; zw uuid; zw2 uuid; km0 text; b boolean;
begin
  select a.user_id into zw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  select a.user_id into zw2 from public.athletes a where a.user_id is not null and a.user_id <> zw and not exists (select 1 from public.coaches c where c.id = a.user_id) order by a.created_at limit 1;
  if zw is null or zw2 is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', current_date, 100, 10, true, now() - interval '1 hour') on conflict (slug) do update set push_start_at = now(), wystartowala_at = now() - interval '1 hour', koniec = null;
  update public.akcje set filmy_progow = '[{"id": "test-1000km", "km": 1000, "plik": "film-akcja.mp4"}, {"id": "zly id!", "km": 5}, {"id": "bez-progu"}]'::jsonb where slug = 'proba';
  km0 := public.akcja_licznik('dla-fabianka')->>'suma_km';

  -- 1. zwykłe konto: progi bez adresu na próbie (adres daje funkcja próby), złe wpisy odpadają, nic jeszcze nie widziane
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_filmy_konta('proba');
  if j is distinct from '{"progi": [{"id": "test-1000km", "km": 1000}], "obejrzane": []}'::jsonb then raise exception 'FAIL 1a: %', j; end if;
  if j::text ~ 'film-akcja|plik' then raise exception 'FAIL 1b: nazwa pliku wychodzi: %', j; end if;
  b := public.akcja_film_obejrzany('proba', 'start');
  if b is distinct from true then raise exception 'FAIL 1c: zapis startu'; end if;
  perform public.akcja_film_obejrzany('proba', 'start');   -- drugi raz bez błędu
  perform public.akcja_film_obejrzany('proba', 'test-1000km');
  j := public.akcja_filmy_konta('proba');
  if j->'obejrzane' is distinct from '["start", "test-1000km"]'::jsonb and j->'obejrzane' is distinct from '["test-1000km", "start"]'::jsonb then raise exception 'FAIL 1d: %', j; end if;
  begin perform public.akcja_film_obejrzany('proba', 'Zły Film'); raise exception 'FAIL 1e: zły identyfikator'; exception when invalid_parameter_value then null; end;
  begin perform 1 from public.akcja_filmy_obejrzane limit 1; raise exception 'FAIL 1f: SELECT tabeli z przeglądarki'; exception when insufficient_privilege then null; end;
  begin insert into public.akcja_filmy_obejrzane (user_id, akcja_slug, film) values (zw2, 'proba', 'start'); raise exception 'FAIL 1g: INSERT za cudze konto'; exception when insufficient_privilege then null; end;
  begin perform filmy_progow from public.akcje limit 1; raise exception 'FAIL 1h: kolumna filmów z przeglądarki'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 8;

  -- 2. drugie konto nie widzi cudzego „widziane”; anon nic
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.akcja_filmy_konta('proba')->'obejrzane' <> '[]'::jsonb then raise exception 'FAIL 2a: cudze widziane'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform public.akcja_filmy_konta('proba'); raise exception 'FAIL 2b: anon czyta'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_film_obejrzany('proba', 'start'); raise exception 'FAIL 2c: anon zapisuje'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 3. próba „od zera” i ponowne naciśnięcie: filmy grają jeszcze raz; prawdziwa akcja tego nie ma
  update public.akcje set wystartowala_at = null where slug = 'proba';
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.akcja_filmy_konta('proba') is distinct from '{"progi": [], "obejrzane": []}'::jsonb then raise exception 'FAIL 3a: przed startem coś wychodzi'; end if;
  if public.akcja_film_obejrzany('proba', 'start') is distinct from false then raise exception 'FAIL 3b: zapis przed startem'; end if;
  execute 'reset role';
  update public.akcje set wystartowala_at = clock_timestamp() where slug = 'proba';   -- nowe naciśnięcie po obejrzeniu (now() w transakcji stoi)
  execute 'set local role authenticated';
  if public.akcja_filmy_konta('proba')->'obejrzane' <> '[]'::jsonb then raise exception 'FAIL 3c: po „od zera” filmy dalej widziane'; end if;
  perform public.akcja_film_obejrzany('proba', 'start');
  if public.akcja_filmy_konta('proba')->'obejrzane' <> '["start"]'::jsonb then raise exception 'FAIL 3d: ponowne obejrzenie po „od zera”: %', public.akcja_filmy_konta('proba'); end if;
  execute 'reset role';
  n := n + 4;

  -- 4. prawdziwa akcja: adres tylko przy zgodzie na wizerunek; bez plików pusta lista; licznik bez zmian
  if (select filmy_progow from public.akcje where slug = 'dla-fabianka') <> '[]'::jsonb then raise exception 'FAIL 4a: prawdziwa akcja z filmami progów'; end if;
  update public.akcje set filmy_progow = '[{"id": "km-1000", "km": 1000, "url": "https://example.invalid/f.mp4"}, {"id": "pct-25", "pct": 25, "url": "https://example.invalid/g.mp4"}]'::jsonb where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.akcja_filmy_konta('dla-fabianka');
  execute 'reset role';
  if (select wizerunek_zgoda from public.akcje where slug = 'dla-fabianka') then
    if j->'progi'->0->>'url' is distinct from 'https://example.invalid/f.mp4' or j->'progi'->1->>'pct' is distinct from '25' then raise exception 'FAIL 4b: %', j; end if;
  end if;
  update public.akcje set wizerunek_zgoda = false where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.akcja_filmy_konta('dla-fabianka');
  execute 'reset role';
  if j::text ~ 'example\.invalid' or jsonb_array_length(j->'progi') <> 2 then raise exception 'FAIL 4c: adres bez zgody na wizerunek: %', j; end if;
  if public.akcja_licznik('dla-fabianka')->>'suma_km' is distinct from km0 then raise exception 'FAIL 4d: licznik km się zmienił'; end if;
  n := n + 4;

  raise exception 'TESTY FILMOW ZIELONE: % asercji | licznik % km bez zmian', n, km0;
end $T$;
