-- 20261101_okienko_log_siec.sql — M2a „Zapytaj" z sieci (Google Search grounding):
--   * tryb 'siec' w okienko_log (bez tego insert z EF odpada na check, a limit 20/dobę nie widziałby żadnego wpisu);
--   * zapytania_sieci — ile zapytań wyszukiwania uruchomił model (webSearchQueries); budżet = tokeny × cena
--     + zapytania_sieci × 0,014 USD (cena Gemini 3+: 14 USD / 1000 zapytań, bez darmowej puli — ostrożnie).
-- Dostęp bez zmian (RLS, SELECT właściciela, zapis service_role). Wycofanie: 20261101_WYCOFANIE_okienko_log_siec.sql.

begin;

alter table public.okienko_log drop constraint if exists okienko_log_tryb_check;
alter table public.okienko_log add constraint okienko_log_tryb_check
  check (tryb in ('router', 'flash', 'siec', 'limit', 'blad', 'budzet80'));
alter table public.okienko_log add column if not exists zapytania_sieci integer not null default 0 check (zapytania_sieci >= 0);

do $$
begin
  if has_table_privilege('anon', 'public.okienko_log', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'okienko_log_siec: anon ma grant — nie wdrażamy';
  end if;
  if has_table_privilege('authenticated', 'public.okienko_log', 'INSERT, UPDATE, DELETE') then
    raise exception 'okienko_log_siec: authenticated może pisać — nie wdrażamy';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'okienko_log_tryb_check' and pg_get_constraintdef(oid) like '%siec%') then
    raise exception 'okienko_log_siec: check trybu bez siec';
  end if;
end $$;

commit;
