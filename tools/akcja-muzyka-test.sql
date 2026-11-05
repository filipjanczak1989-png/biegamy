-- Testy MUZYKI AKCJI (20261107_akcja_muzyka.sql) PO SKUTKU: kubełek przyjmuje MP3, muzyka tajna do startu, te same warunki co film. Jedna transakcja, zawsze wycofana; wynikiem jest treść wyjątku.
-- Adresy w teście są zmyślone: token to napis testowy, żaden plik pod nim nie istnieje.
do $T$
declare
  n int := 0; j jsonb; v_ja uuid; v_id uuid; b storage.buckets;
  P constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/';
  U constant text := P || 'muzyka-premiera.mp3?token=test.token-123';
  R constant text := P || 'muzyka-rower.mp3?token=test.token-456';
begin
  select a.user_id into v_ja from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  if v_ja is null then raise exception 'FAIL 0: brak konta do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa) values ('test-muzyka', 'Test', 'Test', current_date, 100, 10, false) returning id into v_id;
  update public.akcje set wizerunek_zgoda = true, muzyka = jsonb_build_object('premiera', U, 'rower', R) where id = v_id;

  -- 1. kubełek: MP3 wchodzi, reszta bez zmian, limit bez zmian
  select * into b from storage.buckets where id = 'akcja-wizerunek';
  if b.allowed_mime_types is distinct from array['image/webp', 'video/mp4', 'audio/mpeg'] then raise exception 'FAIL 1a: lista typów %', b.allowed_mime_types; end if;
  if b.file_size_limit is distinct from 5242880 then raise exception 'FAIL 1b: limit rozmiaru %', b.file_size_limit; end if;
  if b.public is distinct from false then raise exception 'FAIL 1c: kubełek publiczny'; end if;
  n := n + 3;

  -- 2. przed startem licznik nie zna muzyki, klient nie czyta kolumny
  j := public.akcja_licznik('test-muzyka');
  if j ? 'muzyka' or j::text like '%muzyka-premiera%' then raise exception 'FAIL 2a: licznik przed startem zna muzykę %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ja, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform muzyka from public.akcje; raise exception 'FAIL 2b: klient czyta adresy'; exception when insufficient_privilege then null; end;
  begin update public.akcje set muzyka = '{}'::jsonb; raise exception 'FAIL 2c: klient zmienia adresy'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin perform muzyka from public.akcje; raise exception 'FAIL 2d: anon czyta adresy'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 4;

  -- 3. po starcie: tylko przy zgodzie, rower dopiero przy włączonym rowerzyście
  update public.akcje set push_start_at = now(), wystartowala_at = now(), rowerzysta_wlaczony = false where id = v_id;
  j := public.akcja_licznik('test-muzyka');
  if j->'muzyka'->>'premiera' is distinct from U then raise exception 'FAIL 3a: po starcie bez muzyki %', j->'muzyka'; end if;
  if j->'muzyka' ? 'rower' or j::text like '%muzyka-rower%' then raise exception 'FAIL 3b: rower wychodzi przy wyłączonym rowerzyście'; end if;
  update public.akcje set rowerzysta_wlaczony = true where id = v_id;
  j := public.akcja_licznik('test-muzyka');
  if j->'muzyka'->>'rower' is distinct from R then raise exception 'FAIL 3c: włączony rowerzysta bez swojej pozycji'; end if;
  update public.akcje set wizerunek_zgoda = false where id = v_id;
  j := public.akcja_licznik('test-muzyka');
  if j->>'muzyka' is not null or j::text like '%muzyka-premiera%' then raise exception 'FAIL 3d: bez zgody muzyka wychodzi'; end if;
  n := n + 4;

  -- 4. akcja testowa nigdy
  update public.akcje set testowa = true, wizerunek_zgoda = true where id = v_id;
  j := public.akcja_licznik('test-muzyka');
  if j->>'muzyka' is not null then raise exception 'FAIL 4: próba oddaje muzykę'; end if;
  update public.akcje set testowa = false where id = v_id;
  n := n + 1;

  -- 5. tylko adres podpisany MP3 z prywatnego kubełka, tylko znane pozycje
  begin update public.akcje set muzyka = jsonb_build_object('menu1', 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/x.mp3') where id = v_id; raise exception 'FAIL 5a: publiczny kubełek'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = jsonb_build_object('menu1', 'https://zly.example/storage/v1/object/sign/akcja-wizerunek/x.mp3?token=a') where id = v_id; raise exception 'FAIL 5b: obca domena'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = jsonb_build_object('menu1', U || '"><script>') where id = v_id; raise exception 'FAIL 5c: znaczniki w adresie'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = jsonb_build_object('menu1', P || 'x.mp4?token=a') where id = v_id; raise exception 'FAIL 5d: nie MP3'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = jsonb_build_object('menu1', P || 'x.mp3') where id = v_id; raise exception 'FAIL 5e: bez podpisu'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = jsonb_build_object('menu1', 'ADRES_muzyka-menu-1') where id = v_id; raise exception 'FAIL 5f: niewypełniony wzór'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = jsonb_build_object('inna', U) where id = v_id; raise exception 'FAIL 5g: nieznana pozycja'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = '[]'::jsonb where id = v_id; raise exception 'FAIL 5h: tablica'; exception when check_violation then null; end;
  begin update public.akcje set muzyka = jsonb_build_object('menu1', 7) where id = v_id; raise exception 'FAIL 5i: liczba zamiast adresu'; exception when check_violation then null; end;
  update public.akcje set muzyka = jsonb_build_object('premiera', U, 'menu1', U, 'menu2', U, 'rower', U, 'noc', U, 'mur', U, 'final', U, 'magazyn', U) where id = v_id;
  update public.akcje set muzyka = null where id = v_id;
  n := n + 11;

  -- 6. uprawnienia licznika bez zmian, próba nie zna muzyki, prawdziwa akcja przed startem też nie
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'FAIL 6a: anon woła licznik'; end if;
  if not has_function_privilege('authenticated', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'FAIL 6b: authenticated bez licznika'; end if;
  j := public.akcja_licznik('proba');
  if j->>'muzyka' is not null then raise exception 'FAIL 6c: akcja proba oddaje muzykę'; end if;
  j := public.akcja_licznik('dla-fabianka');
  if not (j->>'wystartowala')::boolean and j ? 'muzyka' then raise exception 'FAIL 6d: prawdziwa akcja przed startem zna muzykę'; end if;
  n := n + 4;

  raise exception 'TESTY MUZYKI ZIELONE: % asercji', n;
end $T$;
