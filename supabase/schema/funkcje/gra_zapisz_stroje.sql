CREATE OR REPLACE FUNCTION public.gra_zapisz_stroje(p_stroje jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
