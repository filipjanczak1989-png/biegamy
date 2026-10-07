CREATE OR REPLACE FUNCTION public.biegus_most_odbierz()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_aid uuid;
  v_od  timestamptz;
  v_km  numeric := 0;
  v_piora int := 0;
  v_logi jsonb := '[]'::jsonb;
begin
  select a.id into v_aid from public.athletes a where a.user_id = auth.uid() limit 1;
  if v_aid is null then
    raise exception 'brak wiersza athletes dla zalogowanego usera' using errcode = '42501';
  end if;

  insert into public.biegus_most (athlete_id, ostatni_odbior)
  values (v_aid, now() - interval '7 days')
  on conflict (athlete_id) do nothing;

  select m.ostatni_odbior into v_od
  from public.biegus_most m where m.athlete_id = v_aid
  for update;

  select coalesce(sum(coalesce(l.distance_km, 0)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'distance_km', l.distance_km,
           'training_type', l.training_type,
           'logged_at', l.logged_at) order by l.logged_at), '[]'::jsonb)
    into v_km, v_logi
  from public.training_logs l
  where l.athlete_id = v_aid
    and l.logged_at > v_od
    and (l.training_type is null or l.training_type not like '\_\_badge\_\_%');

  v_piora := floor(v_km * 5);

  if v_piora >= 1 then
    update public.biegus_most
       set ostatni_odbior = greatest(ostatni_odbior, now())
     where athlete_id = v_aid;
  end if;

  return jsonb_build_object('piora', v_piora, 'km', v_km, 'logi', v_logi, 'od', v_od);
end;
$function$
