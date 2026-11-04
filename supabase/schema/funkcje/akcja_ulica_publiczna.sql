CREATE OR REPLACE FUNCTION public.akcja_ulica_publiczna(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_start timestamptz; u public.akcja_ulica; v_odb text[] := '{}'; v_imiona jsonb; v_bez integer;
begin
  select wystartowala_at into v_start from public.akcje where slug = p_slug;
  if v_start is null then
    return jsonb_build_object('odblokowane', '[]'::jsonb, 'imiona', '[]'::jsonb, 'bez_imienia', 0);
  end if;
  select * into u from public.akcja_ulica where akcja_slug = p_slug;
  if found and u.kwota_zl is not null and u.cel_zl is not null then
    if u.kwota_zl * 100 >= u.cel_zl * 25 then v_odb := v_odb || 'latarnie'::text; end if;
    if u.kwota_zl * 100 >= u.cel_zl * 50 then v_odb := v_odb || 'plac_zabaw'::text; end if;
    if u.kwota_zl * 100 >= u.cel_zl * 100 then v_odb := v_odb || 'park'::text; end if;
  end if;
  select coalesce(jsonb_agg(c.imie order by c.dodano, c.id) filter (where c.zgoda), '[]'::jsonb), (count(*) filter (where not c.zgoda))::integer
    into v_imiona, v_bez from public.akcja_cegielki c where c.akcja_slug = p_slug;
  return jsonb_build_object('odblokowane', to_jsonb(v_odb), 'imiona', v_imiona, 'bez_imienia', v_bez);
exception when others then
  -- Woła ją licznik akcji: awaria dodatków do rysunku nie może zabrać licznika.
  return jsonb_build_object('odblokowane', '[]'::jsonb, 'imiona', '[]'::jsonb, 'bez_imienia', 0);
end $function$
