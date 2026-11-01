-- WYCOFANIE 20261101_okienko_log_siec.sql — tryb 'siec' i kolumna zapytania_sieci.
-- ⛔ KOLEJNOŚĆ: najpierw EF okienko w wersji bez trybu sieci (v1), inaczej insert z 'siec' odpadnie na check.
-- ⛔ Wpisy 'siec' trzeba usunąć przed przywróceniem checku (inaczej add constraint się nie uda) — to log, nie dane.

begin;

delete from public.okienko_log where tryb = 'siec';
alter table public.okienko_log drop constraint if exists okienko_log_tryb_check;
alter table public.okienko_log add constraint okienko_log_tryb_check
  check (tryb in ('router', 'flash', 'limit', 'blad', 'budzet80'));
alter table public.okienko_log drop column if exists zapytania_sieci;

commit;
