CREATE OR REPLACE FUNCTION public.akcja_start(p_slug text, p_nacisnieto_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_t timestamptz := now();
begin
  select * into a from public.akcje where slug = p_slug for update;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_start: tylko startujący' using errcode = '42501';
  end if;
  if a.wystartowala_at is not null then return public.akcja_licznik(p_slug); end if;

  if p_nacisnieto_at is not null
     and p_nacisnieto_at <= now() + interval '2 minutes'
     and p_nacisnieto_at >= now() - interval '1 day'
     and (a.okno_startu_od is null or p_nacisnieto_at >= a.okno_startu_od)
     and (a.okno_startu_do is null or p_nacisnieto_at <= a.okno_startu_do) then
    v_t := p_nacisnieto_at;
  end if;
  if (a.okno_startu_od is not null and v_t < a.okno_startu_od) or (a.okno_startu_do is not null and v_t > a.okno_startu_do) then
    raise exception 'akcja_start: poza oknem startu' using errcode = '22023';
  end if;

  update public.akcje
     set wystartowala_at = v_t,
         start = case when testowa then (v_t at time zone 'Europe/Warsaw')::date else start end
   where id = a.id and wystartowala_at is null;
  return public.akcja_licznik(p_slug);
end $function$
