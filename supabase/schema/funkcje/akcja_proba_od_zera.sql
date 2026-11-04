CREATE OR REPLACE FUNCTION public.akcja_proba_od_zera()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_proba_od_zera: tylko trener' using errcode = '42501'; end if;
  select * into a from public.akcje where slug = 'proba' and testowa for update;
  if not found then raise exception 'akcja_proba_od_zera: brak akcji próbnej' using errcode = 'P0002'; end if;
  update public.akcje set wystartowala_at = null, push_start_at = null, push_zamkniecie_at = null, wyprawa_dotarla_at = null, koniec = null, proba_sym_km = 0 where id = a.id;
  delete from public.akcja_cegielki where akcja_slug = 'proba';
  delete from public.akcja_ulica where akcja_slug = 'proba';
  update public.akcja_firmy set ukryta = true where akcja_slug = 'proba';
  delete from public.akcja_wyprawa_slad where akcja_id = a.id;
  delete from public.akcja_sponsorzy where akcja_id = a.id;
  delete from public.achievements where athlete_id = any(coalesce(a.konta_testowe, '{}'::uuid[])) and badge_id like 'akcja-%';
  return public.akcja_sciezka_stan();
end $function$
