CREATE OR REPLACE FUNCTION public.ustaw_f6_runner_key(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'brak sesji' using errcode = '42501'; end if;
  if p_key is not null and p_key !~ '^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$' then
    raise exception 'zły klucz biegacza' using errcode = '22023';
  end if;
  perform set_config('biegamy.f6_rpc', '1', true);
  update public.athletes set f6_runner_key = p_key where user_id = auth.uid();
  perform set_config('biegamy.f6_rpc', '', true);
end $function$
