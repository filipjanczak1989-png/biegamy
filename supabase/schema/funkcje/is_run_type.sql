CREATE OR REPLACE FUNCTION public.is_run_type(p_typ text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select lower(btrim(p_typ)) = ANY (ARRAY[
    'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
    'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'
  ]);
$function$
