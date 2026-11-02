CREATE OR REPLACE FUNCTION public.akcje_push_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.wystartowala_at is null and new.wystartowala_at is not null and new.push_start_at is null then
    begin
      perform net.http_post(
        url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-push',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
        body    := jsonb_build_object('rodzaj', 'start', 'slug', new.slug));
    exception when others then
      raise warning 'akcje_push_start: push nie wysłany (%), start zapisany', sqlerrm;   -- start ważniejszy niż push (audyt 2.11)
    end;
  end if;
  return new;
end $function$
