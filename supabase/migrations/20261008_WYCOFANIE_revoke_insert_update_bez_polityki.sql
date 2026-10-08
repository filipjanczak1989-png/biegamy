-- WYCOFANIE 20261008_revoke_insert_update_bez_polityki.sql — przywraca DOKŁADNIE zdjęte granty
-- (stan zmierzony 8.10.2026: grantor postgres, 26 par). Przywraca martwe granty: przy braku polityk RLS
-- i tak nic nie umożliwiają — wycofanie ma sens tylko, gdyby revoke okazał się przyczyną awarii.

begin;

grant update on public.achievements to authenticated;
grant insert on public.ai_alerts to authenticated;
grant insert, update on public.ai_cache to authenticated;
grant insert on public.ai_reports to authenticated;
grant update on public.ai_usage_log to authenticated;
grant insert, update on public.daily_briefs to authenticated;
grant update on public.follows to authenticated;
grant update on public.food_cache to authenticated;
grant insert, update on public.food_image_categories to authenticated;
grant update on public.game_scores to authenticated;
grant insert, update on public.intervals_activities to authenticated;
grant update on public.log_comments to authenticated;
grant update on public.log_reactions to authenticated;
grant insert, update on public.nutrition_quotes to authenticated;
grant update on public.radio_comments to authenticated;
grant update on public.radio_likes to authenticated;
grant update on public.recipe_favorites to authenticated;
grant insert, update on public.recipes to authenticated;
grant insert, update on public.wellness to authenticated;

commit;
