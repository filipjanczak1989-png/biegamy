-- KASACJA GRY BIEGUŚ — FAZA 2 (BAZA). Decyzja Filipa 7.10.2026: nikt nie gra.
--
-- KOLEJNOŚĆ WDROŻENIA (nie do pominięcia):
--   1. faza 1 (front) NA PROD: biegus.html = przekierowanie, baner zdjęty, three.js poza SW — inaczej
--      żywy klient woła RPC, którego nie ma, i PATCH-uje tabelę, której nie ma (cicha odmowa, ale
--      z błędami w konsoli i w client_errors);
--   2. tools/backup-biegus_most.sql WYKONANY (zapytania 1-4: biegus_most 14 wierszy + game_events 220),
--      pliki JSON zapisane POZA repo — WYCOFANIE bez danych odtwarza puste tabele;
--   3. dopiero ten plik.
--
-- CO ZDEJMUJE (stan prod zmierzony 7.10 przez CLI: pg_proc/pg_policies/table_privileges):
--   · function biegus_most_odbierz()  — SECURITY DEFINER, EXECUTE: authenticated, service_role (z 7.10)
--   · function biegus_ranking()       — SECURITY DEFINER, EXECUTE: authenticated, service_role (z 17.07)
--   · table biegus_most               — 4 kolumny, PK athlete_id → athletes(id) ON DELETE CASCADE,
--                                        RLS ON, 3 polityki self_*, authenticated: SELECT/DELETE/REFERENCES/
--                                        TRIGGER/TRUNCATE tabelowo + UPDATE(zapis, zapis_ts) kolumnowo; anon: nic
--   · delete_my_account(): linie `DELETE FROM public.biegus_most …` i `… game_events …` — plpgsql rozwiązuje nazwy
--     W CHWILI WYKONANIA, więc drop tabeli bez tej poprawki wywracałby KAŻDE usunięcie konta
--     (42P01 w środku transakcji → nic nie usunięte). Dlatego CREATE OR REPLACE funkcji idzie PRZED drop.
--     Treść = migawka supabase/schema/funkcje/delete_my_account.sql (suma 9b69c5ad6b9560e2, prod 7.10)
--     minus te dwie linie; nic więcej nie zmieniane.
--
--   · table game_events (DECYZJA FILIPA 7.10: w TEJ SAMEJ migracji) — telemetria gry (biegus.html Tele,
--     INSERT-only), 220 wierszy, ostatnie 21.09.2026, 118 z athlete_id. Zmierzone 7.10: RLS ON, polityka
--     ge_insert INSERT {anon,authenticated} WITH CHECK (true), granty kolumnowe INSERT: anon
--     (anon_id,dane,typ,wersja), authenticated (+athlete_id); tabelowo anon/authenticated NIC, więc
--     nikt poza service_role nie czyta. Po kasacji gry = tabela otwarta na anon INSERT bez producenta.
--     Też w delete_my_account (linia `DELETE FROM public.game_events`) — ta sama pułapka 42P01, dlatego
--     JEDNA zmiana funkcji zdejmuje OBIE linie.
--
-- CZEGO NIE RUSZA: jr_* (Janusz Run) — inna gra (janusz.html, js/janusz/), nie dotykana.
--
-- IDEMPOTENTNA (if exists). WYCOFANIE: 20261007_WYCOFANIE_kasacja_biegus_baza.sql + backup JSON.

begin;

-- 1. delete_my_account bez odwołań do biegus_most i game_events (reszta ciała 1:1 z prod 7.10)
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

  -- ⚠️ DANE ZDROWOTNE PIERWSZE. Technicznie funkcja jest JEDNĄ transakcją,
  --    więc przerwanie w środku cofa wszystko i kolejność nic nie zmienia.
  --    Zostaje tu świadomie na wypadek, gdyby ktoś kiedyś rozbił tę funkcję
  --    na osobne wywołania — wtedy kolejność zacznie być jedyną ochroną.
  DELETE FROM public.wellness            WHERE athlete_id = v_athlete_id;

  -- HARD-delete: keyed po athlete_id
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

  -- DOŁOŻONE 16.08.2026 — liczyły na kaskadę, która nie odpala
  DELETE FROM public.log_comments        WHERE athlete_id = v_athlete_id;
  DELETE FROM public.log_reactions       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.delivered_moments   WHERE athlete_id = v_athlete_id;
  -- biegus_most: linia ZDJĘTA 07.10.2026 (tabela skasowana razem z grą Bieguś — faza 2)

  -- Rozmowy: kasujemy OBIE strony. Rozmowa 1:1 nie przeżywa usunięcia jednego
  -- rozmówcy w sensowny sposób — tak samo robiła stara ścieżka z zawodnik.html.
  DELETE FROM public.messages            WHERE athlete_id = v_athlete_id;
  DELETE FROM public.peer_messages       WHERE from_id = v_athlete_id OR to_id = v_athlete_id;

  -- duels.winner_id ma NO ACTION, więc jako jedyna z tej trójki zablokowałaby
  -- kiedyś twarde usunięcie wiersza `athletes`. Kasujemy wszystkie trzy role.
  DELETE FROM public.duels               WHERE challenger_id = v_athlete_id
                                            OR opponent_id   = v_athlete_id
                                            OR winner_id     = v_athlete_id;

  DELETE FROM public.athlete_intake_forms
    WHERE created_athlete_id = v_athlete_id
       OR (v_email IS NOT NULL AND email = v_email);

  -- HARD-delete: keyed po auth uid
  DELETE FROM public.nutrition_profiles WHERE athlete_id = v_uid;
  DELETE FROM public.nutrition_meals    WHERE athlete_id = v_uid;
  DELETE FROM public.ai_usage_log       WHERE athlete_id = v_uid;
  DELETE FROM public.radio_playlists    WHERE owner_id   = v_uid;
  DELETE FROM public.radio_likes        WHERE user_id    = v_uid;
  DELETE FROM public.jr_players         WHERE user_id    = v_uid;

  -- DOŁOŻONE 16.08.2026 — keyed po auth uid (zmierzone, patrz nagłówek)
  DELETE FROM public.radio_comments     WHERE user_id    = v_uid;
  DELETE FROM public.radio_plays        WHERE user_id    = v_uid;
  -- game_events: linia ZDJĘTA 07.10.2026 (tabela skasowana razem z grą Bieguś — faza 2)

  -- recipe_favorites: tabela PUSTA, więc klucza nie da się zmierzyć.
  -- Kasujemy po obu — jeden z warunków trafi w pustkę, żaden nie zaszkodzi.
  DELETE FROM public.recipe_favorites   WHERE athlete_id = v_uid
                                           OR athlete_id = v_athlete_id;

  -- ⚠️ client_errors: ODLINKOWANIE, nie kasowanie. Wiersz niesie `user_id`,
  --    `url` i komunikat błędu. Osoba znika (user_id → NULL), ale ślad po
  --    usterce zostaje — inaczej usunięcie konta kasowałoby nam diagnostykę
  --    błędu, który wciąż dotyka pozostałych. Jeśli to zła granica, zmień
  --    na DELETE — decyzja jest tu, nie rozproszona po kodzie.
  UPDATE public.client_errors SET user_id = NULL WHERE user_id = v_uid;

  -- SCRUB athletes (tombstone)
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

  -- SCRUB profiles
  UPDATE public.profiles SET
    full_name = 'Usunięty użytkownik',
    avatar_url = NULL
  WHERE id = v_uid;

  -- AUTH: identities → sessions → refresh → one_time → mfa → users
  DELETE FROM auth.identities      WHERE user_id = v_uid;
  DELETE FROM auth.sessions        WHERE user_id = v_uid;
  DELETE FROM auth.refresh_tokens  WHERE user_id = v_uid::text;
  DELETE FROM auth.one_time_tokens WHERE user_id = v_uid;
  DELETE FROM auth.mfa_factors     WHERE user_id = v_uid;

  -- DOŁOŻONE 16.08.2026. Dziś WSZYSTKIE PUSTE (0 wierszy), więc ten fragment
  -- niczego nie naprawia — zamyka drogę, którą włączenie OAuth albo klucza
  -- sprzętowego otworzyłoby po cichu. Też liczyły na kaskadę z auth.users.
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

-- 2. funkcje gry
drop function if exists public.biegus_most_odbierz();
drop function if exists public.biegus_ranking();

-- 3. tabele gry (polityki i granty idą razem z nimi; FK do athletes jest PO STRONIE biegus_most)
drop table if exists public.biegus_most;
drop table if exists public.game_events;

notify pgrst, 'reload schema';

commit;

-- KONTROLA PO WYKONANIU (READ-ONLY) — wynik, nie treść (LEKCJE #23):
--   select proname from pg_proc where proname in ('biegus_most_odbierz','biegus_ranking');   -- 0 wierszy
--   select to_regclass('public.biegus_most'), to_regclass('public.game_events');              -- NULL, NULL
--   select prosrc ilike '%biegus%' or prosrc ilike '%game_events%' from pg_proc where proname = 'delete_my_account';  -- false
--   -- REST authenticated/anon: POST /rest/v1/rpc/biegus_most_odbierz → 404 (PGRST202), nie 42501
--   -- potem: node tools/funkcje-bazy.js --zrzut && node tools/polityki-bazy.js --zrzut (biegus_most.txt znika)
