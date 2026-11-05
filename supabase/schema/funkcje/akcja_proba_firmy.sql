CREATE OR REPLACE FUNCTION public.akcja_proba_firmy(p_dodaj boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_logo text; v_pliki jsonb;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_proba_firmy: tylko trener' using errcode = '42501'; end if;
  if p_dodaj then
    delete from public.akcja_firmy where akcja_slug = 'proba' and nazwa in ('Partner Próbny', 'Wieżowiec Próbny', 'Domek Próbny', 'Osiedle Próbne', 'Galeria Próbna', 'Fabryka Próbna');
    select f.logo_url into v_logo from public.akcja_firmy f where f.logo_url is not null order by f.dodano limit 1;
    insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values
      ('proba', 'Partner Próbny', 'https://biegamy.run/', v_logo, 'wiezowiec', 'rzeczowe', false, true),
      ('proba', 'Wieżowiec Próbny', 'https://biegamy.run/', null, 'wiezowiec', 'wplata', true, true),
      ('proba', 'Domek Próbny', 'https://biegamy.run/', v_logo, 'domek', 'wplata', true, true);
    insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie, logo_zgoda) values
      ('proba', 'Osiedle Próbne', 'https://biegamy.run/', v_logo, 'osiedle', 'poprzednie', false, true, false),
      ('proba', 'Galeria Próbna', 'https://biegamy.run/', v_logo, 'galeria', 'poprzednie', false, true, false),
      ('proba', 'Fabryka Próbna', 'https://biegamy.run/', v_logo, 'fabryka', 'poprzednie', false, true, false);
    return public.akcja_sciezka_stan();
  end if;
  select coalesce(jsonb_agg(distinct regexp_replace(f.logo_url, '^.*/akcja-firmy-logo/', '')), '[]'::jsonb) into v_pliki
    from public.akcja_firmy f
   where f.akcja_slug = 'proba' and f.logo_url is not null
     and not exists (select 1 from public.akcja_firmy i where i.akcja_slug <> 'proba' and i.logo_url = f.logo_url);
  delete from public.akcja_firmy where akcja_slug = 'proba';
  return public.akcja_sciezka_stan() || jsonb_build_object('pliki', v_pliki);
end $function$
