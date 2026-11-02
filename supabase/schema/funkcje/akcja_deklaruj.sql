CREATE OR REPLACE FUNCTION public.akcja_deklaruj(p_slug text, p_stawka_gr integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_ja uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if auth.uid() is null then raise exception 'akcja_deklaruj: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null then raise exception 'akcja_deklaruj: nie ma takiej akcji' using errcode = '22023'; end if;
  if p_stawka_gr is null or p_stawka_gr < 1 or p_stawka_gr > 10000 then
    raise exception 'akcja_deklaruj: stawka % gr poza zakresem 1–10000', p_stawka_gr using errcode = '22023'; end if;
  if a.wystartowala_at is null or v_dzis < a.start or (a.koniec is not null and v_dzis > a.koniec)
     or (a.testowa and not (v_ja = any(coalesce(a.konta_testowe, '{}'::uuid[])))) then
    raise exception 'akcja_deklaruj: poza oknem akcji' using errcode = '22023'; end if;
  insert into public.akcja_sponsorzy (akcja_id, athlete_id, stawka_gr) values (a.id, v_ja, p_stawka_gr)
    on conflict (akcja_id, athlete_id) do update set stawka_gr = excluded.stawka_gr;
  insert into public.achievements (athlete_id, badge_id) values (v_ja, 'akcja-sponsor')
    on conflict (athlete_id, badge_id) do nothing;
  return public.akcja_moj_wklad(p_slug);
end $function$
