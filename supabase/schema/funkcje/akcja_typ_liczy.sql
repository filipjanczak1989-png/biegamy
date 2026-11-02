CREATE OR REPLACE FUNCTION public.akcja_typ_liczy(p_typ text, p_ext text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(public.is_run_type(p_typ)
                  or lower(btrim(p_typ)) = any (array['wzmacniający', 'spacer', 'marsz', 'nordic walking', 'nordic', 'wędrówka']), false)
     and (p_ext is null or btrim(p_ext) = '' or p_ext = any (array['Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Walk', 'Hike', 'NordicWalk']));
$function$
