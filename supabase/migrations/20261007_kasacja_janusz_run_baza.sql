-- KASACJA GRY JANUSZ RUN — FAZA 2 (BAZA). Decyzja Filipa 7.10.2026, wzorzec 1:1 jak Bieguś (b8f96c0).
--
-- KOLEJNOŚĆ WDROŻENIA:
--   1. faza 1 (front) NA PROD: janusz.html = przekierowanie, js/janusz i assets/janusz poza repo;
--   2. tools/backup-janusz-run.sql WYKONANY — 11 zrzutów jsonb (zmierzone 7.10: 1 gracz = Filip,
--      jr_runs 37, jr_achievements 4, jr_equipment 1, katalogi 10 + 5, reszta 0) — pliki POZA repo;
--   3. dopiero ten plik.
--
-- CO ZDEJMUJE (stan prod zmierzony 7.10 przez CLI: pg_class/pg_proc/pg_policies/table_privileges):
--   · 13 funkcji jr_* (NIE 14 — wcześniejsza liczba w raporcie była błędna); wszystkie SECURITY INVOKER,
--     wszystkie z EXECUTE dla anon I PUBLIC z default privileges (LEKCJE #23);
--   · 11 tabel jr_*: RLS ON, polityki *_own (ALL/public po jr_players.user_id = auth.uid()) i *_read
--     (SELECT authenticated) na katalogach; authenticated ma ALL tabelowo; anon nic;
--   · FK: dzieci → jr_athletes → jr_players → auth.users; jr_workout_bonuses → training_logs.
--     Kolejność drop = dzieci najpierw (żaden CASCADE nie jest potrzebny; każdy FK leży po stronie
--     tabeli kasowanej, więc po drop nic nie zostaje na training_logs ani auth.users).
--   · delete_my_account(): JEDNA linia `DELETE FROM public.jr_players` — plpgsql rozwiązuje nazwy w chwili
--     wykonania, drop bez poprawki = 42P01 przy każdym usuwaniu konta. CREATE OR REPLACE z migawki prod
--     (suma 886cc82d6775b427, stan po kasacji Biegusia) minus ta linia — jedyna zmiana. PRZED drop.
--
-- CZEGO NIE RUSZA: gra.html („BiegaMy: Wyzwanie", game_scores) — osobna gra, 0 odwołań do jr_*.
--
-- IDEMPOTENTNA (if exists). WYCOFANIE: 20261007_WYCOFANIE_kasacja_janusz_run_baza.sql + backup JSON.

begin;

-- 1. delete_my_account bez jr_players (reszta 1:1 z prod 7.10 po kasacji Biegusia)
CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_athlete_id uuid;
  v_email      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Brak zalogowanego użytkownika';
  END IF;

  IF EXISTS (SELECT 1 FROM public.coaches WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Konto trenera nie może być usunięte tą drogą';
  END IF;

  SELECT id    INTO v_athlete_id FROM public.athletes WHERE user_id = v_uid;
  SELECT email INTO v_email      FROM auth.users      WHERE id      = v_uid;

  DELETE FROM public.wellness            WHERE athlete_id = v_athlete_id;

  DELETE FROM public.training_logs       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.push_subscriptions  WHERE athlete_id = v_athlete_id;
  DELETE FROM public.ai_reports          WHERE athlete_id = v_athlete_id;
  DELETE FROM public.ai_alerts           WHERE athlete_id = v_athlete_id;
  DELETE FROM public.achievements        WHERE athlete_id = v_athlete_id;
  DELETE FROM public.game_scores         WHERE athlete_id = v_athlete_id;
  DELETE FROM public.intervals_activities   WHERE athlete_id = v_athlete_id;
  DELETE FROM public.intervals_connections  WHERE athlete_id = v_athlete_id;
  DELETE FROM public.intervals_credentials  WHERE athlete_id = v_athlete_id;
  DELETE FROM public.strava_activities   WHERE athlete_id = v_athlete_id;
  DELETE FROM public.trainings           WHERE athlete_id = v_athlete_id;
  DELETE FROM public.training_plans      WHERE athlete_id = v_athlete_id;
  DELETE FROM public.race_signups        WHERE athlete_id = v_athlete_id;
  DELETE FROM public.coach_athlete_notes WHERE athlete_id = v_athlete_id;
  DELETE FROM public.profile_posts       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.notifications       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.follows             WHERE follower_id = v_athlete_id OR following_id = v_athlete_id;
  DELETE FROM public.friendships         WHERE requester_id = v_athlete_id OR addressee_id = v_athlete_id;

  DELETE FROM public.log_comments        WHERE athlete_id = v_athlete_id;
  DELETE FROM public.log_reactions       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.delivered_moments   WHERE athlete_id = v_athlete_id;

  DELETE FROM public.messages            WHERE athlete_id = v_athlete_id;
  DELETE FROM public.peer_messages       WHERE from_id = v_athlete_id OR to_id = v_athlete_id;

  DELETE FROM public.duels               WHERE challenger_id = v_athlete_id
                                            OR opponent_id   = v_athlete_id
                                            OR winner_id     = v_athlete_id;

  DELETE FROM public.athlete_intake_forms
    WHERE created_athlete_id = v_athlete_id
       OR (v_email IS NOT NULL AND email = v_email);

  DELETE FROM public.nutrition_profiles WHERE athlete_id = v_uid;
  DELETE FROM public.nutrition_meals    WHERE athlete_id = v_uid;
  DELETE FROM public.ai_usage_log       WHERE athlete_id = v_uid;
  DELETE FROM public.radio_playlists    WHERE owner_id   = v_uid;
  DELETE FROM public.radio_likes        WHERE user_id    = v_uid;
  -- jr_players: linia ZDJĘTA 07.10.2026 (Janusz Run skasowany — tabela nie istnieje)

  DELETE FROM public.radio_comments     WHERE user_id    = v_uid;
  DELETE FROM public.radio_plays        WHERE user_id    = v_uid;

  DELETE FROM public.recipe_favorites   WHERE athlete_id = v_uid
                                           OR athlete_id = v_athlete_id;

  UPDATE public.client_errors SET user_id = NULL WHERE user_id = v_uid;

  IF v_athlete_id IS NOT NULL THEN
    UPDATE public.athletes SET
      full_name = 'Usunięty użytkownik',
      email = NULL, phone = NULL, date_of_birth = NULL, avatar_url = NULL, city = NULL,
      pb_5k = NULL, pb_10k = NULL, pb_half = NULL, pb_marathon = NULL,
      race_goals = NULL, goal = NULL, target_race = NULL, target_date = NULL,
      link_strava = NULL, link_garmin = NULL, link_instagram = NULL, link_facebook = NULL,
      coach_message = NULL, coach_message_at = NULL,
      klaudiusz_brief = NULL, profile_data = NULL, tdee = NULL,
      strava_access_token = NULL, strava_refresh_token = NULL,
      strava_athlete_id = NULL, strava_token_expires_at = NULL, strava_connected_at = NULL,
      is_public = false, active = false,
      email_reports_enabled = false, auto_report_enabled = false, auto_monthly_enabled = false,
      coach_id = NULL
    WHERE id = v_athlete_id;
  END IF;

  UPDATE public.profiles SET
    full_name = 'Usunięty użytkownik',
    avatar_url = NULL
  WHERE id = v_uid;

  DELETE FROM auth.identities      WHERE user_id = v_uid;
  DELETE FROM auth.sessions        WHERE user_id = v_uid;
  DELETE FROM auth.refresh_tokens  WHERE user_id = v_uid::text;
  DELETE FROM auth.one_time_tokens WHERE user_id = v_uid;
  DELETE FROM auth.mfa_factors     WHERE user_id = v_uid;

  DELETE FROM auth.oauth_authorizations  WHERE user_id = v_uid;
  DELETE FROM auth.oauth_consents        WHERE user_id = v_uid;
  DELETE FROM auth.webauthn_challenges   WHERE user_id = v_uid;
  DELETE FROM auth.webauthn_credentials  WHERE user_id = v_uid;

  UPDATE auth.users SET
    email = 'deleted+' || v_uid::text || '@deleted.invalid',
    phone = NULL,
    raw_user_meta_data = '{}'::jsonb,
    banned_until = '9999-12-31 23:59:59+00'::timestamptz,
    updated_at = now()
  WHERE id = v_uid;

  INSERT INTO public.account_deletions_audit (uid, deleted_at) VALUES (v_uid, now());
END;
$function$;

-- 2. funkcje gry (sygnatury zmierzone)
drop function if exists public.jr_buy_item(p_item_key text, p_athlete_id uuid);
drop function if exists public.jr_can_perform_actions();
drop function if exists public.jr_check_day_reset();
drop function if exists public.jr_count_events_by_pattern(p_pattern text);
drop function if exists public.jr_equip_item(p_equipment_id uuid);
drop function if exists public.jr_get_achievements();
drop function if exists public.jr_get_my_biegamy_athlete_id();
drop function if exists public.jr_get_player_stats();
drop function if exists public.jr_get_shop(p_athlete_id uuid);
drop function if exists public.jr_get_unused_training_logs(p_limit integer);
drop function if exists public.jr_init_player(p_coach_name text);
drop function if exists public.jr_perform_action(p_action_key text);
drop function if exists public.jr_unlock_achievement(p_achievement_key text);

-- 3. tabele gry — dzieci najpierw (FK leżą po stronie kasowanych tabel)
drop table if exists public.jr_equipment;
drop table if exists public.jr_events_log;
drop table if exists public.jr_runs;
drop table if exists public.jr_achievements;
drop table if exists public.jr_actions_log;
drop table if exists public.jr_strava_bonuses;
drop table if exists public.jr_workout_bonuses;
drop table if exists public.jr_athletes;
drop table if exists public.jr_players;
drop table if exists public.jr_achievements_catalog;
drop table if exists public.jr_shop_items;

notify pgrst, 'reload schema';

commit;

-- KONTROLA PO WYKONANIU (READ-ONLY) — wynik, nie treść (LEKCJE #23):
--   select count(*) from pg_proc where proname like 'jr\_%';                                  -- 0
--   select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'jr\_%';  -- 0 (tabele + indeksy)
--   select prosrc ilike '%jr\_%' from pg_proc where proname = 'delete_my_account';             -- false
--   -- REST anon: POST /rest/v1/rpc/jr_get_shop {"p_athlete_id":null} → 404 PGRST202; GET /rest/v1/jr_players → 404 PGRST205
--   -- potem: node tools/funkcje-bazy.js --zrzut && node tools/polityki-bazy.js --zrzut (13 + 11 plików jr_* znikają)
