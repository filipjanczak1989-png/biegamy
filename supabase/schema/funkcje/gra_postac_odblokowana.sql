CREATE OR REPLACE FUNCTION public.gra_postac_odblokowana(p_postac text, p_konto uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_postac
    when 'kasia' then true
    when 'filip' then true
    when 'rowerzysta' then coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false)
                           and public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 10
    when 'koparka' then coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false)
                        and (public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 20 or (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w) >= 12500000)
    else false end
$function$
