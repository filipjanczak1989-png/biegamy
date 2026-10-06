-- WYCOFANIE D7b — przywraca stan sprzed 20261006_d7b_…, czyli stan PRODUKCJI z 06.10.2026
-- (migracja 0829 NIE była wykonana, więc wracamy do `coach_manage_trainings`, nie do
-- `trainings_coach_*`).
--
-- ⚠️ Wycofanie odtwarza stan, który NAPRAWDĘ był, z jego dziurami (a) i (c) z nagłówka D7b:
--   · `coach_manage_trainings` FOR ALL TO public, bez WITH CHECK;
--   · `trainings_athlete_insert` bez warunku na coach_id;
--   · trigger w wersji z 06.09 (coach_id pilnowany tylko na wierszu z cudzym coach_id).
-- Uruchamiać tylko wtedy, gdy D7b coś zepsuło — i zapisać CO, zanim się cofnie.

begin;

drop policy if exists "trainings_coach_select" on public.trainings;
drop policy if exists "trainings_coach_insert" on public.trainings;
drop policy if exists "trainings_coach_update" on public.trainings;
drop policy if exists "trainings_coach_delete" on public.trainings;
drop policy if exists "coach_manage_trainings" on public.trainings;

create policy "coach_manage_trainings" on public.trainings
  for all to public
  using (coach_id = auth.uid());

drop policy if exists "trainings_athlete_insert" on public.trainings;

create policy "trainings_athlete_insert" on public.trainings
  for insert to authenticated
  with check (athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid()));

-- trigger: wersja z 20260906_trainings_guard_coach_plan.sql (zmierzona w migawce
-- supabase/schema/funkcje/trainings_guard_coach_plan.sql, suma 7061b121ba244c6d)
create or replace function public.trainings_guard_coach_plan()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $fn$
declare
  uid uuid := auth.uid();
  zmienione text[] := '{}';
begin
  if uid is null then return new; end if;
  if old.coach_id is null then return new; end if;
  if old.coach_id = uid then return new; end if;
  if new.athlete_id    is distinct from old.athlete_id    then zmienione := array_append(zmienione, 'athlete_id');    end if;
  if new.coach_id      is distinct from old.coach_id      then zmienione := array_append(zmienione, 'coach_id');      end if;
  if new.date          is distinct from old.date          then zmienione := array_append(zmienione, 'date');          end if;
  if new.type          is distinct from old.type          then zmienione := array_append(zmienione, 'type');          end if;
  if new.description   is distinct from old.description   then zmienione := array_append(zmienione, 'description');   end if;
  if new.steps         is distinct from old.steps          then zmienione := array_append(zmienione, 'steps');         end if;
  if new.steps_version is distinct from old.steps_version then zmienione := array_append(zmienione, 'steps_version'); end if;
  if new.exercise_ref  is distinct from old.exercise_ref  then zmienione := array_append(zmienione, 'exercise_ref');  end if;
  if array_length(zmienione, 1) is null then return new; end if;
  raise exception 'Ten trening ułożył trener — nie można zmienić: %',
                  array_to_string(zmienione, ', ')
    using errcode = '42501',
          hint = 'Wykonanie zapisuje się w: status, distance_km, pace, heart_rate, duration_min.';
end;
$fn$;

drop trigger if exists trg_trainings_guard_coach_plan on public.trainings;
create trigger trg_trainings_guard_coach_plan
  before update on public.trainings
  for each row execute function public.trainings_guard_coach_plan();

commit;
