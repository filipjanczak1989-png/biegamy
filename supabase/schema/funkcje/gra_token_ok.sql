CREATE OR REPLACE FUNCTION public.gra_token_ok(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((select a.gra_token_hash is not null and a.gra_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
                     from public.akcje a where a.slug = 'dla-fabianka'), false)
$function$
