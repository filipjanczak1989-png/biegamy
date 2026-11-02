CREATE OR REPLACE FUNCTION public.akcja_wycofaj_deklaracje(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_ja uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if auth.uid() is null then raise exception 'akcja_wycofaj_deklaracje: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null then raise exception 'akcja_wycofaj_deklaracje: nie ma takiej akcji' using errcode = '22023'; end if;
  if a.wystartowala_at is null or v_dzis < a.start or (a.koniec is not null and v_dzis > a.koniec) then
    raise exception 'akcja_wycofaj_deklaracje: poza oknem akcji' using errcode = '22023'; end if;
  delete from public.akcja_sponsorzy where akcja_id = a.id and athlete_id = v_ja;
  -- ⚠️ achievements NIETKNIĘTE: odznaka akcja-sponsor zostaje po wycofaniu (decyzja Filipa 2.11)
  return public.akcja_moj_wklad(p_slug);
end $function$
