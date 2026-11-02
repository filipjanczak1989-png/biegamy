-- WYCOFANIE 20261102_icu_stream_types.sql.
-- ⚠️ NAJPIERW cofnąć intervals-sync i intervals-webhook do wersji bez icu_stream_types/icu_trainer —
--    inaczej insert z nieznaną kolumną wywraca cały import (PGRST204). Zebrany pomiar ginie.
begin;
alter table public.training_logs drop column if exists icu_stream_types;
alter table public.training_logs drop column if exists icu_trainer;
notify pgrst, 'reload schema';
commit;
