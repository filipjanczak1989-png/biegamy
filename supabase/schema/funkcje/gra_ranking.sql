CREATE OR REPLACE FUNCTION public.gra_ranking()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'dzien',   public.gra_ranking_od(d),
    'tydzien', public.gra_ranking_od(date_trunc('week', d)::date),
    'wszech',  public.gra_ranking_od(date '2000-01-01'),
    'dolozyli_wszech', public.gra_dolozyli(null, null),
    'dolozyli_akcja', coalesce((select case when a.wystartowala_at is null then '[]'::jsonb
                                            else public.gra_dolozyli(a.wystartowala_at, case when a.koniec is not null then ((a.koniec + 1)::timestamp at time zone 'Europe/Warsaw') end) end
                                  from public.akcje a where a.slug = 'dla-fabianka'), '[]'::jsonb),
    'mur',     (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w),
    'mur_cel', 12500000,
    'aktywna', coalesce((select a.gra_aktywna from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta', coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta_opis', (select case when a.rowerzysta_wlaczony then a.rowerzysta_opis end from public.akcje a where a.slug = 'dla-fabianka'),
    'postac_koparki', coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false))
    from (select (now() at time zone 'Europe/Warsaw')::date d) t
$function$
