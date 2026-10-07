CREATE OR REPLACE FUNCTION public.suma_biegowa(p_athlete_id uuid, p_od timestamp with time zone, p_do timestamp with time zone)
 RETURNS TABLE(suma numeric, ile integer, najdluzszy numeric, sekundy bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and public.is_run_type(t.training_type);
$function$
