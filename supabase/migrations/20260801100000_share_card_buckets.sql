-- ZAPIS HISTORII — nie uruchamiać.
-- Odtwarza stan już obecny na produkcji (utworzone ręcznie 2026-08-01).
--
-- Buckety pod generator kart do udostępniania (EF share-card).
--
-- share-assets — materiały wejściowe renderera: tła (bg/m, bg/k, bg/n),
--   fonty TTF, logotyp i binarka resvg .wasm. Publiczny odczyt, bo EF pobiera
--   je zwykłym fetchem przy cold starcie.
--   Binarka wasm leży u nas celowo: poleganie na esm.sh w runtime na ścieżce
--   generowania to zależność, której nie kontrolujemy.
--
-- share-cards — gotowe karty PNG 1080x1350, klucz {log_id}.png.
--   Karta jest niezmienna: gdy plik istnieje, EF zwraca URL bez renderu.
--   Ograniczenie mime do image/png jest tu tanią bramką — EF i tak zawsze
--   ustawia ten content-type.
--
-- ZERO POLITYK ZAPISU to decyzja, nie przeoczenie: pisze wyłącznie EF przez
-- service_role, który omija RLS. Nowy bucket nie dziedziczy niczego, bo
-- wszystkie istniejące polityki storage.objects są filtrowane po bucket_id.
-- Weryfikacja empiryczna: anon POST -> 403 "new row violates row-level
-- security policy"; anon GET istniejącego obiektu -> 200; nieistniejącego -> 404.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('share-assets', 'share-assets', true, 10485760, NULL),
  ('share-cards',  'share-cards',  true, 10485760, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;
