CREATE OR REPLACE FUNCTION public.jr_perform_action(p_action_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_player jr_players%rowtype;
  v_athlete jr_athletes%rowtype;
  v_now timestamptz := now();
  v_cooldown_hours int;
  v_last_action_at timestamptz;
  v_effects jsonb := '{}'::jsonb;
  v_flavor text;
  v_speaker text;
  v_new_morale int;
  v_new_energia int;
  v_new_determinacja int;
  v_new_kondycja int;
  v_new_wiedza int;
begin
  -- Pobierz player
  select * into v_player from jr_players where user_id = auth.uid();
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;

  -- Pobierz głównego athlete
  select * into v_athlete from jr_athletes
  where player_id = v_player.id and is_main_character = true limit 1;
  if v_athlete.id is null then return jsonb_build_object('ok', false, 'error', 'no_athlete'); end if;

  -- Wybór akcji
  case p_action_key
    when 'anna_call' then
      v_cooldown_hours := 24;
      v_last_action_at := v_player.last_anna_call_at;
    when 'mama_prayer' then
      v_cooldown_hours := 24;
      v_last_action_at := v_player.last_mama_prayer_at;
    when 'mietek_drink' then
      v_cooldown_hours := 24;
      v_last_action_at := v_player.last_mietek_drink_at;
    when 'burek_walk' then
      v_cooldown_hours := 8;
      v_last_action_at := v_player.last_burek_walk_at;
    when 'read' then
      v_cooldown_hours := 12;
      v_last_action_at := v_player.last_read_at;
    when 'sleep' then
      v_cooldown_hours := 0;  -- sleep nie ma cooldownu
      v_last_action_at := null;
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  -- Sprawdź cooldown
  if v_last_action_at is not null and v_cooldown_hours > 0 then
    if v_now < v_last_action_at + (v_cooldown_hours || ' hours')::interval then
      return jsonb_build_object(
        'ok', false,
        'error', 'cooldown',
        'available_at', v_last_action_at + (v_cooldown_hours || ' hours')::interval
      );
    end if;
  end if;

  -- Aplikuj efekty per akcja
  case p_action_key
    when 'anna_call' then
      v_new_morale := least(100, v_athlete.morale + 15);
      v_effects := jsonb_build_object('morale', 15, 'rel_anna', 3);
      update jr_athletes set morale = v_new_morale where id = v_athlete.id;
      update jr_players set
        last_anna_call_at = v_now,
        rel_anna = least(100, rel_anna + 3),
        actions_today = actions_today + 1
      where id = v_player.id;

    when 'mama_prayer' then
      v_new_morale := least(100, v_athlete.morale + 5);
      v_new_energia := least(100, v_athlete.energia + 5);
      v_new_determinacja := greatest(0, v_athlete.determinacja - 1);
      v_effects := jsonb_build_object('morale', 5, 'energia', 5, 'determinacja', -1, 'rel_mama', 5);
      update jr_athletes set morale = v_new_morale, energia = v_new_energia, determinacja = v_new_determinacja
      where id = v_athlete.id;
      update jr_players set
        last_mama_prayer_at = v_now,
        rel_mama = least(100, rel_mama + 5),
        actions_today = actions_today + 1
      where id = v_player.id;

    when 'mietek_drink' then
      v_new_morale := greatest(0, v_athlete.morale - 5);
      v_new_energia := greatest(0, v_athlete.energia - 10);
      v_new_determinacja := least(10, v_athlete.determinacja + 2);
      v_effects := jsonb_build_object('morale', -5, 'energia', -10, 'determinacja', 2, 'rel_mietek', 8);
      update jr_athletes set morale = v_new_morale, energia = v_new_energia, determinacja = v_new_determinacja
      where id = v_athlete.id;
      update jr_players set
        last_mietek_drink_at = v_now,
        rel_mietek = least(100, rel_mietek + 8),
        actions_today = actions_today + 1
      where id = v_player.id;

    when 'burek_walk' then
      v_new_morale := least(100, v_athlete.morale + 3);
      v_new_energia := least(100, v_athlete.energia + 5);
      v_effects := jsonb_build_object('morale', 3, 'energia', 5);
      update jr_athletes set morale = v_new_morale, energia = v_new_energia where id = v_athlete.id;
      update jr_players set
        last_burek_walk_at = v_now,
        actions_today = actions_today + 1
      where id = v_player.id;

    when 'read' then
      v_new_wiedza := least(10, v_athlete.wiedza + 1);
      v_new_determinacja := least(10, v_athlete.determinacja + 1);
      v_effects := jsonb_build_object('wiedza', 1, 'determinacja', 1);
      update jr_athletes set wiedza = v_new_wiedza, determinacja = v_new_determinacja where id = v_athlete.id;
      update jr_players set last_read_at = v_now, actions_today = actions_today + 1 where id = v_player.id;

    when 'sleep' then
      -- Sleep: regeneracja + nowy dzień
      v_new_energia := least(100, v_athlete.energia + 60);
      v_new_morale := least(100, v_athlete.morale + 5);
      v_effects := jsonb_build_object('energia', 60, 'morale', 5);
      update jr_athletes set
        energia = v_new_energia,
        morale = v_new_morale,
        energia_updated_at = v_now,
        runs_today = 0,
        last_run_today_reset_at = v_now
      where id = v_athlete.id;
      update jr_players set
        current_day = current_day + 1,
        day_started_at = v_now,
        actions_today = 0
      where id = v_player.id;
  end case;

  -- Pobierz aktualne stany
  select * into v_player from jr_players where id = v_player.id;
  select * into v_athlete from jr_athletes where id = v_athlete.id;

  -- Zapisz log
  insert into jr_actions_log (player_id, action_key, effects, taken_at)
  values (v_player.id, p_action_key, v_effects, v_now);

  return jsonb_build_object(
    'ok', true,
    'action_key', p_action_key,
    'effects', v_effects,
    'new_morale', v_athlete.morale,
    'new_energia', v_athlete.energia,
    'new_determinacja', v_athlete.determinacja,
    'new_wiedza', v_athlete.wiedza,
    'new_kapital', v_player.kapital,
    'current_day', v_player.current_day,
    'actions_today', v_player.actions_today
  );
end;
$function$
