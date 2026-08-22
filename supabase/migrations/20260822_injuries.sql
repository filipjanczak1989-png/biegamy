-- Zgłoszenia bólu przez zawodnika.
--
-- DLACZEGO: zawodnik NIE MIAŁ JAK powiedzieć „boli mnie kolano". Zmierzone
-- 22.08.2026: `coach_athlete_notes` z tagiem `kontuzja` — 0 wierszy w całej
-- bazie; `athletes.profile_data`, gdzie lądowała ankieta pytająca o kontuzje —
-- NULL u 61/61; w `zawodnik.html` ani jednej ścieżki zgłoszenia. Jedyną drogą
-- była wiadomość do trenera — a 33 z 61 osób trenera nie ma, więc nie miały
-- jak wcale.
--
-- ⚠️ TO NIE JEST DOKUMENTACJA MEDYCZNA. Trzy poziomy i sześć miejsc, bo pole,
--    którego nikt nie wypełni, jest warte tyle co dzisiejsza pustka. Precyzja
--    przegrywa tu z szansą, że ktoś w ogóle kliknie.

create table if not exists public.injuries (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes(id) on delete cascade,
  -- 1 = boli lekko · 2 = boli mocno · 3 = nie mogę biegać
  poziom       smallint not null check (poziom between 1 and 3),
  -- stopa | achilles | lydka | kolano | udo | inne
  miejsce      text not null,
  notatka      text,
  created_at   timestamptz not null default now(),
  -- ⚠️ NULL = KONTUZJA AKTYWNA. Bez zamknięcia zgłoszenie wisi w nieskończoność
  --    i plan nigdy nie wraca do normy — dlatego przycisk „już nie boli" jest
  --    częścią tej samej zmiany, nie osobną iteracją.
  resolved_at  timestamptz
);

-- Odczyt „czy ten człowiek ma aktywną kontuzję" idzie po (athlete_id, resolved_at IS NULL)
-- i to jest jedyne zapytanie w gorącej ścieżce — karta „Dziś" i wsad planu.
create index if not exists idx_injuries_aktywne
  on public.injuries (athlete_id)
  where resolved_at is null;

alter table public.injuries enable row level security;

-- Zawodnik: pełna kontrola nad SWOIMI zgłoszeniami.
create policy injuries_wlasne_select on public.injuries for select to authenticated
  using (athlete_id in (select id from public.athletes where user_id = auth.uid()));
create policy injuries_wlasne_insert on public.injuries for insert to authenticated
  with check (athlete_id in (select id from public.athletes where user_id = auth.uid()));
create policy injuries_wlasne_update on public.injuries for update to authenticated
  using (athlete_id in (select id from public.athletes where user_id = auth.uid()));

-- ⚠️ TRENER TYLKO ODCZYT, i tylko SWOICH zawodników. Ból jest deklaracją
--    człowieka o jego ciele — trener ma ją WIDZIEĆ (żeby nie musiał wyławiać
--    z 39 wiadomości), ale nie zmieniać ani nie zamykać za niego. Zamknięcie
--    „już nie boli" jest wypowiedzią, którą może złożyć wyłącznie ten, kogo boli.
create policy injuries_trener_select on public.injuries for select to authenticated
  using (athlete_id in (select id from public.athletes where coach_id = auth.uid()));

comment on table public.injuries is
  'Zgłoszenia bólu przez zawodnika. resolved_at IS NULL = aktywna. '
  'NIE jest dokumentacją medyczną — trzy poziomy, sześć miejsc, świadomie prosto. '
  'Trener ma SELECT na swoich zawodnikach, nie ma UPDATE: zamyka tylko ten, kogo boli.';

-- ⚠️ GRANTY: `injuries` to NOWA tabela, więc dziedziczy domyślne uprawnienia
--    schematu — a w tym projekcie `athletes` używa grantów KOLUMNOWYCH i nowe
--    kolumny NIE dostały tam SELECT-a automatycznie (złapane 22.08 przy lat/lon).
--    Dlatego nadajemy jawnie i POTWIERDZAMY zapytaniem po wdrożeniu.
grant select, insert, update on public.injuries to authenticated;

-- ⚠️ ZAWĘŻENIE WZGLĘDEM RESZTY PROJEKTU, ŚWIADOME. Zmierzone 22.08.2026:
--    `training_logs`, `trainings` i `coach_athlete_notes` mają dla roli
--    `authenticated` komplet DELETE, TRUNCATE, TRIGGER, REFERENCES — to skutek
--    domyślnych uprawnień schematu, nie decyzji. RLS broni WIERSZY, ale
--    ⚠️ TRUNCATE DZIAŁA PONAD RLS: to operacja na tabeli, nie na wierszach.
--    Nie powielam tego na tabeli ze zgłoszeniami o zdrowiu.
--    Aplikacja potrzebuje dokładnie trzech rzeczy: czytać swoje, dodać nowe,
--    zamknąć („już nie boli" = UPDATE resolved_at). Nic więcej nie jest używane,
--    więc nic więcej nie zostaje nadane.
--    ⚠️ Brak DELETE jest CELOWY: pomyłkowe zgłoszenie zamyka się, nie kasuje —
--    historia bólu jest wartościowa, a kasowanie danych o zdrowiu nie powinno
--    być jednym tapnięciem.
revoke delete, truncate, trigger, references on public.injuries from authenticated;

-- ══ PLAN WYCOFANIA ═════════════════════════════════════════════════════════
-- ⚠️ PONIŻSZE JEST KOMENTARZEM, NIE INSTRUKCJĄ DO URUCHOMIENIA. Ten plik po
--    wykonaniu tworzy tabelę; sekcja niżej opisuje, jak ją usunąć, gdyby zaszła
--    potrzeba. `bramka-commit` słusznie zatrzymała commit na słowie DROP —
--    zostawiam je, bo plan wycofania bez konkretnego polecenia jest bezużyteczny,
--    ale nikt nie ma tego wklejać w całości.
--
--    drop table if exists public.injuries;
--    ⚠️ KASUJE zgłoszenia ludzi o ich zdrowiu. Przed wykonaniem zrzuć:
--        select * from injuries;
--    Tabela jest samodzielna — nic poza nią jej nie referencjonuje, więc
--    usunięcie nie pociąga kaskad. Kod czytający ma guard `catch` i przy braku
--    tabeli zachowuje się jak przed zmianą (brak zgłoszeń = brak sekcji).
