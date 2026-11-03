-- 20261105_intervals_status.sql — STATUS SYNCHRONIZACJI + KREATOR NAPRAWY (Filip 3.11 11:53; Kasia po zmianie telefonu: import martwy od 6.10,
-- w intervals przy Garminie 401). Jeden wiersz na zawodnika z OGNIWEM, w którym stoi rura:
--   'brak'    — niepołączony z intervals;
--   'token'   — BiegaMy ↔ intervals: intervals odpowiada 401/403 → „Połącz ponownie”;
--   'zegarek' — token OK, ale intervals nie ma nowych aktywności > 7 dni → „Zegarek nie wysyła do intervals” (źródło: Garmin/Coros/…);
--   'import'  — intervals ma nowsze aktywności niż BiegaMy → nasz import nie dociągnął (ręczny sync / webhook);
--   'ok'      — rura dosyła; 'siec' — nie udało się sprawdzić (błąd inny niż 401) — nie oskarżamy.
-- Pisze WYŁĄCZNIE EF intervals-status (service). Czyta właściciel i jego trener (lista „kto ma problem i w którym ogniwie”).
-- Źródło i urządzenie z intervals (activity.source / device_name) — żeby instrukcja mówiła „Garmin”, nie ogólnie.
-- Test po skutku: tools/intervals-status-test.sh. Wycofanie: 20261105_WYCOFANIE_intervals_status.sql.
begin;

create table public.intervals_status (
  athlete_id     uuid primary key references public.athletes(id) on delete cascade,
  sprawdzono_at  timestamptz not null default now(),
  ogniwo         text not null check (ogniwo in ('ok', 'brak', 'token', 'zegarek', 'import', 'siec')),
  zrodlo         text check (zrodlo is null or char_length(zrodlo) <= 40),
  urzadzenie     text check (urzadzenie is null or char_length(urzadzenie) <= 80),
  ost_intervals  date,
  ost_biegamy    date,
  dni_ciszy      integer check (dni_ciszy is null or dni_ciszy >= 0),
  szczegoly      jsonb not null default '{}'::jsonb check (pg_column_size(szczegoly) <= 4000)
);
comment on table public.intervals_status is 'Status rury zegarek → intervals → BiegaMy per zawodnik (ogniwo, źródło, ostatnie daty). Pisze tylko EF intervals-status; czyta właściciel i trener.';
alter table public.intervals_status enable row level security;
revoke all on public.intervals_status from public, anon, authenticated;
grant select on public.intervals_status to authenticated;
create policy intervals_status_wlasny on public.intervals_status
  for select to authenticated
  using (athlete_id = (select a.id from public.athletes a where a.user_id = auth.uid() limit 1));
create policy intervals_status_trener on public.intervals_status
  for select to authenticated
  using (exists (select 1 from public.athletes a where a.id = intervals_status.athlete_id and a.coach_id = auth.uid()));

do $$
begin
  if has_table_privilege('anon', 'public.intervals_status', 'SELECT, INSERT, UPDATE, DELETE') then raise exception 'intervals_status: anon'; end if;
  if has_table_privilege('authenticated', 'public.intervals_status', 'INSERT, UPDATE, DELETE') then raise exception 'intervals_status: zalogowany pisze'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'intervals_status' and cmd = 'SELECT') <> 2
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'intervals_status' and cmd <> 'SELECT') then
    raise exception 'intervals_status: polityki (ma być dokładnie: własny + trener, tylko SELECT)';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
