CREATE OR REPLACE FUNCTION public.suma_biegowa(p_athlete_id uuid, p_od timestamp with time zone, p_do timestamp with time zone)
 RETURNS TABLE(suma numeric, ile integer, najdluzszy numeric, sekundy bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
