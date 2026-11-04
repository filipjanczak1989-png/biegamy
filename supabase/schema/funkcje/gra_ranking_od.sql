CREATE OR REPLACE FUNCTION public.gra_ranking_od(p_od date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'cegly', x.cegly, 'postac', x.postac) order by x.cegly desc, x.kiedy), '[]'::jsonb)
    from (select rank() over (order by n.cegly desc)::integer miejsce, n.pseudonim, n.cegly, n.postac, n.kiedy
            from (select distinct on (w.athlete_id) k.pseudonim, w.cegly, w.postac, w.kiedy
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where w.dzien >= p_od and k.pseudonim is not null
                   order by w.athlete_id, w.cegly desc, w.kiedy) n
           order by n.cegly desc, n.kiedy limit 20) x
$function$
