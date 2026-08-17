-- Powiązanie logu z zaplanowanym treningiem, który on wykonuje.
--
-- DLACZEGO: dziś system NIE WIE, czy zaplanowany trening został zrobiony —
-- dopasowuje po DACIE przy zapisie logu (zawodnik.html) i na tym koniec.
-- Zmierzone 17.08.2026 na 1333 zaplanowanych jednostkach z ostatniego roku:
--     log tego samego dnia          895  (67%)
--     log ±1 dzień, nie tego dnia   278  (21%)
--     log ±2–3 dni                   91  ( 7%)
--     brak logu w ±3 dni             69  ( 5%)
-- Co trzecie wykonanie ląduje w innym dniu, niż było zaplanowane, i dzisiejszy
-- matcher o nim nie wie. Do tego 158 dni ma >1 zaplanowaną jednostkę, a 265 dni
-- >1 log — tam `.maybeSingle()` w kliencie po prostu milczy.
--
-- ⚠️ KOLUMNA `training_id` JUŻ ISTNIEJE I JEST MARTWA: 0 wypełnień na 2671 logów.
--    Nie reanimujemy jej, bo nie wiadomo, co miała znaczyć ani kto ją czyta.
--    Nowa kolumna ma jedno, zapisane znaczenie: „ten log wykonuje TEN wiersz
--    z trainings". Martwą zostawiamy do osobnej decyzji o usunięciu.
--
-- ON DELETE SET NULL, nie CASCADE: gdy plan jest zastępowany (generator kasuje
-- stare `planned` przed zapisem nowego), log MUSI przeżyć. Log jest zapisem
-- tego, co człowiek naprawdę zrobił — plan może zniknąć, bieg nie.

alter table public.training_logs
  add column if not exists planned_training_id uuid
    references public.trainings(id) on delete set null;

-- Indeks na kolumnie FK: bez niego odczyt „które logi wykonują ten plan"
-- i sprawdzanie referencji przy DELETE z `trainings` idą seq scanem.
-- Częściowy, bo zdecydowana większość logów nie będzie miała powiązania.
create index if not exists idx_training_logs_planned_training
  on public.training_logs (planned_training_id)
  where planned_training_id is not null;

comment on column public.training_logs.planned_training_id is
  'Zaplanowany trening (trainings.id), który ten log wykonuje. NULL = log bez '
  'planu albo dopasowanie niepewne. ⚠️ Wypełniane TYLKO gdy dopasowanie jest '
  'jednoznaczne (jeden plan i jeden log tego dnia) i przechodzi kontrolę zdrowia '
  '— patrz komentarz przy zapisie w zawodnik.html. NIE wnioskować wykonania '
  'z samej daty: 21% wykonań ląduje o dzień obok.';

-- ⚠️ GRANTU TU NIE MA I TO JEST SPRAWDZONE, NIE POMINIĘTE.
-- Zmierzone 17.08.2026 na `relacl`: authenticated=arwdDxtm/postgres na
-- public.training_logs — grant TABELOWY, a taki obejmuje kolumny dodane
-- później. (Blizna „GRANT po ADD COLUMN" dotyczy `athletes`, gdzie SELECT
-- jest nadany KOLUMNOWO — tam grant byłby konieczny.)
