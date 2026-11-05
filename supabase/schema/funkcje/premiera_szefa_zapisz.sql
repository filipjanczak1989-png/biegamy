CREATE OR REPLACE FUNCTION public.premiera_szefa_zapisz(p_cegly integer, p_czas numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a public.akcje;
  v_ja uuid := public.auth_my_athlete_id();
  v_ile integer;
begin
  if v_ja is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  select * into a from public.akcje where slug = 'dla-fabianka';
  if not found or not exists (select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = v_ja) then return jsonb_build_object('ok', false, 'powod', 'nie_startujacy'); end if;
  if a.wystartowala_at is null then return jsonb_build_object('ok', false, 'powod', 'przed_startem'); end if;
  if not a.wizerunek_zgoda then return jsonb_build_object('ok', false, 'powod', 'bez_zgody'); end if;
  if p_cegly is null or p_czas is null or p_cegly < 0 or p_czas < 59 or p_czas > 136 or p_cegly > 45 * p_czas then return jsonb_build_object('ok', false, 'powod', 'zle_dane'); end if;
  if extract(epoch from (now() - a.wystartowala_at)) < p_czas - 8 then return jsonb_build_object('ok', false, 'powod', 'za_krotko'); end if;
  insert into public.gra_pierwsze_cegly (slug, cegly, czas_s) values ('dla-fabianka', p_cegly, p_czas) on conflict (slug) do nothing;
  get diagnostics v_ile = row_count;
  return jsonb_build_object('ok', true, 'juz', v_ile = 0, 'cegly', (select p.cegly from public.gra_pierwsze_cegly p where p.slug = 'dla-fabianka'));
end $function$
