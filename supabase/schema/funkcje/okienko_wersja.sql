CREATE OR REPLACE FUNCTION public.okienko_wersja()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when coalesce((select u.wartosc from public.okienko_ustawienia u where u.klucz = 'v2_wlaczone'), 'false') <> 'true' then 'v1'
    when coalesce((select u.wartosc from public.okienko_ustawienia u where u.klucz = 'v2_dla_wszystkich'), 'false') = 'true' then 'v2'
    when auth.uid() is not null
         and exists (select 1 from public.okienko_v2_konta k where k.athlete_id = public.auth_my_athlete_id()) then 'v2'
    else 'v1' end
$function$
