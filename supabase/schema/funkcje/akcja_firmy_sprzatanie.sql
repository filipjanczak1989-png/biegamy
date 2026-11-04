CREATE OR REPLACE FUNCTION public.akcja_firmy_sprzatanie()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_pliki text[]; v_maile integer;
begin
  select coalesce(array_agg(zrzut_sciezka), '{}') into v_pliki from public.akcja_firmy_zgloszenia where zrzut_sciezka is not null and utworzono < now() - interval '14 days';
  update public.akcja_firmy_zgloszenia set zrzut_sciezka = null where zrzut_sciezka is not null and utworzono < now() - interval '14 days';
  update public.akcja_firmy_zgloszenia z set email = null from public.akcje a
   where a.slug = z.akcja_slug and z.email is not null and a.koniec is not null and a.koniec + 30 < (now() at time zone 'Europe/Warsaw')::date;
  get diagnostics v_maile = row_count;
  delete from public.akcja_firmy_proby where kiedy < now() - interval '1 day';
  return jsonb_build_object('pliki', to_jsonb(v_pliki), 'maile', v_maile);
end $function$
