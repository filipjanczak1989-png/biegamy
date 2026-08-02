-- ZAPIS HISTORII — nie uruchamiać.
-- Odtwarza stan już obecny na produkcji (wykonane ręcznie 2026-08-02).
--
-- Zawężenie polityk zapisu na buckecie biegamy-assets.
--
-- STAN ZASTANY (dziura): polityki INSERT i UPDATE brzmiały po prostu
--   bucket_id = 'biegamy-assets'
-- bez żadnego zawężenia ścieżki. Każdy zalogowany mógł nadpisać DOWOLNY obiekt
-- w tym buckecie — w tym cudzy awatar, bo kluczem pliku jest athletes.id,
-- wartość publicznie dostępna przez widok public_athletes. Bucket jest publiczny,
-- więc dało się też wystawić plik .html pod zaufanym adresem Supabase.
--
-- ZWIAD: klient pisze do tego bucketu w DOKŁADNIE trzech miejscach i wszystkie
-- trzy używają tej samej ścieżki avatars/{athletes.id}.{ext}:
--   profil.html:1408      sb.storage.from('biegamy-assets').upload(...)
--   zawodnik.html:3400    window.storageUploadRetry(...)
--   zawodnik.html:4832    storageUploadRetry (onboarding)
-- UWAGA przy audycie: grep po ".upload(" znajdzie tylko pierwsze z nich —
-- pozostałe idą przez helper storageUploadRetry. Ten sam sink, dwie pisownie.
-- Cała reszta bucketu (korzeń, janusz/, badges/, day-heroes/, 2/) jest zapisywana
-- ręcznie albo przez service_role, który omija RLS.
--
-- Whitelist rozszerzeń jest tu bramką bezpieczeństwa, nie higieną: bez niej
-- zalogowany wgrywa {swoje_id}.html do publicznego bucketu i ma phishing pod
-- zaufaną domeną.
--
-- SELECT zostaje NIEZAWĘŻONY świadomie: bucket ma public = true, więc odczyt
-- i tak jest otwarty przez publiczny URL. Zawężanie SELECT bez flipu bucketu na
-- prywatny byłoby teatrem, a flip zepsułby wszystkie wywołania getPublicUrl.
--
-- Wykonane ręcznie na produkcji 2026-08-02; ten plik odtwarza stan docelowy.

BEGIN;

DROP POLICY IF EXISTS biegamy_avatars_insert ON storage.objects;
CREATE POLICY biegamy_avatars_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'biegamy-assets'
  AND (storage.foldername(name))[1] = 'avatars'
  AND split_part(storage.filename(name), '.', 1) IN (
        SELECT a.id::text FROM public.athletes a WHERE a.user_id = auth.uid())
  AND lower(split_part(storage.filename(name), '.', 2)) IN ('jpg','jpeg','png','webp')
);

-- upsert: true przy istniejącym pliku idzie ścieżką UPDATE, więc ten sam warunek
-- musi stać w USING (stary wiersz) i WITH CHECK (nowy stan) — inaczej podmiana
-- własnego awatara przestaje działać we wszystkich trzech sinkach naraz.
DROP POLICY IF EXISTS biegamy_avatars_update ON storage.objects;
CREATE POLICY biegamy_avatars_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'biegamy-assets'
  AND (storage.foldername(name))[1] = 'avatars'
  AND split_part(storage.filename(name), '.', 1) IN (
        SELECT a.id::text FROM public.athletes a WHERE a.user_id = auth.uid())
  AND lower(split_part(storage.filename(name), '.', 2)) IN ('jpg','jpeg','png','webp')
)
WITH CHECK (
  bucket_id = 'biegamy-assets'
  AND (storage.foldername(name))[1] = 'avatars'
  AND split_part(storage.filename(name), '.', 1) IN (
        SELECT a.id::text FROM public.athletes a WHERE a.user_id = auth.uid())
  AND lower(split_part(storage.filename(name), '.', 2)) IN ('jpg','jpeg','png','webp')
);

COMMIT;

-- Weryfikacja empiryczna (realny JWT zawodnika przez REST):
--   avatars/{swoje_id}.jpg           -> 200
--   upsert tego samego (PUT)         -> 200   (ścieżka UPDATE)
--   avatars/{cudze_id}.jpg           -> 403 new row violates row-level security policy
--   korzeń bucketu wlam.jpg          -> 403   (foldername()[1] = NULL, warunek nie przechodzi)
--   avatars/{swoje_id}.html          -> 403
--   odczyt publiczny istniejącego    -> 200
--   service_role -> korzeń           -> zapisuje (RLS go nie dotyczy)
