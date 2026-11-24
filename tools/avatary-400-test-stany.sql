-- Stany brzegowe 20261226_avatary_400.sql, każdy w osobnej, zawsze wycofanej transakcji (tools/avatary-400-test.sh).
-- Wspólne przygotowanie: gdy kopii .jfif jeszcze nie ma, 5 atrap wierszy storage.objects (same metadane); dzięki temu
-- przed wgraniem i po nim testy idą tą samą drogą (ukrywanie kopii zmianą nazwy, tylko na czas transakcji).
-- @@WSPOLNE@@
do $T$
declare v_kopii int;
begin
  select count(*) into v_kopii from storage.objects where bucket_id = 'biegamy-assets' and name like 'avatars/%.jfif';
  if v_kopii = 0 then
    insert into storage.objects (bucket_id, name, metadata)
    select 'biegamy-assets', 'avatars/' || a.id::text || '.jfif', jsonb_build_object('size', 41000, 'mimetype', 'image/jpeg', 'cacheControl', 'max-age=31536000')
    from public.athletes a join storage.objects d on d.bucket_id = 'biegamy-assets'
     and d.name in ('avatars/' || a.id::text || '.jpg', 'avatars/' || a.id::text || '.jpeg')
     and (d.metadata->>'size')::bigint >= 2000000
     and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || d.name || '?') > 0;
  elsif v_kopii <> 5 then
    raise exception 'FAIL S0: % kopii .jfif zamiast 0 albo 5', v_kopii;
  end if;
end $T$;
-- @@PUSTA@@
-- (3) „pusta baza” (projekt testowy, odtwarzanie od zera): 5 kont bez avatara, kopie ukryte. Migracja: bez zmian + komunikat.
update public.athletes a set avatar_url = null
 where exists (select 1 from storage.objects d where d.bucket_id = 'biegamy-assets'
   and d.name in ('avatars/' || a.id::text || '.jpg', 'avatars/' || a.id::text || '.jpeg')
   and (d.metadata->>'size')::bigint >= 2000000
   and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || d.name || '?') > 0);
update storage.objects set name = name || '.ukryta-w-tescie' where bucket_id = 'biegamy-assets' and name like 'avatars/%.jfif';
create temp table _av_pusta as select a.id, to_jsonb(a) as wiersz from public.athletes a;
-- @@MIGRACJA@@
do $T$
declare c int; k text;
begin
  select count(*) into c from public.athletes a join _av_pusta p using (id) where to_jsonb(a) is distinct from p.wiersz;
  if c <> 0 then raise exception 'FAIL P1: migracja na pustej bazie zmieniła % wierszy', c; end if;
  select komunikat into k from _avatary_400_wynik;
  if k is null or k not like 'avatary 400: brak dużych avatarów i kopii .jfif%' then raise exception 'FAIL P2: komunikat: %', coalesce(k, 'brak'); end if;
  raise exception 'TESTY AV PUSTA ZIELONE: 2 asercje (bez zmian, komunikat), transakcja wycofana';
end $T$;
-- @@CZESCIOWA@@
-- (4) stan częściowy: 3 z 5 kopii (2 ukryte). Migracja ma odmówić wyjątkiem „[odmowa 5/3/3/0]”; sh sprawdza ten znacznik.
update storage.objects set name = name || '.ukryta-w-tescie'
 where id in (select id from storage.objects where bucket_id = 'biegamy-assets' and name like 'avatars/%.jfif' order by name limit 2);
-- @@MIGRACJA@@
do $T$ begin raise exception 'FAIL C1: migracja w stanie częściowym przeszła'; end $T$;
