-- 20261008_revoke_insert_update_bez_polityki.sql — 26 z 27 par tabela:polecenie, gdzie authenticated
-- ma grant INSERT/UPDATE, a RLS nie ma dla tego polecenia ŻADNEJ polityki (backlog paki 4, journal 7.10).
--
-- STAN ZMIERZONY 8.10.2026 (prod, tylko odczyt): te same 27 par co 7.10, wszystkie na tabelach z RLS ON —
-- każdy taki zapis z sesji użytkownika JUŻ DZIŚ pada (INSERT → 42501, UPDATE → 0 wierszy po cichu).
-- Grant niczego nie umożliwia; zostaje „załadowaną bronią" dla pierwszej polityki dopisanej bez namysłu.
-- Grantor wszędzie postgres (relacl), PUBLIC bez grantów, kolumnowych INSERT brak → revoke tabelowy wystarcza
-- (LEKCJE #23: revoke nie zdejmuje grantu z innego poziomu/adresata — sprawdzone, nie ma takiego).
--
-- DOWÓD „nikt nie zapisuje jako authenticated" (tools/zwiad-zapisy-bez-polityki.js + .sql):
--   · front (*.html, sb.js, js/*.js): jedyny zapis z 26 par — zawodnik.html checkBadges: achievements
--     .upsert(..., { ignoreDuplicates: true }) = ON CONFLICT DO NOTHING → wymaga tylko INSERT (dokumentacja
--     PostgreSQL: UPDATE jest wymagany wyłącznie przy DO UPDATE). Test blizna-50 pilnuje ignoreDuplicates.
--   · Edge Functions: ai_cache (food-recognize), daily_briefs (generate-coach-brief), intervals_activities
--     (intervals-activity-detail), wellness (intervals-sync), ai_reports (generate-athlete-report),
--     recipes (generate-recipe) — WSZYSTKIE przez klienta service_role (omija granty i RLS).
--   · funkcje SQL i triggery (pg_proc na prod, kontrola pozytywna na races): 0 zapisów do tych tabel.
--
-- POMINIĘTE ŚWIADOMIE: race_signups:UPDATE — zapis ISTNIEJE: 5 miejsc na froncie robi .upsert bez
-- ignoreDuplicates (ON CONFLICT DO UPDATE), a to wymaga uprawnienia UPDATE przy KAŻDYM wykonaniu, także
-- bez konfliktu. Revoke zepsułby każde nowe zgłoszenie na start. Dziś ścieżka konfliktu pada na RLS
-- (brak polityki UPDATE) — osobna decyzja, patrz raport 8.10.
--
-- Kontrola po wykonaniu: tools/kontrola-revoke-bez-polityki.sql → 0 wierszy.
-- Wycofanie: 20261008_WYCOFANIE_revoke_insert_update_bez_polityki.sql.

begin;

revoke update on public.achievements from authenticated;
revoke insert on public.ai_alerts from authenticated;
revoke insert, update on public.ai_cache from authenticated;
revoke insert on public.ai_reports from authenticated;
revoke update on public.ai_usage_log from authenticated;
revoke insert, update on public.daily_briefs from authenticated;
revoke update on public.follows from authenticated;
revoke update on public.food_cache from authenticated;
revoke insert, update on public.food_image_categories from authenticated;
revoke update on public.game_scores from authenticated;
revoke insert, update on public.intervals_activities from authenticated;
revoke update on public.log_comments from authenticated;
revoke update on public.log_reactions from authenticated;
revoke insert, update on public.nutrition_quotes from authenticated;
revoke update on public.radio_comments from authenticated;
revoke update on public.radio_likes from authenticated;
revoke update on public.recipe_favorites from authenticated;
revoke insert, update on public.recipes from authenticated;
revoke insert, update on public.wellness from authenticated;

commit;
