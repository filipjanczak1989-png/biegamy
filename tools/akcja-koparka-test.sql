-- Testy KOPARKI (20261105_akcja_koparka.sql) PO SKUTKU: rysunek tajny do startu. set local role + request.jwt.claims, bo postgres omija RLS. Jedna transakcja, zawsze wycofana; wynikiem jest treść wyjątku na końcu.
-- Adresy w teście są zmyślone: token to napis testowy, żaden plik pod nim nie istnieje.
do $T$
declare
  n int := 0; j jsonb; c int; v_ja uuid; v_konto uuid; v_id uuid;
  U constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/test.webp?token=test.token-123';
begin
  select a.user_id, a.id into v_ja, v_konto from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  if v_ja is null then raise exception 'FAIL 0: brak konta do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa) values ('test-kop', 'Test', 'Test', current_date, 100, 10, false) returning id into v_id;

  -- 1. PRZED STARTEM: nawet ze zgodą, postacią i adresem licznik nie zna rysunku
  update public.akcje set wizerunek_zgoda = true, koparka_postac = 'fabianek', koparka_url = U where id = v_id;
  j := public.akcja_licznik('test-kop');
  if j ? 'koparka_url' or j ? 'koparka_postac' or j::text like '%akcja-wizerunek%' then raise exception 'FAIL 1a: licznik przed startem zna rysunek %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ja, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_licznik('test-kop');
  if j::text like '%akcja-wizerunek%' then raise exception 'FAIL 1b: zalogowany widzi rysunek przed startem'; end if;
  begin perform koparka_url from public.akcje; raise exception 'FAIL 1c: klient czyta koparka_url'; exception when insufficient_privilege then null; end;
  begin perform koparka_postac from public.akcje; raise exception 'FAIL 1d: klient czyta koparka_postac'; exception when insufficient_privilege then null; end;
  begin update public.akcje set koparka_url = U; raise exception 'FAIL 1e: klient zmienia adres'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform koparka_url from public.akcje; raise exception 'FAIL 1f: anon czyta koparka_url'; exception when insufficient_privilege then null; end;
  begin perform public.akcja_licznik('test-kop'); raise exception 'FAIL 1g: anon woła licznik'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 7;

  -- 2. NACIŚNIĘCIE: akcja_start od razu oddaje adres, bo guzik ma go pokazać w tej samej chwili
  insert into public.akcja_startujacy (akcja_id, athlete_id) values (v_id, v_konto);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ja, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_start('test-kop');
  if not (j->>'wystartowala')::boolean or j->>'koparka_url' <> U or j->>'koparka_postac' <> 'fabianek' then raise exception 'FAIL 2a: odpowiedź guzika bez rysunku %', j; end if;
  execute 'reset role';
  n := n + 1;

  -- 3. PO STARCIE: tylko przy zgodzie i z ustawioną postacią
  j := public.akcja_licznik('test-kop');
  if j->>'koparka_url' <> U then raise exception 'FAIL 3a: po starcie bez adresu'; end if;
  update public.akcje set wizerunek_zgoda = false where id = v_id;
  j := public.akcja_licznik('test-kop');
  if j->>'koparka_url' is not null or j->>'koparka_postac' is not null then raise exception 'FAIL 3b: bez zgody %', j; end if;
  update public.akcje set wizerunek_zgoda = true, koparka_postac = null where id = v_id;
  j := public.akcja_licznik('test-kop');
  if j->>'koparka_url' is not null then raise exception 'FAIL 3c: bez postaci adres wychodzi'; end if;
  update public.akcje set koparka_postac = 'fabianek', koparka_url = null where id = v_id;
  j := public.akcja_licznik('test-kop');
  if j->>'koparka_postac' is not null then raise exception 'FAIL 3d: postać bez adresu'; end if;
  n := n + 4;

  -- 4. AKCJA TESTOWA: nigdy, bo licznik próby może wywołać każde zalogowane konto, a próbę można uruchomić przed prawdziwym startem
  update public.akcje set testowa = true, koparka_url = U, wizerunek_zgoda = true, koparka_postac = 'fabianek' where id = v_id;
  j := public.akcja_licznik('test-kop');
  if j::text like '%akcja-wizerunek%' or j->>'koparka_postac' is not null then raise exception 'FAIL 4: akcja testowa oddaje rysunek %', j; end if;
  update public.akcje set testowa = false where id = v_id;
  n := n + 1;

  -- 5. CHECK: tylko adres podpisany z prywatnego kubełka, tylko WebP
  begin update public.akcje set koparka_url = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/akcja/x.webp' where id = v_id; raise exception 'FAIL 5a: adres z publicznego kubełka'; exception when check_violation then null; end;
  begin update public.akcje set koparka_url = 'http://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/x.webp?token=a' where id = v_id; raise exception 'FAIL 5b: http'; exception when check_violation then null; end;
  begin update public.akcje set koparka_url = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/x.png?token=a' where id = v_id; raise exception 'FAIL 5c: nie WebP'; exception when check_violation then null; end;
  begin update public.akcje set koparka_url = 'https://zly.example/storage/v1/object/sign/akcja-wizerunek/x.webp?token=a' where id = v_id; raise exception 'FAIL 5d: obcy host'; exception when check_violation then null; end;
  begin update public.akcje set koparka_url = U || '"><script>' where id = v_id; raise exception 'FAIL 5e: znaczniki w adresie'; exception when check_violation then null; end;
  begin update public.akcje set koparka_postac = 'ktos-inny' where id = v_id; raise exception 'FAIL 5f: inna postać'; exception when check_violation then null; end;
  n := n + 6;

  -- 6. KUBEŁEK: prywatny, bez polityk, typ i rozmiar
  -- Migracja filmu dopuszcza też mp4 do 5 MB. Prywatność i wąska lista typów zostają warunkiem.
  if not exists (select 1 from storage.buckets where id = 'akcja-wizerunek' and public is false and file_size_limit <= 5242880 and 'image/webp' = any(allowed_mime_types) and allowed_mime_types <@ array['image/webp', 'video/mp4']) then raise exception 'FAIL 6a: kubełek niezgodny'; end if;
  select count(*) into c from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%akcja-wizerunek%';
  if c <> 0 then raise exception 'FAIL 6b: polityki na kubełku (%)', c; end if;
  select count(*) into c from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL') and coalesce(qual, '') not like '%bucket_id%';
  if c <> 0 then raise exception 'FAIL 6c: polityka SELECT bez warunku na kubełek (%)', c; end if;
  n := n + 3;

  -- 7. NA ŻYWEJ AKCJI: migracja nie ustawia niczego sama, zgoda zostaje przy Filipie
  if (select wizerunek_zgoda from public.akcje where slug = 'proba') is true then raise exception 'FAIL 7: próba ze zgodą'; end if;
  n := n + 1;

  raise exception 'TESTY KOPARKI ZIELONE: % asercji', n;
end $T$;
