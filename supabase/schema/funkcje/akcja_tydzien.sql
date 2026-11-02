CREATE OR REPLACE FUNCTION public.akcja_tydzien(p_slug text, p_poniedzialek date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_przed numeric; v_tydz numeric; v_kw bigint;
begin
  select * into a from public.akcje where slug = p_slug;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_tydzien: tylko startujący' using errcode = '42501';
  end if;
  if extract(isodow from p_poniedzialek) <> 1 then
    raise exception 'akcja_tydzien: % to nie poniedziałek', p_poniedzialek using errcode = '22023';
  end if;
  v_przed := public.akcja_km_okna(a.id, a.start, p_poniedzialek - 1);
  v_tydz  := public.akcja_km_okna(a.id, p_poniedzialek, p_poniedzialek + 6);
  v_kw := floor(least(v_przed + v_tydz, a.cel_km) * a.stawka_gr_filip)::bigint
        - floor(least(v_przed, a.cel_km) * a.stawka_gr_filip)::bigint;
  return jsonb_build_object('poniedzialek', p_poniedzialek, 'km', round(v_tydz, 2), 'kwota_gr', v_kw,
                            'przycieta', (v_przed + v_tydz) > a.cel_km and v_tydz > 0);
end $function$
