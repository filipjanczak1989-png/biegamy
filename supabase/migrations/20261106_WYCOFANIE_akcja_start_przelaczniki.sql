-- Wycofanie 20261106_akcja_start_przelaczniki.sql: guzik znów niczego nie włącza, firmy próby wracają do trzech. Przełączniki zostają, jak stoją. Partnerzy próby znikają przy następnym „Usuń firmy próby”. Po cofnięciu grę, koparkę i rowerzystę włączasz ręcznie, poleceniami ze ściągi.
begin;

CREATE OR REPLACE FUNCTION public.akcja_start(p_slug text, p_nacisnieto_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_t timestamptz := now();
begin
  select * into a from public.akcje where slug = p_slug for update;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_start: tylko startujący' using errcode = '42501';
  end if;
  if a.wystartowala_at is not null then return public.akcja_licznik(p_slug); end if;

  if p_nacisnieto_at is not null
     and p_nacisnieto_at <= now() + interval '2 minutes'
     and p_nacisnieto_at >= now() - interval '1 day'
     and (a.okno_startu_od is null or p_nacisnieto_at >= a.okno_startu_od)
     and (a.okno_startu_do is null or p_nacisnieto_at <= a.okno_startu_do) then
    v_t := p_nacisnieto_at;
  end if;
  if (a.okno_startu_od is not null and v_t < a.okno_startu_od) or (a.okno_startu_do is not null and v_t > a.okno_startu_do) then
    raise exception 'akcja_start: poza oknem startu' using errcode = '22023';
  end if;

  update public.akcje
     set wystartowala_at = v_t,
         start = case when testowa then (v_t at time zone 'Europe/Warsaw')::date else start end
   where id = a.id and wystartowala_at is null;
  return public.akcja_licznik(p_slug);
end $function$;

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
    delete from public.akcja_firmy where akcja_slug = 'proba' and nazwa in ('Partner Próbny', 'Wieżowiec Próbny', 'Domek Próbny');
    select f.logo_url into v_logo from public.akcja_firmy f where f.logo_url is not null order by f.dodano limit 1;
    insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, wsparcie, potwierdzenie_widziane, zgoda_na_wymienienie) values
      ('proba', 'Partner Próbny', 'https://biegamy.run/', v_logo, 'wiezowiec', 'rzeczowe', false, true),
      ('proba', 'Wieżowiec Próbny', 'https://biegamy.run/', null, 'wiezowiec', 'wplata', true, true),
      ('proba', 'Domek Próbny', 'https://biegamy.run/', v_logo, 'domek', 'wplata', true, true);
    return public.akcja_sciezka_stan();
  end if;
  select coalesce(jsonb_agg(distinct regexp_replace(f.logo_url, '^.*/akcja-firmy-logo/', '')), '[]'::jsonb) into v_pliki
    from public.akcja_firmy f
   where f.akcja_slug = 'proba' and f.logo_url is not null
     and not exists (select 1 from public.akcja_firmy i where i.akcja_slug <> 'proba' and i.logo_url = f.logo_url);
  delete from public.akcja_firmy where akcja_slug = 'proba';
  return public.akcja_sciezka_stan() || jsonb_build_object('pliki', v_pliki);
end $function$;

comment on column public.akcje.fabianek_postac_gra is 'Grywalna koparka w grze Cegiełki. Domyślnie false, włącza Filip po starcie i zgodzie. Czytane wyłącznie przez funkcje gry.';

do $$
begin
  if md5(regexp_replace(pg_get_functiondef('public.akcja_start(text, timestamp with time zone)'::regprocedure), '\s+', ' ', 'g')) <> '3070ec7bc9046d4bb8ea5035910607cb' then raise exception 'wycofanie: akcja_start nie wrócił do wersji sprzed migracji'; end if;
  if md5(regexp_replace(pg_get_functiondef('public.akcja_proba_firmy(boolean)'::regprocedure), '\s+', ' ', 'g')) <> '4869c93dcaf216c738882158b615d322' then raise exception 'wycofanie: akcja_proba_firmy nie wróciła do wersji sprzed migracji'; end if;
  if has_function_privilege('anon', 'public.akcja_start(text, timestamp with time zone)', 'EXECUTE') then raise exception 'wycofanie: anon naciska guzik'; end if;
end $$;

commit;
notify pgrst, 'reload schema';
