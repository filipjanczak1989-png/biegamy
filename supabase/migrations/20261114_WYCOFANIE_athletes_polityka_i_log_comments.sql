-- WYCOFANIE 20261114_athletes_polityka_i_log_comments.sql: przywraca athletes_read_public i read_comments, zdejmuje log_comments_read_relacja.
-- Definicje = żywe polityki z produkcji odczytane 12.11.2026 22:05 (pg_policies), zgodne z migawką 5.11. Bez zmian w innych politykach i uprawnieniach.
-- Bezpieczne do ponownego uruchomienia: każda polityka najpierw zdejmowana, jeśli istnieje.
begin;

drop policy if exists log_comments_read_relacja on public.log_comments;
drop policy if exists read_comments on public.log_comments;
create policy read_comments on public.log_comments for select to public using (auth.uid() is not null);

drop policy if exists athletes_read_public on public.athletes;
create policy athletes_read_public on public.athletes for select to public using (is_public = true and auth.uid() is not null);

notify pgrst, 'reload schema';
commit;
