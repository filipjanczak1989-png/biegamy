-- BACKUP READ-ONLY przed fazą 2 kasacji Janusz Run (SQL Editor, rola postgres) — 07.10.2026.
-- Jeden jsonb na tabelę → zapisać każdą komórkę do pliku jr_<tabela>-2026-10-07.json POZA repo
-- (jr_players.user_id = Filip; jr_athletes ma backstory/avatar). WYCOFANIE bez tych plików = puste tabele.
-- Oczekiwane liczby (7.10): achievements 4, achievements_catalog 10, actions_log 0, athletes 1, equipment 1,
-- events_log 0, players 1, runs 37, shop_items 5, strava_bonuses 0, workout_bonuses 0.

-- 1. jr_shop_items
select jsonb_agg(to_jsonb(x)) as jr_shop_items_backup from public.jr_shop_items x;

-- 2. jr_achievements_catalog
select jsonb_agg(to_jsonb(x)) as jr_achievements_catalog_backup from public.jr_achievements_catalog x;

-- 3. jr_players
select jsonb_agg(to_jsonb(x)) as jr_players_backup from public.jr_players x;

-- 4. jr_athletes
select jsonb_agg(to_jsonb(x)) as jr_athletes_backup from public.jr_athletes x;

-- 5. jr_achievements
select jsonb_agg(to_jsonb(x)) as jr_achievements_backup from public.jr_achievements x;

-- 6. jr_actions_log
select jsonb_agg(to_jsonb(x)) as jr_actions_log_backup from public.jr_actions_log x;

-- 7. jr_strava_bonuses
select jsonb_agg(to_jsonb(x)) as jr_strava_bonuses_backup from public.jr_strava_bonuses x;

-- 8. jr_workout_bonuses
select jsonb_agg(to_jsonb(x)) as jr_workout_bonuses_backup from public.jr_workout_bonuses x;

-- 9. jr_equipment
select jsonb_agg(to_jsonb(x)) as jr_equipment_backup from public.jr_equipment x;

-- 10. jr_events_log
select jsonb_agg(to_jsonb(x)) as jr_events_log_backup from public.jr_events_log x;

-- 11. jr_runs
select jsonb_agg(to_jsonb(x)) as jr_runs_backup from public.jr_runs x;

-- 12. kontrola liczb
select relname, (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.'||relname, false, true, '')))[1]::text as wierszy
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'jr\_%' order by 1;
