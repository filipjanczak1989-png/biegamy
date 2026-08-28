CREATE OR REPLACE FUNCTION public.jr_get_my_biegamy_athlete_id()
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select id from athletes where user_id = auth.uid() limit 1;
$function$
