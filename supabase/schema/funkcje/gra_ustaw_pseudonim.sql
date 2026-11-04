CREATE OR REPLACE FUNCTION public.gra_ustaw_pseudonim(p_user uuid, p_pseudonim text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_konto uuid;
begin
  select a.id into v_konto from public.athletes a where a.user_id = p_user limit 1;
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  insert into public.gra_konto (athlete_id, pseudonim) values (v_konto, p_pseudonim)
    on conflict (athlete_id) do update set pseudonim = excluded.pseudonim;
  return jsonb_build_object('ok', true, 'pseudonim', p_pseudonim);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'powod', 'zajety');
  when check_violation then return jsonb_build_object('ok', false, 'powod', 'zly_format');
end $function$
