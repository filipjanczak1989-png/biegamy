CREATE OR REPLACE FUNCTION public.count_pending_intakes()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::INTEGER FROM athlete_intake_forms WHERE status = 'submitted' AND auth_is_coach();
$function$
