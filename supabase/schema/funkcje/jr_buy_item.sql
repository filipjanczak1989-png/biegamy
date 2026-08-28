CREATE OR REPLACE FUNCTION public.jr_buy_item(p_item_key text, p_athlete_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_player_id uuid;
  v_player_kapital int;
  v_item_price int;
  v_item record;
  v_existing_count int;
  v_equipment_id uuid;
begin
  -- Sprawdź profil gracza
  select id, kapital into v_player_id, v_player_kapital
  from jr_players where user_id = auth.uid();
  if v_player_id is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;

  -- Sprawdź czy athlete należy do gracza
  perform 1 from jr_athletes where id = p_athlete_id and player_id = v_player_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'athlete_not_yours'); end if;

  -- Sprawdź item
  select * into v_item from jr_shop_items where item_key = p_item_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'item_not_found'); end if;

  -- Sprawdź czy stać
  if v_player_kapital < v_item.price then
    return jsonb_build_object('ok', false, 'error', 'not_enough_kapital', 'needed', v_item.price, 'have', v_player_kapital);
  end if;

  -- Sprawdź czy już ma ten przedmiot (allow multiple shoes — można mieć kilka par)
  select count(*) into v_existing_count from jr_equipment
  where athlete_id = p_athlete_id and item_key = p_item_key;

  -- Klapki są darmowe i jednorazowe
  if p_item_key = 'klapki_kubota' and v_existing_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;

  -- Pobierz kapitał
  if v_item.price > 0 then
    update jr_players set kapital = kapital - v_item.price where id = v_player_id;
  end if;

  -- Dodaj do equipment (nowy egzemplarz)
  insert into jr_equipment (athlete_id, item_key, durability)
  values (p_athlete_id, p_item_key, v_item.durability_max)
  returning id into v_equipment_id;

  return jsonb_build_object(
    'ok', true,
    'equipment_id', v_equipment_id,
    'item_key', p_item_key,
    'remaining_kapital', v_player_kapital - v_item.price
  );
end;
$function$
