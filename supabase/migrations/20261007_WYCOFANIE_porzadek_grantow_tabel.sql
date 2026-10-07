-- WYCOFANIE 20261007_porzadek_grantow_tabel.sql — przywraca DOKŁADNIE zdjęte granty (stan zmierzony 7.10).
-- ⚠️ Przywraca też REFERENCES/TRIGGER/TRUNCATE dla anon na widoku radio_top — resztkę default privileges,
--    nie decyzję. Jeśli wycofujesz z innego powodu niż awaria, rozważ pominięcie tej linii.
-- ⚠️ SELECT dla anon na radio_top NIE jest przywracany: nadanie odczytu niezalogowanemu to decyzja, nie rollback
--    (bramka-commit: GRANT dla anon = blokada twarda). Czytelnicy widoku działają wyłącznie po zalogowaniu.

begin;

grant references, trigger, truncate, delete on public.achievements to authenticated;
grant references, trigger, truncate, delete on public.ai_alerts to authenticated;
grant references, trigger, truncate, delete on public.ai_cache to authenticated;
grant references, trigger, truncate on public.ai_reports to authenticated;
grant references, trigger, truncate, delete on public.ai_usage_log to authenticated;
grant references, trigger, truncate on public.athlete_intake_forms to authenticated;
grant references on public.athletes to authenticated;
grant references, trigger, truncate on public.coach_athlete_notes to authenticated;
grant references, trigger, truncate on public.coaches to authenticated;
grant references, trigger, truncate, delete on public.daily_briefs to authenticated;
grant references, trigger, truncate, delete on public.duels to authenticated;
grant references, trigger, truncate on public.follows to authenticated;
grant references, trigger, truncate, delete on public.food_cache to authenticated;
grant references, trigger, truncate on public.food_database to authenticated;
grant references, trigger, truncate, delete on public.food_image_categories to authenticated;
grant references, trigger, truncate on public.food_images to authenticated;
grant references, trigger, truncate on public.friendships to authenticated;
grant references, trigger, truncate, delete on public.game_scores to authenticated;
grant references, trigger, truncate, delete on public.intervals_activities to authenticated;
grant references, trigger, truncate on public.intervals_connections to authenticated;
grant references, trigger, truncate on public.log_comments to authenticated;
grant references, trigger, truncate on public.log_reactions to authenticated;
grant references, trigger, truncate on public.messages to authenticated;
grant references, trigger, truncate, delete on public.notifications to authenticated;
grant references, trigger, truncate on public.nutrition_meals to authenticated;
grant references, trigger, truncate, delete on public.nutrition_profiles to authenticated;
grant references, trigger, truncate, delete on public.nutrition_quotes to authenticated;
grant references, trigger, truncate, delete on public.peer_messages to authenticated;
grant references, trigger, truncate on public.profile_posts to authenticated;
grant references, trigger, truncate, delete on public.profiles to authenticated;
grant references, trigger, truncate on public.push_subscriptions to authenticated;
grant references, trigger, truncate on public.race_signups to authenticated;
grant references, trigger, truncate on public.races to authenticated;
grant references, trigger, truncate on public.radio_comments to authenticated;
grant references, trigger, truncate on public.radio_likes to authenticated;
grant references, trigger, truncate on public.radio_playlist_tracks to authenticated;
grant references, trigger, truncate on public.radio_playlists to authenticated;
grant references, trigger, truncate on public.radio_tracks to authenticated;
grant references, trigger, truncate on public.recipe_favorites to authenticated;
grant references, trigger, truncate, delete on public.recipes to authenticated;
grant references, trigger, truncate on public.strava_activities to authenticated;
grant references, trigger, truncate on public.training_logs to authenticated;
grant references, trigger, truncate on public.training_plan_workouts to authenticated;
grant references, trigger, truncate on public.training_plans to authenticated;
grant references, trigger, truncate on public.trainings to authenticated;
grant references, trigger, truncate, delete on public.wellness to authenticated;
grant references, trigger, truncate on public.ai_usage_today to authenticated;
grant references, trigger, truncate on public.radio_comments_view to authenticated;
grant references, trigger, truncate on public.radio_top to anon;
grant references, trigger, truncate on public.radio_top to authenticated;

notify pgrst, 'reload schema';

commit;
