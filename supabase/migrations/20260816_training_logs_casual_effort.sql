-- Znacznik „treningowo" przy starcie.
--
-- DLACZEGO NOWA KOLUMNA, A NIE ISTNIEJĄCA: `training_logs` ma 27 kolumn i żadnej
-- na flagi. `comment` to tekst zawodnika, `source`/`external_source` to
-- pochodzenie wpisu, `feel` to skala samopoczucia. Wciśnięcie znacznika w
-- `comment` powtórzyłoby pomyłkę `pb_*` jako `text` — pole o jednym znaczeniu
-- użyte do drugiego.
--
-- DLACZEGO DOMYŚLNIE FALSE (= „na maksa"): zmierzone 16.08.2026 na 65 startach
-- z policzalnym dystansem — 48 wygląda na prawdziwy maksymalny wysiłek
-- (dwaj niezależni świadkowie: HR ≥92% obserwowanego maksa ORAZ tempo ≥8%
-- szybsze niż własne biegi spokojne podobnej długości; zgodni w 46 z 53
-- przypadków, gdzie mamy obu). Domyślne „na maksa" jest więc prawdziwe dla
-- ~74% istniejących wierszy.
--
-- ⚠️ ŚWIADOMIE BEZ BACKFILLU. Mój wykrywacz opiera się na PROXY tętna
--    maksymalnego (najwyższe zaobserwowane HR), a nie na pomiarze. Wpisanie
--    jego wyniku do bazy zamieniłoby oszacowanie w fakt, którego później nikt
--    by nie odróżnił od deklaracji człowieka. 84 istniejące starty zostają
--    jako „na maksa".

alter table public.training_logs
  add column if not exists casual_effort boolean not null default false;

comment on column public.training_logs.casual_effort is
  'Start przebiegnięty luźno (parkrun w treningu), nie na maksa. '
  'Domyślnie false = maksymalny wysiłek. Ustawiane wyłącznie przez zawodnika '
  'w modalu logowania; NIE jest wypełniane automatycznie.';

-- ⚠️ GRANTU TU NIE MA I TO JEST SPRAWDZONE, NIE POMINIĘTE.
-- Blizna z `athletes` mówi „GRANT po ADD COLUMN" — ale ona dotyczy tabel,
-- gdzie SELECT jest nadany KOLUMNOWO. Zmierzone 16.08.2026:
--   athletes            -> authenticated ma SELECT tylko kolumnowo  → grant KONIECZNY
--   training_logs       -> authenticated ma SELECT tabelowo         → grant zbędny
--   athlete_intake_forms-> authenticated ma SELECT tabelowo         → grant zbędny
-- Grant tabelowy obejmuje kolumny dodane później. Dopisanie tu zbędnego
-- GRANT-a nie zaszkodziłoby, ale utrwaliłoby regułę „zawsze grantuj" zamiast
-- „sprawdź, jak nadano SELECT" — a to jest różnica między nawykiem a wiedzą.
