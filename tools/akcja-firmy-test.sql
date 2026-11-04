-- Testy FIRM (20261104_akcja_firmy.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS, więc bez tego test byłby zielony zawsze):
-- trener zapisuje i kasuje, zwykły zawodnik i anon dostają odmowę (także z user_metadata udającym trenera), CHECK-i, licznik: kwota tylko przy zgodzie, firmy tylko po starcie,
-- awaria listy nie psuje licznika, bucket i polityki storage. Jedna transakcja, zawsze wycofana (tools/akcja-firmy-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; c int; j jsonb; t text; tr uuid; zw uuid; id1 uuid; id2 uuid; id3 uuid;
  P constant text := 'test-firmy-po';
  LOGO constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/00000000-0000-4000-8000-000000000001.png';
begin
  select id into tr from public.coaches limit 1;
  select a.user_id into zw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches k where k.id = a.user_id) order by a.created_at limit 1;
  if tr is null or zw is null then raise exception 'FAIL 0: brak kont do testu'; end if;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at) values (P, 'Test', 'Janek', current_date, 100, 10, true, now());
  insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa) values ('test-firmy-przed', 'Test', current_date, 100, 10, true);

  -- 1. trener: zapis, autor i data z bazy
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, logo_url, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane) values (P, true, 'Firma Zgoda', 'https://firma-zgoda.pl/o-nas?x=1', LOGO, 123400, true, true) returning id into id1;
  insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane) values (P, true, 'Firma Bez Zgody', 'https://firma-bez-zgody.pl', 777700, false, true) returning id into id2;
  insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Firma Bez Kwoty', 'https://firma-bez-kwoty.pl', true) returning id into id3;
  select count(*) into c from public.akcja_firmy where akcja_slug = P; if c <> 3 then raise exception 'FAIL 1a: trener widzi % wierszy', c; end if;
  select count(*) into c from public.akcja_firmy where id = id1 and dodal = tr and dodano > now() - interval '1 minute'; if c <> 1 then raise exception 'FAIL 1b: autor albo data'; end if;
  n := n + 2;
  -- 1c. autora i daty nie da się podać; UPDATE nie istnieje (poprawka = usuń i dodaj)
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane, dodal) values (P, true, 'Podrobiony', 'https://a.pl', true, zw); raise exception 'FAIL 1c: podrobiony autor'; exception when insufficient_privilege then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane, dodano) values (P, true, 'Podrobiony', 'https://a.pl', true, now() - interval '1 year'); raise exception 'FAIL 1d: podrobiona data'; exception when insufficient_privilege then null; end;
  begin update public.akcja_firmy set zgoda_na_kwote = true where id = id2; raise exception 'FAIL 1e: UPDATE trenera'; exception when insufficient_privilege then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Upsert', 'https://a.pl', true) on conflict (id) do update set zgoda_na_kwote = true; raise exception 'FAIL 1f: zgoda przez upsert'; exception when insufficient_privilege then null; end;
  n := n + 4;

  -- 2. CHECK-i: potwierdzenie, link, logo, nazwa, kwota
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Zla', 'https://a.pl', false); raise exception 'FAIL 2a: potwierdzenie false'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link) values (P, true, 'Zla', 'https://a.pl'); raise exception 'FAIL 2b: bez potwierdzenia'; exception when not_null_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Zla', 'http://a.pl', true); raise exception 'FAIL 2c: link http'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Zla', 'javascript:alert(1)', true); raise exception 'FAIL 2d: link javascript'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Zla', 'https://bez-kropki', true); raise exception 'FAIL 2e: link bez domeny'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Zla', 'https://firma.pl@zly.example', true); raise exception 'FAIL 2f: link z @'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Zla', 'https://a.pl/"><script>', true); raise exception 'FAIL 2g: link z <>'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, logo_url, potwierdzenie_widziane) values (P, true, 'Zla', 'https://a.pl', 'https://zly.example/logo.png', true); raise exception 'FAIL 2h: logo obce'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, logo_url, potwierdzenie_widziane) values (P, true, 'Zla', 'https://a.pl', 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/avatars/00000000-0000-4000-8000-000000000001.png', true); raise exception 'FAIL 2i: logo z innego bucketu'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, logo_url, potwierdzenie_widziane) values (P, true, 'Zla', 'https://a.pl', replace(LOGO, '.png', '.svg'), true); raise exception 'FAIL 2j: logo SVG'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, repeat('x', 121), 'https://a.pl', true); raise exception 'FAIL 2k: nazwa 121 znaków'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, ' x ', 'https://a.pl', true); raise exception 'FAIL 2l: nazwa jednoznakowa'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, zgoda_na_kwote, potwierdzenie_widziane) values (P, true, 'Zla', 'https://a.pl', true, true); raise exception 'FAIL 2m: zgoda bez kwoty'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, kwota_gr, potwierdzenie_widziane) values (P, true, 'Zla', 'https://a.pl', 0, true); raise exception 'FAIL 2n: kwota 0'; exception when check_violation then null; end;
  -- 2o. zgoda na wymienienie obowiązkowa (Filip 4.11)
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, false, 'Zla', 'https://a.pl', true); raise exception 'FAIL 2o: zgoda na wymienienie false'; exception when check_violation then null; end;
  begin insert into public.akcja_firmy (akcja_slug, nazwa, link, potwierdzenie_widziane) values (P, 'Zla', 'https://a.pl', true); raise exception 'FAIL 2p: bez zgody na wymienienie'; exception when not_null_violation then null; end;
  n := n + 16;

  -- 3. zwykły zawodnik, także z user_metadata udającym trenera: user_metadata zmienia sam, więc nie może niczego otwierać
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated', 'user_metadata', json_build_object('role', 'coach'))::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.akcja_firmy; if c <> 0 then raise exception 'FAIL 3a: zawodnik czyta % wierszy', c; end if;
  begin insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Zawodnik', 'https://a.pl', true); raise exception 'FAIL 3b: zawodnik zapisał'; exception when insufficient_privilege then null; end;
  begin update public.akcja_firmy set nazwa = 'x' where id = id1; raise exception 'FAIL 3c: zawodnik UPDATE'; exception when insufficient_privilege then null; end;
  delete from public.akcja_firmy where id = id1;
  reset role;
  select count(*) into c from public.akcja_firmy where id = id1; if c <> 1 then raise exception 'FAIL 3d: zawodnik skasował'; end if;
  n := n + 4;

  -- 4. anon: odmowa na tabeli i na liczniku (wariant b: niezalogowani tylko przez EF)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin execute 'set local role anon'; perform count(*) from public.akcja_firmy; raise exception 'FAIL 4a: anon czyta'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; insert into public.akcja_firmy (akcja_slug, zgoda_na_wymienienie, nazwa, link, potwierdzenie_widziane) values (P, true, 'Anon', 'https://a.pl', true); raise exception 'FAIL 4b: anon zapisał'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; delete from public.akcja_firmy where id = id1; raise exception 'FAIL 4c: anon DELETE'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform public.akcja_licznik(P); raise exception 'FAIL 4d: anon czyta licznik'; exception when insufficient_privilege then null; end;
  reset role;
  if has_table_privilege('anon', 'public.akcja_firmy', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then raise exception 'FAIL 4e: anon ma grant tabelowy'; end if;
  if has_any_column_privilege('anon', 'public.akcja_firmy', 'SELECT, INSERT, UPDATE, REFERENCES') then raise exception 'FAIL 4f: anon ma grant kolumnowy'; end if;
  n := n + 6;

  -- 5. licznik jak w EF (service_role): firmy tylko po starcie, kolejność wg dodano, kwota tylko przy zgodzie, nic poza czterema polami
  update public.akcja_firmy set dodano = now() - interval '3 hours' where id = id2;
  update public.akcja_firmy set dodano = now() - interval '2 hours' where id = id1;
  update public.akcja_firmy set dodano = now() - interval '1 hour' where id = id3;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  j := public.akcja_licznik('test-firmy-przed'); if j ? 'firmy' then raise exception 'FAIL 5a: firmy przed startem %', j; end if;
  j := public.akcja_licznik(P);
  reset role;
  if jsonb_array_length(j->'firmy') <> 3 then raise exception 'FAIL 5b: lista %', j->'firmy'; end if;
  if j->'firmy'->0->>'nazwa' <> 'Firma Bez Zgody' or j->'firmy'->1->>'nazwa' <> 'Firma Zgoda' or j->'firmy'->2->>'nazwa' <> 'Firma Bez Kwoty' then raise exception 'FAIL 5c: kolejność %', j->'firmy'; end if;
  if (j->'firmy'->1->>'kwota_gr')::int <> 123400 then raise exception 'FAIL 5d: kwota przy zgodzie'; end if;
  if j->'firmy'->0->'kwota_gr' <> 'null'::jsonb or j->'firmy'->2->'kwota_gr' <> 'null'::jsonb then raise exception 'FAIL 5e: kwota bez zgody wyszła'; end if;
  t := (j->'firmy')::text;
  if t ~ '777700' then raise exception 'FAIL 5f: kwota bez zgody w odpowiedzi'; end if;
  if t ~* 'potwierdzenie|dodal|dodano|zgoda_na|akcja_slug' then raise exception 'FAIL 5g: pole niepubliczne %', t; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(j->'firmy'->0) k) <> array['kwota_gr', 'link', 'logo_url', 'nazwa'] then raise exception 'FAIL 5h: klucze %', j->'firmy'->0; end if;
  n := n + 8;

  -- 6. awaria listy nie psuje licznika: bez tabeli licznik działa, firmy puste
  alter table public.akcja_firmy rename to akcja_firmy_awaria;
  j := public.akcja_licznik(P);
  if j->'firmy' <> '[]'::jsonb or (j->>'suma_km') is null then raise exception 'FAIL 6: awaria listy %', j; end if;
  alter table public.akcja_firmy_awaria rename to akcja_firmy;
  n := n + 1;

  -- 7. trener kasuje; pusta lista = pusta tablica
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.akcja_firmy where akcja_slug = P;
  reset role;
  j := public.akcja_licznik(P); if j->'firmy' <> '[]'::jsonb then raise exception 'FAIL 7: po skasowaniu %', j->'firmy'; end if;
  n := n + 1;

  -- 8. bucket i polityki storage po skutku
  if not exists (select 1 from storage.buckets where id = 'akcja-firmy-logo' and public and file_size_limit = 1048576 and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp'] and array_length(allowed_mime_types, 1) = 3) then raise exception 'FAIL 8a: bucket'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name) values ('akcja-firmy-logo', '00000000-0000-4000-8000-000000000002.png');
  begin insert into storage.objects (bucket_id, name) values ('akcja-firmy-logo', '00000000-0000-4000-8000-000000000003.svg'); raise exception 'FAIL 8b: trener wgrał .svg'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('akcja-firmy-logo', 'podkatalog/logo.png'); raise exception 'FAIL 8c: trener wgrał złą nazwę'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated', 'user_metadata', json_build_object('role', 'coach'))::text, true);
  execute 'set local role authenticated';
  begin insert into storage.objects (bucket_id, name) values ('akcja-firmy-logo', '00000000-0000-4000-8000-000000000004.png'); raise exception 'FAIL 8d: zawodnik wgrał'; exception when insufficient_privilege then null; end;
  select count(*) into c from storage.objects where bucket_id = 'akcja-firmy-logo' and name like '00000000-0000-4000-8000-%'; if c <> 0 then raise exception 'FAIL 8e: zawodnik widzi pliki przez RLS'; end if;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin execute 'set local role anon'; insert into storage.objects (bucket_id, name) values ('akcja-firmy-logo', '00000000-0000-4000-8000-000000000005.png'); raise exception 'FAIL 8f: anon wgrał'; exception when insufficient_privilege then null; end;
  reset role;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'ALL') and (coalesce(qual, '') || coalesce(with_check, '')) like '%akcja-firmy-logo%') then raise exception 'FAIL 8g: polityka nadpisania pliku'; end if;
  n := n + 7;

  -- 9. delete_my_account nie zna tabeli, bo tabela nie ma klucza do athletes
  if exists (select 1 from pg_constraint where conrelid = 'public.akcja_firmy'::regclass and confrelid = 'public.athletes'::regclass) then raise exception 'FAIL 9: klucz do athletes, delete_my_account do przeglądu'; end if;
  n := n + 1;

  raise exception 'TESTY FIRM ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
