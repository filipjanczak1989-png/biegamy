-- UŻYCIE Janusz Run (READ-ONLY) — kto gra, od kiedy, ostatnia aktywność
select 'gracz' as co,
       p.id::text as a,
       coalesce(a.full_name, '(brak athletes dla user_id)') as b,
       'created='||p.created_at::date||' day='||coalesce(p.current_day::text,'-')||' phase='||coalesce(p.current_phase::text,'-')||' day_started='||coalesce(p.day_started_at::date::text,'-') as c
from public.jr_players p left join public.athletes a on a.user_id = p.user_id
union all
select 'jr_athletes', ja.id::text, 'player='||ja.player_id::text, 'created='||ja.created_at::date||' phase='||coalesce(ja.current_phase::text,'-')||' energia_upd='||coalesce(ja.energia_updated_at::date::text,'-') from public.jr_athletes ja
union all
select 'jr_runs', 'n='||count(*)::text, 'pierwszy='||coalesce(min(completed_at)::date::text,'-'), 'ostatni='||coalesce(max(completed_at)::date::text,'-')||' km='||coalesce(sum(actual_distance_km)::text,'0') from public.jr_runs
union all
select 'jr_achievements', 'n='||count(*)::text, 'ostatnie='||coalesce(max(unlocked_at)::date::text,'-'), string_agg(achievement_key, ',') from public.jr_achievements
union all
select 'jr_equipment', 'n='||count(*)::text, string_agg(item_key||'(eq='||is_equipped::text||')', ','), 'ostatnie='||coalesce(max(acquired_at)::date::text,'-') from public.jr_equipment
union all
select 'logi', 'actions='||(select count(*) from public.jr_actions_log)::text, 'events='||(select count(*) from public.jr_events_log)::text, 'strava_bon='||(select count(*) from public.jr_strava_bonuses)::text||' workout_bon='||(select count(*) from public.jr_workout_bonuses)::text
union all
select 'katalogi', 'achievements_catalog='||(select count(*) from public.jr_achievements_catalog)::text, 'shop_items='||(select count(*) from public.jr_shop_items)::text, ''
order by 1,2;
