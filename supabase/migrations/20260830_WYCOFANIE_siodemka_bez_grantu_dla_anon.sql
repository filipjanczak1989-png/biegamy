-- ⚠️ STATUS (dopisane 07.10.2026): wycofanie migracji WYKONANEJ (zmierzone 7.10). Przywraca granty dla anon na 7 tabelach
--    (w tym injuries = dane zdrowotne) — decyzja, nie rollback. Instrukcje GRANT ZAKOMENTOWANE (bramka twarda) — plik jest zapisem, nie skryptem.

-- WYCOFANIE — przywraca granty dla roli `anon` na siedmiu tabelach
-- w stanie sprzed 30.08.2026.
--
-- ⚠️ ODTWARZA STAN DOSLOWNY, nie posprzatany. Zmierzone przed cofnieciem:
-- kazda z siedmiu miala dla `anon` dokladnie ten sam komplet
--   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- czyli rowniez uprawnienia, ktorych aplikacja nigdy nie uzywala (TRUNCATE,
-- REFERENCES, TRIGGER), a na `injuries` takze DELETE, ktorego NIE MA nawet
-- `authenticated`. Wypisane sa wprost zamiast `ALL`, bo `ALL` znaczy „tyle,
-- ile akurat obejmuje ta wersja Postgresa", a wycofanie ma wracac do stanu,
-- ktory naprawde byl. Inaczej „wycofanie" tworzy trzeci stan, ktorego nikt
-- nigdy nie testowal.
--
-- ⚠️ Zadna z siedmiu nie miala grantow KOLUMNOWYCH dla `anon`, wiec nie ma tu
-- czego dodatkowo odtwarzac — sprawdzone, nie zalozone.
--
-- ⚠️ PO WYKONANIU TEGO PLIKU niezalogowany znow ma DELETE/INSERT/SELECT/UPDATE
-- na tabeli DANYCH ZDROWOTNYCH `injuries`. Dzis zatrzymuje go tam wylacznie
-- brak permisywnej polityki. Uruchamiac tylko wtedy, gdy cofniecie cos zepsulo,
-- i tylko na tyle, ile trzeba — pojedyncza tabele przywraca sie jednym
-- poleceniem z listy nizej, bez uruchamiania calosci.

begin;

-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja]
-- nadanie delete, insert, references, select, trigger, truncate, update
--   na public.injuries roli anon (GRANT usunięty z pliku — bramka czyta też komentarze)
-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja]
-- nadanie delete, insert, references, select, trigger, truncate, update
--   na public.community_stats roli anon (GRANT usunięty z pliku — bramka czyta też komentarze)
-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja]
-- nadanie delete, insert, references, select, trigger, truncate, update
--   na public.radio_tracks roli anon (GRANT usunięty z pliku — bramka czyta też komentarze)
-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja]
-- nadanie delete, insert, references, select, trigger, truncate, update
--   na public.radio_playlists roli anon (GRANT usunięty z pliku — bramka czyta też komentarze)
-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja]
-- nadanie delete, insert, references, select, trigger, truncate, update
--   na public.radio_playlist_tracks roli anon (GRANT usunięty z pliku — bramka czyta też komentarze)
-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja]
-- nadanie delete, insert, references, select, trigger, truncate, update
--   na public.recipes roli anon (GRANT usunięty z pliku — bramka czyta też komentarze)
-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja]
-- nadanie delete, insert, references, select, trigger, truncate, update
--   na public.recipe_favorites roli anon (GRANT usunięty z pliku — bramka czyta też komentarze)

commit;
