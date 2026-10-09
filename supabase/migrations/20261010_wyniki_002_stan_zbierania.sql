-- NIEWYKONANA NA PROD, na teście wykonana 9.10
-- Źródło: paczka biegamy-results-pkg sql/002_collect_state.sql (stan z 9.10, wersja nałożona na test).
-- Wycofanie (całość 001–005): 20261010_wyniki_WYCOFANIE.sql. Kontrola: tools/kontrola-wyszukiwarka-wynikow.sql.
-- 002: stan automatycznego zbierania (kursor + dziennik przebiegów). Tylko service_role.
begin;

create table if not exists public.collect_seen (
  source      text        not null,
  ext_id      integer     not null,            -- numer imprezy w źródle (np. Datasport results<ID>)
  state       text        not null check (state in ('ok', 'no_results', 'missing')),
  event_date  date,
  first_seen  timestamptz not null default now(),
  checked_at  timestamptz not null default now(),
  primary key (source, ext_id)
);

create table if not exists public.collect_runs (
  id          bigint generated always as identity primary key,
  source      text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null default 'running' check (status in ('running', 'ok', 'stopped', 'error')),
  requested   integer     not null default 0,
  events      integer     not null default 0,
  results     integer     not null default 0,
  skipped     jsonb       not null default '{}'::jsonb,   -- {"anonim": 12, "niepełnoletni": 40, ...}
  note        text
);
create index if not exists collect_runs_source_started on public.collect_runs (source, started_at desc);

alter table public.collect_seen enable row level security;
alter table public.collect_runs enable row level security;
revoke all on public.collect_seen from anon, authenticated, public;
revoke all on public.collect_runs from anon, authenticated, public;
-- brak polityk RLS: dostęp wyłącznie przez service_role (omija RLS)

notify pgrst, 'reload schema';
commit;
