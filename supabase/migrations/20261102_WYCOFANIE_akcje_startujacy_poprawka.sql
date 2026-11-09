-- WYCOFANIE 20261102_akcje_startujacy_poprawka.sql — przywraca stan sprzed poprawki (BŁĘDNY: startujący = konto
-- testowe, konto testowe próby = główne konto Filipa). Tylko gdyby poprawka sama coś zepsuła.
-- ⚠️ 9.11.2026: e-maile i UUID kont usunięte z repo (repo jest publiczne). W ich miejscu opis roli; wartości w notatce Filipa poza repo.
--    Migracja wykonana na bazie; tego pliku NIE uruchamiać ponownie (placeholdery celowo przerywają ponowne uruchomienie).
begin;
update public.akcja_startujacy s
   set athlete_id = '<KONTO TESTOWE PRÓBY: wartość poza repo>'
  from public.akcje a
 where a.id = s.akcja_id and a.slug in ('dla-fabianka', 'proba')
   and s.athlete_id = '<KONTO STARTUJĄCE: wartość poza repo>';
update public.akcje set konta_testowe = array['<KONTO STARTUJĄCE: wartość poza repo>'::uuid] where slug = 'proba';
commit;
-- KONTROLA: select a.slug, s.athlete_id from akcja_startujacy s join akcje a on a.id = s.akcja_id;
