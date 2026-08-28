CREATE OR REPLACE FUNCTION public.jr_get_unused_training_logs(p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, logged_at timestamp with time zone, distance_km numeric, duration text, pace text, heart_rate integer, feel text, training_type text, comment text, coach_comment text)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select
    tl.id,
    tl.logged_at,
    tl.distance_km,
    tl.duration,
    tl.pace,
    tl.heart_rate,
    tl.feel,
    tl.training_type,
    tl.comment,
    tl.coach_comment
  from training_logs tl
  join athletes a on a.id = tl.athlete_id
  left join jr_workout_bonuses wb on wb.training_log_id = tl.id
    and wb.player_id in (select id from jr_players where user_id = auth.uid())
  where a.user_id = auth.uid()
    and tl.logged_at >= now() - interval '14 days'
    and wb.id is null  -- jeszcze nie odebrane
    and tl.distance_km is not null
    and tl.distance_km > 0
  order by tl.logged_at desc
  limit p_limit;
$function$
