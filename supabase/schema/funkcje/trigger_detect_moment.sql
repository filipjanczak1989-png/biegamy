CREATE OR REPLACE FUNCTION public.trigger_detect_moment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
DECLARE hook_secret text; pub_key text; r record; n int := 0;
BEGIN
  SELECT decrypted_secret INTO hook_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret';
  SELECT decrypted_secret INTO pub_key    FROM vault.decrypted_secrets WHERE name = 'publishable_key';

  -- Jedna instrukcja = jedno wywołanie na zawodnika. Trigger i tak przekazuje wyłącznie
  -- athlete_id, a EF przelicza całą historię, więc N wywołań z jednej paczki liczyło
  -- N razy dokładnie to samo. Import 2500 wierszy z zegarka: było 2500, jest 1.
  FOR r IN
    SELECT DISTINCT athlete_id FROM nowe
    WHERE athlete_id IS NOT NULL
      AND training_type NOT LIKE '__badge__%'
  LOOP
    PERFORM net.http_post(
      url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/detect-moment',
      headers := jsonb_build_object('Content-Type','application/json','apikey', pub_key, 'x-push-secret', hook_secret),
      body    := jsonb_build_object('athlete_id', r.athlete_id)
    );
    n := n + 1;
  END LOOP;

  RAISE LOG '[detect] dispatch dla % zawodnikow', n;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.security_events(severity, source, message, details)
  VALUES ('critical','trigger_detect_moment','detect dispatch failed',
          jsonb_build_object('sqlerrm', SQLERRM));
  RETURN NULL;
END; $function$
