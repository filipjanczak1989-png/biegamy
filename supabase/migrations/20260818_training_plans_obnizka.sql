-- Stan „plan jest obniżony” — bez niego reguła wyjścia z obniżki nie ma czego czytać.
--
-- DLACZEGO: `oceniAdaptacje` ma sześć wyjść i jedno z nich, `przywroc`, było
-- MARTWE. Warunek brzmi `wObnizce && ponizej === 0`, a klient podstawiał
-- `wObnizce: false` na sztywno, bo nie było gdzie tego stanu trzymać. Gałąź
-- istniała, wyglądała na działającą i nie mogła odpalić nigdy — ten sam kształt
-- co inne martwe gałęzie łapane w sierpniu.
--
-- ⚠️ SAMA FLAGA BY NIE WYSTARCZYŁA I TO JEST SEDNO TEJ MIGRACJI.
--    `ponizej` liczy się z `training_plan_workouts.target_distance_km`. Gdyby
--    obniżka nie ruszała tego, z czym porównujemy, człowiek po obniżce nadal
--    byłby mierzony ORYGINALNYM planem — żeby wyjść z obniżki, musiałby wrócić
--    do 75% poziomu sprzed niej, czyli do stanu, w którym obniżka była zbędna.
--    Wyjście odpalałoby wyłącznie wtedy, gdy nie było potrzebne.
--    Dlatego trzymamy OBNIŻONĄ BAZĘ, a nie samo „tak/nie”: klient skaluje nią
--    cel porównania, więc „wyrabiam obniżony plan” znaczy to, co mówi.
--
-- ⚠️ ŚWIADOMIE NIE PRZEPISUJEMY JEDNOSTEK W KALENDARZU. Obniżka jest UPDATE-em
--    na jednym wierszu, nie kasowaniem i wstawianiem przyszłych treningów.
--    Ta druga ścieżka (DELETE + INSERT) potrafiła w sierpniu skasować plan
--    trenera i nie wchodzi tu bocznymi drzwiami.
--    CENA JEST REALNA I TRZEBA JĄ ZNAĆ: kalendarz nadal pokazuje pierwotne
--    kilometry, a oceniamy według obniżonych. Rozjazd musi być POWIEDZIANY
--    na ekranie — komunikat z `oceniAdaptacje` podaje obie liczby („schodzi
--    z X na Y km/tydz”) i to jest jedyne miejsce, w którym człowiek się o tym
--    dowiaduje. Jeśli kiedyś zniknie z ekranu, ta migracja staje się pułapką.

alter table public.training_plans
  add column if not exists baza_obnizona_km numeric(6,2),
  add column if not exists obnizona_od      date;

-- Obie kolumny opisują JEDEN stan, więc muszą być puste albo pełne razem.
-- Bez tego po miesiącu leżą wiersze z datą bez wartości i nie wiadomo,
-- czy plan jest obniżony, czy ktoś przerwał zapis w połowie.
alter table public.training_plans
  drop constraint if exists training_plans_obnizka_spojna;
alter table public.training_plans
  add constraint training_plans_obnizka_spojna check (
    (baza_obnizona_km is null and obnizona_od is null) or
    (baza_obnizona_km is not null and obnizona_od is not null and baza_obnizona_km > 0)
  );

comment on column public.training_plans.baza_obnizona_km is
  'Obniżona objętość tygodniowa (km) po reakcji na niedowykonanie. NULL = plan '
  'nie jest obniżony. ⚠️ `input_target_volume_km` zostaje NIETKNIĘTE — trzyma '
  'poziom, do którego plan ma wrócić. Wyjście z obniżki zeruje obie kolumny.';

comment on column public.training_plans.obnizona_od is
  'Kiedy obniżka weszła w życie. Razem z baza_obnizona_km albo wcale (CHECK).';

-- ⚠️ GRANTU TU NIE MA I TO JEST SPRAWDZONE, NIE POMINIĘTE.
-- relacl dla `training_plans` zmierzone PRZED migracją 18.08.2026:
--     authenticated=arwdDxtm/postgres
-- Jest `r` i `w`, czyli SELECT oraz UPDATE są TABELOWE, a takie obejmują
-- kolumny dodane później. Odwrotnie niż przy `athletes`, gdzie SELECT jest
-- nadany KOLUMNOWO (52 z 58 kolumn) i grant trzeba dopisywać ręcznie —
-- porównanie obu przypadków stoi w 20260818_athletes_hr_max.sql.

-- ══ KONTROLA PO MIGRACJI ═══════════════════════════════════════════════════
-- select grantee, privilege_type from information_schema.column_privileges
--  where table_name='training_plans' and column_name='baza_obnizona_km';
-- Musi zawierać authenticated/SELECT i authenticated/UPDATE.
