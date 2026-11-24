-- Po skutku 20261226_avatary_400.sql (tools/avatary-400-test.sh po): tylko odczyt, same liczby.
do $T$
declare c int;
begin
  select count(*) into c from public.athletes a
    join storage.objects m on m.bucket_id = 'biegamy-assets' and m.name = 'avatars/' || a.id::text || '.jfif'
     and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || m.name || '?') > 0
     and (m.metadata->>'size')::bigint between 1000 and 199999
     and m.metadata->>'mimetype' = 'image/jpeg' and m.metadata->>'cacheControl' = 'max-age=31536000';
  if c <> 5 then raise exception 'FAIL P1: % kont wskazuje kopię .jfif zamiast 5', c; end if;
  select count(*) into c from public.athletes a
    join storage.objects d on d.bucket_id = 'biegamy-assets' and d.name like 'avatars/%' and (d.metadata->>'size')::bigint >= 2000000
     and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || d.name || '?') > 0;
  if c <> 0 then raise exception 'FAIL P2: % kont dalej wskazuje avatar >= 2 MB', c; end if;
  select count(*) into c from storage.objects where bucket_id = 'biegamy-assets' and name like 'avatars/%' and (metadata->>'size')::bigint >= 2000000;
  if c <> 5 then raise exception 'FAIL P3: starych plików >= 2 MB w kubełku % zamiast 5 (miały zostać)', c; end if;
  select count(*) into c from public.athletes where avatar_url like '%/biegamy-assets/avatars/%' and avatar_url not like '%?t=%';
  if c <> 0 then raise exception 'FAIL P4: % adresów avatara bez ?t=', c; end if;
  raise exception 'TESTY AV PO ZIELONE: 4 asercje (tylko odczyt)';
end $T$;
