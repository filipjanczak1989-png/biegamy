CREATE OR REPLACE FUNCTION public.jr_unlock_achievement(p_achievement_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_player_id uuid;
  v_athlete_id uuid;
  v_already_unlocked int;
  v_cat record;
begin
  select id into v_player_id from jr_players where user_id = auth.uid();
  if v_player_id is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;

  -- Sprawdź czy już odblokowany
  select count(*) into v_already_unlocked from jr_achievements
  where player_id = v_player_id and achievement_key = p_achievement_key;
  if v_already_unlocked > 0 then return jsonb_build_object('ok', false, 'already', true); end if;

  -- Pobierz catalog
  select * into v_cat from jr_achievements_catalog where achievement_key = p_achievement_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  -- Zapisz odblokowanie
  insert into jr_achievements (player_id, achievement_key)
  values (v_player_id, p_achievement_key);

  -- Nagrody: kapital + morale głównego zawodnika
  if v_cat.reward_kapital > 0 then
    update jr_players set kapital = kapital + v_cat.reward_kapital where id = v_player_id;
  end if;

  if v_cat.reward_morale > 0 then
    select id into v_athlete_id from jr_athletes
    where player_id = v_player_id and is_main_character = true limit 1;
    if v_athlete_id is not null then
      update jr_athletes set morale = least(100, morale + v_cat.reward_morale) where id = v_athlete_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'achievement_key', p_achievement_key,
    'name', v_cat.name,
    'reward_kapital', v_cat.reward_kapital,
    'reward_morale', v_cat.reward_morale,
    'image_file', v_cat.image_file
  );
end;
$function$
