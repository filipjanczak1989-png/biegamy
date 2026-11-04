CREATE OR REPLACE FUNCTION public.gra_moje_dolozone(p_konto uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with okno as (
    select a.wystartowala_at od, case when a.koniec is not null then ((a.koniec + 1)::timestamp at time zone 'Europe/Warsaw') end doo from public.akcje a where a.slug = 'dla-fabianka'
  ), suma as (
    select w.athlete_id, sum(w.cegly)::bigint wszech,
           coalesce(sum(w.cegly) filter (where o.od is not null and w.kiedy >= o.od and (o.doo is null or w.kiedy < o.doo)), 0)::bigint akcja
      from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id left join okno o on true
     where k.pseudonim is not null or w.athlete_id = p_konto
     group by w.athlete_id
  )
  select coalesce((select jsonb_build_object(
      'dolozyli_wszech', jsonb_build_object('cegly', m.wszech, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.wszech > m.wszech)),
      'dolozyli_akcja', jsonb_build_object('cegly', m.akcja, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.akcja > m.akcja)))
    from suma m where m.athlete_id = p_konto), '{}'::jsonb)
$function$
