CREATE OR REPLACE FUNCTION public.gra_liczba(j jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric end $function$
