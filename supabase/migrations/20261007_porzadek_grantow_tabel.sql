-- PORZĄDEK GRANTÓW TABELOWYCH — paka 4 / C, propozycja 7.10.2026 (BEZ WYKONANIA, decyzja Filipa).
--
-- POMIAR (CLI read-only, information_schema.table_privileges + pg_policies, 7.10): 77 relacji w public.
-- anon: ŻADNEJ tabeli; z widoków public_athletes (SELECT — celowo, landing/profil publiczny) i radio_top
-- (REFERENCES, SELECT, TRIGGER, TRUNCATE — resztka default privileges). authenticated: na większości
-- tabel pełne ALL z default privileges (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE),
-- a to, co faktycznie wolno, rozstrzygają polityki RLS. TRUNCATE/TRIGGER/REFERENCES nie przechodzą
-- przez RLS wcale (TRUNCATE omija RLS; PostgREST ich nie wystawia, ale psql/SDK z JWT — tak).
--
-- REGUŁA TEJ MIGRACJI:
--   1. TRUNCATE, TRIGGER, REFERENCES — revoke od anon i authenticated WSZĘDZIE, gdzie są (tabele i widoki);
--      żaden klient tego nie używa (grep frontu i EF: 0 użyć), a brak grantu = brak drogi.
--   2. DELETE — revoke od authenticated TYLKO tam, gdzie nie ma polityki DELETE ani ALL. Dziś taki
--      DELETE i tak zwraca 0 wierszy (RLS bez polityki = nic), więc zmiana jest higieną: pierwsza
--      permisywna polityka dołożona obok przestałaby być jedyną barierą. Sprawdzone grepem: żadna
--      strona ani EF nie woła .delete() na tych tabelach (po stronie EF i tak działa service_role).
--   3. jr_* POMINIĘTE — kasowane w 20261007_kasacja_janusz_run_baza.sql.
--   4. INSERT/UPDATE bez polityki NIE są tu ruszane (nie było w zakresie; osobna decyzja — lista w raporcie).
--
-- ⚠️ delete_my_account i EF działają jako SECURITY DEFINER / service_role — revoke od authenticated
--    ich nie dotyka. ⚠️ public_athletes: anon SELECT zostaje (profil publiczny).
-- WYCOFANIE: 20261007_WYCOFANIE_porzadek_grantow_tabel.sql (dokładnie te granty z powrotem).

begin;

revoke references, trigger, truncate, delete on public.achievements from authenticated;
revoke references, trigger, truncate, delete on public.ai_alerts from authenticated;
revoke references, trigger, truncate, delete on public.ai_cache from authenticated;
revoke references, trigger, truncate on public.ai_reports from authenticated;
revoke references, trigger, truncate, delete on public.ai_usage_log from authenticated;
revoke references, trigger, truncate on public.athlete_intake_forms from authenticated;
revoke references on public.athletes from authenticated;
revoke references, trigger, truncate on public.coach_athlete_notes from authenticated;
revoke references, trigger, truncate on public.coaches from authenticated;
revoke references, trigger, truncate, delete on public.daily_briefs from authenticated;
revoke references, trigger, truncate, delete on public.duels from authenticated;
revoke references, trigger, truncate on public.follows from authenticated;
revoke references, trigger, truncate, delete on public.food_cache from authenticated;
revoke references, trigger, truncate on public.food_database from authenticated;
revoke references, trigger, truncate, delete on public.food_image_categories from authenticated;
revoke references, trigger, truncate on public.food_images from authenticated;
revoke references, trigger, truncate on public.friendships from authenticated;
revoke references, trigger, truncate, delete on public.game_scores from authenticated;
revoke references, trigger, truncate, delete on public.intervals_activities from authenticated;
revoke references, trigger, truncate on public.intervals_connections from authenticated;
revoke references, trigger, truncate on public.log_comments from authenticated;
revoke references, trigger, truncate on public.log_reactions from authenticated;
revoke references, trigger, truncate on public.messages from authenticated;
revoke references, trigger, truncate, delete on public.notifications from authenticated;
revoke references, trigger, truncate on public.nutrition_meals from authenticated;
revoke references, trigger, truncate, delete on public.nutrition_profiles from authenticated;
revoke references, trigger, truncate, delete on public.nutrition_quotes from authenticated;
revoke references, trigger, truncate, delete on public.peer_messages from authenticated;
revoke references, trigger, truncate on public.profile_posts from authenticated;
revoke references, trigger, truncate, delete on public.profiles from authenticated;
revoke references, trigger, truncate on public.push_subscriptions from authenticated;
revoke references, trigger, truncate on public.race_signups from authenticated;
revoke references, trigger, truncate on public.races from authenticated;
revoke references, trigger, truncate on public.radio_comments from authenticated;
revoke references, trigger, truncate on public.radio_likes from authenticated;
revoke references, trigger, truncate on public.radio_playlist_tracks from authenticated;
revoke references, trigger, truncate on public.radio_playlists from authenticated;
revoke references, trigger, truncate on public.radio_tracks from authenticated;
revoke references, trigger, truncate on public.recipe_favorites from authenticated;
revoke references, trigger, truncate, delete on public.recipes from authenticated;
revoke references, trigger, truncate on public.strava_activities from authenticated;
revoke references, trigger, truncate on public.training_logs from authenticated;
revoke references, trigger, truncate on public.training_plan_workouts from authenticated;
revoke references, trigger, truncate on public.training_plans from authenticated;
revoke references, trigger, truncate on public.trainings from authenticated;
revoke references, trigger, truncate, delete on public.wellness from authenticated;
revoke references, trigger, truncate on public.ai_usage_today from authenticated;
revoke references, trigger, truncate on public.radio_comments_view from authenticated;
revoke references, trigger, truncate on public.radio_top from anon;
-- DOPISANE po wydruku (c) 7.10: anon SELECT na widoku radio_top to resztka — czytelnicy to radio.html (radioInit()
-- bez sesji przenosi na index.html, grep 7.10) i zawodnik.html:9804 (po zalogowaniu). Wykonywane OSOBNO, po (c).
revoke select on public.radio_top from anon;
revoke references, trigger, truncate on public.radio_top from authenticated;

notify pgrst, 'reload schema';

commit;

-- KONTROLA PO WYKONANIU (READ-ONLY):
--   select table_name, grantee, string_agg(privilege_type, ',' order by 3) from information_schema.table_privileges
--    where table_schema = 'public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')
--    group by 1, 2;                                                               -- 0 wierszy
--   select count(*) from information_schema.table_privileges tp where tp.table_schema = 'public' and tp.grantee = 'authenticated'
--    and tp.privilege_type = 'DELETE' and not exists (select 1 from pg_policies p where p.tablename = tp.table_name and p.cmd in ('DELETE','ALL'));  -- 0
--   -- potem: node tools/polityki-bazy.js --zrzut
