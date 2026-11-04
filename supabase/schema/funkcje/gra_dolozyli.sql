CREATE OR REPLACE FUNCTION public.gra_dolozyli(p_od timestamp with time zone, p_do timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'cegly', x.cegly) order by x.cegly desc, x.pseudonim), '[]'::jsonb)
    from (select rank() over (order by n.cegly desc)::integer miejsce, n.pseudonim, n.cegly
            from (select k.pseudonim, sum(w.cegly)::bigint cegly
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where k.pseudonim is not null and (p_od is null or w.kiedy >= p_od) and (p_do is null or w.kiedy < p_do)
                   group by k.pseudonim) n
           order by n.cegly desc, n.pseudonim limit 20) x
$function$
