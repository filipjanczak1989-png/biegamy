-- G0: uszczelnienie RLS na training_plans / training_plan_workouts
--
-- PROBLEM
-- training_plans_insert_coach sprawdzalo WYLACZNIE coach_id = auth.uid().
-- Nie weryfikowalo, czy wstawiajacy jest trenerem, i NIE ograniczalo athlete_id.
-- Dowolny zalogowany mogl wstawic plan obcemu zawodnikowi z coach_id = wlasny uid
-- i status='approved' — polityka SELECT ofiary ('approved' + wlasny athlete_id)
-- pokazalaby taki plan jako plan od trenera.
--
-- MOST TOZSAMOSCI (wazne, bo nazwy kolumn myla)
--   athletes.coach_id      -> coaches(id)
--   training_plans.coach_id -> auth.users(id)
--   coaches.id             -> auth.users(id)   [zmierzone: 2 z 2 wierszy]
-- Czyli obie kolumny 'coach_id' trzymaja TEN SAM uid i porownanie jest legalne.
-- Warunek `athlete_id IN (SELECT id FROM athletes WHERE coach_id = auth.uid())`
-- implikuje bycie trenerem — nie-trener nie ma zadnego wiersza w athletes.coach_id,
-- wiec auth_is_coach() byloby tu redundantne.
--
-- ZAKRES
-- Zaostrzamy WYLACZNIE INSERT. USING dla SELECT/UPDATE/DELETE zostaje bez zmian,
-- zeby nie odciac trenera od istniejacych wierszy (jest 1 plan w statusie draft,
-- gdzie plan.coach_id <> athlete.coach_id — zaszlosc, nie do zablokowania teraz).
-- We wszystkich 8 politykach role public -> authenticated.
--
-- BLAST RADIUS
-- Zywa sciezka tworzenia planow to EF generate-training-plan / approve-training-plan,
-- ktore uzywaja SERVICE_ROLE i omijaja RLS. Klient (trener.html) robi tylko
-- SELECT/UPDATE/DELETE. Zaostrzenie INSERT nie dotyka zadnej dzialajacej sciezki.

begin;

-- ── training_plans ────────────────────────────────────────────────────────────

alter policy "training_plans_insert_coach" on public.training_plans
  to authenticated
  with check (
    coach_id = auth.uid()
    and athlete_id in (select id from public.athletes where coach_id = auth.uid())
  );

alter policy "training_plans_select_coach_or_athlete" on public.training_plans
  to authenticated;

alter policy "training_plans_update_coach" on public.training_plans
  to authenticated;

alter policy "training_plans_delete_coach" on public.training_plans
  to authenticated;

-- ── training_plan_workouts ────────────────────────────────────────────────────

alter policy "training_plan_workouts_insert_coach" on public.training_plan_workouts
  to authenticated
  with check (
    exists (
      select 1
      from public.training_plans tp
      where tp.id = training_plan_workouts.plan_id
        and tp.coach_id = auth.uid()
        and tp.athlete_id in (select id from public.athletes where coach_id = auth.uid())
    )
  );

alter policy "training_plan_workouts_select_via_plan" on public.training_plan_workouts
  to authenticated;

alter policy "training_plan_workouts_update_coach" on public.training_plan_workouts
  to authenticated;

alter policy "training_plan_workouts_delete_coach" on public.training_plan_workouts
  to authenticated;

commit;
