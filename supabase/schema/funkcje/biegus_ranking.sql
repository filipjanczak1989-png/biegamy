CREATE OR REPLACE FUNCTION public.biegus_ranking()
 RETURNS TABLE(imie text, km numeric, gwiazdki integer, etapy integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    left(coalesce(nullif(zapis->>'imie',''),'Bieguś'),24)              as imie,
    coalesce((zapis->>'laczneKm')::numeric,0)                          as km,
    coalesce((select count(*)::int
              from jsonb_object_keys(coalesce(zapis->'gwiazdki','{}'::jsonb))),0) as gwiazdki,
    coalesce(jsonb_array_length(coalesce(zapis->'ukonczone','[]'::jsonb)),0)      as etapy
  from public.biegus_most
  where zapis is not null
  order by km desc, gwiazdki desc
  limit 20;
$function$
