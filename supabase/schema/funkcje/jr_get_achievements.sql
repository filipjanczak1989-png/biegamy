CREATE OR REPLACE FUNCTION public.jr_get_achievements()
 RETURNS TABLE(achievement_key text, name text, description text, image_file text, sort_order integer, is_hidden boolean, reward_kapital integer, reward_morale integer, unlocked boolean, unlocked_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select
    c.achievement_key, c.name, c.description, c.image_file, c.sort_order, c.is_hidden,
    c.reward_kapital, c.reward_morale,
    (a.id is not null) as unlocked,
    a.unlocked_at
  from jr_achievements_catalog c
  left join jr_achievements a
    on a.achievement_key = c.achievement_key
    and a.player_id in (select id from jr_players where user_id = auth.uid())
  order by c.sort_order;
$function$
