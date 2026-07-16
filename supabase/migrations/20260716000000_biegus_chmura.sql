-- CHMURA v1: cloud save gry Bieguś na biegus_most (wzorzec MOST v2)
-- zapis = pelny JSON z localStorage (biegus_droga_zapis_v1), zapis_ts = znacznik last-write-wins
alter table public.biegus_most add column if not exists zapis jsonb;
alter table public.biegus_most add column if not exists zapis_ts timestamptz;

-- RYTUAL (konstytucja): kolumnowe granty po ADD COLUMN — Postgres NIE nadaje ich sam po REVOKE
grant select (zapis, zapis_ts) on public.biegus_most to authenticated;
grant update (zapis, zapis_ts) on public.biegus_most to authenticated;

-- RYTUAL (lekcja cc, default-acl): jawny revoke anon po kazdym DDL na tabeli
revoke all on public.biegus_most from anon;

notify pgrst, 'reload schema';

-- WERYFIKACJA (po wykonaniu, przez supabase-js/REST nie raw SQL):
-- 1) select zapis, zapis_ts z tokenem usera -> 200 (wlasny wiersz), RLS self-only trzyma cudze
-- 2) PATCH {zapis:{"test":1},zapis_ts:now} tokenem usera -> 204
-- 3) anon key bez tokenu -> 401/403 na biegus_most
