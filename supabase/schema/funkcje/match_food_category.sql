CREATE OR REPLACE FUNCTION public.match_food_category(food_name text)
 RETURNS TABLE(category text, image_url text, matched_keyword text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized text;
BEGIN
  -- Lowercase + trim
  normalized := lower(trim(food_name));

  RETURN QUERY
  SELECT c.category, c.image_url, kw
  FROM food_image_categories c, unnest(c.keywords) AS kw
  WHERE c.is_active = true
    AND normalized LIKE '%' || kw || '%'
  ORDER BY c.display_order, length(kw) DESC
  LIMIT 1;
END;
$function$
