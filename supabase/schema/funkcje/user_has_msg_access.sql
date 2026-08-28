CREATE OR REPLACE FUNCTION public.user_has_msg_access(_athlete_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM athletes a 
    WHERE a.id = _athlete_id 
      AND (a.user_id = auth.uid() OR a.coach_id = auth.uid())
  );
$function$
