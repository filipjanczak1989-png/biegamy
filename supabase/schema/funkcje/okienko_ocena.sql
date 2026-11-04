CREATE OR REPLACE FUNCTION public.okienko_ocena(p_id bigint, p_ocena smallint, p_komentarz text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  if p_ocena is null or p_ocena not in (-1, 1) then raise exception 'ocena musi być -1 albo 1' using errcode = 'check_violation'; end if;
  update public.okienko_v2_log l
     set ocena = p_ocena, komentarz = case when p_ocena = -1 and p_komentarz is not null and btrim(p_komentarz) <> '' then left(btrim(p_komentarz), 300) else null end
   where l.id = p_id and l.kiedy > now() - interval '24 hours'
     and exists (select 1 from public.athletes a where a.id = l.athlete_id and a.user_id = auth.uid());
  get diagnostics n = row_count;
  return n = 1;
end $function$
