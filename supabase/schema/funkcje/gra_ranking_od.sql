CREATE OR REPLACE FUNCTION public.gra_ranking_od(p_od date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'punkty', x.punkty, 'cegly', x.cegly, 'postac', x.postac) order by x.punkty desc, x.kiedy), '[]'::jsonb)
    from (select rank() over (order by n.punkty desc)::integer miejsce, n.pseudonim, n.punkty, n.cegly, n.postac, n.kiedy
            from (select distinct on (w.athlete_id) k.pseudonim, w.punkty, w.cegly, w.postac, w.kiedy
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where w.dzien >= p_od and k.pseudonim is not null
                   order by w.athlete_id, w.punkty desc, w.kiedy) n
           order by n.punkty desc, n.kiedy limit 20) x
$function$
