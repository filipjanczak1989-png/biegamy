CREATE OR REPLACE FUNCTION public.search_food_by_name(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, display_name text, brand text, kcal_per_100 real, protein_g_per_100 real, carbs_g_per_100 real, fat_g_per_100 real, fiber_g_per_100 real, serving_unit text, image_url text, source text, hit_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q text;
BEGIN
  q := lower(trim(p_query));
  IF q = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    fd.id, fd.display_name, fd.brand,
    fd.kcal_per_100, fd.protein_g_per_100, fd.carbs_g_per_100, fd.fat_g_per_100,
    fd.fiber_g_per_100, fd.serving_unit, fd.image_url, fd.source, fd.hit_count
  FROM food_database fd
  WHERE 
    fd.name_normalized LIKE '%' || q || '%'
    OR lower(fd.display_name) LIKE '%' || q || '%'
  ORDER BY 
    CASE WHEN fd.name_normalized = q THEN 0
         WHEN fd.name_normalized LIKE q || '%' THEN 1
         WHEN lower(fd.display_name) LIKE q || '%' THEN 2
         ELSE 3 END,
    fd.hit_count DESC,
    fd.fetched_at DESC
  LIMIT p_limit;
END;
$function$
