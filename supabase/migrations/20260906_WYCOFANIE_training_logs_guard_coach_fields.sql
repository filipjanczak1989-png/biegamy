-- WYCOFANIE 20260906_training_logs_guard_coach_fields.sql
--
-- ⚠️ CO WRACA: trener znowu bedzie mogl zmienic KAZDA z 30 kolumn logu swojego
--    zawodnika — dystans, czas, tempo, tetno, samopoczucie, komentarz. 3191
--    wierszy. Trigger niczego nie zapisuje, wiec zdjecie go nie zostawia stanu
--    do naprawienia; wraca wylacznie uprawnienie.

alter policy "coach_updates_coach_fields" on public.training_logs
  rename to "coach can mark logs read";

drop trigger if exists trg_training_logs_guard_coach_fields on public.training_logs;
drop function if exists public.training_logs_guard_coach_fields();
