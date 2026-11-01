-- M3a v2 (1.11.2026): tryb „impreza" w okienku.
--  1) okienko_log.tryb += 'impreza' — bez tego wpis trybu imprezy odbija się od CHECK, a limit sieci 20/dobę
--     (uzyteSiecDzis liczy z logu) przestałby obejmować wyszukania imprez.
--  2) okienko_znaleziska.status += 'kalendarz' — źródła z odpowiedzi o imprezie (domeny organizatorów) dla K-źródła
--     na maszynie3. Odczyt bez zmian (trener), zapis bez zmian (tylko EF / service_role).
-- Bez nowych tabel, polityk ani grantów. Wycofanie: 20261101_WYCOFANIE_okienko_impreza.sql.
begin;

alter table public.okienko_log drop constraint if exists okienko_log_tryb_check;
alter table public.okienko_log add constraint okienko_log_tryb_check
  check (tryb in ('router', 'flash', 'siec', 'siec-cache', 'osoba', 'impreza', 'limit', 'blad', 'budzet80'));

alter table public.okienko_znaleziska drop constraint if exists okienko_znaleziska_status_check;
alter table public.okienko_znaleziska add constraint okienko_znaleziska_status_check
  check (status in ('nowe', 'sprawdzone', 'odrzucone', 'kalendarz'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'okienko_log_tryb_check' and pg_get_constraintdef(oid) like '%impreza%' and pg_get_constraintdef(oid) like '%siec-cache%') then
    raise exception 'okienko_impreza: check trybu bez impreza/siec-cache';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'okienko_znaleziska_status_check' and pg_get_constraintdef(oid) like '%kalendarz%' and pg_get_constraintdef(oid) like '%odrzucone%') then
    raise exception 'okienko_impreza: check statusu bez kalendarz';
  end if;
end $$;

commit;
