CREATE OR REPLACE FUNCTION public.jr_equip_item(p_equipment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_athlete_id uuid;
  v_item_key text;
  v_category text;
  v_durability int;
begin
  -- Pobierz info o przedmiocie i sprawdź własność
  select e.athlete_id, e.item_key, s.category, e.durability
  into v_athlete_id, v_item_key, v_category, v_durability
  from jr_equipment e
  join jr_shop_items s on s.item_key = e.item_key
  join jr_athletes a on a.id = e.athlete_id
  join jr_players p on p.id = a.player_id
  where e.id = p_equipment_id and p.user_id = auth.uid();

  if v_athlete_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_yours_or_missing');
  end if;

  if v_durability <= 0 then
    return jsonb_build_object('ok', false, 'error', 'durability_zero');
  end if;

  -- Zdejmij inne przedmioty tej samej kategorii
  update jr_equipment e
  set is_equipped = false
  from jr_shop_items s
  where e.athlete_id = v_athlete_id
    and e.item_key = s.item_key
    and s.category = v_category
    and e.id <> p_equipment_id;

  -- Załóż ten
  update jr_equipment set is_equipped = true where id = p_equipment_id;

  return jsonb_build_object('ok', true, 'item_key', v_item_key);
end;
$function$
