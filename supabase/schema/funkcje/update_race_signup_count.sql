CREATE OR REPLACE FUNCTION public.update_race_signup_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE races
    SET signup_count = (SELECT COUNT(*) FROM race_signups WHERE race_id = NEW.race_id)
    WHERE id = NEW.race_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE races
    SET signup_count = (SELECT COUNT(*) FROM race_signups WHERE race_id = OLD.race_id)
    WHERE id = OLD.race_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$
