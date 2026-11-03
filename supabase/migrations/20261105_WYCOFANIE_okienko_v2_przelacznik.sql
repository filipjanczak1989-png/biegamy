-- 20261105_WYCOFANIE_okienko_v2_przelacznik.sql — cofa 20261105_okienko_v2_przelacznik.sql (Okienko 2.0 E0).
-- Przed kasacją: front po błędzie RPC okienko_wersja() sam wraca na v1 (js/okienko.js), więc kolejność nie wymaga deployu.
-- Miękki powrót BEZ tej migracji: update public.okienko_ustawienia set wartosc = 'false' where klucz = 'v2_wlaczone';
begin;
select cron.unschedule('okienko-v2-log-30d') where exists (select 1 from cron.job where jobname = 'okienko-v2-log-30d');
select cron.unschedule('okienko-v2-rozmowa-1d') where exists (select 1 from cron.job where jobname = 'okienko-v2-rozmowa-1d');
drop function if exists public.okienko_wersja();
drop table if exists public.okienko_v2_rozmowa;
drop table if exists public.okienko_v2_log;
drop table if exists public.okienko_v2_konta;
drop table if exists public.okienko_ustawienia;
commit;
