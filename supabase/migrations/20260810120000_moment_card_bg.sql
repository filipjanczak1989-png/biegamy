-- Własne tło dla karty kamienia milowego.
--
-- Zmiana decyzji z K1: uznaliśmy wtedy, że kamień nie ma naturalnego zdjęcia, bo dotyczy setek
-- treningów, nie jednego. Praktyka pokazała co innego — kto przebiega tysiąc kilometrów, chce
-- tam SWOJE zdjęcie. Kamień nie wisi na żadnym logu, więc `training_logs.card_bg_url` nie miał
-- jak zadziałać; tło musi żyć przy momencie.
--
-- Dlaczego KOLUMNA, a nie klucz w `payload`: payload bywa nadpisywany przy ponownej detekcji
-- tego samego momentu, a tło ustawia człowiek i nie może zniknąć przy przeliczeniu silnika.
ALTER TABLE public.delivered_moments
  ADD COLUMN IF NOT EXISTS card_bg_url text;

-- ⚠️ GRANT JEST OBOWIĄZKOWY, NIE DZIEDZICZY SIĘ. Zmierzone przed zmianą:
--   authenticated  SELECT → grant TABELOWY  → nowa kolumna dziedziczy, nic nie trzeba
--   authenticated  UPDATE → grant KOLUMNOWY, na JEDNEJ kolumnie (shown_at)
-- Bez poniższej linii zapis z klienta padłby na uprawnieniach, a nie na RLS — i diagnoza
-- poszłaby w stronę polityk, gdzie problemu nie ma. To ta sama pułapka co przy `athletes`.
GRANT UPDATE (card_bg_url) ON public.delivered_moments TO authenticated;

-- RLS BEZ ZMIAN — sprawdzone, polityki wystarczają. Na UPDATE są dwie, obie permisywne:
--   dm_ath_mark_shown  USING/CHECK: athlete_id należy do auth.uid()
--   dm_ath_upd         USING/CHECK: to samo + status = 'approved'
-- Polityki RLS działają na WIERSZE, nie na kolumny, więc `card_bg_url` jest nimi objęty
-- automatycznie. Zawodnik ustawi tło tylko na własnym momencie; trener, mimo że widzi
-- moment przez dm_coach_sel, nie zapisze tła — i to jest właściwa granica: to jego
-- kilometry i jego zdjęcie, tak samo jak przy tle treningu.
