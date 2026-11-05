CREATE OR REPLACE FUNCTION public.gra_nagrody_do_poziomu(p_poziom integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(n.przedmiot order by n.po, n.przedmiot), '[]'::jsonb)
    from (values (4, 'opaska'), (7, 'spodenki-czerwone'), (10, 'kamizelka'), (11, 'kask-rowerowy'), (15, 'czapka-pompon'), (20, 'medal'), (20, 'czapka-zlota')) n(po, przedmiot)
   where coalesce(p_poziom, 1) >= n.po
$function$
