CREATE OR REPLACE FUNCTION public.trainings_guard_coach_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  uid uuid := auth.uid();
  zmienione text[] := '{}';
begin
  if uid is null then return new; end if;
  if old.coach_id = uid then return new; end if;

  if new.coach_id is distinct from old.coach_id then
    raise exception 'coach_id w treningu może zmienić tylko trener tego treningu'
      using errcode = '42501',
            hint = 'Trening własny zostaje bez trenera; trening trenera zostaje przy nim.';
  end if;

  if old.coach_id is null then return new; end if;

  if new.athlete_id    is distinct from old.athlete_id    then zmienione := array_append(zmienione, 'athlete_id');    end if;
  if new.date          is distinct from old.date          then zmienione := array_append(zmienione, 'date');          end if;
  if new.type          is distinct from old.type          then zmienione := array_append(zmienione, 'type');          end if;
  if new.description   is distinct from old.description   then zmienione := array_append(zmienione, 'description');   end if;
  if new.steps         is distinct from old.steps         then zmienione := array_append(zmienione, 'steps');         end if;
  if new.steps_version is distinct from old.steps_version then zmienione := array_append(zmienione, 'steps_version'); end if;
  if new.exercise_ref  is distinct from old.exercise_ref  then zmienione := array_append(zmienione, 'exercise_ref');  end if;
  if array_length(zmienione, 1) is null then return new; end if;
  raise exception 'Ten trening ułożył trener — nie można zmienić: %',
                  array_to_string(zmienione, ', ')
    using errcode = '42501',
          hint = 'Wykonanie zapisuje się w: status, distance_km, pace, heart_rate, duration_min.';
end;
$function$
