CREATE OR REPLACE FUNCTION public.gra_kup(p_przedmiot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_konto uuid := public.auth_my_athlete_id();
  k public.gra_konto;
  v_cena integer := case p_przedmiot
    when 'koszulka-czerwona' then 10
    when 'koszulka-niebieska' then 10
    when 'koszulka-zielona' then 10
    when 'koszulka-fioletowa' then 15
    when 'koszulka-zlota' then 50
    when 'kamizelka' then 25
    when 'spodenki-czerwone' then 8
    when 'spodenki-niebieskie' then 8
    when 'spodenki-zielone' then 8
    when 'spodenki-biale' then 12
    when 'buty-czerwone' then 12
    when 'buty-niebieskie' then 12
    when 'buty-zielone' then 12
    when 'buty-fioletowe' then 15
    when 'buty-robocze' then 20
    when 'opaska' then 10
    when 'czapka-pompon' then 15
    when 'kask-rowerowy' then 25
    when 'czapka-zlota' then 40
    when 'okulary' then 20
    when 'medal' then 30
    when 'peleryna' then 60
  end;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  if v_cena is null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  insert into public.gra_konto (athlete_id) values (v_konto) on conflict (athlete_id) do nothing;
  select * into k from public.gra_konto where athlete_id = v_konto for update;
  if k.kupione @> to_jsonb(p_przedmiot) then return jsonb_build_object('ok', false, 'powod', 'juz_masz', 'saldo', k.saldo, 'kupione', k.kupione); end if;
  if k.saldo < v_cena then return jsonb_build_object('ok', false, 'powod', 'za_malo', 'saldo', k.saldo, 'kupione', k.kupione); end if;
  update public.gra_konto set saldo = saldo - v_cena, kupione = kupione || to_jsonb(p_przedmiot) where athlete_id = v_konto returning * into k;
  return jsonb_build_object('ok', true, 'saldo', k.saldo, 'kupione', k.kupione);
end $function$
