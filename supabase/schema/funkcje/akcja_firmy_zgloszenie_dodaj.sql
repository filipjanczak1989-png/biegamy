CREATE OR REPLACE FUNCTION public.akcja_firmy_zgloszenie_dodaj(p_id uuid, p_slug text, p_rodzaj text, p_nazwa text, p_link text, p_email text, p_logo text, p_zrzut text, p_kwota_gr integer DEFAULT NULL::integer, p_zgoda_kwota boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.akcja_firmy_zgloszenia (id, akcja_slug, rodzaj, nazwa, link, email, logo_sciezka, zrzut_sciezka, zgoda_na_wymienienie, kwota_gr, zgoda_na_kwote)
  values (p_id, p_slug, p_rodzaj, p_nazwa, p_link, p_email, p_logo, p_zrzut, true, p_kwota_gr, coalesce(p_zgoda_kwota, false));
  return jsonb_build_object('ok', true);
end $function$
