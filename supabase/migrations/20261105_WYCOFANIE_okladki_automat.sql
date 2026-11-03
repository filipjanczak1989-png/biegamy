-- 20261105_WYCOFANIE_okladki_automat.sql — cofa 20261105_okladki_automat.sql (cron + log; okładki w imprezy_okladki i race-covers zostają).
begin;
select cron.unschedule('okladki-imprez-noc') where exists (select 1 from cron.job where jobname = 'okladki-imprez-noc');
drop table if exists public.okladki_log;
commit;
