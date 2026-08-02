-- Własne tło karty per trening (share-card ETAP 1).
--
-- Zawodnik wgrywa zdjęcie, klient kadruje je do 4:5 i przyciemnia adaptacyjnie,
-- a EF share-card renderuje na nim kartę zamiast tła z biblioteki.
--
-- Kolumna: card_bg_url trzyma PUBLICZNY URL z bucketu card-bg wraz z ?t=timestamp.
-- Cache-buster jest częścią kontraktu, nie ozdobą: EF liczy z tego URL-a hash8,
-- który wchodzi do klucza karty (share-cards/{log_id}-{hash8}.png). Podmiana
-- zdjęcia daje nowy hash, nową kartę, a stare linki nadal żyją.
--
-- GRANT jest tu REDUNDANTNY i zostaje świadomie, dla jawności: training_logs ma
-- grant TABELOWY (authenticated=arwdDxtm), więc nowa kolumna dziedziczy uprawnienia.
-- UWAGA na odwrotny przypadek: public.athletes ma granty KOLUMNOWE i tam nowa
-- kolumna NIE odziedziczy nic — sprawdzaj relacl przed każdym ADD COLUMN,
-- nie zakładaj.
--
-- Trener może zapisać card_bg_url podopiecznemu, bo athletes_update_own_logs
-- daje mu UPDATE na całym wierszu. RLS nie rozróżnia kolumn. Klient nie tworzy
-- takiej ścieżki; rozróżnianie kolumnowe to świadomie odłożona Faza 2.

BEGIN;

ALTER TABLE public.training_logs ADD COLUMN IF NOT EXISTS card_bg_url text;

GRANT SELECT (card_bg_url) ON public.training_logs TO authenticated;
GRANT UPDATE (card_bg_url) ON public.training_logs TO authenticated;

-- Limit i whitelist mime NIE są opcjonalne: polityka sprawdza tylko ŚCIEŻKĘ,
-- więc bez nich ktoś wgrywa 40 MB pod nazwą .jpg. Kadrownik produkuje JPEG
-- 1080x1350 (~200-400 KB), 5 MB to zapas na podniesienie jakości.
-- (Dla kontrastu: biegamy-assets nie ma limitu i stąd awatary po 8,2 MB.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-bg', 'card-bg', true, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Ścieżka: {auth.uid()}/{log_id}.jpg — folder jest granicą właściciela.
DROP POLICY IF EXISTS card_bg_owner_insert ON storage.objects;
CREATE POLICY card_bg_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'card-bg' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS card_bg_owner_update ON storage.objects;
CREATE POLICY card_bg_owner_update ON storage.objects
FOR UPDATE TO authenticated
USING      (bucket_id = 'card-bg' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'card-bg' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS card_bg_owner_delete ON storage.objects;
CREATE POLICY card_bg_owner_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'card-bg' AND (storage.foldername(name))[1] = auth.uid()::text);

-- SELECT NIE jest tu nadmiarowy, choć bucket jest publiczny.
-- public = true otwiera wyłącznie ścieżkę /object/public/..., a NIE daje SELECT
-- na storage.objects. Operacje, które muszą najpierw ODNALEŹĆ wiersz — DELETE,
-- listowanie, podmiana istniejącego pliku — bez tej polityki nie mają go jak
-- zobaczyć. Objawia się jako 403 "Access denied" u WŁAŚCICIELA mimo poprawnej
-- polityki DELETE, co myli, bo wygląda na problem z DELETE.
-- Ta polityka nie otwiera treści (ta jest publiczna przez URL) — daje wyłącznie
-- prawo zobaczenia WŁASNEGO wiersza. Zweryfikowane: właściciel listujący cudzy
-- folder dostaje pustą tablicę, nie 403.
DROP POLICY IF EXISTS card_bg_owner_select ON storage.objects;
CREATE POLICY card_bg_owner_select ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'card-bg' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Weryfikacja empiryczna (realny JWT + anon przez REST), 12 bramek:
--   anon INSERT / UPDATE / DELETE-na-istniejącym  -> 403
--   właściciel zapisuje pod własne uid            -> 200
--   zapis pod cudze uid                           -> 403
--   odczyt bez Bearer                             -> 200
--   mime spoza whitelisty (.png)                  -> 415 invalid_mime_type
--   SELECT + UPDATE card_bg_url przez REST        -> 200 / 204 (dowód na NOTIFY)
--   właściciel DELETE własnego pliku              -> 200
--   właściciel listuje własny folder              -> widzi obiekt
--   właściciel listuje cudzy folder               -> [] (pusto, nie 403)
--   anon listuje                                  -> []
