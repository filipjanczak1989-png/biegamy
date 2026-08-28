CREATE OR REPLACE FUNCTION public.auto_resolve_past_event_notes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  resolved_count INTEGER;
BEGIN
  UPDATE public.coach_athlete_notes
  SET is_resolved = TRUE,
      resolved_at = NOW()
  WHERE is_resolved = FALSE
    AND tag = 'start'
    AND event_date IS NOT NULL
    AND event_date < CURRENT_DATE;
  
  GET DIAGNOSTICS resolved_count = ROW_COUNT;
  RETURN resolved_count;
END;
$function$
