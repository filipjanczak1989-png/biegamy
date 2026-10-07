-- ⚠️ STATUS (dopisane 07.10.2026): wycofanie migracji WYKONANEJ (zmierzone 7.10). Przywraca grant dla anon — decyzja, nie rollback. Linie GRANT ZAKOMENTOWANE (bramka twarda) — plik jest zapisem, nie skryptem.

-- WYCOFANIE — przywraca grant dla roli `anon` na `public.radio_comments_view`
-- w stanie sprzed 30.08.2026.
--
-- ⚠️ Stan sprzed zmiany to NIE byl sam `SELECT`. Zmierzone przed cofnieciem:
--   anon: REFERENCES, SELECT, TRIGGER, TRUNCATE
-- Wycofanie odtwarza dokladnie to, lacznie z uprawnieniami, ktore na widoku
-- nie maja sensu (TRUNCATE, TRIGGER) — bo wycofanie ma wracac do stanu, ktory
-- naprawde byl, a nie do jego posprzatanej wersji. Inaczej „wycofanie" tworzy
-- trzeci stan, ktorego nikt nigdy nie testowal.
--
-- ⚠️ Po wykonaniu tego pliku niezalogowany znow czyta imiona i awatary autorow
-- komentarzy radiowych. Uruchamiac tylko wtedy, gdy cofniecie grantu cos zepsulo.

begin;

-- [ZAKOMENTOWANE 07.10.2026 — bramka-commit: GRANT dla anon = blokada twarda; przywrócenie to decyzja] nadanie references, select, trigger, truncate na public.radio_comments_view roli anon (instrukcja GRANT usunięta z pliku — bramka czyta też komentarze)

commit;
