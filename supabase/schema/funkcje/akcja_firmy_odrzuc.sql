CREATE OR REPLACE FUNCTION public.akcja_firmy_odrzuc(p_id uuid, p_powod text, p_kto uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare z public.akcja_firmy_zgloszenia;
begin
  select * into z from public.akcja_firmy_zgloszenia where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if z.status <> 'nowe' then return jsonb_build_object('ok', false, 'powod', 'juz_decyzja'); end if;
  update public.akcja_firmy_zgloszenia set status = 'odrzucone', powod = left(p_powod, 300), decyzja_at = now(), decyzja_kto = p_kto, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
  return jsonb_build_object('ok', true, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
end $function$
