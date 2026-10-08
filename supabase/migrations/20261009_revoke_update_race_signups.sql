-- 20261009_revoke_update_race_signups.sql — ostatnia para grant-bez-polityki: race_signups:UPDATE.
--
-- ⛔ KOLEJNOŚĆ: WYKONAĆ DOPIERO PO DEPLOYU FRONTU z ignoreDuplicates (5 upsertów: profil.html ×2, races.html ×2,
--    zawodnik.html ×1) I PO OKRESIE PRZEJŚCIOWYM (proponowane ≥ 3 dni). Dokumenty sprzed deployu otwarte na
--    telefonach robią jeszcze ON CONFLICT DO UPDATE, a to wymaga UPDATE przy KAŻDYM wykonaniu — revoke przed
--    ich wymianą zepsułby KAŻDE nowe zgłoszenie na start z takiego dokumentu (42501). Wymianę starych dokumentów
--    przyspiesza przeładowanie przy powrocie z tła (6fec59e) i ?v= zasobów (ce2faf1).
--
-- DLACZEGO MOŻNA: race_signups ma tylko (id, race_id, athlete_id, created_at); upserty ustawiały wyłącznie klucz
-- (race_id, athlete_id) — DO UPDATE wpisywał te same wartości, nikt nie ZMIENIA istniejącego zgłoszenia.
-- Bez polityki UPDATE ścieżka konfliktu i tak rzucała błąd (dokumentacja PostgreSQL). Po zmianie frontu:
-- tools/zwiad-zapisy-bez-polityki.js race_signups:UPDATE → „brak zapisu"; funkcje SQL/triggery → 0 (8.10).
--
-- W TYM SAMYM COMMICIE: usunąć wyjątek 'race_signups:UPDATE' z tools/kontrola-revoke-bez-polityki.sql.
-- Kontrola po wykonaniu: tools/kontrola-revoke-bez-polityki.sql → 0 wierszy (bez wyjątku).
-- Wycofanie: 20261009_WYCOFANIE_revoke_update_race_signups.sql.

begin;
revoke update on public.race_signups from authenticated;
commit;
