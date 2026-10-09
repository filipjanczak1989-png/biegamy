-- NIEWYKONANA NA PROD, na teście wykonana 9.10
-- Źródło: paczka biegamy-results-pkg sql/004_runner_key.sql (stan z 9.10, wersja nałożona na test).
-- Wycofanie (całość 001–005): 20261010_wyniki_WYCOFANIE.sql. Kontrola: tools/kontrola-wyszukiwarka-wynikow.sql.
-- 004: warstwa osób nad surowymi wynikami.
-- Zasada: race_results to surowe, dopisywane dane (zbieramy WSZYSTKO, z person_ref lub bez).
-- runner_key to wyliczany, odwracalny wniosek „czyj to wynik”; resolve_runners() można odpalać dowolnie często
-- i przeliczać od nowa po zmianie reguł. link_method mówi, skąd wniosek:
--   'person_ref'      – id osoby ze źródła (pewne w obrębie źródła)
--   'name_yob_unique' – wynik bez id; w całej bazie to nazwisko+rocznik ma dokładnie jedno person_ref → dopięty (prawdopodobne)
--   'name_yob'        – wynik bez id i bez jednoznacznego kandydata → osobna grupa nazwisko+rocznik
begin;

alter table public.race_results add column if not exists runner_key text;
alter table public.race_results add column if not exists link_method text;
create index if not exists race_results_runner_key on public.race_results (runner_key);

create or replace function public.resolve_runners()
returns bigint
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare n bigint;
begin
  with cand as (        -- nazwisko+rocznik → jedyne person_ref (jeśli jest dokładnie jedno)
    select name_key, yob, min(person_ref) as pref
    from public.race_results
    where person_ref is not null and yob is not null
    group by name_key, yob
    having count(distinct person_ref) = 1
  ), calc as (
    select r.id,
           case when r.person_ref is not null then r.person_ref
                when c.pref is not null and not exists (   -- bezpiecznik: ta osoba ma już inny wynik w tych samych zawodach lub tego samego dnia
                       select 1 from public.race_results p
                       join public.race_events pe on pe.id = p.event_id
                       join public.race_events re on re.id = r.event_id
                       where p.person_ref = c.pref
                         and ((p.event_id = r.event_id and p.time_seconds is distinct from r.time_seconds)
                           or (p.event_id <> r.event_id and pe.event_date = re.event_date))
                     ) then c.pref
                else 'k:' || r.name_key || '|' || coalesce(r.yob::text, '') end as rk,
           case when r.person_ref is not null then 'person_ref'
                when c.pref is not null and not exists (
                       select 1 from public.race_results p
                       join public.race_events pe on pe.id = p.event_id
                       join public.race_events re on re.id = r.event_id
                       where p.person_ref = c.pref
                         and ((p.event_id = r.event_id and p.time_seconds is distinct from r.time_seconds)
                           or (p.event_id <> r.event_id and pe.event_date = re.event_date))
                     ) then 'name_yob_unique'
                else 'name_yob' end as lm
    from public.race_results r
    left join cand c on c.name_key = r.name_key and c.yob = r.yob and r.person_ref is null
  )
  update public.race_results r
     set runner_key = calc.rk, link_method = calc.lm
    from calc
   where calc.id = r.id
     and (r.runner_key is distinct from calc.rk or r.link_method is distinct from calc.lm);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.resolve_runners() from public, anon, authenticated;
grant execute on function public.resolve_runners() to service_role;

drop function if exists public.search_runners(text, int);
drop function if exists public.runner_results(text, int, text);

create or replace function public.search_runners(q text, lim int default 20)
returns table (
  runner_key    text,
  name_key      text,
  display_name  text,
  yob           smallint,
  results_count bigint,
  last_date     date,
  last_event    text,
  last_city     text,
  clubs         text[],
  probable      boolean      -- true, jeśli część wyników dopięto regułą name_yob_unique
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
    select coalesce(r.runner_key, r.person_ref, 'k:' || r.name_key || '|' || coalesce(r.yob::text, '')) as gkey,
           coalesce(r.event_id::text || ':' || r.time_seconds::text, r.id::text) as dkey,   -- ten sam wynik zapisany dwa razy liczymy raz
           r.name_key, r.runner_name, r.yob, r.club, r.link_method,
           e.name as event_name, e.event_date, e.city as event_city
    from public.race_results r
    join public.race_events  e on e.id = r.event_id
    where length(public.name_key(q)) >= 3
      and exists (select 1 from toks)
      and not exists (select 1 from toks where r.name_key not like '%' || toks.t || '%')
  )
  select h.gkey,
         (array_agg(h.name_key    order by h.event_date desc nulls last))[1],
         (array_agg(h.runner_name order by h.event_date desc nulls last))[1],
         (array_agg(h.yob         order by h.event_date desc nulls last))[1],
         count(distinct h.dkey),
         max(h.event_date),
         (array_agg(h.event_name  order by h.event_date desc nulls last))[1],
         (array_agg(h.event_city  order by h.event_date desc nulls last))[1],
         coalesce(array_agg(distinct h.club) filter (where h.club is not null), '{}'),
         bool_or(h.link_method = 'name_yob_unique')
  from hits h
  group by h.gkey
  order by max(h.event_date) desc nulls last, count(*) desc
  limit least(greatest(coalesce(lim, 20), 1), 50)
$$;

create or replace function public.runner_results(p_runner_key text)
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
  select d.id, d.name, d.event_date, d.city, d.distance_km, d.time_seconds,
         d.position_total, d.position_category, d.category, d.club, d.source, d.result_url, d.scope
  from (
    select distinct on (r.event_id, coalesce(r.time_seconds::text, r.id::text))       -- ten sam wynik zapisany dwa razy (różne numery startowe) pokazujemy raz
           r.id, e.name, e.event_date, e.city, e.distance_km, r.time_seconds,
           r.position_total, r.position_category, r.category, r.club, r.source, r.result_url, r.scope, r.created_at
    from public.race_results r
    join public.race_events  e on e.id = r.event_id
    where coalesce(r.runner_key, r.person_ref, 'k:' || r.name_key || '|' || coalesce(r.yob::text, '')) = p_runner_key
    order by r.event_id, coalesce(r.time_seconds::text, r.id::text), (r.person_ref is not null) desc, r.created_at
  ) d
  order by d.event_date desc nulls last, d.created_at desc
  limit 1000
$$;

revoke all on function public.search_runners(text, int), public.runner_results(text) from public, anon;
grant execute on function public.search_runners(text, int), public.runner_results(text) to authenticated;

notify pgrst, 'reload schema';
commit;
