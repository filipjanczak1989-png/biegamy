CREATE OR REPLACE FUNCTION public.jr_get_shop(p_athlete_id uuid)
 RETURNS TABLE(item_key text, name text, category text, price integer, image_file text, description text, flavor_text text, tempo_modifier_pct integer, durability_max integer, sort_order integer, owned_count integer, best_durability integer, is_equipped boolean, equipment_id uuid)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select
    s.item_key, s.name, s.category, s.price, s.image_file, s.description, s.flavor_text,
    s.tempo_modifier_pct, s.durability_max, s.sort_order,
    coalesce(e.cnt, 0)::int as owned_count,
    coalesce(e.best_dur, 0)::int as best_durability,
    coalesce(e.equipped, false) as is_equipped,
    e.equipped_id as equipment_id
  from jr_shop_items s
  left join lateral (
    select
      count(*)::int as cnt,
      max(durability) as best_dur,
      bool_or(is_equipped) as equipped,
      (select id from jr_equipment ie where ie.athlete_id = p_athlete_id and ie.item_key = s.item_key and ie.is_equipped = true limit 1) as equipped_id
    from jr_equipment
    where athlete_id = p_athlete_id and item_key = s.item_key
  ) e on true
  where p_athlete_id in (
    select a.id from jr_athletes a
    join jr_players p on p.id = a.player_id
    where p.user_id = auth.uid()
  )
  order by s.sort_order;
$function$
