CREATE OR REPLACE FUNCTION public.auth_is_coach()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.coaches WHERE id = auth.uid());
$function$
