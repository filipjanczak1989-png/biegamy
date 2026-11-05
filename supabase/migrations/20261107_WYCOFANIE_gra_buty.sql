-- Wycofanie 20261107_gra_buty.sql: funkcje wracają do poprzednich wersji. Złote cegły wydane na buty nie wracają. Kupione buty zostają w gra_konto.kupione i w zapisanych strojach, ale gra bez nich ich nie zna, a następny zapis stroju zdejmie miejsce „stopy”.
begin;

create or replace function public.gra_kup(p_przedmiot text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
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
end $$;

create or replace function public.gra_zapisz_stroje(p_stroje jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_konto uuid := public.auth_my_athlete_id();
  v_kupione jsonb; v_wynik jsonb := '{}'::jsonb; v_czysty jsonb; p record; s record;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  if jsonb_typeof(p_stroje) is distinct from 'object' or octet_length(p_stroje::text) > 2000 then return jsonb_build_object('ok', false, 'powod', 'zle_dane'); end if;
  insert into public.gra_konto (athlete_id) values (v_konto) on conflict (athlete_id) do nothing;
  select k.kupione into v_kupione from public.gra_konto k where k.athlete_id = v_konto for update;
  for p in select e.key, e.value from jsonb_each(p_stroje) e where e.key in ('kasia', 'filip', 'rowerzysta') and jsonb_typeof(e.value) = 'object' loop
    v_czysty := '{}'::jsonb;
    for s in select t.key, t.value from jsonb_each_text(p.value) t where t.key in ('tulow', 'spodenki', 'glowa', 'oczy', 'szyja', 'plecy') and t.value is not null loop
      if v_kupione ? s.value or s.value = 'korona' then v_czysty := v_czysty || jsonb_build_object(s.key, s.value); end if;
    end loop;
    v_wynik := v_wynik || jsonb_build_object(p.key, v_czysty);
  end loop;
  update public.gra_konto set stroje = v_wynik where athlete_id = v_konto;
  return jsonb_build_object('ok', true, 'stroje', v_wynik);
end $$;

notify pgrst, 'reload schema';
commit;
