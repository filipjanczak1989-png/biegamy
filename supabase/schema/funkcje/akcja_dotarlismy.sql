CREATE OR REPLACE FUNCTION public.akcja_dotarlismy(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
