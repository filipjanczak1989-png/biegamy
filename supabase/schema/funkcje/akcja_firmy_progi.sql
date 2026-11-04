CREATE OR REPLACE FUNCTION public.akcja_firmy_progi(p_domek integer, p_wiezowiec integer, p_zgloszenia boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_domek is null or p_wiezowiec is null or p_domek < 1 or p_wiezowiec <= p_domek then return jsonb_build_object('ok', false, 'powod', 'progi'); end if;
  update public.akcje set prog_domku_zl = p_domek, prog_wiezowca_zl = p_wiezowiec, firmy_zgloszenia = coalesce(p_zgloszenia, firmy_zgloszenia) where slug = 'dla-fabianka';
  return jsonb_build_object('ok', true);
end $function$
