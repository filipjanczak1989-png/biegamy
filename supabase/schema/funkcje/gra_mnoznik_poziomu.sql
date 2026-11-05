CREATE OR REPLACE FUNCTION public.gra_mnoznik_poziomu(p_poziom integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ select least(4.23, 1 + 0.17 * (greatest(coalesce(p_poziom, 1), 1) - 1)) $function$
