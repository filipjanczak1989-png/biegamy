CREATE OR REPLACE FUNCTION public.ensure_coach_athlete_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.athletes WHERE user_id = NEW.id) THEN INSERT INTO public.athletes (user_id, full_name, is_public) VALUES (NEW.id, COALESCE(NEW.full_name, 'Trener'), true); END IF; RETURN NEW; END; $function$
