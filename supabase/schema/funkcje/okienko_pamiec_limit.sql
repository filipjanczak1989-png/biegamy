CREATE OR REPLACE FUNCTION public.okienko_pamiec_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (select count(*) from public.okienko_pamiec where athlete_id = new.athlete_id) >= 30 then
    raise exception 'okienko_pamiec: limit 30 faktów — usuń coś w Profilu („Co Okienko o mnie wie”)' using errcode = 'check_violation';
  end if;
  return new;
end $function$
