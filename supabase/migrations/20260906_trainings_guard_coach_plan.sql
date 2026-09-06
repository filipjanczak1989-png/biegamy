-- Zamiar trenera przestaje być zapisywalny przez zawodnika.
--
-- DZIURA: `trainings_athlete_update` ma warunek WYŁĄCZNIE „athlete_id należy do
-- usera" — bez `plan_source`, bez `status`. Zawodnik mógł więc nadpisać KAŻDY
-- swój wiersz, w tym 2181 z `plan_source='coach'` (1324 planned + 857 done),
-- czyli plan dostany od Filipa albo Kasi. Dla porównania
-- `trainings_athlete_delete` ma przynajmniej `status='planned'`.
-- To ta sama klasa co D7, tylko na drugą stronę: tam trener mógł pisać cudzym,
-- tu zawodnik mógł pisać trenerskim.
--
-- ⚠️ DLACZEGO TRIGGER, A NIE POLITYKA ANI GRANT — obie drogi są zamknięte
--    i sprawdziłem je, zanim tu doszedłem:
--
--    RLS działa na WIERSZACH. Zawężenie po wierszu (np. `plan_source
--    IS DISTINCT FROM 'coach'`) odcięłoby oznaczanie wykonania — a to nie jest
--    przypadek brzegowy: 857 wierszy trenerskich ma już `status='done'`,
--    z czego 851 z dystansem. Zawodnik MUSI móc powiedzieć „zrobione".
--
--    GRANT działa na KOLUMNACH, ale na ROLE — a trener i zawodnik to ta sama
--    rola `authenticated` (role w bazie: anon / authenticated / service_role;
--    rozdziela ich wyłącznie polityka). Odebranie kolumny zawodnikowi odebrałoby
--    ją trenerowi. To różnica wobec `athletes`, gdzie GRANT kolumnowy zadziałał.
--
--    Zostaje trigger albo wąskie RPC. RPC wymagałoby przepisania PIĘCIU ścieżek
--    zapisu w kliencie, a przeoczenie którejkolwiek zostawia dziurę. Trigger
--    pilnuje niezależnie od ścieżki, także tych, których dziś nie znamy.
--
-- ⚠️ ARGUMENT, KTÓRY TYDZIEŃ TEMU BYŁBY PRZECIW: trigger to kolejny obiekt
--    w bazie, o którym repo nie wie. Od 29.08 mamy migawkę (`supabase/schema/`),
--    więc trigger w niej wyląduje i każdy przyszły rozjazd będzie diffem.
--    To jest jego pierwszy prawdziwy test.
--
-- ⚠️ CO ZOSTAJE WOLNE I DLACZEGO: status, distance_km, pace, heart_rate,
--    duration_min. To jest ZAPIS WYKONANIA — `trainings` niesie jednocześnie
--    plan i log (znana wada: zalogowanie treningu nadpisuje distance_km
--    wartością wykonaną), więc te kolumny należą do zawodnika.
--
-- ⚠️ `plan_source` ŚWIADOMIE POZA ZAKRESEM. Zawodnik już go nie pisze
--    (poprawka d86f6c0 — gałąź zawodnika w saveTraining ustawiała
--    `plan_source:'coach'`, przebierając własny trening za trenerski), ale
--    kolumna zostaje zapisywalna. Wpisać ją do ochrony można w każdej chwili;
--    zakres tej migracji jest ustalony i nie rozszerzam go po cichu.
--
-- ⚠️ KOSZT ZMIERZONY PRZED WYKONANIEM, na 2121 parach plan↔kalendarz
--    (`training_plan_workouts.calendar_training_id`):
--        inna data          76  u 9 osób  (68 z tego o JEDEN dzień)
--        inny typ           18            (9 z nich to zapis rzeczywistości:
--                                          → Start 4, → Odpoczynek 5)
--        inny opis         145            (ale 70 to dopisanie do PUSTEGO opisu
--                                          planu, 1 skasowanie; realnych
--                                          nadpisań niepustego zalecenia: 74)
--    ⚠️ SPRAWCY NIE DA SIĘ USTALIĆ i trzeba to wiedzieć: nie ma `updated_by`
--    ani historii zmian, wszystkie 9 osób z przesunięciem MA trenera, a do
--    poprawki d86f6c0 edycja zawodnika podpisywała się `plan_source='coach'`,
--    więc edycje zawodnika były w danych zakamuflowane jako trenerskie.
--    Te liczby są więc GÓRNĄ granicą tego, co odbieramy, nie pomiarem użycia.

create or replace function public.trainings_guard_coach_plan()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $fn$
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
$fn$;

comment on function public.trainings_guard_coach_plan() is
  'Chroni zamiar trenera w public.trainings przed zapisem przez zawodnika. '
  'Blokuje: athlete_id, coach_id, date, type, description, steps, steps_version, '
  'exercise_ref. Wolne (zapis wykonania): status, distance_km, pace, heart_rate, '
  'duration_min. Przepuszcza bez sprawdzania: brak JWT (service_role), wiersz '
  'bez coach_id (trening własny zawodnika) oraz trenera tego wiersza. '
  'Powód: trainings_athlete_update nie zawęża ani kolumn, ani wierszy, a RLS '
  'kolumn nie umie i GRANT nie rozdzieli trenera od zawodnika (ta sama rola).';

drop trigger if exists trg_trainings_guard_coach_plan on public.trainings;
create trigger trg_trainings_guard_coach_plan
  before update on public.trainings
  for each row execute function public.trainings_guard_coach_plan();

-- ══ SAMOKONTROLA — WYKONANA 6.09.2026, WYNIK PONIŻEJ ══════════════════════
-- ⚠️ ZWYKŁY SELECT NIE DOWODZI NICZEGO. `supabase db query` leci jako
--    `postgres`, czyli DOKŁADNIE tą ścieżką, którą trigger przepuszcza
--    (uid IS NULL). „Trigger istnieje" to nie to samo co „trigger broni".
--    Podszywamy się więc pod użytkownika przez GUC i cofamy transakcję:
--        begin;
--          set local request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
--          <update>;
--        rollback;
--
-- ⚠️ SAMOKONTROLA ZŁAPAŁA BŁĄD I DLATEGO TU STOI. Pierwsza wersja miała
--    `zmienione := zmienione || 'type'`, co PostgreSQL parsuje jako TABLICĘ
--    i wywala 22P02. Trigger nadal blokował — ale nie swoim kodem i nie swoim
--    komunikatem: PostgREST oddałby 500 zamiast 403, a człowiek dostałby
--    bełkot o „malformed array literal". Zielone „trigger utworzony" tego
--    nie pokazało. Poprawione na `array_append`.
--
--    1. zawodnik → type na wierszu trenerskim      ODMOWA 42501 „…nie można zmienić: type"
--    2. zawodnik → date + description naraz        ODMOWA 42501, wymienia OBIE kolumny
--    3. zawodnik → status+distance+pace+hr+czas    PRZESZŁO, wartości zapisane
--    4. trener TEGO wiersza → type + description   PRZESZŁO
--    5. zawodnik → type WŁASNEGO treningu          PRZESZŁO  ⚠️ najważniejszy:
--       (coach_id IS NULL, plan z generatora)                 196 wierszy z generatora
--                                                             musi zostać edytowalnych
--    6. OBCY trener → type                         ODMOWA 42501
--    7. brak JWT (service_role / admin) → type     PRZESZŁO
--
-- ══ KONTROLA STANU ════════════════════════════════════════════════════════
-- select tgname, tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
--  where c.relname='trainings' and not t.tgisinternal;      -- oczekiwane: O (enabled)
-- select proname from pg_proc where proname='trainings_guard_coach_plan';
