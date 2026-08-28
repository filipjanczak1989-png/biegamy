CREATE OR REPLACE FUNCTION public.jr_can_perform_actions()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'anna_call',     case when last_anna_call_at is null or last_anna_call_at < now() - interval '24 hours' then true else false end,
    'mama_prayer',   case when last_mama_prayer_at is null or last_mama_prayer_at < now() - interval '24 hours' then true else false end,
    'mietek_drink',  case when last_mietek_drink_at is null or last_mietek_drink_at < now() - interval '24 hours' then true else false end,
    'burek_walk',    case when last_burek_walk_at is null or last_burek_walk_at < now() - interval '8 hours' then true else false end,
    'read',          case when last_read_at is null or last_read_at < now() - interval '12 hours' then true else false end,
    'anna_next',     case when last_anna_call_at is null then null else last_anna_call_at + interval '24 hours' end,
    'mama_next',     case when last_mama_prayer_at is null then null else last_mama_prayer_at + interval '24 hours' end,
    'mietek_next',   case when last_mietek_drink_at is null then null else last_mietek_drink_at + interval '24 hours' end,
    'burek_next',    case when last_burek_walk_at is null then null else last_burek_walk_at + interval '8 hours' end,
    'read_next',     case when last_read_at is null then null else last_read_at + interval '12 hours' end,
    'current_day',   current_day,
    'actions_today', actions_today
  )
  from jr_players where user_id = auth.uid();
$function$
