CREATE OR REPLACE FUNCTION public.jr_check_day_reset()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_player jr_players%rowtype;
  v_athlete jr_athletes%rowtype;
begin
  select * into v_player from jr_players where user_id = auth.uid();
  if v_player.id is null then return jsonb_build_object('ok', false); end if;

  select * into v_athlete from jr_athletes
  where player_id = v_player.id and is_main_character = true limit 1;
  if v_athlete.id is null then return jsonb_build_object('ok', false); end if;

  -- Reset runs_today jeśli minęło >18h
  if v_athlete.last_run_today_reset_at is null or
     v_athlete.last_run_today_reset_at < now() - interval '18 hours' then
    update jr_athletes set
      runs_today = 0,
      last_run_today_reset_at = now()
    where id = v_athlete.id;
    return jsonb_build_object('ok', true, 'reset', true);
  end if;

  return jsonb_build_object('ok', true, 'reset', false);
end;
$function$
