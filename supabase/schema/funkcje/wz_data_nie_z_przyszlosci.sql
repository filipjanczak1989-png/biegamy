CREATE OR REPLACE FUNCTION public.wz_data_nie_z_przyszlosci()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.data > current_date then raise exception 'wynik z przyszłości' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $function$
