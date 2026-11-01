-- Wycofanie 20261101_okienko_impreza.sql. KOLEJNOŚĆ: najpierw EF okienko w wersji bez trybu „impreza" (v10),
-- inaczej jej wpisy odbiją się od CHECK. Wpisy 'impreza' i znaleziska 'kalendarz' trzeba przenieść przed zawężeniem.
begin;
update public.okienko_log set tryb = 'siec' where tryb = 'impreza' and zapytania_sieci > 0;
update public.okienko_log set tryb = 'router' where tryb = 'impreza';
update public.okienko_znaleziska set status = 'nowe' where status = 'kalendarz';
alter table public.okienko_log drop constraint if exists okienko_log_tryb_check;
alter table public.okienko_log add constraint okienko_log_tryb_check
  check (tryb in ('router', 'flash', 'siec', 'siec-cache', 'osoba', 'limit', 'blad', 'budzet80'));
alter table public.okienko_znaleziska drop constraint if exists okienko_znaleziska_status_check;
alter table public.okienko_znaleziska add constraint okienko_znaleziska_status_check
  check (status in ('nowe', 'sprawdzone', 'odrzucone'));
commit;
