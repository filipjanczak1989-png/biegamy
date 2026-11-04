CREATE OR REPLACE FUNCTION public.akcja_firmy_zatwierdz(p_id uuid, p_logo_url text, p_kto uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare z public.akcja_firmy_zgloszenia; v_firma uuid;
begin
  select * into z from public.akcja_firmy_zgloszenia where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if z.status <> 'nowe' then return jsonb_build_object('ok', false, 'powod', 'juz_decyzja'); end if;
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane, zgoda_na_wymienienie, dodal)
  values (z.akcja_slug, z.nazwa, z.link, p_logo_url, z.rodzaj, z.kwota_gr, z.zgoda_na_kwote, true, true, p_kto) returning id into v_firma;
  update public.akcja_firmy_zgloszenia set status = 'zatwierdzone', decyzja_at = now(), decyzja_kto = p_kto, firma_id = v_firma, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
  return jsonb_build_object('ok', true, 'firma', v_firma, 'email', z.email, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
end $function$
