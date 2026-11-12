-- B, część ODBIERAJĄCA (krok 4, sobota 14.11.2026 rano, przy komputerze przez 2 h): zdjęcie polityki athletes_read_public
-- i zawężenie odczytu log_comments do relacji (autor, właściciel wpisu, jego trener — nikt więcej; decyzja 11.11).
--
-- WARUNKI PRZED: krok 3 (20261112_athletes_widok_i_funkcje.sql) wykonany, front z widokiem na prod od 12.11, client_errors
-- czyste do czwartku, test `ATHLETES_Z_MIGRACJA=1 tools/athletes-cudze-profile-test.sh` ZIELONY na bazie.
-- PO: test bez flagi zielony; przez REST na koncie testowym: email cudzego z athletes → 0 wierszy, własny wiersz → jest,
-- public_athletes → kolumny widoku, log_comments cudzego wpisu → 0, własnego → są, jako trener komentarze podopiecznego → są.
--
-- athletes: po zdjęciu polityki z tabeli czytają właściciel (athletes_read_own) i trener podopiecznych (athletes_read_by_coach);
-- cudzych czyta się przez widok public_athletes. Polityki INSERT/UPDATE/DELETE bez zmian.
-- log_comments: dotąd `auth.uid() is not null` = każdy zalogowany czytał wszystkie komentarze, także pod wpisami prywatnych
-- zawodników i rozmowy trener–zawodnik (privacy.html obiecuje „komentarze między Tobą a trenerem oraz znajomymi”).
-- Czwarta gałąź (decyzja 12.11): komentarz pod wpisem PUBLICZNYM czyta każdy zalogowany, z tą samą definicją „publiczny”,
-- którą ma widok public_training_logs (EXISTS na widoku: jedna definicja, nie druga kopia warunku). Anon bez zmian
-- (nie ma grantu na log_comments, polityka jest `to authenticated`).

begin;

drop policy if exists athletes_read_public on public.athletes;

drop policy if exists read_comments on public.log_comments;
create policy log_comments_read_relacja on public.log_comments
  for select to authenticated
  using (
    -- autor komentarza
    athlete_id = (select a.id from public.athletes a where a.user_id = auth.uid())
    -- właściciel wpisu
    or exists (select 1 from public.training_logs l join public.athletes a on a.id = l.athlete_id
                where l.id = log_comments.log_id and a.user_id = auth.uid())
    -- trener właściciela wpisu
    or exists (select 1 from public.training_logs l join public.athletes a on a.id = l.athlete_id
                where l.id = log_comments.log_id and a.coach_id = auth.uid())
    -- wpis publiczny: ta sama definicja co widok public_training_logs (athletes.is_public = true)
    or exists (select 1 from public.public_training_logs v where v.id = log_comments.log_id)
  );
comment on policy log_comments_read_relacja on public.log_comments is
  'Komentarz czyta autor, właściciel wpisu, trener właściciela, a pod wpisem publicznym (jak public_training_logs) każdy zalogowany (decyzja 12.11.2026). Wcześniej: każdy zalogowany wszystko.';

commit;

-- ROLLBACK (jedna linia na raz, od razu po objawie; definicje = stan prod z migawki 5.11.2026):
--   create policy athletes_read_public on public.athletes for select to public using (is_public = true and auth.uid() is not null);
--   drop policy if exists log_comments_read_relacja on public.log_comments;
--   create policy read_comments on public.log_comments for select to public using (auth.uid() is not null);
