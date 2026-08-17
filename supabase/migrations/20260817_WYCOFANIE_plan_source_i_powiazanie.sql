-- PLAN WYCOFANIA dla dwóch migracji z 17.08.2026:
--   20260817_trainings_plan_source.sql
--   20260817_training_logs_planned_training_id.sql
--
-- ⚠️ TEN PLIK NIE JEST MIGRACJĄ DO URUCHOMIENIA. Jest odpowiedzią na pytanie,
--    które zadaje `tools/bramka-commit.js`: „rollback kodu strukturalnie nie
--    cofnie migracji — jaki jest plan?". Uruchamiać RĘCZNIE i tylko świadomie.
--
-- ⚠️ OBIE MIGRACJE SĄ ADDYTYWNE. Nie zmieniają istniejących kolumn, nie ruszają
--    typów, nie kasują danych. Jedyny zapis do istniejących wierszy to backfill
--    `plan_source = 'coach'` (2181 wierszy) — i on też jest odwracalny, bo
--    kolumna przed migracją nie istniała, więc nie ma czego przywracać.
--    Wycofanie jest tu tańsze niż zwykle: DROP COLUMN i tyle.

-- ══ WYCOFANIE 1: training_logs.planned_training_id ═════════════════════════
--
-- ⚠️ KOLEJNOŚĆ: kod PRZED kolumną. Po wycofaniu tej kolumny `saveLog`
--    w zawodnik.html wywali się na UPDATE nieistniejącego pola — a to jest
--    ścieżka, której zawodnik używa codziennie. Najpierw cofnąć commit
--    (albo zdjąć blok wiązania), potem kolumnę.
--
-- ⚠️ TRACISZ DANE, KTÓRYCH NIE DA SIĘ ODTWORZYĆ. Powiązania zapisane po
--    17.08 przez `saveLog` niosą informację, której nie ma nigdzie indziej:
--    „ten log wykonuje TEN plan". Dopasowanie po dacie odtworzy tylko 67%
--    z nich (zmierzone) — reszta zniknie bezpowrotnie. Przed DROP zrobić:
--      \copy (select id, planned_training_id from training_logs
--             where planned_training_id is not null) to 'powiazania.csv' csv header

drop index if exists public.idx_training_logs_planned_training;

alter table public.training_logs
  drop column if exists planned_training_id;

-- ══ WYCOFANIE 2: trainings.plan_source ═════════════════════════════════════
--
-- ⚠️ KOLEJNOŚĆ: kod PRZED kolumną, z tego samego powodu. `plan_source` zapisuje
--    zawodnik.html (generator), kalendarz.html (dwa INSERT-y i dwa UPDATE-y)
--    oraz trener.html (jeden INSERT). Po zdjęciu kolumny każdy z nich rzuci
--    błąd na nieistniejącej kolumnie. Odczyt jest bezpieczny — `_odTrenera()`
--    w zawodnik.html spada na `coach_id`, gdy `plan_source` jest puste.
--
-- Strata jest tu mniejsza: pochodzenie 'coach' da się odtworzyć backfillem
-- z `coach_id`, bo panel trenerski zawsze je wpisuje. Nie da się odtworzyć
-- WYŁĄCZNIE oznaczeń 'generator' — dziś jest ich 0, więc dziś strata wynosi zero.

alter table public.trainings
  drop constraint if exists trainings_plan_source_check;

alter table public.trainings
  drop column if exists plan_source;

-- ══ KONTROLA PO WYCOFANIU ══════════════════════════════════════════════════
-- select count(*) filter (where column_name='plan_source')          as ma_plan_source,
--        count(*) filter (where column_name='planned_training_id')  as ma_powiazanie
--   from information_schema.columns
--  where table_name in ('trainings','training_logs');
-- Oczekiwane po wycofaniu: 0 i 0.
