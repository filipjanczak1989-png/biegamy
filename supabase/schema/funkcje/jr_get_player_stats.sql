CREATE OR REPLACE FUNCTION public.jr_get_player_stats()
 RETURNS TABLE(total_workouts_bonused integer, total_km_real numeric, total_morale_gained integer, last_bonus_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select
    count(*)::int as total_workouts_bonused,
    coalesce(sum(distance_km), 0)::numeric as total_km_real,
    coalesce(sum((bonus_value->>'morale')::int), 0)::int as total_morale_gained,
    max(applied_at) as last_bonus_at
  from jr_workout_bonuses
  where player_id in (select id from jr_players where user_id = auth.uid());
$function$
