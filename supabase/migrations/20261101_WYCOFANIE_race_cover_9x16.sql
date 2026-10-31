-- WYCOFANIE 20261101_race_cover_9x16.sql — zdejmuje races.cover_9x16_url.
--
-- ⛔ KOLEJNOŚĆ: najpierw EF race-image bez wariantu 9x16 (select z cover_9x16_url dostałby 42703)
--    i front bez odczytu tej kolumny (zawodnik.html _okladkaStartu, races.html).
-- Obiekty race-<id>-9x16 w race-covers zostają — kolumna nie trzyma plików. Usunąć przez Storage API,
-- jeśli mają zniknąć (storage nie ma kosza; okładki da się wygenerować ponownie).

begin;

alter table public.races drop column if exists cover_9x16_url;

commit;
