-- Testy FILMU AKCJI (20261105_akcja_film.sql) PO SKUTKU: film tajny do startu, te same warunki co rysunek. Jedna transakcja, zawsze wycofana; wynikiem jest treść wyjątku.
-- Adresy w teście są zmyślone: token to napis testowy, żaden plik pod nim nie istnieje.
do $T$
declare
  n int := 0; j jsonb; v_ja uuid; v_konto uuid; v_id uuid;
  U constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/film-akcja.mp4?token=test.token-123';
begin
  select a.user_id, a.id into v_ja, v_konto from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  if v_ja is null then raise exception 'FAIL 0: brak konta do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa) values ('test-film', 'Test', 'Test', current_date, 100, 10, false) returning id into v_id;
  update public.akcje set wizerunek_zgoda = true, film_akcji_url = U where id = v_id;

  -- 1. przed startem licznik nie zna filmu, klient nie czyta kolumny
  j := public.akcja_licznik('test-film');
  if j ? 'film_akcji_url' or j::text like '%film-akcja%' then raise exception 'FAIL 1a: licznik przed startem zna film %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ja, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform film_akcji_url from public.akcje; raise exception 'FAIL 1b: klient czyta adres'; exception when insufficient_privilege then null; end;
  begin update public.akcje set film_akcji_url = U; raise exception 'FAIL 1c: klient zmienia adres'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 2. po starcie: tylko przy zgodzie
  update public.akcje set wystartowala_at = now() where id = v_id;
  j := public.akcja_licznik('test-film');
  if j->>'film_akcji_url' is distinct from U then raise exception 'FAIL 2a: po starcie bez filmu %', j->'film_akcji_url'; end if;
  update public.akcje set wizerunek_zgoda = false where id = v_id;
  j := public.akcja_licznik('test-film');
  if j->>'film_akcji_url' is not null then raise exception 'FAIL 2b: bez zgody film wychodzi'; end if;
  n := n + 2;

  -- 3. akcja testowa nigdy
  update public.akcje set testowa = true, wizerunek_zgoda = true where id = v_id;
  j := public.akcja_licznik('test-film');
  if j->>'film_akcji_url' is not null then raise exception 'FAIL 3: próba oddaje film'; end if;
  n := n + 1;

  -- 4. tylko adres podpisany z prywatnego kubełka, tylko mp4; kubełek przyjmuje film i zostaje prywatny
  begin update public.akcje set film_akcji_url = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/x.mp4' where id = v_id; raise exception 'FAIL 4a: publiczny kubełek'; exception when check_violation then null; end;
  begin update public.akcje set film_akcji_url = 'https://zly.example/storage/v1/object/sign/akcja-wizerunek/x.mp4?token=a' where id = v_id; raise exception 'FAIL 4b: obca domena'; exception when check_violation then null; end;
  begin update public.akcje set film_akcji_url = U || '"><script>' where id = v_id; raise exception 'FAIL 4c: znaczniki w adresie'; exception when check_violation then null; end;
  if (select public from storage.buckets where id = 'akcja-wizerunek') is distinct from false then raise exception 'FAIL 4d: kubełek publiczny'; end if;
  if not (select 'video/mp4' = any(allowed_mime_types) and 'image/webp' = any(allowed_mime_types) and file_size_limit >= 4194304 from storage.buckets where id = 'akcja-wizerunek') then raise exception 'FAIL 4e: kubełek nie przyjmie filmu'; end if;
  n := n + 5;

  raise exception 'TESTY FILMU ZIELONE: % asercji', n;
end $T$;
