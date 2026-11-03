-- 20261105_intervals_status_garmin.sql — ogniwo 'garmin' (3.11.2026, Filip 13:xx): gdy Garmin ogranicza dostęp dla intervals.icu
-- (nowe T&C Garmina, wątek intervals 9.10 / the5krunner 14.10), status ma to ROZPOZNAĆ (cisza Garmina u wielu osób naraz) i pokazać
-- „Garmin ogranicza dostęp — wgraj plik albo poczekaj na bezpośrednie połączenie”, a nie „zegarek nie wysyła”. Decyzję liczy EF
-- intervals-status (ogniwo.mjs czyBlokadaGarmina) albo wymusza sekret GARMIN_BLOKADA=1; baza tylko dopuszcza nową wartość.
-- Wycofanie: 20261105_WYCOFANIE_intervals_status_garmin.sql. Test: IS_Z_MIGRACJA=1 bash tools/intervals-status-test.sh (7 asercji).
begin;

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.intervals_status'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%ogniwo%';
  if c is null then raise exception 'brak constraintu ogniwo na intervals_status'; end if;
  execute format('alter table public.intervals_status drop constraint %I', c);
  alter table public.intervals_status
    add constraint intervals_status_ogniwo_check check (ogniwo in ('ok', 'brak', 'token', 'zegarek', 'import', 'siec', 'garmin'));
end $$;

comment on column public.intervals_status.ogniwo is 'ok | brak | token (nasze połączenie) | zegarek (nie wysyła do intervals) | import (nasz) | siec | garmin (Garmin ogranicza dostęp dla intervals — zbiorowa cisza źródła Garmin Connect albo GARMIN_BLOKADA=1)';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.intervals_status'::regclass and conname = 'intervals_status_ogniwo_check'
                   and pg_get_constraintdef(oid) like '%''garmin''%') then
    raise exception 'ogniwo garmin niedopuszczone';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
