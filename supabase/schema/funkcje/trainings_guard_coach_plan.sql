CREATE OR REPLACE FUNCTION public.trainings_guard_coach_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  uid uuid := auth.uid();
  -- ⚠️ `array_append`, NIE `zmienione || 'nazwa'`. Operator `||` z nieotypowanym
  --    literałem PostgreSQL parsuje jako TABLICĘ i wywala 22P02 („malformed
  --    array literal"). Trigger wtedy nadal blokuje — ale nie swoim kodem
  --    42501 i nie swoim komunikatem, więc PostgREST oddaje 500 zamiast 403,
  --    a człowiek dostaje bełkot o tablicy. Złapane samokontrolą przy
  --    wdrożeniu; „trigger istnieje" to nie to samo co „trigger broni".
  zmienione text[] := '{}';
begin
  -- Brak JWT => service_role albo SQL admina. `anon` nie ma na tej tabeli
  -- ŻADNYCH uprawnień (migawka 29.08), więc pusty uid nie jest tu furtką.
  -- Edge Functions piszą wyłącznie service_role i żadna nie robi UPDATE-u
  -- na `trainings` (sprawdzone: jedyny zapis to INSERT w approve-training-plan).
  if uid is null then return new; end if;

  -- Wiersz bez trenera to trening własny zawodnika (m.in. wszystkie 196
  -- z generatora) — jego zamiar jest jego, wolno mu go zmieniać.
  if old.coach_id is null then return new; end if;

  -- Pisze trener TEGO wiersza. Ten sam warunek, którego używa polityka
  -- `coach_manage_trainings` (coach_id = auth.uid()) — jedno kryterium
  -- „kto tu jest trenerem", nie dwa.
  if old.coach_id = uid then return new; end if;

  if new.athlete_id    is distinct from old.athlete_id    then zmienione := array_append(zmienione, 'athlete_id');    end if;
  if new.coach_id      is distinct from old.coach_id      then zmienione := array_append(zmienione, 'coach_id');      end if;
  if new.date          is distinct from old.date          then zmienione := array_append(zmienione, 'date');          end if;
  if new.type          is distinct from old.type          then zmienione := array_append(zmienione, 'type');          end if;
  if new.description   is distinct from old.description   then zmienione := array_append(zmienione, 'description');   end if;
  if new.steps         is distinct from old.steps         then zmienione := array_append(zmienione, 'steps');         end if;
  if new.steps_version is distinct from old.steps_version then zmienione := array_append(zmienione, 'steps_version'); end if;
  if new.exercise_ref  is distinct from old.exercise_ref  then zmienione := array_append(zmienione, 'exercise_ref');  end if;

  if array_length(zmienione, 1) is null then return new; end if;

  -- 42501 = insufficient_privilege. PostgREST mapuje to na 403, nie na 500 —
  -- klient ma dostać odmowę, a nie „błąd serwera".
  raise exception 'Ten trening ułożył trener — nie można zmienić: %',
                  array_to_string(zmienione, ', ')
    using errcode = '42501',
          hint = 'Wykonanie zapisuje się w: status, distance_km, pace, heart_rate, duration_min.';
end;
$function$
