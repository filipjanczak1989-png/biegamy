CREATE OR REPLACE FUNCTION public.akcja_km_okna(p_akcja_id uuid, p_od date, p_do date, p_tylko uuid[] DEFAULT NULL::uuid[])
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- ⚠️ JOIN, nie LEFT JOIN: least() w Postgresie POMIJA NULL — least(NULL, 100) = 100, więc pusty wiersz
  --    z left join dawał akcji bez jednego wpisu 100 km (złapane testem 5a, 2.11.2026).
  select coalesce(sum(least(dz.km, case when dz.athlete_id = any(coalesce(a.wyprawa_athlete_ids, '{}'::uuid[])) then a.cap_km_doba_wyprawa else a.cap_km_doba end)), 0)::numeric
  from public.akcje a
  join lateral (
    select l.athlete_id, (l.logged_at at time zone 'Europe/Warsaw')::date as d, sum(l.distance_km) as km
    from public.training_logs l
    where l.distance_km > 0
      and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
      and public.akcja_typ_liczy(l.training_type, l.external_type)   -- tylko bieg i chód (Filip 2.11 18:35)
      and (l.logged_at at time zone 'Europe/Warsaw')::date >= greatest(a.start, p_od)
      and (l.logged_at at time zone 'Europe/Warsaw')::date <= least(p_do, coalesce(a.koniec, p_do),
                                                                  (now() at time zone 'Europe/Warsaw')::date)
      and (not a.testowa or l.athlete_id = any(coalesce(a.konta_testowe, '{}'::uuid[])))
      and (p_tylko is null or l.athlete_id = any(p_tylko))
    group by 1, 2
  ) dz on true
  where a.id = p_akcja_id;
$function$
