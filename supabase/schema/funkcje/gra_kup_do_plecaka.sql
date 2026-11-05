CREATE OR REPLACE FUNCTION public.gra_kup_do_plecaka(p_przedmiot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_konto uuid := public.auth_my_athlete_id();
  v_cena integer := case p_przedmiot when 'kask' then 5 when 'bidon' then 4 when 'rakieta' then 25 end;
  k public.gra_konto;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  if v_cena is null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  insert into public.gra_konto (athlete_id) values (v_konto) on conflict (athlete_id) do nothing;
  select * into k from public.gra_konto where athlete_id = v_konto for update;
  if k.saldo < v_cena then return jsonb_build_object('ok', false, 'powod', 'za_malo', 'saldo', k.saldo, 'plecak', k.plecak); end if;
  update public.gra_konto set saldo = saldo - v_cena, plecak = plecak || jsonb_build_object(p_przedmiot, coalesce((plecak ->> p_przedmiot)::integer, 0) + 1)
   where athlete_id = v_konto returning * into k;
  return jsonb_build_object('ok', true, 'saldo', k.saldo, 'plecak', k.plecak);
end $function$
