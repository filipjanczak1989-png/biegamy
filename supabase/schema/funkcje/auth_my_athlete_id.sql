CREATE OR REPLACE FUNCTION public.auth_my_athlete_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.athletes WHERE user_id = auth.uid() LIMIT 1;
$function$
