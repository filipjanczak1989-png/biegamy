-- ⚠️ STATUS (dopisane 07.10.2026): WYKONANA NA PROD. Zmierzone 7.10 00:07 (polityki-bazy --zrzut + REST anon na widok → 42501,
--    journal 2026-10-06) i ponownie 7.10 wieczór (table_privileges: anon bez grantu na radio_comments_view). Historia.

-- Cofniecie grantu dla roli `anon` na widoku `public.radio_comments_view`.
--
-- USTALENIE (30.08.2026), na ktorym oparta jest ta zmiana — radio jest wylacznie
-- dla zalogowanych, wiec grant jest POZOSTALOSCIA, nie funkcja:
--   · `radio.html` wymaga sesji: `radioInit()` bez sesji ponawia proebe po 1 s
--     i przenosi na `index.html`; `radioLoad()` nigdy nie startuje;
--   · z landingu NIE MA wejscia do radia — zero wzmianek w `index.html`.
--     Linki prowadza tylko z `profil.html`, `trener.html` i `zawodnik.html`,
--     czyli spod zalogowania (plus skrot PWA w `manifest.json`, ktory i tak
--     trafia na to samo przekierowanie);
--   · `radio_comments_view` jest wolany w jednym miejscu w calym repo —
--     `radio.html:414` — czyli zawsze jako `authenticated`, nigdy jako `anon`.
--
-- ⚠️ PRZEKIEROWANIE W STRONIE NICZEGO NIE CHRONILO. Klucz `anon` jest jawny
-- w zrodle kazdej strony, wiec o dostepie decyduje GRANT, nie JavaScript.
-- Zmierzone: `anon` czytal ten widok BEZ ODMOWY, choc tabele zrodlowa
-- `radio_comments` ma zablokowana (`42501`). Widok omija RLS
-- (`security_invoker=false`, wlasciciel `postgres` z BYPASSRLS) i NIE FILTRUJE
-- NICZEGO — dociaga `full_name` i `avatar_url` z `athletes`.
--
-- ⚠️ Dzis zwracal 0 wierszy, bo `radio_comments` jest PUSTA. Ekspozycja byla
-- wiec mechanicznie realna, a co do danych pusta — otworzylaby sie sama
-- przy pierwszym komentarzu. To jest powod, dla ktorego cofamy to TERAZ,
-- a nie „gdy pojawia sie komentarze".
--
-- Zakres: TYLKO ten widok. `radio_top` tez ma grant dla `anon`, ale ma
-- `security_invoker=true`, wiec RLS dziala na pytajacego i anon widzi tam 0 —
-- to osobna, slabsza sprawa. Lista pozostalych grantow dla `anon` czeka
-- na decyzje osobno.
--
-- Sprawdzenie po wykonaniu:
--   anon → `radio_comments_view`  ma dac `42501: permission denied`
--   zalogowany → komentarze w radio.html maja dzialac bez zmian

begin;

revoke all on public.radio_comments_view from anon;

commit;
