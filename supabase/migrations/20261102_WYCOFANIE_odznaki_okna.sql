-- WYCOFANIE 20261102_odznaki_okna.sql — zdejmuje wyzwalacz okien odznak i tabelę okien. achievements nietknięte
-- (przyznane odznaki zostają). Po wycofaniu okna pilnuje wyłącznie front (zawodnik.html _odznakaWOknie).
begin;
drop trigger if exists achievements_okno on public.achievements;
drop function if exists public.achievements_okno();
drop table if exists public.odznaki_okna;
commit;
-- KONTROLA: select count(*) from pg_trigger where tgname = 'achievements_okno';  -- 0
