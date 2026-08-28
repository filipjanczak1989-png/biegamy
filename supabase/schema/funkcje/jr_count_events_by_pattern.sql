CREATE OR REPLACE FUNCTION public.jr_count_events_by_pattern(p_pattern text)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select count(*)::int
  from jr_events_log el
  join jr_athletes a on a.id = el.athlete_id
  join jr_players p on p.id = a.player_id
  where p.user_id = auth.uid()
    and el.event_key like p_pattern;
$function$
