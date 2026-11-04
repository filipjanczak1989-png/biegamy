-- Testy ARKUSZA KOPARKI (20261105_akcja_koparka_arkusz.sql) PO SKUTKU: arkusz tajny do startu, te same warunki co rysunek. Jedna transakcja, zawsze wycofana; wynikiem jest treść wyjątku.
-- Adresy w teście są zmyślone: token to napis testowy, żaden plik pod nim nie istnieje.
do $T$
declare
  n int := 0; j jsonb; v_ja uuid; v_konto uuid; v_id uuid;
  U constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/arkusz.webp?token=test.token-123';
begin
  select a.user_id, a.id into v_ja, v_konto from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  if v_ja is null then raise exception 'FAIL 0: brak konta do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa) values ('test-ark', 'Test', 'Test', current_date, 100, 10, false) returning id into v_id;
  update public.akcje set wizerunek_zgoda = true, koparka_postac = 'fabianek', koparka_arkusz_url = U where id = v_id;

  -- 1. przed startem licznik nie zna arkusza, klient nie czyta kolumny
  j := public.akcja_licznik('test-ark');
  if j ? 'koparka_arkusz_url' or j::text like '%arkusz%' then raise exception 'FAIL 1a: licznik przed startem zna arkusz %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ja, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform koparka_arkusz_url from public.akcje; raise exception 'FAIL 1b: klient czyta adres'; exception when insufficient_privilege then null; end;
  begin update public.akcje set koparka_arkusz_url = U; raise exception 'FAIL 1c: klient zmienia adres'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 2. po starcie: tylko przy zgodzie i z ustawioną postacią
  update public.akcje set wystartowala_at = now() where id = v_id;
  j := public.akcja_licznik('test-ark');
  if j->>'koparka_arkusz_url' is distinct from U then raise exception 'FAIL 2a: po starcie bez arkusza %', j->'koparka_arkusz_url'; end if;
  update public.akcje set wizerunek_zgoda = false where id = v_id;
  j := public.akcja_licznik('test-ark');
  if j->>'koparka_arkusz_url' is not null then raise exception 'FAIL 2b: bez zgody arkusz wychodzi'; end if;
  update public.akcje set wizerunek_zgoda = true, koparka_postac = null where id = v_id;
  j := public.akcja_licznik('test-ark');
  if j->>'koparka_arkusz_url' is not null then raise exception 'FAIL 2c: bez postaci arkusz wychodzi'; end if;
  n := n + 3;

  -- 3. akcja testowa nigdy
  update public.akcje set testowa = true, wizerunek_zgoda = true, koparka_postac = 'fabianek' where id = v_id;
  j := public.akcja_licznik('test-ark');
  if j->>'koparka_arkusz_url' is not null then raise exception 'FAIL 3: próba oddaje arkusz'; end if;
  n := n + 1;

  -- 4. tylko adres podpisany z prywatnego kubełka
  begin update public.akcje set koparka_arkusz_url = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/x.webp' where id = v_id; raise exception 'FAIL 4a: publiczny kubełek'; exception when check_violation then null; end;
  begin update public.akcje set koparka_arkusz_url = 'https://zly.example/storage/v1/object/sign/akcja-wizerunek/x.webp?token=a' where id = v_id; raise exception 'FAIL 4b: obca domena'; exception when check_violation then null; end;
  begin update public.akcje set koparka_arkusz_url = U || '"><script>' where id = v_id; raise exception 'FAIL 4c: znaczniki w adresie'; exception when check_violation then null; end;
  n := n + 3;

  raise exception 'TESTY ARKUSZA ZIELONE: % asercji', n;
end $T$;
