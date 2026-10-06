-- WYCOFANIE 20261007_is_run_type_jedna_lista_w_bazie.sql
-- Kolejność: najpierw suma_biegowa wraca do listy INLINE (migawka prod z 7.10 00:07,
-- supabase/schema/funkcje/suma_biegowa.sql), DOPIERO potem drop is_run_type — inaczej
-- suma_biegowa padnie na brakującej funkcji przy pierwszym wywołaniu (share-card, miesiac-cron).

begin;

create or replace function public.suma_biegowa(
  p_athlete_id uuid,
  p_od         timestamptz,
  p_do         timestamptz
)
returns table (suma numeric, ile integer, najdluzszy numeric, sekundy bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(sum(t.distance_km), 0)::numeric                       as suma,
    count(*)::integer                                              as ile,
    coalesce(max(t.distance_km), 0)::numeric                       as najdluzszy,
    coalesce(sum(
      case when t.duration ~ '^[0-9]+:[0-9]{2}(:[0-9]{2})?$' then
        case when length(t.duration) - length(replace(t.duration, ':', '')) = 2
             then split_part(t.duration, ':', 1)::bigint * 3600
                + split_part(t.duration, ':', 2)::bigint * 60
                + split_part(t.duration, ':', 3)::bigint
             else split_part(t.duration, ':', 1)::bigint * 60
                + split_part(t.duration, ':', 2)::bigint
        end
      else 0 end
    ), 0)::bigint                                                  as sekundy
  from public.training_logs t
  where t.athlete_id = p_athlete_id
    and t.logged_at >= p_od
    and t.logged_at <  p_do
    and t.distance_km > 0
    and coalesce(t.training_type, '') not like '\_\_badge\_\_%'
    and lower(btrim(coalesce(t.training_type, ''))) = ANY (ARRAY[
      'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
      'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'
    ]);
$$;

revoke all on function public.suma_biegowa(uuid, timestamptz, timestamptz) from public;
revoke all on function public.suma_biegowa(uuid, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.suma_biegowa(uuid, timestamptz, timestamptz) to service_role;

drop function if exists public.is_run_type(text);

commit;
