-- P4: zawodnik moze skasowac WLASNY ZAPLANOWANY trening
--
-- PO CO
-- Generator planow zapisuje plan bezposrednio z klienta (trzy inserty, bez EF).
-- Bez DELETE zawodnik nie moze:
--   1. posprzatac po nieudanym zapisie — gdyby insert do trainings przeszedl,
--      a insert do training_plan_workouts padl, w kalendarzu zostaja sieroty
--      i klient nie ma jak sie z tego wycofac,
--   2. ulozyc planu drugi raz — nowy plan naklada sie na stary.
--
-- GRANICA
-- status = 'planned' jest OBOWIAZKOWE i nie wolno go stad zdjac. Bez tego warunku
-- zawodnik kasowalby wlasna historie treningowa ('done'), a to nieodwracalne.
-- Zakres: wylacznie wlasne wiersze, mapowane przez athletes.user_id (kanon projektu;
-- model auth.uid() = athlete_id jest w tej tabeli martwy — patrz migracja
-- 20260810140100).
--
-- ⚠️ PULAPKA PRZY KONSUMPCJI
-- Odrzucenie przez USING to NIE blad. Postgres kasuje 0 wierszy, PostgREST oddaje
-- 204/200 z pusta tablica i ZERO informacji o odrzuceniu. Klient nie moze wnioskowac
-- z braku bledu, ze cokolwiek zniklo — po kasowaniu musi sprawdzic stan ODCZYTEM,
-- inaczej dolozy duplikaty na wierzch. Ta sama pulapka co przy card_bg_url.

begin;

create policy "trainings_athlete_delete" on public.trainings
  for delete to authenticated
  using (
    athlete_id in (select id from public.athletes where user_id = auth.uid())
    and status = 'planned'
  );

commit;
