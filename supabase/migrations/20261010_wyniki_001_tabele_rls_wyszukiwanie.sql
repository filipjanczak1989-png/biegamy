-- NIEWYKONANA NA PROD, na teście wykonana 9.10
-- 20261010_wyniki_001_tabele_rls_wyszukiwanie.sql — wyszukiwarka wyników (paczka biegamy-results-pkg, sql/001_results_search.sql).
--
-- ⛔ KOLEJNOŚĆ: najpierw baza TESTOWA (hgqvhisbaveoawssehpp), kontrola tools/kontrola-wyszukiwarka-wynikow.sql,
--    smoke na teście; prod dopiero po bramce Filipa. Na prod NIE MA event triggera ensure_rls (test go ma, zmierzone
--    9.10) — dlatego KAŻDA tabela ma jawne `enable row level security`, a kontrola sprawdza relrowsecurity.
--
-- ZMIANY WOBEC PACZKI (sql/001_results_search.sql):
--   · revoke EXECUTE od PUBLIC/anon także na name_key() i race_results_set_key() (paczka zdejmowała tylko z dwóch
--     RPC; konwencja PAKI 4: funkcje bez anon/PUBLIC). name_key() zostaje dla authenticated — search_runners jest
--     SECURITY INVOKER i woła ją uprawnieniami użytkownika.
--   · begin/commit jak reszta migracji w repo.
--
-- ZMIERZONE 9.10 na prod (tylko odczyt): race_events, race_results, results_import_log, name_key, search_runners,
-- runner_results, race_results_set_key — NIE ISTNIEJĄ; kolumny name_key/organizer_id w public — brak;
-- pg_trgm i unaccent — DOSTĘPNE, NIEZAINSTALOWANE (ta migracja je instaluje w schemacie extensions).
--
-- ⚠️ Supabase przy `create table` w public SAM nadaje anon/authenticated ALL (default privileges) — o braku dostępu
--    decyduje `revoke all` niżej, nie brak grantu. Test paczki (PGlite) tych domyślnych grantów nie ma, więc jego
--    „anon nic nie widzi" jest zielone niezależnie od revoke — prawdziwy dowód to kontrola na bazie testowej.
-- Wycofanie (całość 001–005): 20261010_wyniki_WYCOFANIE.sql.

begin;

create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.name_key(p text)
returns text
language sql
stable
parallel safe
set search_path = public, extensions
as $$
  select coalesce(string_agg(t, ' ' order by t), '')
  from unnest(
    regexp_split_to_array(
      regexp_replace(lower(unaccent(coalesce(p, ''))), '[^a-z0-9\s-]', ' ', 'g'),
      '[\s-]+'
    )
  ) as t
  where t <> ''
$$;

create table if not exists public.race_events (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  source_event_id text not null,
  name            text not null,
  event_date      date,
  city            text,
  distance_km     numeric(8,3),
  source_url      text,
  organizer_id    uuid,
  created_at      timestamptz not null default now(),
  unique (source, source_event_id)
);

create table if not exists public.race_results (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.race_events(id) on delete cascade,
  source            text not null,
  source_id         text not null,
  runner_name       text not null,
  name_key          text not null,
  yob               smallint check (yob is null or yob between 1900 and 2100),
  city              text,
  club              text,
  category          text,
  time_seconds      integer check (time_seconds is null or time_seconds >= 0),
  position_total    integer,
  position_category integer,
  bib               text,
  result_url        text,
  scope             text not null default 'private' check (scope in ('public', 'private')),
  imported_by       uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint race_results_uniq unique nulls not distinct (source, source_id, imported_by)
);

create index if not exists race_results_name_trgm on public.race_results using gin (name_key extensions.gin_trgm_ops);
create index if not exists race_results_key_yob   on public.race_results (name_key, yob);
create index if not exists race_results_event     on public.race_results (event_id);
create index if not exists race_results_importer  on public.race_results (imported_by) where imported_by is not null;

create or replace function public.race_results_set_key()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.name_key := public.name_key(new.runner_name);
  return new;
end
$$;

drop trigger if exists race_results_set_key on public.race_results;
create trigger race_results_set_key
  before insert or update of runner_name on public.race_results
  for each row execute function public.race_results_set_key();

create table if not exists public.results_import_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists results_import_log_user_time on public.results_import_log (user_id, created_at desc);

alter table public.race_events        enable row level security;
alter table public.race_results       enable row level security;
alter table public.results_import_log enable row level security;

drop policy if exists race_events_read on public.race_events;
create policy race_events_read on public.race_events
  for select to authenticated using (true);

drop policy if exists race_results_read on public.race_results;
create policy race_results_read on public.race_results
  for select to authenticated
  using (scope = 'public' or imported_by = (select auth.uid()));

drop policy if exists race_results_delete_own on public.race_results;
create policy race_results_delete_own on public.race_results
  for delete to authenticated
  using (imported_by = (select auth.uid()));

revoke all on public.race_events, public.race_results, public.results_import_log from anon, authenticated;
grant select         on public.race_events  to authenticated;
grant select, delete on public.race_results to authenticated;

create or replace function public.search_runners(q text, lim int default 20)
returns table (
  name_key      text,
  display_name  text,
  yob           smallint,
  results_count bigint,
  last_date     date,
  last_event    text,
  last_city     text,
  clubs         text[]
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with toks as (
    select t from unnest(string_to_array(public.name_key(q), ' ')) as t where length(t) >= 2
  ),
  hits as (
    select r.name_key, r.runner_name, r.yob, r.club,
           e.name as event_name, e.event_date, e.city as event_city
    from public.race_results r
    join public.race_events  e on e.id = r.event_id
    where length(public.name_key(q)) >= 3
      and exists (select 1 from toks)
      and not exists (select 1 from toks where r.name_key not like '%' || toks.t || '%')
  )
  select h.name_key,
         (array_agg(h.runner_name order by h.event_date desc nulls last))[1],
         h.yob,
         count(*),
         max(h.event_date),
         (array_agg(h.event_name  order by h.event_date desc nulls last))[1],
         (array_agg(h.event_city  order by h.event_date desc nulls last))[1],
         coalesce(array_agg(distinct h.club) filter (where h.club is not null), '{}')
  from hits h
  group by h.name_key, h.yob
  order by max(h.event_date) desc nulls last, count(*) desc
  limit least(greatest(coalesce(lim, 20), 1), 50)
$$;

create or replace function public.runner_results(p_name_key text, p_yob int default null)
returns table (
  result_id         uuid,
  event_name        text,
  event_date        date,
  event_city        text,
  distance_km       numeric,
  time_seconds      integer,
  position_total    integer,
  position_category integer,
  category          text,
  club              text,
  source            text,
  result_url        text,
  scope             text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select r.id, e.name, e.event_date, e.city, e.distance_km, r.time_seconds,
         r.position_total, r.position_category, r.category, r.club, r.source, r.result_url, r.scope
  from public.race_results r
  join public.race_events  e on e.id = r.event_id
  where r.name_key = p_name_key
    and r.yob is not distinct from p_yob::smallint
  order by e.event_date desc nulls last, r.created_at desc
  limit 1000
$$;

revoke all on function public.search_runners(text, int), public.runner_results(text, int) from public, anon;
grant execute on function public.search_runners(text, int), public.runner_results(text, int) to authenticated;
revoke all on function public.name_key(text) from public, anon;
grant execute on function public.name_key(text) to authenticated;
revoke all on function public.race_results_set_key() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
