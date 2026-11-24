-- Avatary 400 px (24.11.2026). Cached Egress planu Free 6,0 z 5 GB; 5 avatarów ma razem 24,5 MB (2–8 MB każdy), bo
-- pochodzą sprzed zmniejszania przy wgrywaniu (dziś downscaleImage w sb.js: JPEG, dłuższy bok 400 px, ok. 30–60 kB).
--
-- Kopie wgrywa WCZEŚNIEJ Filip (avatary-wgraj.cjs → supabase storage cp) pod NOWĄ nazwą tego samego konta:
--   avatars/<id konta>.jfif, image/jpeg, Cache-Control max-age=31536000.
-- Dlaczego nowa ścieżka, a nie nowe ?t=: CDN Supabase pomija query string (sonda 24.11: pierwszy nieużywany ?sonda= od razu
-- HIT), więc o świeżości decyduje ścieżka. Dlaczego .jfif: tego rozszerzenia aplikacja nie zapisze (policy
-- biegamy_avatars_insert: jpg/jpeg/png/webp), więc nowe wgranie użytkownika nigdy nie nadpisze kopii z rocznym cache.
-- delete-account rozpoznaje avatars/<id>.<1–5 znaków> jako plik konta, więc kopię usuwa razem z kontem.
--
-- Zmienia TYLKO athletes.avatar_url: ścieżka duży plik → kopia, ?t= bez zmian. Wycofanie
-- (20261226_WYCOFANIE_avatary_400.sql) odwraca to bajt w bajt, bez kopii danych. Stare pliki zostają w kubełku.
-- Numer 20261226 = kolejny wolny w katalogu (od 20261127 numery idą przed kalendarzem, jeden na migrację; 20261224 zajęty).
-- Stany (komunikat wraca jako wiersz wyniku: supabase db query nie pokazuje raise notice):
--   brak dużych avatarów i kopii .jfif (projekt testowy, odtwarzanie od zera)  → bez zmian, komunikat
--   już przepięte (0 dużych wskazanych, 5 kont wskazuje swoje kopie, 5 kopii)    → bez zmian, komunikat
--   5 dużych, każdy z gotową kopią (image/jpeg, 1–199 kB, max-age=31536000)     → przepięcie 5 kont, komunikat
--   cokolwiek innego (np. 3 kopie z 5) = stan częściowy                          → wyjątek, nic się nie zmienia
-- Test: tools/avatary-400-test.sh (w wycofanej transakcji).
begin;
create temp table if not exists _avatary_400_wynik (komunikat text) on commit drop;
truncate _avatary_400_wynik;
do $$
declare v_duze int; v_par int; v_kopie int; v_juz int; v_zmian int;
begin
  create temp table if not exists _avatary_400 (id uuid, stara text, nowa text, kopia_ok boolean) on commit drop;
  truncate _avatary_400;
  insert into _avatary_400
  select a.id, d.name, 'avatars/' || a.id::text || '.jfif', m.name is not null
  from public.athletes a
  join storage.objects d on d.bucket_id = 'biegamy-assets'
   and d.name in ('avatars/' || a.id::text || '.jpg', 'avatars/' || a.id::text || '.jpeg')
   and (d.metadata->>'size')::bigint >= 2000000
   and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || d.name || '?') > 0
  left join storage.objects m on m.bucket_id = 'biegamy-assets'
   and m.name = 'avatars/' || a.id::text || '.jfif'
   and (m.metadata->>'size')::bigint between 1000 and 199999
   and m.metadata->>'mimetype' = 'image/jpeg'
   and m.metadata->>'cacheControl' = 'max-age=31536000';
  select count(*), count(*) filter (where kopia_ok) into v_duze, v_par from _avatary_400;
  select count(*) into v_kopie from storage.objects where bucket_id = 'biegamy-assets' and name like 'avatars/%.jfif';
  select count(*) into v_juz from public.athletes a
    join storage.objects m on m.bucket_id = 'biegamy-assets' and m.name = 'avatars/' || a.id::text || '.jfif'
     and strpos(a.avatar_url, '/storage/v1/object/public/biegamy-assets/' || m.name || '?') > 0;

  if v_duze = 0 and v_kopie = 0 then
    insert into _avatary_400_wynik values ('avatary 400: brak dużych avatarów i kopii .jfif (np. projekt testowy, odtwarzanie od zera) – bez zmian');
    return;
  end if;
  if v_duze = 0 and v_juz = 5 and v_kopie = 5 then
    insert into _avatary_400_wynik values ('avatary 400: już przepięte (5 kont wskazuje swoje kopie .jfif) – bez zmian');
    return;
  end if;
  if not (v_duze = 5 and v_par = 5 and v_kopie = 5 and v_juz = 0) then
    raise exception 'avatary 400 [odmowa %/%/%/%]: stan częściowy – duże avatary %, z gotową kopią %, kopii .jfif w kubełku %, już przepiętych % (oczekiwane 5/5/5/0 albo 0/0/0/0) – nic nie zmieniono',
      v_duze, v_par, v_kopie, v_juz, v_duze, v_par, v_kopie, v_juz;
  end if;

  update public.athletes a
     set avatar_url = replace(a.avatar_url, '/biegamy-assets/' || p.stara || '?', '/biegamy-assets/' || p.nowa || '?')
    from _avatary_400 p
   where p.id = a.id;
  get diagnostics v_zmian = row_count;
  if v_zmian <> 5 then
    raise exception 'avatary 400: zmieniono % wierszy zamiast 5 – nic nie zmieniono', v_zmian;
  end if;
  insert into _avatary_400_wynik values ('avatary 400: przepięto 5 kont na kopie .jfif (stare pliki zostają w kubełku)');
end $$;
select komunikat from _avatary_400_wynik;
commit;
