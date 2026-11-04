CREATE OR REPLACE FUNCTION public.gra_suma_cegiel(p_konto uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select coalesce(sum(w.cegly), 0)::bigint from public.gra_wyniki w where w.athlete_id = p_konto $function$
