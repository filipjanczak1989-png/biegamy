CREATE OR REPLACE FUNCTION public.akcja_zamknij_dobe()
 RETURNS TABLE(slug text, suma_km numeric, cel_km numeric, koniec date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare a public.akcje; v_wczoraj date := (now() at time zone 'Europe/Warsaw')::date - 1; v_suma numeric;
begin
  for a in select * from public.akcje where wystartowala_at is not null and koniec is null and start <= v_wczoraj for update loop
    v_suma := public.akcja_km_okna(a.id, a.start, v_wczoraj);
    if v_suma >= a.cel_km then
      update public.akcje set koniec = v_wczoraj where id = a.id and koniec is null;
      slug := a.slug; suma_km := round(v_suma, 2); cel_km := a.cel_km; koniec := v_wczoraj;
      return next;
    end if;
  end loop;
end $function$
