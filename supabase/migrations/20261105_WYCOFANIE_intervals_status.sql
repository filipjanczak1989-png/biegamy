-- 20261105_WYCOFANIE_intervals_status.sql — cofa 20261105_intervals_status.sql.
begin;
drop table if exists public.intervals_status;
notify pgrst, 'reload schema';
commit;
