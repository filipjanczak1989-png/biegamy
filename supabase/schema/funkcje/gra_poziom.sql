CREATE OR REPLACE FUNCTION public.gra_poziom(p_cegly bigint)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(max(p.n), 1)::integer
    from unnest(array[0, 100, 300, 800, 1600, 3200, 5600, 9000, 14000, 20000, 28000, 38000, 52000, 70000, 92000, 120000, 156000, 200000, 260000, 400000]::bigint[]) with ordinality p(prog, n)
   where coalesce(p_cegly, 0) >= p.prog
$function$
