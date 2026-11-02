-- Testy L4 (20261102_imprezy_okladki.sql): anon nic; zalogowany czyta, nie pisze; service_role pisze; CHECK url/typ.
do $T$
declare n int := 0; r_uid uuid; c int;
begin
  select user_id into r_uid from public.athletes where user_id is not null order by created_at limit 1;
  insert into public.imprezy_okladki (klucz, url, typ, nazwa, miasto)
  values ('testbieg|testowo', 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/race-covers/impreza-0123456789012345678901234567890123456789.jpg?v=1', 'ulica', 'Test Bieg', 'Testowo');
  begin insert into public.imprezy_okladki (klucz, url, typ, nazwa) values ('x|y', 'https://evil.example/a.jpg', 'ulica', 'x'); raise exception 'FAIL 1a: obcy url'; exception when check_violation then null; end;
  begin insert into public.imprezy_okladki (klucz, url, typ, nazwa) values ('x|z', 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/race-covers/impreza-0123456789012345678901234567890123456789.jpg', 'kosmos', 'x'); raise exception 'FAIL 1b: zły typ'; exception when check_violation then null; end;
  n := n + 2;
  begin execute 'set local role anon'; perform count(*) from public.imprezy_okladki; raise exception 'FAIL 2a: anon czyta'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.imprezy_okladki where klucz = 'testbieg|testowo';
  if c <> 1 then raise exception 'FAIL 2b: zalogowany nie widzi wiersza'; end if;
  begin insert into public.imprezy_okladki (klucz, url, typ, nazwa) values ('a|b', 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/race-covers/impreza-0123456789012345678901234567890123456789.jpg', 'ulica', 'a'); raise exception 'FAIL 2c: zalogowany pisze'; exception when insufficient_privilege then null; end;
  begin update public.imprezy_okladki set nazwa = 'zmiana' where klucz = 'testbieg|testowo'; raise exception 'FAIL 2d: zalogowany zmienia'; exception when insufficient_privilege then null; end;
  begin delete from public.imprezy_okladki where klucz = 'testbieg|testowo'; raise exception 'FAIL 2e: zalogowany kasuje'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  insert into public.imprezy_okladki (klucz, url, typ, nazwa) values ('s|r', 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/race-covers/impreza-0123456789012345678901234567890123456789.jpg', 'trail', 'sr')
  on conflict (klucz) do update set url = excluded.url;
  reset role;
  n := n + 5;
  raise exception 'TESTY OKLADEK ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
