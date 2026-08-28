CREATE OR REPLACE FUNCTION public.lookup_food_by_barcode(p_barcode text)
 RETURNS TABLE(id uuid, display_name text, brand text, kcal_per_100 real, protein_g_per_100 real, carbs_g_per_100 real, fat_g_per_100 real, fiber_g_per_100 real, sugar_g_per_100 real, salt_g_per_100 real, saturated_fat_g_per_100 real, serving_unit text, image_url text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    fd.id, fd.display_name, fd.brand,
    fd.kcal_per_100, fd.protein_g_per_100, fd.carbs_g_per_100, fd.fat_g_per_100,
    fd.fiber_g_per_100, fd.sugar_g_per_100, fd.salt_g_per_100, fd.saturated_fat_g_per_100,
    fd.serving_unit, fd.image_url, fd.source
  FROM food_database fd
  WHERE fd.barcode = trim(p_barcode)
  LIMIT 1;
END;
$function$
