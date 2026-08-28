CREATE OR REPLACE FUNCTION public.notify_filip_new_athlete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _filip_coach   uuid := 'bd9cbbac-c98d-4ac7-8610-9daf754b2de5';
  _filip_athlete uuid := '56092926-2cf1-44b6-952f-38614497fdc2';
  _kto  text;
  _skad text;
BEGIN
  IF NEW.id = _filip_athlete THEN RETURN NEW; END IF;

  _kto := COALESCE(NULLIF(TRIM(NEW.full_name), ''), 'Nowy użytkownik');
  _skad := CASE
    WHEN NEW.coach_id = _filip_coach THEN 'Twój zawodnik'
    WHEN NEW.coach_id IS NULL        THEN 'rejestracja społecznościowa (bez trenera)'
    ELSE 'zawodnik innego trenera'
  END;

  INSERT INTO notifications (athlete_id, from_athlete_id, type, message)
  VALUES (_filip_athlete, NEW.id, 'new_athlete',
          'Nowa rejestracja: ' || _kto || ' — ' || _skad);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_filip_new_athlete failed: %', SQLERRM;
  RETURN NEW;
END;
$function$
