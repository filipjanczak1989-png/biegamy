CREATE OR REPLACE FUNCTION public.akcja_moj_wklad(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_ja uuid; v_stawka integer;
begin
  if auth.uid() is null then raise exception 'akcja_moj_wklad: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null then return null; end if;
  select stawka_gr into v_stawka from public.akcja_sponsorzy where akcja_id = a.id and athlete_id = v_ja;
  return jsonb_build_object(
    'wystartowala', a.wystartowala_at is not null,
    'km', case when a.wystartowala_at is null then null
               else round(public.akcja_km_okna(a.id, a.start, (now() at time zone 'Europe/Warsaw')::date, array[v_ja]), 2) end,
    'stawka_gr', v_stawka);
end $function$
