-- WYCOFANIE 20260906_trainings_guard_coach_plan.sql
--
-- ⚠️ CO TRACISZ: zawodnik znowu może nadpisać zamiar trenera w `trainings` —
--    typ, opis, kroki, datę i przypisanie. Dziura wraca w całości, bo
--    `trainings_athlete_update` nadal nie zawęża ani kolumn, ani wierszy.
--    Zasięg: 2181 wierszy `plan_source='coach'` (stan 6.09.2026).
--
-- ⚠️ NIC NIE TRZEBA ODTWARZAĆ. Trigger niczego nie zapisuje ani nie kasuje —
--    tylko odrzuca UPDATE-y. Zdjęcie go nie zostawia po sobie stanu do
--    naprawienia, w odróżnieniu od migracji dodających kolumny.
--
-- ⚠️ ZDEJMIJ TAKŻE BLOKADĘ W KLIENCIE, jeśli wycofujesz świadomie, a nie
--    awaryjnie: `kalendarz.html` nie pozwala przeciągać kart trenerskich
--    i nie wysyła chronionych kolumn w gałęzi zawodnika. Sam rollback SQL
--    przywróci uprawnienie, którego interfejs i tak nie użyje.

drop trigger if exists trg_trainings_guard_coach_plan on public.trainings;
drop function if exists public.trainings_guard_coach_plan();

-- KONTROLA:
-- select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
--  where c.relname='trainings' and not t.tgisinternal;
-- select proname from pg_proc where proname='trainings_guard_coach_plan';
