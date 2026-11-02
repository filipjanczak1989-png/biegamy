CREATE OR REPLACE FUNCTION public.athletes_f6_klucz_tylko_rpc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT' and new.f6_runner_key is not null)
     or (tg_op = 'UPDATE' and new.f6_runner_key is distinct from old.f6_runner_key) then
    if coalesce(current_setting('biegamy.f6_rpc', true), '') <> '1' then
      raise exception 'f6_runner_key: zapis tylko przez ustaw_f6_runner_key()' using errcode = '42501';
    end if;
  end if;
  return new;
end $function$
