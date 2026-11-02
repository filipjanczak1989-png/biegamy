CREATE OR REPLACE FUNCTION public.wynik_zgloszony_dopasuj(p_id uuid, p_result_id text, p_czas_s integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_ath uuid; v_czas integer;
begin
  if auth.uid() is null then raise exception 'brak sesji' using errcode = '42501'; end if;
  if p_result_id !~ '^[A-Za-z0-9:._-]{1,120}$' or p_czas_s is null or p_czas_s not between 60 and 360000 then raise exception 'złe dane' using errcode = '22023'; end if;
  select athlete_id, czas_s into v_ath, v_czas from public.wyniki_zgloszone where id = p_id;
  if v_ath is null then raise exception 'brak wiersza' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.athletes a where a.id = v_ath and (a.user_id = auth.uid() or a.coach_id = auth.uid())) then
    raise exception 'nie Twój wynik' using errcode = '42501'; end if;
  perform set_config('biegamy.wz_rpc', '1', true);
  update public.wyniki_zgloszone set stan = 'zastapiony', oficjalny_result_id = p_result_id, oficjalny_czas_s = p_czas_s,
    roznica_pct = round(abs(v_czas - p_czas_s)::numeric / p_czas_s * 100, 2), dopasowano_at = now() where id = p_id;
  perform set_config('biegamy.wz_rpc', '', true);
end $function$
