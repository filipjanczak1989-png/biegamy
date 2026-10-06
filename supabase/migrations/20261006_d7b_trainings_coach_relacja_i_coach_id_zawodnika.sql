-- D7b — public.trainings: polityka trenera z RELACJĄ (athletes.coach_id), rola `authenticated`,
-- INSERT zawodnika bez cudzego coach_id, trigger domyka zmianę coach_id na własnym wierszu.
--
-- Zastępuje NIEWYKONANĄ 20260829_d7_trainings_coach_rola_i_with_check.sql (zostaje w repo
-- jako ślad). Tamta migracja robiła tylko (b) z poniższej listy; zwiad 06.10.2026 wykazał:
--
--   (a) with_check trenera = `coach_id = auth.uid()` — NIE wymaga, żeby athlete_id należał
--       do zawodnika TEGO trenera. Każdy zalogowany (trener i nie-trener — rola jest jedna)
--       może wstawić wiersz z coach_id = swoje uid i DOWOLNYM athlete_id. Wiersz pojawia się
--       w kalendarzu obcej osoby jako „plan trenera". Przed 0829 to samo — przy `FOR ALL`
--       bez WITH CHECK Postgres bierze USING jako warunek zapisu, czyli identyczny warunek.
--   (c) trainings_athlete_insert sprawdza tylko athlete_id → zawodnik może wstawić własny
--       wiersz z coach_id = uid DOWOLNEGO trenera; ten trener zobaczy go przez
--       trainings_coach_select jako swój. trainings_athlete_update + trigger
--       trainings_guard_coach_plan (na prod od 06.09) blokują zmianę coach_id TYLKO gdy
--       old.coach_id jest cudzy i niepusty — wiersz własny (old.coach_id IS NULL) wolno
--       przepisać na dowolnego trenera.
--
-- ZASADA JEDNA: coach_id w wierszu może być (1) NULL, (2) uid trenera, który jest trenerem
-- tego zawodnika w `athletes.coach_id`. Nic innego. Egzekwowane:
--   · dla trenera — w WITH CHECK (insert/update) przez relację,
--   · dla zawodnika — INSERT tylko z coach_id IS NULL (RLS), zmiana coach_id w UPDATE
--     zablokowana w triggerze (RLS nie widzi OLD, trigger widzi — to już przyjęty wzorzec).
--
-- ⚠️ Czego NIE zmieniamy i dlaczego:
--   · trainings_athlete_update WITH CHECK zostaje bez warunku na coach_id. Wariant
--     „coach_id = athletes.coach_id" ODRZUCONY: po odpięciu trenera stare wiersze mają
--     coach_id dawnego trenera, a athletes.coach_id = NULL — zawodnik nie mógłby oznaczyć
--     ich jako done/missed. Trigger załatwia to bez tej regresji.
--   · trainings_coach_select / _delete zostają na samym `coach_id = auth.uid()`: trener ma
--     widzieć i móc skasować własne wiersze także u zawodnika, który się odpiął.
--   · service_role (approve-training-plan: INSERT l.219, DELETE l.176) ma BYPASSRLS —
--     polityki go nie dotyczą; guard tej EF sprawdza plan.coach_id === user.id.
--
-- ŚCIEŻKI ZAPISU PRZEJRZANE (24 miejsca, zwiad 06.10 — tabela w komunikacie paczki):
--   PRZEJDĄ: wszystkie 9 INSERT-ów trenera (coach_id = session.user.id, athlete_id z listy
--   JEGO zawodników), oba INSERT-y zawodnika (zawodnik.html:6165 coach_id:null,
--   kalendarz.html:2620 coach_id niepodany → NULL), wszystkie 8 UPDATE-ów (żaden nie
--   wysyła coach_id/athlete_id), 5 DELETE-ów (bez zmian w polityce delete).
--   ZMIANA ZACHOWANIA (zamierzona): trener edytujący (kalendarz.html:2510) wiersz zawodnika,
--   który już go odpiął → odmowa WITH CHECK. Dziś przechodzi. To przypadek brzegowy
--   „trener grzebie w kalendarzu byłego zawodnika" — uznany za poprawną odmowę.
--
-- ⚠️ TRENER JEST TEŻ ZAWODNIKIEM (LEKCJE #19b): trener planujący SOBIE wstawia wiersz
--   z coach_id = własne uid i athlete_id = własny wiersz athletes. Przechodzi przez
--   trainings_athlete_*? NIE (coach_id nie NULL). Przez trainings_coach_insert? Tylko gdy
--   jego athletes.coach_id = jego uid. Jeśli trener ma u siebie coach_id NULL, wstawienie
--   z coach_id = uid ODBIJE. Sprawdzić przed wykonaniem:
--     select id, coach_id from athletes where user_id in (select id from coaches);
--   i w razie NULL — albo ustawić coach_id na siebie, albo zaakceptować, że trener
--   planuje sobie jak zawodnik (coach_id NULL).
--
-- IDEMPOTENTNA: każde `create policy` poprzedzone `drop policy if exists`; funkcja przez
-- `create or replace`; trigger `drop if exists` + `create`. Jedna transakcja; przy błędzie
-- w środku nic nie zostaje.
--
-- WYCOFANIE: 20261006_WYCOFANIE_d7b_trainings_coach_relacja_i_coach_id_zawodnika.sql

begin;

-- ── 1. Polityki trenera: rola authenticated, cztery polecenia, RELACJA w zapisie ──
drop policy if exists "coach_manage_trainings"  on public.trainings;
drop policy if exists "trainings_coach_select"  on public.trainings;
drop policy if exists "trainings_coach_insert"  on public.trainings;
drop policy if exists "trainings_coach_update"  on public.trainings;
drop policy if exists "trainings_coach_delete"  on public.trainings;

create policy "trainings_coach_select" on public.trainings
  for select to authenticated
  using (coach_id = auth.uid());

create policy "trainings_coach_insert" on public.trainings
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and athlete_id in (select a.id from public.athletes a where a.coach_id = auth.uid())
  );

create policy "trainings_coach_update" on public.trainings
  for update to authenticated
  using (coach_id = auth.uid())
  with check (
    coach_id = auth.uid()
    and athlete_id in (select a.id from public.athletes a where a.coach_id = auth.uid())
  );

create policy "trainings_coach_delete" on public.trainings
  for delete to authenticated
  using (coach_id = auth.uid());

-- ── 2. INSERT zawodnika: własny wiersz = bez trenera ──
drop policy if exists "trainings_athlete_insert" on public.trainings;

create policy "trainings_athlete_insert" on public.trainings
  for insert to authenticated
  with check (
    athlete_id in (select a.id from public.athletes a where a.user_id = auth.uid())
    and coach_id is null
  );

-- ── 3. Trigger: zmiana coach_id dozwolona WYŁĄCZNIE trenerowi tego wiersza ──
-- Różnica wobec wersji z 06.09: sprawdzenie coach_id idzie PRZED wczesnym wyjściem
-- `old.coach_id is null`, więc obejmuje też wiersz własny zawodnika.
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
  if uid is null then return new; end if;                 -- service_role / postgres: bez JWT
  if old.coach_id = uid then return new; end if;          -- trener tego wiersza: wolno wszystko

  -- 06.10.2026: coach_id pilnowany ZAWSZE, także gdy old.coach_id IS NULL (wiersz własny).
  if new.coach_id is distinct from old.coach_id then
    raise exception 'coach_id w treningu może zmienić tylko trener tego treningu'
      using errcode = '42501',
            hint = 'Trening własny zostaje bez trenera; trening trenera zostaje przy nim.';
  end if;

  if old.coach_id is null then return new; end if;        -- wiersz własny: reszta kolumn wolna

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
$fn$;

comment on function public.trainings_guard_coach_plan() is
  'Chroni zamiar trenera w public.trainings przed zapisem przez zawodnika. '
  'Od 06.10.2026 coach_id może zmienić WYŁĄCZNIE trener tego wiersza (także na wierszu '
  'własnym zawodnika, gdzie old.coach_id IS NULL). Na wierszu trenera blokuje ponadto: '
  'athlete_id, date, type, description, steps, steps_version, exercise_ref. Wolne (zapis '
  'wykonania): status, distance_km, pace, heart_rate, duration_min. Przepuszcza bez '
  'sprawdzania: brak JWT (service_role). Powód: RLS nie widzi OLD, więc zakaz zmiany '
  'kolumny musi siedzieć w triggerze; GRANT nie rozdzieli trenera od zawodnika (ta sama rola).';

drop trigger if exists trg_trainings_guard_coach_plan on public.trainings;
create trigger trg_trainings_guard_coach_plan
  before update on public.trainings
  for each row execute function public.trainings_guard_coach_plan();

commit;
