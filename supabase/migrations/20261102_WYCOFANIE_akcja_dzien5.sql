-- WYCOFANIE 20261102_akcja_dzien5.sql — zdejmuje crony, wyzwalacz pushu startu, RPC dotarcia i zamknięcia, kolumny flag.
-- ⚠️ koniec wpisany przez akcja_zamknij_dobe ZOSTAJE (to fakt — okno akcji zamknięte). akcja_proba_reset wraca do wersji
--    z 20261102_akcje (bez czyszczenia flag).
begin;
select cron.unschedule('akcja-zamkniecie') where exists (select 1 from cron.job where jobname = 'akcja-zamkniecie');
select cron.unschedule('akcja-niedziela') where exists (select 1 from cron.job where jobname = 'akcja-niedziela');
drop trigger if exists akcje_push_start on public.akcje;
drop function if exists public.akcje_push_start();
drop function if exists public.akcja_zamknij_dobe();
drop function if exists public.akcja_dotarlismy(text);
create or replace function public.akcja_proba_reset()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare a public.akcje;
begin
  select * into a from public.akcje where slug = 'proba' and testowa;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_proba_reset: tylko startujący' using errcode = '42501';
  end if;
  update public.akcje set wystartowala_at = null, wyprawa_dotarla_at = null where id = a.id;
  return public.akcja_licznik('proba');
end $fn$;
alter table public.akcje drop column if exists push_zamkniecie_at;
alter table public.akcje drop column if exists push_start_at;
notify pgrst, 'reload schema';
commit;
