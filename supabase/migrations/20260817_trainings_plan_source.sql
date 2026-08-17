-- Skąd wziął się trening w kalendarzu: od trenera czy z generatora zawodnika.
--
-- DLACZEGO NOWA KOLUMNA, A NIE `coach_id IS NULL`: to działa DZIŚ, ale przez
-- przypadek. `coach_id` odpowiada na pytanie „kto jest właścicielem wiersza",
-- nie „kto to zaplanował". Zmierzone 17.08.2026: 2181 treningów ma coach_id,
-- 26 nie ma — i te 26 NIE pochodzi z generatora (generator zapisał 0 planów),
-- tylko z czasów, gdy wstawiano je inaczej. Wnioskowanie o pochodzeniu z pola
-- o innym znaczeniu to ta sama pomyłka co `pb_*` jako `text`.
--
-- ⚠️ POWÓD PRODUKTOWY, NIE PORZĄDKOWY: bez tego trener edytuje plan, który
--    ktoś ułożył sobie sam, w przekonaniu że poprawia własną robotę. A zawodnik
--    czytał „📋 Plan trenera" pod planem, który sam sobie wygenerował.
--
-- ⚠️ BACKFILL TYLKO TEGO, CO DA SIĘ UDOWODNIĆ. `kalendarz.html` (panel trenerski)
--    ZAWSZE wpisuje `coach_id: session.user.id`, więc coach_id NOT NULL dowodzi
--    pochodzenia od trenera. Odwrotnie już nie: NULL nie dowodzi generatora.
--    Te 26 wierszy zostaje z plan_source = NULL („nie wiadomo") zamiast dostać
--    zmyśloną etykietę. Konsumenci mają traktować NULL jako „nieznane", a nie
--    jako „generator".

alter table public.trainings
  add column if not exists plan_source text;

-- PostgreSQL nie zna `ADD CONSTRAINT IF NOT EXISTS` — stąd blok DO.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trainings_plan_source_check'
      and conrelid = 'public.trainings'::regclass
  ) then
    alter table public.trainings
      add constraint trainings_plan_source_check
      check (plan_source is null or plan_source in ('coach', 'generator'));
  end if;
end $$;

update public.trainings
   set plan_source = 'coach'
 where plan_source is null
   and coach_id is not null;

comment on column public.trainings.plan_source is
  'Kto zaplanował ten trening: coach (panel trenerski) albo generator '
  '(zawodnik sam sobie ułożył plan). NULL = nieznane, wiersze sprzed 17.08.2026 '
  'bez coach_id. ⚠️ NIE wnioskować pochodzenia z coach_id — to pole o innym '
  'znaczeniu. Znacznik zmienia się na "coach", gdy trener zapisze edycję.';

-- ⚠️ GRANTU TU NIE MA I TO JEST SPRAWDZONE, NIE POMINIĘTE.
-- Zmierzone 17.08.2026: `authenticated` ma na `trainings` SELECT nadany
-- TABELOWO, a grant tabelowy obejmuje kolumny dodane później. (Blizna
-- „GRANT po ADD COLUMN" dotyczy `athletes`, gdzie SELECT jest kolumnowy.)
