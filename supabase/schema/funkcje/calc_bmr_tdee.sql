CREATE OR REPLACE FUNCTION public.calc_bmr_tdee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.sex = 'M' THEN
    NEW.bmr := ROUND(10 * NEW.weight_kg + 6.25 * NEW.height_cm - 5 * NEW.age + 5);
  ELSE
    NEW.bmr := ROUND(10 * NEW.weight_kg + 6.25 * NEW.height_cm - 5 * NEW.age - 161);
  END IF;
  NEW.tdee := ROUND(NEW.bmr * NEW.activity_level);
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
