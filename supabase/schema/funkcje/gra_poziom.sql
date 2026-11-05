CREATE OR REPLACE FUNCTION public.gra_poziom(p_cegly bigint)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(max(p.n), 1)::integer
    from unnest(array[0, 100, 300, 700, 1800, 3100, 4600, 6400, 8300, 10400, 12900, 15700, 18900, 22500, 26400, 30600, 35300, 40400, 45900, 52200]::bigint[]) with ordinality p(prog, n)
   where coalesce(p_cegly, 0) >= p.prog
$function$
