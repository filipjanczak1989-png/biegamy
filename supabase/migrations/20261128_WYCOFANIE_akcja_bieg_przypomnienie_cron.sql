-- WYCOFANIE 20261128_akcja_bieg_przypomnienie_cron.sql: zdejmuje codzienne wołanie EF bieg-przypomnienie. Funkcja i log wysyłek zostają.
begin;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'akcja-bieg-przypomnienie') then perform cron.unschedule('akcja-bieg-przypomnienie'); end if;
end $$;
commit;
