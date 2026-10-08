-- WYCOFANIE 20261009_revoke_update_race_signups.sql — przywraca zdjęty grant (stan zmierzony 8.10.2026:
-- authenticated=arwdm/postgres na race_signups). Potrzebne tylko, gdyby po revoke zapisy na start dostawały 42501
-- (= gdzieś został upsert bez ignoreDuplicates albo stary dokument sprzed deployu).

begin;
grant update on public.race_signups to authenticated;
commit;
