CREATE OR REPLACE FUNCTION public.akcja_moje_dni(p_slug text)
 RETURNS date[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_ja uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if auth.uid() is null then raise exception 'akcja_moje_dni: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null or a.wystartowala_at is null then return '{}'::date[]; end if;
  if a.testowa and not (v_ja = any (coalesce(a.konta_testowe, '{}'::uuid[]))) then return '{}'::date[]; end if;
  return coalesce((
    select array_agg(distinct (l.logged_at at time zone 'Europe/Warsaw')::date)
    from public.training_logs l
    where l.athlete_id = v_ja and l.distance_km > 0
      and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
      and public.akcja_typ_liczy(l.training_type, l.external_type)
      and (l.logged_at at time zone 'Europe/Warsaw')::date between a.start and least(coalesce(a.koniec, v_dzis), v_dzis)), '{}'::date[]);
end $function$
