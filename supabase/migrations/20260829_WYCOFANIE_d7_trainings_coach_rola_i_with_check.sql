-- ⚠️ STATUS (dopisane 07.10.2026): wycofanie migracji NIEWYKONANEJ (0829 zastąpiona przez 20261006_d7b). Historia, nie wykonywać.

-- WYCOFANIE D7 — przywraca dokladnie stan sprzed 29.08.2026:
-- jedna polityka `coach_manage_trainings`, rola `public`, `FOR ALL`,
-- `USING (coach_id = auth.uid())`, BEZ `WITH CHECK`.
--
-- ⚠️ Odtwarza rowniez brak `WITH CHECK` — to jest celowe. Wycofanie ma wracac do
-- stanu, ktory naprawde byl, a nie do jego ulepszonej wersji; inaczej „wycofanie"
-- jest trzecim stanem, ktorego nikt nigdy nie testowal.
--
-- Sprawdzenie po wycofaniu (ten sam zestaw co przy wdrozeniu):
--   trener1 widzi 1825 | trener2 467 | obcy 0
--   trener1 wpisuje SWOJ coach_id → OK | trener1 wpisuje CUDZY → ODRZUCONE

begin;

drop policy if exists "trainings_coach_select" on public.trainings;
drop policy if exists "trainings_coach_insert" on public.trainings;
drop policy if exists "trainings_coach_update" on public.trainings;
drop policy if exists "trainings_coach_delete" on public.trainings;

create policy "coach_manage_trainings" on public.trainings
  for all to public
  using (coach_id = auth.uid());

commit;
