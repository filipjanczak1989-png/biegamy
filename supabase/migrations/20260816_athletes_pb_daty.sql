-- Data przy życiówce — miesiąc i rok.
--
-- PO CO: `athletes.pb_*` to cztery pola `text` bez daty i bez historii. Przez to
-- nie da się odpowiedzieć na pytanie „czy ta życiówka jest aktualna", a
-- odtworzenie daty przez dopasowanie PB do logu udaje się dla 6 ze 111 PB (5%).
-- Zmierzone 16.08.2026: 32 z 34 osób z ≥2 PB ma parę NIEDATOWALNĄ (94%) — i to,
-- a nie sprzeczność danych, blokuje wykładnik indywidualny.
-- Patrz project_zaleglosc_pb_bez_dat_wykladnik_odrzucony.
--
-- DLACZEGO `date`, A NIE `text`: pola `pb_*` są typu `text` i to jest blizna,
-- która kosztowała nas gołe „56" odczytane jako 56 sekund. Nie powtarzamy jej.
--
-- DLACZEGO MIESIĄC, A NIE SAM ROK: sam rok wymusiłby założenie środka roku,
-- czyli ±6 miesięcy błędu w każdej wartości. PB ze stycznia i z grudnia tego
-- samego roku wyglądałyby na jednoczesne, a PB z grudnia i ze stycznia
-- następnego — na odległe o rok. Dokładnie odwrotnie niż prawda.
-- Koszt wypełnienia jest ten sam: `<input type="month">` daje natywny wybór
-- miesiąca i roku w jednym geście.
--
-- KONWENCJA: przechowujemy PIERWSZY DZIEŃ MIESIĄCA. Dzień nie niesie
-- informacji i nie wolno go czytać jako dokładnej daty biegu.

alter table public.athletes
  add column if not exists pb_5k_at date,
  add column if not exists pb_10k_at date,
  add column if not exists pb_half_at date,
  add column if not exists pb_marathon_at date;

comment on column public.athletes.pb_5k_at is
  'Miesiąc ustanowienia PB (pierwszy dzień miesiąca). NULL = nie podano. Dzień jest umowny.';
comment on column public.athletes.pb_10k_at is 'j.w.';
comment on column public.athletes.pb_half_at is 'j.w.';
comment on column public.athletes.pb_marathon_at is 'j.w.';

-- ⚠️ GRANT SELECT JEST TU KONIECZNY — sprawdzone, nie z nawyku.
-- Na `athletes` rola authenticated ma SELECT nadany KOLUMNOWO (tabelowo ma
-- tylko DELETE/INSERT/REFERENCES/UPDATE). Nowa kolumna nie dziedziczy więc
-- prawa odczytu i PostgREST jej nie odda — kolumna istnieje, a karta widzi null.
-- UPDATE jest tabelowy, więc go nie powtarzamy.
grant select (pb_5k_at, pb_10k_at, pb_half_at, pb_marathon_at)
  on public.athletes to authenticated;

-- Bariera na dolną granicę. Klient można obejść, a rok 1990 jest niepodważalny
-- niezależnie od interfejsu.
--
-- ⚠️ GÓRNEJ GRANICY NIE MA W CHECK-u I TO JEST ŚWIADOME, NIE PRZEOCZENIE.
--    Naturalne `<= current_date` jest NIELEGALNE: `current_date` jest STABLE,
--    a CHECK wymaga IMMUTABLE („functions in check constraint must be marked
--    IMMUTABLE"). Sztywna data w rodzaju '2100-01-01' przeszłaby, ale nie
--    blokowałaby niczego, co warto blokować — a wyglądałaby na barierę.
--    Zamiast atrapy: górną granicę („data z przyszłości") pilnuje walidator
--    w kliencie, a tu zostaje tylko warunek, który da się utrzymać uczciwie.
--    Gdyby kiedyś okazało się, że to za mało — właściwym narzędziem jest
--    trigger BEFORE INSERT/UPDATE, nie CHECK.
--
-- ⚠️ Nie dodajemy też warunku „data tylko przy niepustym PB": przy UPDATE
--    jednego pola CHECK widzi stan PO zmianie i zablokowałby legalną kolejność
--    „najpierw data, potem czas". Ten warunek pilnuje walidujDatePB.
alter table public.athletes
  drop constraint if exists athletes_pb_daty_sensowne;
alter table public.athletes
  add constraint athletes_pb_daty_sensowne check (
    (pb_5k_at       is null or pb_5k_at       >= date '1990-01-01') and
    (pb_10k_at      is null or pb_10k_at      >= date '1990-01-01') and
    (pb_half_at     is null or pb_half_at     >= date '1990-01-01') and
    (pb_marathon_at is null or pb_marathon_at >= date '1990-01-01')
  ) not valid;
-- `not valid` — istniejące 61 wierszy ma same NULL-e, więc nic nie łamie
-- warunku, ale nie skanujemy tabeli pod blokadą.
alter table public.athletes validate constraint athletes_pb_daty_sensowne;
