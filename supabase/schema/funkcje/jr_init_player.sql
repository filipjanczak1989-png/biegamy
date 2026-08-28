CREATE OR REPLACE FUNCTION public.jr_init_player(p_coach_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_player_id uuid;
  v_athlete_id uuid;
begin
  -- Sprawdź czy już istnieje
  select id into v_player_id
  from jr_players
  where user_id = auth.uid();
  
  if v_player_id is not null then
    return v_player_id;
  end if;
  
  -- Stwórz gracza
  insert into jr_players (user_id, coach_name)
  values (auth.uid(), coalesce(p_coach_name, 'Trener'))
  returning id into v_player_id;
  
  -- Stwórz Janusza
  insert into jr_athletes (
    player_id, name, surname, avatar, age, hometown, is_main_character,
    backstory, relationships
  ) values (
    v_player_id, 'Janusz', 'Kowalczyk', 'janusz_default', 47, 'Hrubieszów', true,
    '{"weight_kg": 112, "promise_to": "Anna (daughter)", "occupation": "ślusarz"}'::jsonb,
    '{"anna": "daughter", "mietek": "neighbor_rival", "burek": "dog", "heniu": "future_mentor"}'::jsonb
  ) returning id into v_athlete_id;
  
  return v_player_id;
end;
$function$
