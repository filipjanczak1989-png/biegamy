-- 20261105_WYCOFANIE_intervals_status_garmin.sql — cofa 20261105_intervals_status_garmin.sql (wiersze 'garmin' wracają do 'zegarek').
begin;
update public.intervals_status set ogniwo = 'zegarek' where ogniwo = 'garmin';
alter table public.intervals_status drop constraint if exists intervals_status_ogniwo_check;
alter table public.intervals_status
  add constraint intervals_status_ogniwo_check check (ogniwo in ('ok', 'brak', 'token', 'zegarek', 'import', 'siec'));
comment on column public.intervals_status.ogniwo is null;
notify pgrst, 'reload schema';
commit;
