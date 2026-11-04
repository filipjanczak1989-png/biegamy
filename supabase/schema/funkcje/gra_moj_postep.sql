CREATE OR REPLACE FUNCTION public.gra_moj_postep()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('cegly', s.c, 'poziom', public.gra_poziom(s.c))
    from (select public.gra_suma_cegiel(public.auth_my_athlete_id()) c) s
$function$
