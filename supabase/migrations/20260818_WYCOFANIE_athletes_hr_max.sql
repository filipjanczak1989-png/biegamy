-- PLAN WYCOFANIA dla 20260818_athletes_hr_max.sql
--
-- ⚠️ TEN PLIK NIE JEST MIGRACJĄ DO URUCHOMIENIA. Uruchamiać RĘCZNIE i świadomie.
--
-- ⚠️ KOLEJNOŚĆ: KOD PRZED KOLUMNĄ. `hr_max` czyta profil.html i obie ścieżki
--    liczenia stref (zawodnik.html, narzedzia.html). Po zdjęciu kolumny każdy
--    `select` z nią w liście pól zwróci błąd — a to jest ekran, który zawodnik
--    otwiera codziennie. Najpierw cofnąć commit, potem kolumnę.
--
-- ⚠️ TRACISZ DANE WPISANE RĘCZNIE PRZEZ LUDZI. `hr_max` nie da się odtworzyć
--    z niczego: nie ma go w logach (tam jest tętno ŚREDNIE), nie ma w PB.
--    Jedyne źródło to człowiek, który go wpisał. Przed DROP zrobić:
--      \copy (select id, full_name, hr_max from athletes where hr_max is not null)
--            to 'hr_max.csv' csv header
--
-- Wycofanie samego GRANT-u nie jest potrzebne — granty kolumnowe znikają razem
-- z kolumną.

alter table public.athletes
  drop constraint if exists athletes_hr_max_check;

alter table public.athletes
  drop column if exists hr_max;

-- ══ KONTROLA PO WYCOFANIU ══════════════════════════════════════════════════
-- select count(*) from information_schema.columns
--  where table_name='athletes' and column_name='hr_max';
-- Oczekiwane: 0.
