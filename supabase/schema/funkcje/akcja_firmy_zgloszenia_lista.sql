CREATE OR REPLACE FUNCTION public.akcja_firmy_zgloszenia_lista()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'zgloszenia', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'proba', z.akcja_slug = 'proba', 'rodzaj', z.rodzaj, 'nazwa', z.nazwa, 'link', z.link, 'email', z.email, 'kwota_gr', z.kwota_gr, 'zgoda_na_kwote', z.zgoda_na_kwote, 'logo', z.logo_sciezka, 'zrzut', z.zrzut_sciezka,
                                     'status', z.status, 'powod', z.powod, 'utworzono', z.utworzono, 'decyzja_at', z.decyzja_at) order by (z.status = 'nowe') desc, z.utworzono desc)
                           from (select * from public.akcja_firmy_zgloszenia order by (status = 'nowe') desc, utworzono desc limit 50) z), '[]'::jsonb),
    'prog_domku_zl', (select a.prog_domku_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'prog_wiezowca_zl', (select a.prog_wiezowca_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'firmy_zgloszenia', (select a.firmy_zgloszenia from public.akcje a where a.slug = 'dla-fabianka'))
$function$
