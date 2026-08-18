-- PLAN WYCOFANIA dla 20260818_training_plans_obnizka.sql
--
-- ⚠️ TEN PLIK NIE JEST MIGRACJĄ DO URUCHOMIENIA. Uruchamiać RĘCZNIE i świadomie.
--
-- ⚠️ KOLEJNOŚĆ: KOD PRZED KOLUMNAMI. Obie czyta `_zbierzDaneAdaptacji`
--    w zawodnik.html (lista pól w `select`) i zapisuje `_zapiszObnizke`.
--    Po zdjęciu kolumn oba zapytania wywalą się na nieistniejącym polu,
--    a ekran „Mój plan” przestanie się renderować.
--
-- ⚠️ TRACISZ STAN, KTÓREGO NIE DA SIĘ ODTWORZYĆ. `baza_obnizona_km` mówi,
--    o ile plan został obniżony i do czego ma wrócić. Nie wynika to z niczego
--    innego: kalendarz nadal trzyma PIERWOTNE kilometry (obniżka świadomie
--    ich nie przepisuje), więc po skasowaniu kolumny nie ma śladu, że plan
--    w ogóle był obniżony. Przed DROP zrobić:
--      \copy (select id, athlete_id, baza_obnizona_km, obnizona_od
--             from training_plans where baza_obnizona_km is not null)
--            to 'obnizki.csv' csv header
--
-- SKUTEK UBOCZNY WYCOFANIA: reguła `przywroc` wraca do stanu martwej gałęzi —
-- klient znów będzie podstawiał wObnizce=false, bo nie będzie czego czytać.
-- To jest dokładnie ten stan, który ta migracja naprawiała.

alter table public.training_plans
  drop constraint if exists training_plans_obnizka_spojna;

alter table public.training_plans
  drop column if exists baza_obnizona_km,
  drop column if exists obnizona_od;

-- ══ KONTROLA PO WYCOFANIU ══════════════════════════════════════════════════
-- select count(*) from information_schema.columns
--  where table_name='training_plans'
--    and column_name in ('baza_obnizona_km','obnizona_od');
-- Oczekiwane: 0.
