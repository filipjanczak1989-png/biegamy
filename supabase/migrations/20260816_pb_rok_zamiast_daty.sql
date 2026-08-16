-- Rocznik zamiast miesiąca przy życiówce — decyzja produktowa Filipa.
--
-- ⚠️ TA MIGRACJA COFA CZĘŚĆ 20260816_athletes_pb_daty I 20260816_intake_pb_daty
--    Z TEGO SAMEGO DNIA. Tamte dodały `pb_*_at date` (miesiąc + rok). Decyzja
--    brzmi: sam rocznik, `smallint`.
--
-- CO TO KOSZTUJE (odnotowane raz, nie żeby wracać): rocznik nie odróżnia
-- stycznia od grudnia, więc jedyne inne zastosowanie daty — sprawdzenie, czy
-- dwa PB pochodzą z tego samego okresu formy — zostaje z niepewnością
-- ±12 miesięcy. Patrz project_zaleglosc_pb_bez_dat_wykladnik_odrzucony.
-- Wyświetlanie na karcie jest rocznikowe („PB z 2023"), więc na ekranie nie
-- zmienia się nic.
--
-- ⚠️ DROP JEST TU BEZPIECZNY, BO SPRAWDZONY: kolumny `pb_*_at` wdrożono kilka
--    minut wcześniej i mają WYŁĄCZNIE NULL-e (zweryfikowane zapytaniem przed
--    wykonaniem). Gdyby ktokolwiek zdążył coś wpisać, właściwą drogą byłoby
--    przepisanie `extract(year from pb_*_at)`, nie DROP.

-- ── athletes ────────────────────────────────────────────────────────────────
alter table public.athletes drop constraint if exists athletes_pb_daty_sensowne;
alter table public.athletes
  drop column if exists pb_5k_at,
  drop column if exists pb_10k_at,
  drop column if exists pb_half_at,
  drop column if exists pb_marathon_at;

alter table public.athletes
  add column if not exists pb_5k_year       smallint,
  add column if not exists pb_10k_year      smallint,
  add column if not exists pb_half_year     smallint,
  add column if not exists pb_marathon_year smallint;

comment on column public.athletes.pb_5k_year is
  'Rok ustanowienia PB. NULL = nie podano. Rocznik, nie data — nie odróżnia miesięcy.';
comment on column public.athletes.pb_10k_year is 'j.w.';
comment on column public.athletes.pb_half_year is 'j.w.';
comment on column public.athletes.pb_marathon_year is 'j.w.';

-- ⚠️ GRANT SELECT KONIECZNY. Na `athletes` rola authenticated ma SELECT nadany
-- KOLUMNOWO (tabelowo tylko DELETE/INSERT/REFERENCES/UPDATE), więc nowa kolumna
-- nie dziedziczy prawa odczytu i PostgREST jej nie odda — kolumna istnieje,
-- a karta widzi null. UPDATE jest tabelowy, nie powtarzamy go.
-- (Sprawdzone per tabela, nie z nawyku: training_logs i athlete_intake_forms
--  mają SELECT tabelowy i grantu nie potrzebują.)
grant select (pb_5k_year, pb_10k_year, pb_half_year, pb_marathon_year)
  on public.athletes to authenticated;

-- Bariera na dolną granicę. Górnej („rok z przyszłości") nie ma w CHECK-u
-- świadomie: naturalne `extract(year from current_date)` jest STABLE, a CHECK
-- wymaga IMMUTABLE. Sztywna liczba w rodzaju 2100 przeszłaby, ale nie
-- blokowałaby niczego, co warto blokować — a wyglądałaby na barierę.
-- Górną granicę pilnuje walidujRokPB w kliencie.
alter table public.athletes
  add constraint athletes_pb_lata_sensowne check (
    (pb_5k_year       is null or pb_5k_year       >= 1990) and
    (pb_10k_year      is null or pb_10k_year      >= 1990) and
    (pb_half_year     is null or pb_half_year     >= 1990) and
    (pb_marathon_year is null or pb_marathon_year >= 1990)
  ) not valid;
alter table public.athletes validate constraint athletes_pb_lata_sensowne;

-- ── athlete_intake_forms ────────────────────────────────────────────────────
alter table public.athlete_intake_forms
  drop column if exists pb_5k_at,
  drop column if exists pb_10k_at,
  drop column if exists pb_half_at,
  drop column if exists pb_marathon_at;

alter table public.athlete_intake_forms
  add column if not exists pb_5k_year       smallint,
  add column if not exists pb_10k_year      smallint,
  add column if not exists pb_half_year     smallint,
  add column if not exists pb_marathon_year smallint;
-- Bez grantu: `authenticated` ma tu SELECT/INSERT/UPDATE tabelowo, a grant
-- tabelowy obejmuje kolumny dodane później. `anon` nie ma tu nic i nie dostaje.

-- ⚠️ FUNKCJA MUSI ISC W TEJ SAMEJ MIGRACJI CO DROP KOLUMN.
-- plpgsql NIE sprawdza cial funkcji przy `alter table ... drop column`, wiec
-- usuniecie `pb_*_at` zostawiloby funkcje, ktora wyglada na dzialajaca i wywala
-- sie dopiero przy PIERWSZYM przyjeciu zawodnika — czyli na sciezce, ktorej
-- nikt nie przechodzi codziennie. Awaria wyszlaby przy nowym kliencie trenera.
--
-- ⚠️ Rok idzie ZA SWOIM czasem (CASE, nie COALESCE): przy zachowaniu starego PB
-- osobny COALESCE podpialby pod niego rocznik z ankiety. Zly rok przy dobrym
-- czasie jest gorszy niz brak roku, bo wyglada na informacje.

CREATE OR REPLACE FUNCTION public.accept_intake_form(p_intake_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id UUID; v_athlete_id UUID; v_intake RECORD; v_existing RECORD;
  v_normalized_email TEXT; v_gender TEXT;
BEGIN
  v_coach_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM coaches WHERE id = v_coach_id) THEN
    RAISE EXCEPTION 'Tylko trener może akceptować ankiety'; END IF;
  SELECT * INTO v_intake FROM athlete_intake_forms WHERE id = p_intake_id;
  IF v_intake IS NULL THEN RAISE EXCEPTION 'Ankieta nie istnieje'; END IF;
  IF v_intake.status != 'submitted' THEN
    RAISE EXCEPTION 'Ankieta nie jest w statusie submitted (jest: %)', v_intake.status; END IF;

  -- normalizacja płci (kanon M/K; F→K defensywnie)
  v_gender := CASE upper(trim(coalesce(v_intake.gender,'')))
                WHEN 'M' THEN 'M' WHEN 'K' THEN 'K' WHEN 'F' THEN 'K' ELSE NULL END;

  v_normalized_email := lower(trim(v_intake.email));
  IF v_normalized_email IS NOT NULL AND v_normalized_email != '' THEN
    SELECT id, coach_id, full_name, goal, pb_5k, pb_10k, pb_half, pb_marathon,
           pb_5k_year, pb_10k_year, pb_half_year, pb_marathon_year
      INTO v_existing FROM athletes WHERE lower(trim(email)) = v_normalized_email LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.coach_id = v_coach_id THEN
        UPDATE athletes
        SET full_name = COALESCE(NULLIF(v_existing.full_name, ''), v_intake.full_name),
            goal = COALESCE(NULLIF(v_existing.goal, ''), v_intake.target_race_name, v_intake.race_goals_year),
            pb_5k = COALESCE(NULLIF(v_existing.pb_5k, ''), v_intake.pb_5k),
            pb_10k = COALESCE(NULLIF(v_existing.pb_10k, ''), v_intake.pb_10k),
            pb_half = COALESCE(NULLIF(v_existing.pb_half, ''), v_intake.pb_half),
            pb_marathon = COALESCE(NULLIF(v_existing.pb_marathon, ''), v_intake.pb_marathon),
            -- ⚠️ ROK IDZIE ZA SWOIM CZASEM, NIE OSOBNYM COALESCE.
            -- Naturalne `COALESCE(v_existing.pb_5k_year, v_intake.pb_5k_year)` rozprzegloby
            -- pare: zostawiloby stary czas i podpieloby pod niego rocznik z ankiety.
            -- Zly rok przy dobrym czasie jest gorszy niz brak roku, bo wyglada
            -- na informacje. Zrodlo musi byc TO SAMO dla obu pol.
            pb_5k_year = CASE WHEN NULLIF(v_existing.pb_5k, '') IS NOT NULL
                            THEN v_existing.pb_5k_year ELSE v_intake.pb_5k_year END,
            pb_10k_year = CASE WHEN NULLIF(v_existing.pb_10k, '') IS NOT NULL
                             THEN v_existing.pb_10k_year ELSE v_intake.pb_10k_year END,
            pb_half_year = CASE WHEN NULLIF(v_existing.pb_half, '') IS NOT NULL
                              THEN v_existing.pb_half_year ELSE v_intake.pb_half_year END,
            pb_marathon_year = CASE WHEN NULLIF(v_existing.pb_marathon, '') IS NOT NULL
                                  THEN v_existing.pb_marathon_year ELSE v_intake.pb_marathon_year END,
            race_goals = COALESCE(NULLIF(race_goals, ''), v_intake.race_goals_year),
            gender = COALESCE(gender, v_gender)
        WHERE id = v_existing.id;
        v_athlete_id := v_existing.id;
      ELSE
        RAISE EXCEPTION 'Ten email jest już w bazie u innego trenera. Skontaktuj się z nim jeśli to ten sam zawodnik, ankieta pozostaje w statusie submitted.';
      END IF;
    END IF;
  END IF;

  IF v_athlete_id IS NULL THEN
    INSERT INTO athletes (
      full_name, email, phone, coach_id, active, is_public,
      pb_5k, pb_10k, pb_half, pb_marathon,
      pb_5k_year, pb_10k_year, pb_half_year, pb_marathon_year, goal, race_goals, gender,
      terms_accepted_at
    ) VALUES (
      v_intake.full_name, v_intake.email, v_intake.phone, v_coach_id, true,
      COALESCE(v_intake.visible_to_others, false),
      v_intake.pb_5k, v_intake.pb_10k, v_intake.pb_half, v_intake.pb_marathon,
      v_intake.pb_5k_year, v_intake.pb_10k_year, v_intake.pb_half_year, v_intake.pb_marathon_year,
      COALESCE(v_intake.target_race_name, v_intake.race_goals_year),
      v_intake.race_goals_year, v_gender,
      -- FAZA 4: realna zgoda RODO z intake → terms. consent_at = moment zaznaczenia zgód
      -- (fallback created_at, choć dane pokazują consent_at zawsze wypełniony gdy zgoda=true).
      CASE WHEN v_intake.consent_data_processing THEN COALESCE(v_intake.consent_at, v_intake.created_at) ELSE NULL END
    ) RETURNING id INTO v_athlete_id;
  END IF;

  UPDATE athlete_intake_forms
  SET status = 'accepted', accepted_at = NOW(), accepted_by_coach_id = v_coach_id, created_athlete_id = v_athlete_id
  WHERE id = p_intake_id;
  RETURN v_athlete_id;
END;
$function$
