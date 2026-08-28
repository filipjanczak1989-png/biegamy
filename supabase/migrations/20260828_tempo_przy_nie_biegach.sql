-- ─────────────────────────────────────────────────────────────────────────────
-- TEMPO PRZY NIE-BIEGACH — czyszczenie 14 wierszy, 26 ZOSTAJE ŚWIADOMIE
--
-- KONTEKST. Do 27.08.2026 czyszczenie tempa dla typów nie-biegowych żyło
-- wyłącznie w kalendarz.html; `zawodnik.html` go nie miał. Po scaleniu trzech
-- kopii `saveLog` w rdzeń `window.zapiszLog` (sb.js) reguła obowiązuje
-- wszystkie ścieżki zapisu — ale 40 istniejących wierszy zostało z tempem.
--
-- KTO TO CZYTAŁ. Nie było to martwe pole: `gra.html` uśredniał tempo ze
-- WSZYSTKICH logów (filtrował tylko odznaki i „Warm-up mentalny"), a średnia
-- zasila drabinę tierów. Konsument naprawiony w tym samym commicie co ta
-- migracja — filtr `isRunType` w gra.html i w smartSuggest w kalendarz.html.
--
-- ⚠️⚠️ DLACZEGO 26 WIERSZY „Zastępczy" NIE JEST ŚMIECIEM I ZOSTAJE ⚠️⚠️
--
--   „Zastępczy" to rower i pływanie. Tempo 1:49/km przy rowerze NIE jest
--   błędem zapisu — to prawdziwa, poprawnie policzona wartość dla tej
--   dyscypliny (≈33 km/h). Zmierzone 28.08.2026: 26 wierszy, 25 z dystansem,
--   zakres 1:49–6:18. Te liczby opisują odbyty trening i są jedyną informacją
--   o jego intensywności, jaką mamy.
--
--   Psuły statystyki BIEGOWE nie dlatego, że są nieprawdziwe, tylko dlatego,
--   że konsument ich nie odsiewał. Naprawa należy do konsumenta, nie do
--   danych — i została tam zrobiona.
--
--   >>> JEŚLI CZYTASZ TO, SZYKUJĄC „PORZĄDKI": NIE KASUJ ICH. <<<
--   Wyzerowanie tych 26 wierszy to nieodwracalna utrata realnych pomiarów
--   w zamian za zero korzyści — filtry po stronie odczytu już działają.
--   Gdyby kiedyś okazało się, że jakiś NOWY konsument znowu je łapie:
--   dołóż mu `isRunType`, tak jak zrobiliśmy 28.08.
--
-- CO ZEROWANE (14 wierszy: 11 × „Wzmacniający", 3 × „Odpoczynek”):
--   Tu tempo nie niesie żadnej informacji — trening siłowy nie ma tempa na
--   kilometr. Wartości są albo artefaktem liczenia (`0:00` przy pustym
--   dystansie), albo śladem po treningu opisanym złym typem.
--
-- ⚠️ `0:00` TO SKAMIELINA, NIE CZYNNA WADA. Zmierzone 28.08: 4 wiersze
--    w CAŁEJ bazie mają `pace='0:00'`, ostatni z 16.07.2026, ŻADEN po
--    16.08 (kolumna `created_at` istnieje od tej daty i jest przy nich pusta).
--    Dzisiejszy `calcPaceAuto` w zawodnik.html ma guard
--    `if (!dist || !timeVal ...) return;`, więc nie potrafi już zapisać zera
--    przy pustym dystansie. Nie ma czego naprawiać w kodzie zapisu.
--
-- ODWRACALNOŚĆ: stan sprzed zmiany leży w ~/.cache/sb-audit/
--   backfill-tempo-przed-20260828.csv (id + pace + typ + dystans + czas).
-- ─────────────────────────────────────────────────────────────────────────────

update training_logs
   set pace = null
 where lower(trim(training_type)) in ('wzmacniający', 'odpoczynek')
   and pace is not null;

-- Kontrola po zmianie — oczekiwane: nie-biegi 0, „Zastępczy" NADAL 26.
--   select count(*) filter (where lower(trim(training_type)) in ('wzmacniający','odpoczynek') and pace is not null) as wyzerowane_ma_byc_0,
--          count(*) filter (where lower(trim(training_type)) = 'zastępczy' and pace is not null) as zastepczy_ma_byc_26
--     from training_logs;
