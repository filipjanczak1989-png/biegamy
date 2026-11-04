CREATE OR REPLACE FUNCTION public.akcja_ulica_zmiana()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.zmieniono := now();
  new.zmienil := auth.uid();
  return new;
end $function$
