CREATE OR REPLACE FUNCTION public.trigger_send_push()
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
    url := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','apikey', pub_key, 'x-push-secret', hook_secret),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.security_events(severity, source, message, details)
  VALUES ('critical','trigger_send_push','push dispatch failed', jsonb_build_object('sqlerrm', SQLERRM, 'notification_id', NEW.id));
  RETURN NEW;
END; $function$
