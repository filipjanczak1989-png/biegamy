CREATE OR REPLACE FUNCTION public.accept_terms()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _ts timestamptz := now();
begin
  update public.athletes
     set terms_accepted_at = _ts
   where user_id = auth.uid();
  return _ts;
end;
$function$
