-- WYCOFANIE 20261102_akcja_push_nie_blokuje_startu.sql (wyzwalacz = migawka sprzed zmiany; grant service_role zostaje z default ACL).
begin;
create or replace function public.akcje_push_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.wystartowala_at is null and new.wystartowala_at is not null and new.push_start_at is null then
    perform net.http_post(
      url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-push',
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
      body    := jsonb_build_object('rodzaj', 'start', 'slug', new.slug));
  end if;
  return new;
end $function$;
revoke execute on function public.akcja_km_okna(uuid, date, date, uuid[]) from service_role;
notify pgrst, 'reload schema';
commit;
