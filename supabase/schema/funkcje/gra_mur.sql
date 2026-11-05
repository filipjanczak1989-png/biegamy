CREATE OR REPLACE FUNCTION public.gra_mur()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w)::bigint + coalesce((select p.cegly from public.gra_pierwsze_cegly p where p.slug = 'dla-fabianka'), 0) $function$
