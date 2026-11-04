CREATE OR REPLACE FUNCTION public.akcja_firmy_do_sprawdzenia()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when public.auth_is_coach() then (select count(*)::integer from public.akcja_firmy_zgloszenia where status = 'nowe') end
$function$
