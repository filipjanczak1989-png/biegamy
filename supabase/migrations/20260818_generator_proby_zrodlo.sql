-- Skąd przyszła próba ułożenia planu: człowiek wpisał sam czy kliknął ścieżkę.
--
-- DLACZEGO: od 18.08.2026 odmowa pokazuje ścieżkę („najbliżej masz 10 km")
-- z przyciskiem, który układa plan na wskazany dystans. Pytanie brzmi, czy
-- ścieżka działa lepiej niż samo wyjście — czyli czy następna osoba trafi
-- na plan po JEDNEJ odmowie zamiast po trzech.
--
-- ⚠️ ŚWIADOMIE NIE MA TU KOLUMNY „CO ZROBIŁ POTEM" i to jest sedno tej migracji.
--    Taka kolumna musiałaby być dopisywana PÓŹNIEJ — cronem albo przy kolejnym
--    wejściu — a kolumna statusu, którą ktoś musi zaktualizować, po miesiącu
--    jest w połowie pusta i nikt nie wie, czy NULL znaczy „zniknął", czy
--    „nie zdążyliśmy zapisać". To ta sama pułapka co flaga bez ekranu.
--
--    Zamiast tego zapisujemy JEDNO pole, które jest znane w chwili zapisu
--    i nie da się go wyliczyć: skąd przyszło kliknięcie. Reszta jest
--    WYLICZANA z kolejnych prób tego samego zawodnika:
--      • następna próba ma zrodlo='sciezka'   -> skorzystał ze ścieżki
--      • następna próba ma zrodlo='formularz' -> zmienił sam
--      • nie ma następnej próby               -> zniknął
--
--    Przykład zapytania odpowiadającego na pytanie „czy ścieżka pomaga":
--      select zrodlo, count(*) filter (where wynik='plan') as plany,
--             count(*) as prob
--        from generator_proby group by 1;
--
-- ⚠️ NULL = próba sprzed tej migracji ALBO wejście, którego nie oznaczyliśmy.
--    Nie czytać NULL jako 'formularz' — dziś w tabeli jest 0 wierszy, więc
--    każdy NULL po tej dacie znaczy, że któreś wejście nie ustawia pola.

alter table public.generator_proby
  add column if not exists zrodlo text
    check (zrodlo is null or zrodlo in ('formularz', 'sciezka'));

comment on column public.generator_proby.zrodlo is
  'Skad przyszla ta proba: formularz = czlowiek wpisal sam, sciezka = klikniecie '
  'przycisku w komunikacie odmowy. ⚠️ To JEDYNE pole o „co zrobil potem" — reszta '
  'jest WYLICZANA z kolejnych prob tego samego zawodnika, nie przechowywana. '
  'Kolumna statusu, ktora ktos musi pozniej dopisac, nie bylaby aktualizowana.';

-- ⚠️ GRANTU NIE MA I TO JEST SPRAWDZONE. relacl dla generator_proby zmierzone
-- 18.08.2026: authenticated=ar/postgres — SELECT i INSERT sa TABELOWE, wiec
-- obejmuja kolumny dodane pozniej. (UPDATE i DELETE zostaly swiadomie zdjete
-- przy tworzeniu tabeli — telemetria, ktorej podmiot moze ja skasowac,
-- przestaje byc telemetria.)

-- ══ KONTROLA PO MIGRACJI ═══════════════════════════════════════════════════
-- select grantee, privilege_type from information_schema.column_privileges
--  where table_name='generator_proby' and column_name='zrodlo' order by 1,2;
-- Oczekiwane: authenticated INSERT + SELECT, service_role komplet.
