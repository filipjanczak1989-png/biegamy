-- NIEWYKONANA NA PROD, na teście wykonana 9.10
-- Źródło: paczka biegamy-results-pkg sql/003_person_ref.sql (stan z 9.10, wersja nałożona na test).
-- Wycofanie (całość 001–005): 20261010_wyniki_WYCOFANIE.sql. Kontrola: tools/kontrola-wyszukiwarka-wynikow.sql.
-- 003: identyfikator osoby ze źródła (Datasport id_per) → rozróżnianie imienników i łączenie wyników tej samej osoby.
-- Zasada grupowania kandydatów: jeśli wynik ma person_ref – grupujemy po nim; jeśli nie – po (name_key, yob) jak dotąd.
-- Ograniczenie: wyniki bez person_ref nie są doklejane do grupy z person_ref o tym samym nazwisku i roczniku.
begin;

alter table public.race_results add column if not exists person_ref text;   -- np. 'datasport:978201'
create index if not exists race_results_person_ref on public.race_results (person_ref) where person_ref is not null;

drop function if exists public.search_runners(text, int);
drop function if exists public.runner_results(text, int);

create or replace function public.search_runners(q text, lim int default 20)
returns table (
  name_key      text,
  display_name  text,
  yob           smallint,
  person_ref    text,
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
    select coalesce(r.person_ref, 'k:' || r.name_key || '|' || coalesce(r.yob::text, '')) as gkey,
           r.person_ref, r.name_key, r.runner_name, r.yob, r.club,
           e.name as event_name, e.event_date, e.city as event_city
    from public.race_results r
    join public.race_events  e on e.id = r.event_id
    where length(public.name_key(q)) >= 3
      and exists (select 1 from toks)
      and not exists (select 1 from toks where r.name_key not like '%' || toks.t || '%')
  )
  select (array_agg(h.name_key    order by h.event_date desc nulls last))[1],
         (array_agg(h.runner_name order by h.event_date desc nulls last))[1],
         (array_agg(h.yob         order by h.event_date desc nulls last))[1],
         max(h.person_ref),
         count(*),
         max(h.event_date),
         (array_agg(h.event_name  order by h.event_date desc nulls last))[1],
         (array_agg(h.event_city  order by h.event_date desc nulls last))[1],
         coalesce(array_agg(distinct h.club) filter (where h.club is not null), '{}')
  from hits h
  group by h.gkey
  order by max(h.event_date) desc nulls last, count(*) desc
  limit least(greatest(coalesce(lim, 20), 1), 50)
$$;

create or replace function public.runner_results(p_name_key text, p_yob int default null, p_person_ref text default null)
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
  where (p_person_ref is not null and r.person_ref = p_person_ref)
     or (p_person_ref is null and r.person_ref is null
         and r.name_key = p_name_key and r.yob is not distinct from p_yob::smallint)
  order by e.event_date desc nulls last, r.created_at desc
  limit 1000
$$;

revoke all on function public.search_runners(text, int), public.runner_results(text, int, text) from public, anon;
grant execute on function public.search_runners(text, int), public.runner_results(text, int, text) to authenticated;

notify pgrst, 'reload schema';
commit;
