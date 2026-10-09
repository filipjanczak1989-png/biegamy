-- NIEWYKONANA NA PROD, na teście wykonana 9.10
-- 20261010_wyniki_WYCOFANIE.sql — cofa 20261010_wyniki_001…005 (wyszukiwarka wyników) w całości.
-- ⚠️ KASUJE DANE: race_results, race_events, results_import_log, collect_seen, collect_runs, erasure_list.
--    Na prod przed wykonaniem: backup tych tabel poza repo (jak przy kasacjach 7.10). erasure_list to lista
--    osób, które zażądały usunięcia — po wycofaniu i ponownym wdrożeniu trzeba ją ODTWORZYĆ przed pierwszym
--    zbieraniem, inaczej zbieracz przywróci ich wyniki.
-- Rozszerzeń pg_trgm/unaccent NIE zdejmujemy — przed `drop extension` sprawdź pg_depend.

begin;
drop trigger if exists race_results_zz_erasure_guard on public.race_results;
drop function if exists public.erase_runner(text, text);
drop function if exists public.race_results_erasure_guard();
drop function if exists public.resolve_runners();
drop function if exists public.search_runners(text, int);
drop function if exists public.runner_results(text);
drop function if exists public.runner_results(text, int, text);
drop function if exists public.runner_results(text, int);
drop table if exists public.erasure_list;
drop table if exists public.collect_runs;
drop table if exists public.collect_seen;
drop table if exists public.race_results;
drop table if exists public.race_events;
drop table if exists public.results_import_log;
drop function if exists public.race_results_set_key();
drop function if exists public.name_key(text);
notify pgrst, 'reload schema';
commit;
