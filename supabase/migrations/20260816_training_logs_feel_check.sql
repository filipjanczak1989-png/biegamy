-- ─────────────────────────────────────────────────────────────────────────────
-- training_logs.feel — CHECK na dozwolone wartości.
--
-- POWÓD. Kolumna nie miała ŻADNEGO ograniczenia — przeszłaby dowolna wartość.
-- Znalezione 16.08.2026: `gra.html` zapisywała `'ok'`, którego nie zna żadna
-- skala ani w aplikacji, ani w Edge Functions. Wpadłoby w domyślną „2", czyli
-- po cichu jako `mid`. Ścieżka nie była użyta ani razu (`source='game'` = 0
-- wierszy), więc nikt tego nie zauważył — bomba nierozbrojona, nie wybuch.
-- Sam zapis naprawiony w tym samym commicie; CHECK domyka drogę.
--
-- ⚠️ NIC NIE ZABLOKUJE. Zmierzone na produkcji przed wdrożeniem, 2 649 wierszy:
--      good = 582 · mid = 422 · bad = 43 · NULL = 1 602
--    Zero innych wartości. NULL dopuszczony celowo — 60% logów nie ma oceny
--    i to jest poprawny stan (człowiek nie musi oceniać treningu).
--
-- `great` dopuszczone Z GÓRY, zanim pojawi się w UI. Kolejność jest istotna:
-- CHECK przed dołożeniem poziomu znaczy, że klient nie może zapisać wartości,
-- którą właśnie dokładamy — a odwrotna kolejność zostawiłaby okno, w którym
-- baza przyjmuje cokolwiek.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.training_logs
  add constraint training_logs_feel_dozwolone
  check (feel is null or feel in ('bad', 'mid', 'good', 'great'));

comment on constraint training_logs_feel_dozwolone on public.training_logs is
  'Dozwolone: bad/mid/good/great albo NULL (brak oceny). Dodane 16.08.2026 — wcześniej kolumna przyjmowała dowolny tekst, m.in. ''ok'' z gra.html.';
