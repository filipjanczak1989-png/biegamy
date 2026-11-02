CREATE OR REPLACE FUNCTION public.akcja_proba_reset()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
