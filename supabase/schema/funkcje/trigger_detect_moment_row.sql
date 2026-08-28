CREATE OR REPLACE FUNCTION public.trigger_detect_moment_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
DECLARE hook_secret text; pub_key text;
BEGIN
  SELECT decrypted_secret INTO hook_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret';
  SELECT decrypted_secret INTO pub_key    FROM vault.decrypted_secrets WHERE name = 'publishable_key';
  PERFORM net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/detect-moment',
    headers := jsonb_build_object('Content-Type','application/json','apikey', pub_key, 'x-push-secret', hook_secret),
    body    := jsonb_build_object('athlete_id', NEW.athlete_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.security_events(severity, source, message, details)
  VALUES ('critical','trigger_detect_moment','detect dispatch failed',
          jsonb_build_object('sqlerrm', SQLERRM, 'athlete_id', NEW.athlete_id));
  RETURN NEW;
END; $function$
