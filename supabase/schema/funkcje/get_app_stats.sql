CREATE OR REPLACE FUNCTION public.get_app_stats()
 RETURNS TABLE(total_count bigint, today_count bigint, week_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::BIGINT,
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::BIGINT,
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT
  FROM athletes WHERE auth_is_coach();
$function$
