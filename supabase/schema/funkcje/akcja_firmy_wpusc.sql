CREATE OR REPLACE FUNCTION public.akcja_firmy_wpusc(p_ip text, p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  LIMIT_NA_GODZINE constant integer := 3;
  v_ile integer; ak public.akcje;
begin
  if p_slug not in ('dla-fabianka', 'proba') or not coalesce((select a.firmy_zgloszenia and a.wystartowala_at is not null from public.akcje a where a.slug = p_slug), false) then
    return jsonb_build_object('ok', false, 'powod', 'wylaczone');
  end if;
  delete from public.akcja_firmy_proby where kiedy < now() - interval '1 day';
  select count(*) into v_ile from public.akcja_firmy_proby where ip_skrot = p_ip and kiedy > now() - interval '1 hour';
  if v_ile >= LIMIT_NA_GODZINE then return jsonb_build_object('ok', false, 'powod', 'limit'); end if;
  insert into public.akcja_firmy_proby (ip_skrot) values (p_ip);
  select * into ak from public.akcje where slug = p_slug;
  return jsonb_build_object('ok', true, 'prog_domku_zl', ak.prog_domku_zl, 'prog_wiezowca_zl', ak.prog_wiezowca_zl);
end $function$
