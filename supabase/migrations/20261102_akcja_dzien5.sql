-- PROJEKT F dzień 5: wyprawa (szkielet), zamknięcie akcji i pushe (start / niedziela / zamknięcie). Spec v3 pkt 2–3, pkt 10.
--   akcja_dotarlismy(slug)   — startujący oznacza dotarcie wyprawy (raz; tylko po starcie). Zwraca licznik.
--   akcja_zamknij_dobe()     — WYŁĄCZNIE service_role (EF akcja-push z nocnego crona): dla każdej trwającej akcji, gdy suma
--                              do WCZORAJ (doba warszawska) >= cel → koniec = wczoraj (v2 pkt 5: koniec = dzień dobicia;
--                              kilometry z tego dnia liczą się do jego końca). Raz — potem okno zamknięte na stałe.
--   push_start_at / push_zamkniecie_at — push startu i zamknięcia RAZ (EF ustawia po wysłaniu).
--   wyzwalacz akcje_push_start — pierwsze ustawienie wystartowala_at → net.http_post do EF akcja-push {rodzaj:'start'}
--                              (także po starcie offline, gdy zapis dojdzie później). Reset próby czyści flagi.
--   cron: akcja-zamkniecie 23:15 UTC codziennie (00:15 PL zimą), akcja-niedziela nd 18:00 UTC (19:00 PL zimą; akcja do lutego).
-- Pushe: start „Ruszyło. <nazwa z bazy>. Każdy kilometr się liczy.", niedziela tylko km i % celu (rozliczenie jednorazowe —
-- bez kwot), zamknięcie „<cel> km. Dziękujemy." Próba ('proba') — tylko konta testowe.
begin;

alter table public.akcje add column push_start_at timestamptz;
alter table public.akcje add column push_zamkniecie_at timestamptz;

create function public.akcja_dotarlismy(p_slug text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje;
begin
  select * into a from public.akcje where slug = p_slug for update;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_dotarlismy: tylko startujący' using errcode = '42501';
  end if;
  if a.wystartowala_at is null then raise exception 'akcja_dotarlismy: akcja nie wystartowała' using errcode = '22023'; end if;
  update public.akcje set wyprawa_dotarla_at = now() where id = a.id and wyprawa_dotarla_at is null;
  return public.akcja_licznik(p_slug);
end $fn$;

create function public.akcja_zamknij_dobe()
returns table (slug text, suma_km numeric, cel_km numeric, koniec date)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
declare a public.akcje; v_wczoraj date := (now() at time zone 'Europe/Warsaw')::date - 1; v_suma numeric;
begin
  for a in select * from public.akcje where wystartowala_at is not null and koniec is null and start <= v_wczoraj for update loop
    v_suma := public.akcja_km_okna(a.id, a.start, v_wczoraj);
    if v_suma >= a.cel_km then
      update public.akcje set koniec = v_wczoraj where id = a.id and koniec is null;
      slug := a.slug; suma_km := round(v_suma, 2); cel_km := a.cel_km; koniec := v_wczoraj;
      return next;
    end if;
  end loop;
end $fn$;

-- reset próby czyści też flagi pushy (próba generalna 7.11 ma przejść pełną ścieżkę jeszcze raz)
create or replace function public.akcja_proba_reset()
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje;
begin
  select * into a from public.akcje where slug = 'proba' and testowa;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_proba_reset: tylko startujący' using errcode = '42501';
  end if;
  update public.akcje set wystartowala_at = null, wyprawa_dotarla_at = null, koniec = null, push_start_at = null, push_zamkniecie_at = null
   where id = a.id;
  return public.akcja_licznik('proba');
end $fn$;

create function public.akcje_push_start()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  if old.wystartowala_at is null and new.wystartowala_at is not null and new.push_start_at is null then
    perform net.http_post(
      url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-push',
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
      body    := jsonb_build_object('rodzaj', 'start', 'slug', new.slug));
  end if;
  return new;
end $fn$;
create trigger akcje_push_start after update of wystartowala_at on public.akcje
  for each row execute function public.akcje_push_start();

revoke all on function public.akcja_dotarlismy(text) from public, anon, authenticated;
revoke all on function public.akcja_zamknij_dobe() from public, anon, authenticated;
revoke all on function public.akcje_push_start() from public, anon, authenticated;
revoke all on function public.akcja_proba_reset() from public, anon, authenticated;
grant execute on function public.akcja_dotarlismy(text) to authenticated;
grant execute on function public.akcja_proba_reset() to authenticated;
grant execute on function public.akcja_zamknij_dobe() to service_role;

select cron.schedule('akcja-zamkniecie', '15 23 * * *', $job$
  select net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-push',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
    body    := '{"rodzaj":"zamkniecie"}'::jsonb);
$job$);
select cron.schedule('akcja-niedziela', '0 18 * * 0', $job$
  select net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-push',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
    body    := '{"rodzaj":"niedziela"}'::jsonb);
$job$);

do $$
begin
  if has_function_privilege('anon', 'public.akcja_dotarlismy(text)', 'execute')
     or has_function_privilege('authenticated', 'public.akcja_zamknij_dobe()', 'execute')
     or has_function_privilege('anon', 'public.akcja_zamknij_dobe()', 'execute') then raise exception 'dzien5: uprawnienia'; end if;
  if not has_function_privilege('service_role', 'public.akcja_zamknij_dobe()', 'execute') then raise exception 'dzien5: service_role'; end if;
  if (select count(*) from cron.job where jobname in ('akcja-zamkniecie', 'akcja-niedziela')) <> 2 then raise exception 'dzien5: cron'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'akcje_push_start' and not tgisinternal) then raise exception 'dzien5: wyzwalacz'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
