CREATE OR REPLACE FUNCTION public.akcja_url_zbiorki(p_slug text, p_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_url text := btrim(coalesce(p_url, ''));
begin
  select * into a from public.akcje where slug = p_slug for update;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_url_zbiorki: tylko startujący' using errcode = '42501';
  end if;
  if v_url !~ '^https://www\.siepomaga\.pl/[A-Za-z0-9._~/-]{1,200}$' then
    raise exception 'akcja_url_zbiorki: link musi być https://www.siepomaga.pl/…' using errcode = '22023';
  end if;
  update public.akcje set url_zbiorki = v_url where id = a.id;
  return public.akcja_licznik(p_slug);
end $function$
