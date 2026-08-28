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
