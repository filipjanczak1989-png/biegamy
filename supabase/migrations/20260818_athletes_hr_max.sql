-- Własny maksymalny puls zawodnika.
--
-- DLACZEGO: strefy tętna liczyliśmy z `220 − wiek` i to jest wzór, który nigdy
-- nie miał być stosowany indywidualnie. Odchylenie standardowe tej formuły to
-- ±10–12 uderzeń (Robergs & Landwehr 2002, przegląd 43 formuł) — czyli dla
-- konkretnego człowieka pomyłka o 20 uderzeń jest w normie, a nie wyjątkiem.
-- Zgłoszenie Maćka 17.08.2026: „strefy to totalna bujda, mój max to 177–181,
-- nie to, co pokazujecie".
--
-- ⚠️ NIE PODPOWIADAMY WARTOŚCI Z LOGÓW. `training_logs.heart_rate` to tętno
--    ŚREDNIE z jednostki, nie maksymalne — średnia z definicji nie sięga maksa.
--    Zmierzone 18.08.2026 na koncie Maćka: 446 logów z tętnem, najwyższa wartość
--    173, czyli 100% poniżej jego deklarowanych 177. To NIE potwierdza ani nie
--    obala jego liczby — to po prostu inna wielkość. Podpowiedź z tego pola
--    byłaby wskaźnikiem zastępczym podanym jako pomiar.
--
-- NULL = „nie podał", nie „nie ma". Kod spada wtedy na `220 − wiek` i MUSI to
-- oznaczyć w interfejsie słowem „szacunkowe" — inaczej wracamy do stanu, w którym
-- zgadywanie wygląda jak pomiar.

alter table public.athletes
  add column if not exists hr_max smallint;

-- Zakres 120–230. Nie jest to zakres „fizjologicznie możliwy", tylko zakres
-- POMYŁEK PRZY WPISYWANIU: łapie literówkę (17 zamiast 170, 1800 zamiast 180)
-- i nie łapie nikogo realnego. Dolne 120 zostawia miejsce dla osób starszych
-- i na beta-blokerach, górne 230 dla nastolatków. Wartości spoza tego zakresu
-- to prawie na pewno pomyłka, a nie rzadki organizm.
alter table public.athletes
  drop constraint if exists athletes_hr_max_check;
alter table public.athletes
  add constraint athletes_hr_max_check
    check (hr_max is null or (hr_max >= 120 and hr_max <= 230));

comment on column public.athletes.hr_max is
  'Maksymalne tętno podane PRZEZ ZAWODNIKA (pomiar z testu lub z zegarka). '
  'NULL = nie podał → kod liczy 220 − wiek i oznacza strefy jako szacunkowe. '
  '⚠️ NIE wypełniać automatycznie z training_logs.heart_rate — to tętno ŚREDNIE.';

-- ⚠️ GRANT JEST TU KONIECZNY I TO JEST SPRAWDZONE, NIE SKOPIOWANE Z NAWYKU.
-- Zmierzone 18.08.2026: relacl dla `athletes` to
--     authenticated=awdx/postgres        ← INSERT, UPDATE, DELETE, REFERENCES
-- czyli BEZ `r`. SELECT na tej tabeli jest nadany KOLUMNOWO (52 z 58 kolumn),
-- więc kolumna dodana teraz byłaby zapisywalna, ale NIEODCZYTYWALNA — PostgREST
-- zwróciłby wtedy 403 przy `select('hr_max')`, a nie pustą wartość.
-- (Odwrotnie niż przy training_logs, gdzie grant jest tabelowy i dopisywać
--  nic nie trzeba — porównanie tych dwóch przypadków jest w komentarzu
--  migracji 20260817_training_logs_planned_training_id.sql.)
grant select (hr_max) on public.athletes to authenticated;
grant select (hr_max), insert (hr_max), update (hr_max) on public.athletes to service_role;

-- ══ KONTROLA PO MIGRACJI ═══════════════════════════════════════════════════
-- select grantee, privilege_type from information_schema.column_privileges
--  where table_name='athletes' and column_name='hr_max' order by 1,2;
-- Oczekiwane: authenticated INSERT/REFERENCES/SELECT/UPDATE (INSERT i UPDATE
-- z grantu tabelowego), service_role komplet.
