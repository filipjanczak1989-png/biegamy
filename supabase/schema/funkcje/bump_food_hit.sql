CREATE OR REPLACE FUNCTION public.bump_food_hit(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE food_database 
  SET hit_count = hit_count + 1,
      last_hit_at = now()
  WHERE id = p_id;
END;
$function$
