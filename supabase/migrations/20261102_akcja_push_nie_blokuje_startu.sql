-- PROJEKT F — audyt 2.11 (OK Filipa 2.11 wieczorem), pkt 4 i 7:
--   4. akcje_push_start: wyjątek z net.http_post / odczytu Vault NIE cofa startu (AFTER UPDATE w transakcji akcja_start —
--      do dziś rollback wystartowala_at, telefon dostawał błąd ≠ 42501/22023 i ponawiał bez końca). Start ważniejszy niż push.
--      Cena: bez pushu nikt nie dostanie powiadomienia, trigger nie odpali drugi raz — ręcznie: EF akcja-push {rodzaj:'start', slug}.
--   7. akcja_km_okna: jawny EXECUTE dla service_role (share-card karta akcji, akcja-push niedziela) — dotąd tylko z default ACL.
-- Test: tools/akcje-test-transakcji.sql część 12 (net.http_post przemianowane w transakcji → start zapisany, ostrzeżenie zamiast błędu).
-- Wycofanie: 20261102_WYCOFANIE_akcja_push_nie_blokuje_startu.sql.
begin;

create or replace function public.akcje_push_start()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
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
end $fn$;

grant execute on function public.akcja_km_okna(uuid, date, date, uuid[]) to service_role;

do $$
begin
  if position('exception when others' in pg_get_functiondef('public.akcje_push_start()'::regprocedure)) = 0 then raise exception 'push_start: brak osłony'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'akcje_push_start' and not tgisinternal) then raise exception 'push_start: wyzwalacz zniknął'; end if;
  if not has_function_privilege('service_role', 'public.akcja_km_okna(uuid, date, date, uuid[])', 'execute') then raise exception 'km_okna: service_role'; end if;
  if has_function_privilege('authenticated', 'public.akcja_km_okna(uuid, date, date, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.akcja_km_okna(uuid, date, date, uuid[])', 'execute') then raise exception 'km_okna: authenticated/anon'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
