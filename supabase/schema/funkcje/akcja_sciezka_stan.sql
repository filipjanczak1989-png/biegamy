CREATE OR REPLACE FUNCTION public.akcja_sciezka_stan()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; u public.akcja_ulica;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_sciezka_stan: tylko trener' using errcode = '42501'; end if;
  select * into a from public.akcje where slug = 'proba' and testowa;
  if not found then raise exception 'akcja_sciezka_stan: brak akcji próbnej' using errcode = 'P0002'; end if;
  select * into u from public.akcja_ulica where akcja_slug = 'proba';
  return jsonb_build_object('wystartowala', a.wystartowala_at is not null, 'wystartowala_at', a.wystartowala_at, 'dotarla', a.wyprawa_dotarla_at is not null, 'sym_km', a.proba_sym_km,
    'kwota_proc', case when u.cel_zl > 0 then round(coalesce(u.kwota_zl, 0) / u.cel_zl * 100) end,
    'firmy', (select count(*) from public.akcja_firmy f where f.akcja_slug = 'proba' and not f.ukryta),
    'firmy_ukryte', (select count(*) from public.akcja_firmy f where f.akcja_slug = 'proba' and f.ukryta),
    'zgloszenia_nowe', (select count(*) from public.akcja_firmy_zgloszenia z where z.status = 'nowe'),
    'formularz', a.firmy_zgloszenia);
end $function$
