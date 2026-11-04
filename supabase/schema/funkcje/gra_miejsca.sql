CREATE OR REPLACE FUNCTION public.gra_miejsca(p_konto uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with okres(nazwa, od) as (
    select * from (values ('dzien', (now() at time zone 'Europe/Warsaw')::date),
                          ('tydzien', date_trunc('week', (now() at time zone 'Europe/Warsaw')::date)::date),
                          ('wszech', date '2000-01-01')) v(nazwa, od)
  ), moje as (
    select o.nazwa, o.od, (select max(w.cegly) from public.gra_wyniki w where w.athlete_id = p_konto and w.dzien >= o.od) cegly from okres o
  )
  select coalesce(jsonb_object_agg(m.nazwa, jsonb_build_object('cegly', m.cegly, 'miejsce',
           1 + (select count(*) from (select w.athlete_id from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                                       where w.dzien >= m.od and k.pseudonim is not null and w.athlete_id <> p_konto
                                       group by w.athlete_id having max(w.cegly) > m.cegly) lepsi))), '{}'::jsonb) || public.gra_moje_dolozone(p_konto)
    from moje m where m.cegly is not null
$function$
