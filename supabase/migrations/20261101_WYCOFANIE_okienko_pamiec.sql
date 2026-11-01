-- WYCOFANIE 20261101_okienko_pamiec.sql — zadanie czyszczenia cache, okienko_siec_cache, okienko_znaleziska.
-- ⛔ KOLEJNOŚĆ: najpierw EF okienko w wersji bez pamięci (v4), inaczej odczyt/zapis cache i znalezisk dostanie 42P01.
-- ⛔ DANE: znaleziska (leady dla K-źródła) przepadają — jeśli są „sprawdzone", wyeksportować je przed wycofaniem.

begin;

select cron.unschedule('okienko-siec-cache-24h') where exists (select 1 from cron.job where jobname = 'okienko-siec-cache-24h');
drop table if exists public.okienko_znaleziska;
drop table if exists public.okienko_siec_cache;
delete from public.okienko_log where tryb in ('siec-cache', 'osoba');
alter table public.okienko_log drop constraint if exists okienko_log_tryb_check;
alter table public.okienko_log add constraint okienko_log_tryb_check
  check (tryb in ('router', 'flash', 'siec', 'limit', 'blad', 'budzet80'));

commit;
