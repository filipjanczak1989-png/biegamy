-- WYCOFANIE 20261102_akcje.sql — kasuje tabele i RPC akcji.
-- ⚠️ Po starcie akcji (akcje.wystartowala_at) wycofanie kasuje też deklaracje sponsorów i moment startu.
--    Najpierw zrzut: select row_to_json(a) from akcje a; select row_to_json(s) from akcja_sponsorzy s;
-- training_logs nie jest dotykane (suma liczona na odczyt).
begin;
drop function if exists public.akcja_proba_reset();
drop function if exists public.akcja_start(text, timestamptz);
drop function if exists public.akcja_tydzien(text, date);
drop function if exists public.akcja_moj_wklad(text);
drop function if exists public.akcja_licznik(text);
drop function if exists public.akcja_km_okna(uuid, date, date, uuid[]);
drop table if exists public.akcja_sponsorzy;
drop table if exists public.akcja_startujacy;
drop table if exists public.akcje;
notify pgrst, 'reload schema';
commit;
-- KONTROLA: select count(*) from pg_proc where proname like 'akcja\_%';  -- 0
