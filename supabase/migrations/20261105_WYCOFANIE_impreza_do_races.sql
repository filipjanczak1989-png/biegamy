-- 20261105_WYCOFANIE_impreza_do_races.sql — cofa 20261105_impreza_do_races.sql. Wiersze races dodane przez RPC zostają (to normalne starty).
begin;
drop function if exists public.impreza_do_races(text, text, date, text, numeric, text, text);
drop function if exists public.klucz_nazwy_imprezy(text);
drop index if exists public.races_impreza_klucz;
alter table public.races drop column if exists impreza_klucz;
notify pgrst, 'reload schema';
commit;
