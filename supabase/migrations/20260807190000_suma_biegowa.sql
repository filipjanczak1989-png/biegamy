-- suma_biegowa — jedno źródło liczb okresu dla kart (tydzień, miesiąc).
--
-- Powód powstania: karta i detektor liczyły to samo dwiema implementacjami, a lista typów
-- biegowych rozłaziła się po plikach. Ta funkcja zastępuje kopię RUN_TYPES w EF share-card
-- i zapobiega czwartej kopii w EF miesiac-cron — bilans kopii wychodzi na zero, nie na plus.
-- Przy okazji znika ryzyko, że karta policzy tydzień inaczej niż silnik, który go wykrył.
--
-- ⚠️ TO JEST TRZECIE ŹRÓDŁO listy typów biegowych, obok:
--     1. sb.js                  → window.RUN_TYPES
--     2. js/silnik-momentu.js   → var RUN_TYPES (inline w EF detect-moment)
--     3. TA FUNKCJA             → karty (share-card, miesiac-cron)
--   Bramka po każdej zmianie listy: python tools/sprawdz-run-types.py

CREATE OR REPLACE FUNCTION public.suma_biegowa(
  p_athlete_id uuid,
  p_od         timestamptz,
  p_do         timestamptz
)
RETURNS TABLE (suma numeric, ile integer, najdluzszy numeric, sekundy bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(SUM(t.distance_km), 0)::numeric                       AS suma,
    COUNT(*)::integer                                              AS ile,
    COALESCE(MAX(t.distance_km), 0)::numeric                       AS najdluzszy,
    -- duration to TEXT: "1:49:40" albo "49:40". Zły format liczy się jako zero,
    -- bo karta ma powstać nawet gdy część wpisów ma śmieci w czasie trwania.
    COALESCE(SUM(
      CASE WHEN t.duration ~ '^[0-9]+:[0-9]{2}(:[0-9]{2})?$' THEN
        CASE WHEN length(t.duration) - length(replace(t.duration, ':', '')) = 2
             THEN split_part(t.duration, ':', 1)::bigint * 3600
                + split_part(t.duration, ':', 2)::bigint * 60
                + split_part(t.duration, ':', 3)::bigint
             ELSE split_part(t.duration, ':', 1)::bigint * 60
                + split_part(t.duration, ':', 2)::bigint
        END
      ELSE 0 END
    ), 0)::bigint                                                  AS sekundy
  FROM public.training_logs t
  WHERE t.athlete_id = p_athlete_id
    AND t.logged_at >= p_od
    AND t.logged_at <  p_do
    AND t.distance_km > 0
    -- Filtr odznak W ŚRODKU funkcji, nie u wołającego: backslash escapuje podkreślenie,
    -- bo w LIKE `_` jest znakiem wieloznacznym i bez tego wzorzec łapałby też inne typy.
    AND COALESCE(t.training_type, '') NOT LIKE '\_\_badge\_\_%'
    -- Lista typów biegowych — JEDNO miejsce w tej funkcji.
    AND lower(btrim(COALESCE(t.training_type, ''))) = ANY (ARRAY[
      'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
      'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'
    ]);
$$;

-- Tylko service_role. Karty renderuje EF, który po nim chodzi; klient nie woła tej funkcji
-- bezpośrednio i gdyby miał, to osobna decyzja — SECURITY DEFINER omija RLS, więc funkcja
-- wystawiona zalogowanym pozwoliłaby czytać sumy cudzych treningów po samym athlete_id.
REVOKE ALL ON FUNCTION public.suma_biegowa(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suma_biegowa(uuid, timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suma_biegowa(uuid, timestamptz, timestamptz) TO service_role;

-- Idempotencja karty miesięcznej: jeden moment na zawodnika i miesiąc, niezależnie od statusu.
-- Indeks z 5 sierpnia (delivered_moments_pending_uniq) obejmuje wyłącznie status='pending',
-- a momenty miesięczne wstawiamy od razu jako 'approved' — sam by nie wystarczył.
CREATE UNIQUE INDEX IF NOT EXISTS delivered_moments_miesiac_uniq
  ON public.delivered_moments (athlete_id, (evidence->>'miesiac'))
  WHERE type = 'miesiac';

-- Cron karty miesięcznej.
-- ⚠️ GODZINA JEST UMOWNA I DRYFUJE MIĘDZY PORAMI ROKU. Baza chodzi w UTC, Polska w CEST/CET,
-- więc '0 4 1 * *' to 6:00 czasu lokalnego latem i 5:00 zimą. To NIE jest błąd — pg_cron nie
-- zna stref czasowych i nie przestawia się razem z zegarem. Jeśli godzina zacznie przeszkadzać,
-- zmienia się ją ręcznie dwa razy w roku albo akceptuje dryf.
-- cron.schedule jest idempotentne: ponowne wykonanie z tą samą nazwą aktualizuje job.
SELECT cron.schedule('miesiac-karta', '0 4 1 * *', $job$
  SELECT net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/miesiac-cron',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret')),
    body    := '{}'::jsonb);
$job$);
