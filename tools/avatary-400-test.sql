-- Testy 20261226_avatary_400.sql i jej WYCOFANIA w JEDNEJ transakcji, zawsze wycofanej (tools/avatary-400-test.sh wkleja
-- treść obu migracji w miejsca znaczników). Bez wgranych kopii .jfif wstawia na czas transakcji 5 atrap wierszy
-- storage.objects (same metadane, pliku nie ma). Wypisuje tylko liczby.
create temp table _av_przed as
  select a.id, a.avatar_url, to_jsonb(a) - 'avatar_url' as reszta from public.athletes a;
create temp table _av_duze as
  select a.id, d.name as stara, 'avatars/' || a.id::text || '.jfif' as nowa
  from public.athletes a
  join storage.objects d on d.bucket_id = 'biegamy-assets'
   and d.name in ('avatars/' || a.id::text || '.jpg', 'avatars/' || a.id::text || '.jpeg')
   and (d.metadata->>'size')::bigint >= 2000000
   and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || d.name || '?') > 0;
create temp table _av_stan (tryb text, n int);
do $T$
declare v_duze int; v_kopii int;
begin
  select count(*) into v_duze from _av_duze;
  if v_duze <> 5 then raise exception 'FAIL 0: % kont z dużym avatarem zamiast 5', v_duze; end if;
  select count(*) into v_kopii from _av_duze k join storage.objects o on o.bucket_id = 'biegamy-assets' and o.name = k.nowa;
  if v_kopii = 0 then
    insert into storage.objects (bucket_id, name, metadata)
    select 'biegamy-assets', nowa, jsonb_build_object('size', 41000, 'mimetype', 'image/jpeg', 'cacheControl', 'max-age=31536000') from _av_duze;
    insert into _av_stan values ('symulacja (5 atrap kopii w storage.objects)', 0);
  elsif v_kopii = 5 then
    insert into _av_stan values ('prawdziwe kopie', 0);
  else
    raise exception 'FAIL 0b: % kopii .jfif zamiast 0 albo 5', v_kopii;
  end if;
end $T$;
-- @@MIGRACJA@@
do $T$
declare c int; c2 int;
begin
  select count(*) into c from public.athletes a join _av_przed p using (id) where a.avatar_url is distinct from p.avatar_url;
  if c <> 5 then raise exception 'FAIL 1: zmienionych avatar_url % zamiast 5', c; end if;
  select count(*) into c from public.athletes a join _av_przed p using (id) where (to_jsonb(a) - 'avatar_url') is distinct from p.reszta;
  if c <> 0 then raise exception 'FAIL 2: zmieniły się inne kolumny w % wierszach', c; end if;
  select count(*) into c from public.athletes a join _av_duze d using (id) join _av_przed p using (id)
   where a.avatar_url = replace(p.avatar_url, '/biegamy-assets/' || d.stara || '?', '/biegamy-assets/' || d.nowa || '?');
  if c <> 5 then raise exception 'FAIL 3: nowy adres to nie ścieżka kopii z tym samym ?t= (% z 5)', c; end if;
  select count(*) into c from public.athletes a join _av_przed p using (id)
   where a.avatar_url is distinct from p.avatar_url
     and (substring(a.avatar_url from '[?].*$') is distinct from substring(p.avatar_url from '[?].*$')
          or a.avatar_url not like '%/storage/v1/object/public/biegamy-assets/avatars/' || a.id::text || '.jfif?t=%');
  if c <> 0 then raise exception 'FAIL 4: query string zmieniony albo kopia spoza ścieżki konta (% wierszy)', c; end if;
  select count(*) filter (where v.avatar_url like '%/biegamy-assets/' || d.nowa || '?%'), count(*) into c, c2
    from public.public_athletes v join _av_duze d using (id);
  if c <> c2 then raise exception 'FAIL 5: widok public_athletes pokazuje kopię u % z % kont', c, c2; end if;
  select count(*) into c from public.athletes a
    join storage.objects d on d.bucket_id = 'biegamy-assets' and d.name in ('avatars/' || a.id::text || '.jpg', 'avatars/' || a.id::text || '.jpeg')
     and (d.metadata->>'size')::bigint >= 2000000 and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || d.name || '?') > 0;
  if c <> 0 then raise exception 'FAIL 6: po migracji % kont dalej wskazuje duży plik', c; end if;
  select count(*) into c from storage.objects o join _av_duze d on o.bucket_id = 'biegamy-assets' and o.name = d.stara;
  if c <> 5 then raise exception 'FAIL 7: starych plików w kubełku % zamiast 5', c; end if;
  if (select komunikat from _avatary_400_wynik) is distinct from 'avatary 400: przepięto 5 kont na kopie .jfif (stare pliki zostają w kubełku)' then
    raise exception 'FAIL 8: komunikat migracji: %', coalesce((select komunikat from _avatary_400_wynik), 'brak');
  end if;
  update _av_stan set n = _av_stan.n + 8;
end $T$;
create temp table _av_po as select a.id, to_jsonb(a) as wiersz from public.athletes a;
-- @@MIGRACJA@@
do $T$
declare c int;
begin
  select count(*) into c from public.athletes a join _av_po p using (id) where to_jsonb(a) is distinct from p.wiersz;
  if c <> 0 then raise exception 'FAIL 9: ponowne uruchomienie po skutku zmieniło % wierszy', c; end if;
  if (select komunikat from _avatary_400_wynik) not like 'avatary 400: już przepięte%' then
    raise exception 'FAIL 10: komunikat ponownego uruchomienia: %', coalesce((select komunikat from _avatary_400_wynik), 'brak');
  end if;
  update _av_stan set n = _av_stan.n + 2;
end $T$;
-- @@WYCOFANIE@@
do $T$
declare c int; v_n int; v_tryb text;
begin
  select count(*) into c from public.athletes a join _av_przed p using (id)
   where a.avatar_url is distinct from p.avatar_url or (to_jsonb(a) - 'avatar_url') is distinct from p.reszta;
  if c <> 0 then raise exception 'FAIL 11: po wycofaniu % wierszy inne niż przed migracją', c; end if;
  select count(*) into c from public.athletes;
  if c <> (select count(*) from _av_przed) then raise exception 'FAIL 12: liczba kont % zamiast %', c, (select count(*) from _av_przed); end if;
  if (select komunikat from _avatary_400_wynik) not like 'wycofanie avatary 400: przywrócono 5 kont%' then
    raise exception 'FAIL 13: komunikat wycofania: %', coalesce((select komunikat from _avatary_400_wynik), 'brak');
  end if;
  select n + 3, tryb into v_n, v_tryb from _av_stan;
  raise exception 'TESTY AV ZIELONE: % asercji, %, transakcja wycofana', v_n, v_tryb;
end $T$;
