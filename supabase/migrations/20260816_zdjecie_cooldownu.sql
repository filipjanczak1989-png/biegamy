-- ─────────────────────────────────────────────────────────────────────────────
-- ZDJĘCIE COOLDOWNU + created_at (16.08.2026)
--
-- Powód nie jest taki, że reguła była za ostra — tylko taki, że MIERZYŁA NIE TO,
-- CO DEKLAROWAŁA. Zmierzone 16.08.2026:
--
--   · przepuściła 118 nadmiarowych wierszy u 20 z 53 osób, przy jedynym
--     deklarowanym celu: „To ograniczenie chroni przed przypadkowymi duplikatami"
--   · blokowała RANO prawdziwe zapisy, WIECZOREM przepuszczała duplikaty — bo
--     porównywała `logged_at` (data wybrana przez człowieka, z doklejonym
--     południem) z zegarem ściennym `now()`
--   · progu 3 h nie da się uzasadnić danymi: 1011 z 1015 logów ma godzinę
--     12:00/13:00/14:00, więc realnej pory treningu NIE MA w schemacie
--   · intencji nie da się ustalić z repo: najstarszy ślad to commit
--     „Add files via upload" z 11.05.2026, zero opisu, zero migracji
--
-- Konkretny przypadek: 2.08 o 09:06 człowiek dostał „Pozostało jeszcze: 7h 54min"
-- tuż po zalogowaniu porannego treningu, bo `logged_at` tamtego logu to 14:00.
-- Przez 11 minut próbował ~49 razy; każda próba wgrywała te same zdjęcia od nowa
-- (147 plików, 51 MB, cztery różne rozmiary).
--
-- !! NAPRAWIANIE MECHANIZMU POD NIEZNANĄ INTENCJĘ jest gorsze niż zbudowanie
--    tego, co faktycznie potrzebne. Ochrona przed duplikatem idzie do klienta
--    jako MIĘKKIE ostrzeżenie, nie jako UNIQUE — bo dwa prawdziwe treningi tego
--    samego dnia, typu i dystansu są możliwe. Zmierzone: z 91 grup duplikatów
--    38 RÓŻNI SIĘ treścią (czas/tempo/tętno/komentarz), czyli to realne drugie
--    treningi. UNIQUE zablokowałby je — powtórzylibyśmy błąd, który usuwamy,
--    tylko w drugą stronę.
--
-- ⚠️ ZOSTAJE DO POPRAWIENIA OSOBNO: `community_km` ma w ciele komentarz
--    „…'intervals', które jest zwolnione z triggera check_log_cooldown".
--    Po tej migracji zdanie jest nieprawdą (.ai/LEKCJE.md #12), ale poprawienie
--    go wymaga CREATE OR REPLACE całej funkcji naprawianej 14.08 — zły stosunek
--    ryzyka do zysku. Decyzja Filipa: zostawić, zapisać w backlogu.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1) Trigger i funkcja. Sprawdzone przed usunięciem: NIC innego od nich nie
--    zależy — zero funkcji wywołujących, zero widoków, zero polityk.
--    (`community_km` wspomina nazwę WYŁĄCZNIE w komentarzu.)
drop trigger if exists enforce_log_cooldown on public.training_logs;
drop function if exists public.check_log_cooldown();

-- 2) created_at — NIE do cooldownu. Do tego, żeby w ogóle dało się powiedzieć,
--    KIEDY wiersz powstał. Przy każdej diagnozie z 15–16.08 tego brakowało:
--    `logged_at` to data treningu, `id` to uuid v4 (zero informacji o czasie),
--    `xmin` ginie przy pierwszym UPDATE, a logi są edytowane.
--
-- !! DWA KROKI, ŚWIADOMIE. Połączone w jedno (`ADD COLUMN … DEFAULT now()`)
--    wymusiłoby przepisanie tabeli i wpisało FAŁSZYWY czas w 2616 istniejących
--    wierszy. NULL uczciwie mówi „nie wiadomo".
alter table public.training_logs add column if not exists created_at timestamptz;
alter table public.training_logs alter column created_at set default now();

comment on column public.training_logs.created_at is
  'Czas WSTAWIENIA wiersza. NULL dla 2616 wierszy sprzed 16.08.2026 — wtedy nie było czym tego zapisać. Nie mylić z logged_at (data treningu, doklejone południe).';

commit;

-- ── WERYFIKACJA (uruchomić po migracji) ──────────────────────────────────────
-- select tgname from pg_trigger where tgname='enforce_log_cooldown';        -- PUSTO
-- select proname from pg_proc where proname='check_log_cooldown';           -- PUSTO
-- select count(*) filter (where created_at is null) as stare,
--        count(*) filter (where created_at is not null) as nowe
--   from public.training_logs;                                              -- 2616 / 0
-- select has_column_privilege('authenticated','public.training_logs','created_at','SELECT');  -- true
