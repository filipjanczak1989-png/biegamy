-- FUNKCJE BEZ EXECUTE DLA anon I PUBLIC — paka 4 / D, propozycja 7.10.2026 (BEZ WYKONANIA, decyzja Filipa).
--
-- POMIAR (CLI read-only, pg_proc.proacl, 7.10): 26 funkcji w public z anon=X. Źródło: ALTER DEFAULT
-- PRIVILEGES (pg_default_acl dla ról postgres i supabase_admin): każda NOWA funkcja w public dostaje
-- EXECUTE dla anon, authenticated, service_role — i dodatkowo dla PUBLIC (wpis `=X`). To ten sam
-- mechanizm, który 7.10 zostawił anonowi is_run_type (LEKCJE #23). Z 27:
--   · 13 jr_*            — kasowane w 20261007_kasacja_janusz_run_baza.sql (nie tu);
--   · community_km       — kasowana w 20261007_kasacja_community_km.sql (nie tu);
--   · 11 funkcji TRIGGEROWYCH (pg_trigger.tgfoid, 7.10): calc_bmr_tdee, ensure_coach_athlete_row,
--     messages_guard_autorstwa, notify_filip_new_athlete, training_logs_guard_coach_fields,
--     trainings_guard_coach_plan, trigger_detect_moment, trigger_detect_moment_row,
--     update_can_updated_at, update_intake_updated_at, update_intervals_conn_timestamp
--     Funkcja triggerowa jest wywoływana PRZEZ trigger, nie przez
--     klienta — Postgres sprawdza EXECUTE przy CREATE TRIGGER (właściciel), nie przy odpalaniu.
--     Żaden klient nie woła ich przez RPC (grep rpc('…') w html/js/ts: 0 użyć);
--   · are_friends(uuid, uuid) — nie w triggerze, nie w polityce, nie w widoku, nie w RPC frontu
--     (grep: 0 użyć poza migawką; pg_policies/pg_trigger/pg_get_viewdef 7.10: 0) — DROP (decyzja Filipa 7.10).
--
-- CO ROBI: drop are_friends; revoke EXECUTE od PUBLIC i anon na 11 triggerowych; ALTER DEFAULT PRIVILEGES
-- dla postgres (decyzja Filipa 7.10; supabase_admin: 42501, patrz niżej) — nowe funkcje tworzone jako postgres
-- NIE dostają już EXECUTE dla anon ani PUBLIC. Tabel to nie dotyczy (osobna decyzja: pg_default_acl 'r' nadal
-- daje anonowi arwdDxtm). authenticated i service_role mają JAWNE granty
-- (proacl) — zostają, więc triggery odpalane przez zalogowanych i service_role nic nie tracą.
-- ⚠️ `revoke … from anon` BEZ `revoke … from public` nic nie da: anon jest członkiem PUBLIC,
--    a wpis `=X` to właśnie PUBLIC. Dlatego obie linie przy każdej funkcji.
--
-- ⚠️ Default privileges dla authenticated/service_role ZOSTAJĄ (nowa funkcja nadal dostaje je automatycznie);
--    zdejmujemy wyłącznie anon i PUBLIC. Korzyść: koniec kategorii błędu z LEKCJE #23.
--
-- WYCOFANIE: 20261007_WYCOFANIE_funkcje_bez_execute_dla_anon.sql (przywraca PUBLIC i anon 1:1).

begin;

drop function if exists public.are_friends(a uuid, b uuid);
revoke execute on function public.calc_bmr_tdee() from public, anon;
revoke execute on function public.ensure_coach_athlete_row() from public, anon;
revoke execute on function public.messages_guard_autorstwa() from public, anon;
revoke execute on function public.notify_filip_new_athlete() from public, anon;
revoke execute on function public.training_logs_guard_coach_fields() from public, anon;
revoke execute on function public.trainings_guard_coach_plan() from public, anon;
revoke execute on function public.trigger_detect_moment() from public, anon;
revoke execute on function public.trigger_detect_moment_row() from public, anon;
revoke execute on function public.update_can_updated_at() from public, anon;
revoke execute on function public.update_intake_updated_at() from public, anon;
revoke execute on function public.update_intervals_conn_timestamp() from public, anon;

-- koniec automatycznego EXECUTE dla anon/PUBLIC na NOWYCH funkcjach w public (obie role z pg_default_acl, 7.10)
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
-- supabase_admin: ta sama instrukcja `for role supabase_admin` dała na prod 7.10 `ERROR 42501 permission denied to
-- change default privileges` — rola postgres w Supabase nie jest członkiem supabase_admin i nie może zmieniać jej
-- default privileges. ZOSTAJE: funkcje tworzone PRZEZ supabase_admin (nie nasze migracje — te idą jako postgres)
-- nadal dostaną EXECUTE dla anon i PUBLIC. Zmierzone po wykonaniu: pg_default_acl postgres = {postgres,
-- authenticated, service_role}; supabase_admin = bez zmian (z anon i PUBLIC).

notify pgrst, 'reload schema';

commit;


-- KONTROLA PO WYKONANIU (READ-ONLY):
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proacl::text like '%anon=%';
--   -- oczekiwane: tylko jr_* (do kasacji) i community_km (do kasacji), potem 0
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proacl::text like '{=X%';  -- jw.
--   select count(*) from pg_proc where proname = 'are_friends';   -- 0
--   select defaclacl from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace where n.nspname = 'public' and d.defaclobjtype = 'f';
--   -- oczekiwane 2 wiersze: postgres BEZ anon=X i BEZ =X; supabase_admin NADAL z anon=X (42501 przy zmianie — patrz wyżej)
--   -- smoke: zapis treningu jako authenticated (trigger trg_detect_moment_ins) i wiadomość (trg_messages_guard_autorstwa) działają
