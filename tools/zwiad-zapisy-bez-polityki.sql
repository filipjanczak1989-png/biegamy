-- ZWIAD (tylko odczyt): funkcje SQL i triggery, które PISZĄ do tabel z parami grant-bez-polityki.
-- Funkcja SECURITY INVOKER (prosecdef = false) wołana przez użytkownika — albo trigger odpalony jego
-- zapisem — działa z uprawnieniami authenticated: revoke INSERT/UPDATE by ją zepsuł.
-- SECURITY DEFINER działa jako właściciel (postgres) — revoke od authenticated jej nie dotyczy.
-- Uzupełnienie tools/zwiad-zapisy-bez-polityki.js (front + Edge Functions). 08.10.2026.
with tabele(t) as (values
  ('achievements'),('ai_alerts'),('ai_cache'),('ai_reports'),('ai_usage_log'),('daily_briefs'),('follows'),
  ('food_cache'),('food_image_categories'),('game_scores'),('intervals_activities'),('log_comments'),
  ('log_reactions'),('nutrition_quotes'),('race_signups'),('radio_comments'),('radio_likes'),
  ('recipe_favorites'),('recipes'),('wellness')
)
select p.proname as funkcja, p.prosecdef as security_definer, tabele.t as tabela,
       case when p.prosrc ~* ('insert\s+into\s+(public\.)?' || tabele.t || '\M') then 'INSERT' end as ins,
       case when p.prosrc ~* ('update\s+(public\.)?' || tabele.t || '\M') or p.prosrc ~* ('on\s+conflict[^;]*do\s+update') and p.prosrc ~* ('insert\s+into\s+(public\.)?' || tabele.t || '\M') then 'UPDATE' end as upd,
       (select string_agg(c.relname || '.' || tg.tgname, ', ') from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
         where tg.tgfoid = p.oid and not tg.tgisinternal) as jako_trigger_na
from pg_proc p join pg_namespace n on n.oid = p.pronamespace, tabele
where n.nspname = 'public'
  and (p.prosrc ~* ('insert\s+into\s+(public\.)?' || tabele.t || '\M') or p.prosrc ~* ('update\s+(public\.)?' || tabele.t || '\M'))
order by 3, 1;
