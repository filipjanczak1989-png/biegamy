-- WYCOFANIE 20261101_okienko_log.sql — zdejmuje zadanie retencji i tabelę okienko_log.
--
-- ⛔ KOLEJNOŚĆ: najpierw EF okienko wyłączona albo wdrożona bez zapisu do logu — inaczej każde pytanie dostanie 42P01
--    przy insert/count i okienko odpowie 502/503.
-- ⛔ DANE: wpisy (pytania ludzi z ostatnich 30 dni) przepadają; kopii nie robimy — to log, nie dane do odtworzenia.

begin;

select cron.unschedule('okienko-log-30d') where exists (select 1 from cron.job where jobname = 'okienko-log-30d');

drop table if exists public.okienko_log;

commit;
