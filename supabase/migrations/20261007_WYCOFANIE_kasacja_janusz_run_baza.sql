-- WYCOFANIE 20261007_kasacja_janusz_run_baza.sql — odtwarza 11 tabel, 13 funkcji, polityki i granty
-- w stanie ZMIERZONYM na prod 7.10.2026 (DDL wygenerowany z information_schema/pg_catalog, nie przepisany
-- ręcznie; funkcje 1:1 z supabase/schema/funkcje/jr_*.sql). DANYCH NIE ODTWARZA SAMO — krok 4 wymaga plików
-- z tools/backup-janusz-run.sql (jeden jsonb na tabelę), rodzice przed dziećmi.
--
-- ⚠️ Front po fazie 1 nie ma gry — wycofanie bazy ma sens tylko razem z git revert fazy 1 i deployem.
-- ⚠️ EXECUTE dla anon NIE JEST odtwarzany (na prod było: default privileges dały anonowi i PUBLIC EXECUTE
--    na wszystkich 13 funkcjach — LEKCJE #23; bramka-commit: GRANT dla anon = blokada twarda). Funkcje
--    dostają EXECUTE tylko dla authenticated i service_role; gra nigdy nie wołała ich bez logowania.
-- ⚠️ Default privileges Supabase: `create table` nadaje anonowi ALL — dlatego revoke z NAZWY po każdej tabeli.

begin;

-- 1. tabele (rodzice → dzieci), RLS, polityki, granty
-- jr_shop_items
create table if not exists public.jr_shop_items (
  item_key                  text NOT NULL,
  name                      text NOT NULL,
  category                  text NOT NULL,
  price                     integer NOT NULL default 0,
  sort_order                integer default 0,
  image_file                text,
  description               text,
  flavor_text               text,
  tempo_modifier_pct        integer default 0,
  morale_modifier           integer default 0,
  durability_max            integer default 100,
  required_phase            integer default 1,
  required_total_km         numeric(6,2) default 0,
  constraint jr_shop_items_pkey PRIMARY KEY (item_key)
);
alter table public.jr_shop_items enable row level security;
create policy jr_shop_items_read on public.jr_shop_items for select to authenticated
  using (true);
revoke all on public.jr_shop_items from public;
revoke all on public.jr_shop_items from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_shop_items to authenticated;

-- jr_achievements_catalog
create table if not exists public.jr_achievements_catalog (
  achievement_key           text NOT NULL,
  name                      text NOT NULL,
  description               text NOT NULL,
  image_file                text,
  sort_order                integer default 0,
  phase                     integer default 1,
  is_hidden                 boolean default false,
  reward_kapital            integer default 0,
  reward_morale             integer default 0,
  constraint jr_achievements_catalog_pkey PRIMARY KEY (achievement_key)
);
alter table public.jr_achievements_catalog enable row level security;
create policy jr_ach_catalog_read on public.jr_achievements_catalog for select to authenticated
  using (true);
revoke all on public.jr_achievements_catalog from public;
revoke all on public.jr_achievements_catalog from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_achievements_catalog to authenticated;

-- jr_players
create table if not exists public.jr_players (
  id                        uuid NOT NULL default gen_random_uuid(),
  user_id                   uuid NOT NULL,
  coach_name                text,
  current_phase             integer default 1,
  created_at                timestamptz default now(),
  last_active_at            timestamptz default now(),
  coach_xp                  integer default 0,
  coach_level               integer default 1,
  knowledge_physiology      integer default 1,
  knowledge_mental          integer default 1,
  knowledge_strategy        integer default 1,
  kapital                   integer default 100,
  story_flags               jsonb default '{}'::jsonb,
  intro_completed           boolean default false,
  last_anna_call_at         timestamptz,
  last_mama_prayer_at       timestamptz,
  last_mietek_drink_at      timestamptz,
  last_burek_walk_at        timestamptz,
  last_read_at              timestamptz,
  current_day               integer default 1,
  day_started_at            timestamptz default now(),
  actions_today             integer default 0,
  rel_anna                  integer default 50,
  rel_mama                  integer default 50,
  rel_mietek                integer default 30,
  rel_heniu                 integer default 0,
  rel_halinka               integer default 40,
  constraint jr_players_pkey PRIMARY KEY (id),
  constraint jr_players_user_id_key UNIQUE (user_id),
  constraint jr_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.jr_players enable row level security;
create policy jr_players_own on public.jr_players for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
revoke all on public.jr_players from public;
revoke all on public.jr_players from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_players to authenticated;

-- jr_athletes
create table if not exists public.jr_athletes (
  id                        uuid NOT NULL default gen_random_uuid(),
  player_id                 uuid NOT NULL,
  name                      text NOT NULL default 'Janusz'::text,
  surname                   text default 'Kowalczyk'::text,
  avatar                    text default 'janusz_default'::text,
  age                       integer default 47,
  hometown                  text default 'Hrubieszów'::text,
  is_main_character         boolean default false,
  current_phase             integer default 1,
  status                    text default 'training'::text,
  status_until              timestamptz,
  kondycja                  integer default 1,
  tempo_seconds             integer default 480,
  vo2max                    numeric(4,1) default 28.0,
  determinacja              integer default 3,
  morale                    integer default 50,
  energia                   integer default 100,
  energia_updated_at        timestamptz default now(),
  total_km                  numeric(7,2) default 0,
  total_runs                integer default 0,
  longest_run_km            numeric(5,2) default 0,
  fastest_5k_seconds        integer,
  fastest_10k_seconds       integer,
  fastest_half_seconds      integer,
  fastest_full_seconds      integer,
  backstory                 jsonb default '{}'::jsonb,
  relationships             jsonb default '{}'::jsonb,
  created_at                timestamptz default now(),
  wiedza                    integer default 0,
  runs_today                integer default 0,
  last_run_today_reset_at   timestamptz default now(),
  state_override            text,
  state_override_until      timestamptz,
  constraint jr_athletes_pkey PRIMARY KEY (id),
  constraint jr_athletes_player_id_fkey FOREIGN KEY (player_id) REFERENCES jr_players(id) ON DELETE CASCADE
);
create index if not exists idx_jr_athletes_player ON public.jr_athletes USING btree (player_id);
alter table public.jr_athletes enable row level security;
create policy jr_athletes_own on public.jr_athletes for all to public
  using ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))))
  with check ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))));
revoke all on public.jr_athletes from public;
revoke all on public.jr_athletes from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_athletes to authenticated;

-- jr_achievements
create table if not exists public.jr_achievements (
  id                        uuid NOT NULL default gen_random_uuid(),
  player_id                 uuid NOT NULL,
  achievement_key           text NOT NULL,
  unlocked_at               timestamptz default now(),
  constraint jr_achievements_pkey PRIMARY KEY (id),
  constraint jr_achievements_player_id_achievement_key_key UNIQUE (player_id, achievement_key),
  constraint jr_achievements_player_id_fkey FOREIGN KEY (player_id) REFERENCES jr_players(id) ON DELETE CASCADE
);
create index if not exists idx_jr_achievements_player ON public.jr_achievements USING btree (player_id);
alter table public.jr_achievements enable row level security;
create policy jr_achievements_own on public.jr_achievements for all to public
  using ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))))
  with check ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))));
revoke all on public.jr_achievements from public;
revoke all on public.jr_achievements from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_achievements to authenticated;

-- jr_actions_log
create table if not exists public.jr_actions_log (
  id                        uuid NOT NULL default gen_random_uuid(),
  player_id                 uuid NOT NULL,
  action_key                text NOT NULL,
  effects                   jsonb,
  flavor_text               text,
  flavor_speaker            text,
  taken_at                  timestamptz default now(),
  constraint jr_actions_log_pkey PRIMARY KEY (id),
  constraint jr_actions_log_player_id_fkey FOREIGN KEY (player_id) REFERENCES jr_players(id) ON DELETE CASCADE
);
create index if not exists idx_jr_actions_player ON public.jr_actions_log USING btree (player_id, taken_at DESC);
alter table public.jr_actions_log enable row level security;
create policy jr_actions_log_own on public.jr_actions_log for all to public
  using ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))))
  with check ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))));
revoke all on public.jr_actions_log from public;
revoke all on public.jr_actions_log from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_actions_log to authenticated;

-- jr_strava_bonuses
create table if not exists public.jr_strava_bonuses (
  id                        uuid NOT NULL default gen_random_uuid(),
  player_id                 uuid NOT NULL,
  strava_activity_id        bigint,
  activity_distance_km      numeric(6,2),
  activity_date             timestamptz,
  bonus_type                text,
  bonus_value               jsonb default '{}'::jsonb,
  applied_at                timestamptz default now(),
  constraint jr_strava_bonuses_pkey PRIMARY KEY (id),
  constraint jr_strava_bonuses_strava_activity_id_player_id_key UNIQUE (strava_activity_id, player_id),
  constraint jr_strava_bonuses_player_id_fkey FOREIGN KEY (player_id) REFERENCES jr_players(id) ON DELETE CASCADE
);
create index if not exists idx_jr_strava_player ON public.jr_strava_bonuses USING btree (player_id);
alter table public.jr_strava_bonuses enable row level security;
create policy jr_strava_bonuses_own on public.jr_strava_bonuses for all to public
  using ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))))
  with check ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))));
revoke all on public.jr_strava_bonuses from public;
revoke all on public.jr_strava_bonuses from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_strava_bonuses to authenticated;

-- jr_workout_bonuses
create table if not exists public.jr_workout_bonuses (
  id                        uuid NOT NULL default gen_random_uuid(),
  player_id                 uuid NOT NULL,
  training_log_id           uuid,
  workout_type              text,
  distance_km               numeric(5,2),
  duration_min              integer,
  feel                      text,
  bonus_value               jsonb,
  flavor_text               text,
  applied_at                timestamptz default now(),
  constraint jr_workout_bonuses_pkey PRIMARY KEY (id),
  constraint jr_workout_bonuses_player_id_training_log_id_key UNIQUE (player_id, training_log_id),
  constraint jr_workout_bonuses_player_id_fkey FOREIGN KEY (player_id) REFERENCES jr_players(id) ON DELETE CASCADE,
  constraint jr_workout_bonuses_training_log_id_fkey FOREIGN KEY (training_log_id) REFERENCES training_logs(id) ON DELETE CASCADE
);
create index if not exists idx_jr_workout_bonuses_log ON public.jr_workout_bonuses USING btree (training_log_id);
create index if not exists idx_jr_workout_bonuses_player ON public.jr_workout_bonuses USING btree (player_id, applied_at DESC);
alter table public.jr_workout_bonuses enable row level security;
create policy jr_workout_bonuses_own on public.jr_workout_bonuses for all to public
  using ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))))
  with check ((player_id IN ( SELECT jr_players.id
   FROM jr_players
  WHERE (jr_players.user_id = auth.uid()))));
revoke all on public.jr_workout_bonuses from public;
revoke all on public.jr_workout_bonuses from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_workout_bonuses to authenticated;

-- jr_equipment
create table if not exists public.jr_equipment (
  id                        uuid NOT NULL default gen_random_uuid(),
  athlete_id                uuid NOT NULL,
  item_key                  text NOT NULL,
  is_equipped               boolean default false,
  durability                integer default 100,
  acquired_at               timestamptz default now(),
  constraint jr_equipment_pkey PRIMARY KEY (id),
  constraint jr_equipment_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES jr_athletes(id) ON DELETE CASCADE
);
create index if not exists idx_jr_equipment_athlete ON public.jr_equipment USING btree (athlete_id);
alter table public.jr_equipment enable row level security;
create policy jr_equipment_own on public.jr_equipment for all to public
  using ((athlete_id IN ( SELECT a.id
   FROM (jr_athletes a
     JOIN jr_players p ON ((p.id = a.player_id)))
  WHERE (p.user_id = auth.uid()))))
  with check ((athlete_id IN ( SELECT a.id
   FROM (jr_athletes a
     JOIN jr_players p ON ((p.id = a.player_id)))
  WHERE (p.user_id = auth.uid()))));
revoke all on public.jr_equipment from public;
revoke all on public.jr_equipment from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_equipment to authenticated;

-- jr_events_log
create table if not exists public.jr_events_log (
  id                        uuid NOT NULL default gen_random_uuid(),
  athlete_id                uuid NOT NULL,
  event_key                 text NOT NULL,
  triggered_at              timestamptz default now(),
  player_choice             text,
  effects                   jsonb default '{}'::jsonb,
  constraint jr_events_log_pkey PRIMARY KEY (id),
  constraint jr_events_log_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES jr_athletes(id) ON DELETE CASCADE
);
create index if not exists idx_jr_events_athlete ON public.jr_events_log USING btree (athlete_id);
alter table public.jr_events_log enable row level security;
create policy jr_events_own on public.jr_events_log for all to public
  using ((athlete_id IN ( SELECT a.id
   FROM (jr_athletes a
     JOIN jr_players p ON ((p.id = a.player_id)))
  WHERE (p.user_id = auth.uid()))))
  with check ((athlete_id IN ( SELECT a.id
   FROM (jr_athletes a
     JOIN jr_players p ON ((p.id = a.player_id)))
  WHERE (p.user_id = auth.uid()))));
revoke all on public.jr_events_log from public;
revoke all on public.jr_events_log from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_events_log to authenticated;

-- jr_runs
create table if not exists public.jr_runs (
  id                        uuid NOT NULL default gen_random_uuid(),
  athlete_id                uuid NOT NULL,
  started_at                timestamptz default now(),
  completed_at              timestamptz,
  location                  text default 'pole_ziemniakow'::text,
  planned_distance_km       numeric(5,2),
  actual_distance_km        numeric(5,2),
  duration_seconds          integer,
  result                    text,
  exp_gained                integer default 0,
  meta                      jsonb default '{}'::jsonb,
  constraint jr_runs_pkey PRIMARY KEY (id),
  constraint jr_runs_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES jr_athletes(id) ON DELETE CASCADE
);
create index if not exists idx_jr_runs_athlete ON public.jr_runs USING btree (athlete_id);
alter table public.jr_runs enable row level security;
create policy jr_runs_own on public.jr_runs for all to public
  using ((athlete_id IN ( SELECT a.id
   FROM (jr_athletes a
     JOIN jr_players p ON ((p.id = a.player_id)))
  WHERE (p.user_id = auth.uid()))))
  with check ((athlete_id IN ( SELECT a.id
   FROM (jr_athletes a
     JOIN jr_players p ON ((p.id = a.player_id)))
  WHERE (p.user_id = auth.uid()))));
revoke all on public.jr_runs from public;
revoke all on public.jr_runs from anon;
grant delete, insert, references, select, trigger, truncate, update on public.jr_runs to authenticated;

-- 2. funkcje (migawki prod 7.10) — EXECUTE bez anon/PUBLIC (patrz nagłówek)
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
$function$;
revoke all on function public.jr_buy_item(p_item_key text, p_athlete_id uuid) from public;
revoke all on function public.jr_buy_item(p_item_key text, p_athlete_id uuid) from anon;
grant execute on function public.jr_buy_item(p_item_key text, p_athlete_id uuid) to authenticated, service_role;

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
$function$;
revoke all on function public.jr_can_perform_actions() from public;
revoke all on function public.jr_can_perform_actions() from anon;
grant execute on function public.jr_can_perform_actions() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jr_check_day_reset()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_player jr_players%rowtype;
  v_athlete jr_athletes%rowtype;
begin
  select * into v_player from jr_players where user_id = auth.uid();
  if v_player.id is null then return jsonb_build_object('ok', false); end if;

  select * into v_athlete from jr_athletes
  where player_id = v_player.id and is_main_character = true limit 1;
  if v_athlete.id is null then return jsonb_build_object('ok', false); end if;

  -- Reset runs_today jeśli minęło >18h
  if v_athlete.last_run_today_reset_at is null or
     v_athlete.last_run_today_reset_at < now() - interval '18 hours' then
    update jr_athletes set
      runs_today = 0,
      last_run_today_reset_at = now()
    where id = v_athlete.id;
    return jsonb_build_object('ok', true, 'reset', true);
  end if;

  return jsonb_build_object('ok', true, 'reset', false);
end;
$function$;
revoke all on function public.jr_check_day_reset() from public;
revoke all on function public.jr_check_day_reset() from anon;
grant execute on function public.jr_check_day_reset() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jr_count_events_by_pattern(p_pattern text)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select count(*)::int
  from jr_events_log el
  join jr_athletes a on a.id = el.athlete_id
  join jr_players p on p.id = a.player_id
  where p.user_id = auth.uid()
    and el.event_key like p_pattern;
$function$;
revoke all on function public.jr_count_events_by_pattern(p_pattern text) from public;
revoke all on function public.jr_count_events_by_pattern(p_pattern text) from anon;
grant execute on function public.jr_count_events_by_pattern(p_pattern text) to authenticated, service_role;

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
$function$;
revoke all on function public.jr_equip_item(p_equipment_id uuid) from public;
revoke all on function public.jr_equip_item(p_equipment_id uuid) from anon;
grant execute on function public.jr_equip_item(p_equipment_id uuid) to authenticated, service_role;

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
$function$;
revoke all on function public.jr_get_achievements() from public;
revoke all on function public.jr_get_achievements() from anon;
grant execute on function public.jr_get_achievements() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jr_get_my_biegamy_athlete_id()
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select id from athletes where user_id = auth.uid() limit 1;
$function$;
revoke all on function public.jr_get_my_biegamy_athlete_id() from public;
revoke all on function public.jr_get_my_biegamy_athlete_id() from anon;
grant execute on function public.jr_get_my_biegamy_athlete_id() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jr_get_player_stats()
 RETURNS TABLE(total_workouts_bonused integer, total_km_real numeric, total_morale_gained integer, last_bonus_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select
    count(*)::int as total_workouts_bonused,
    coalesce(sum(distance_km), 0)::numeric as total_km_real,
    coalesce(sum((bonus_value->>'morale')::int), 0)::int as total_morale_gained,
    max(applied_at) as last_bonus_at
  from jr_workout_bonuses
  where player_id in (select id from jr_players where user_id = auth.uid());
$function$;
revoke all on function public.jr_get_player_stats() from public;
revoke all on function public.jr_get_player_stats() from anon;
grant execute on function public.jr_get_player_stats() to authenticated, service_role;

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
$function$;
revoke all on function public.jr_get_shop(p_athlete_id uuid) from public;
revoke all on function public.jr_get_shop(p_athlete_id uuid) from anon;
grant execute on function public.jr_get_shop(p_athlete_id uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jr_get_unused_training_logs(p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, logged_at timestamp with time zone, distance_km numeric, duration text, pace text, heart_rate integer, feel text, training_type text, comment text, coach_comment text)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select
    tl.id,
    tl.logged_at,
    tl.distance_km,
    tl.duration,
    tl.pace,
    tl.heart_rate,
    tl.feel,
    tl.training_type,
    tl.comment,
    tl.coach_comment
  from training_logs tl
  join athletes a on a.id = tl.athlete_id
  left join jr_workout_bonuses wb on wb.training_log_id = tl.id
    and wb.player_id in (select id from jr_players where user_id = auth.uid())
  where a.user_id = auth.uid()
    and tl.logged_at >= now() - interval '14 days'
    and wb.id is null  -- jeszcze nie odebrane
    and tl.distance_km is not null
    and tl.distance_km > 0
  order by tl.logged_at desc
  limit p_limit;
$function$;
revoke all on function public.jr_get_unused_training_logs(p_limit integer) from public;
revoke all on function public.jr_get_unused_training_logs(p_limit integer) from anon;
grant execute on function public.jr_get_unused_training_logs(p_limit integer) to authenticated, service_role;

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
$function$;
revoke all on function public.jr_init_player(p_coach_name text) from public;
revoke all on function public.jr_init_player(p_coach_name text) from anon;
grant execute on function public.jr_init_player(p_coach_name text) to authenticated, service_role;

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
$function$;
revoke all on function public.jr_perform_action(p_action_key text) from public;
revoke all on function public.jr_perform_action(p_action_key text) from anon;
grant execute on function public.jr_perform_action(p_action_key text) to authenticated, service_role;

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
$function$;
revoke all on function public.jr_unlock_achievement(p_achievement_key text) from public;
revoke all on function public.jr_unlock_achievement(p_achievement_key text) from anon;
grant execute on function public.jr_unlock_achievement(p_achievement_key text) to authenticated, service_role;

-- 3. delete_my_account: przywrócić linię `DELETE FROM public.jr_players WHERE user_id = v_uid;` po radio_likes
--    (CREATE OR REPLACE z migawki supabase/schema/funkcje/delete_my_account.sql sprzed tej kasacji, suma 886cc82d6775b427).

-- 4. DANE z backupu (tools/backup-janusz-run.sql): rodzice przed dziećmi, wkleić jsonb w miejsce […]
-- insert into public.jr_shop_items select * from jsonb_populate_recordset(null::public.jr_shop_items, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_achievements_catalog select * from jsonb_populate_recordset(null::public.jr_achievements_catalog, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_players select * from jsonb_populate_recordset(null::public.jr_players, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_athletes select * from jsonb_populate_recordset(null::public.jr_athletes, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_achievements select * from jsonb_populate_recordset(null::public.jr_achievements, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_actions_log select * from jsonb_populate_recordset(null::public.jr_actions_log, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_strava_bonuses select * from jsonb_populate_recordset(null::public.jr_strava_bonuses, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_workout_bonuses select * from jsonb_populate_recordset(null::public.jr_workout_bonuses, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_equipment select * from jsonb_populate_recordset(null::public.jr_equipment, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_events_log select * from jsonb_populate_recordset(null::public.jr_events_log, '[…]'::jsonb) on conflict do nothing;
-- insert into public.jr_runs select * from jsonb_populate_recordset(null::public.jr_runs, '[…]'::jsonb) on conflict do nothing;

notify pgrst, 'reload schema';

commit;

-- KONTROLA: select relname, (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.'||relname, false, true, '')))[1]::text
--   from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'jr\_%' order by 1;
--   -- oczekiwane liczby z backupu (7.10: achievements 4, achievements_catalog 10, actions_log 0, athletes 1, equipment 1,
--   --  events_log 0, players 1, runs 37, shop_items 5, strava_bonuses 0, workout_bonuses 0)
