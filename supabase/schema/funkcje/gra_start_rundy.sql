CREATE OR REPLACE FUNCTION public.gra_start_rundy(p_ulepszenie text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  RUND_NA_MINUTE constant integer := 3;   -- runda trwa minutę; zapas na wyjście i ponowny start
  v_konto uuid := public.auth_my_athlete_id();
  v_ile integer; v_runda uuid; v_saldo integer; v_poziom integer;
  v_cena integer := case p_ulepszenie when 'kask' then 5 when 'bidon' then 4 end;
  v_ulepszenie text;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  if not coalesce((select a.gra_aktywna from public.akcje a where a.slug = 'dla-fabianka'), false) then return jsonb_build_object('ok', false, 'powod', 'wylaczona'); end if;
  insert into public.gra_konto (athlete_id) values (v_konto) on conflict (athlete_id) do nothing;
  perform 1 from public.gra_konto where athlete_id = v_konto for update;   -- kolejka per konto: równoległe starty nie przeskoczą limitu
  select count(*) into v_ile from public.gra_rundy where athlete_id = v_konto and start_at > now() - interval '60 seconds';
  if v_ile >= RUND_NA_MINUTE then
    if not exists (select 1 from public.gra_podejrzane where athlete_id = v_konto and powod = 'za_czesto' and kiedy > now() - interval '60 seconds') then
      insert into public.gra_podejrzane (athlete_id, powod, dane) values (v_konto, 'za_czesto', jsonb_build_object('rund_w_minucie', v_ile));
    end if;
    return jsonb_build_object('ok', false, 'powod', 'za_czesto');
  end if;
  -- Ulepszenie płatne dopiero tutaj, po limicie: odrzucony start nie kosztuje. Za mało cegiełek = runda bez ulepszenia, nie brak rundy.
  if v_cena is not null then
    update public.gra_konto set saldo = saldo - v_cena where athlete_id = v_konto and saldo >= v_cena;
    if found then v_ulepszenie := p_ulepszenie; end if;
  end if;
  v_poziom := public.gra_poziom(public.gra_suma_cegiel(v_konto));
  insert into public.gra_rundy (athlete_id, ulepszenie, poziom) values (v_konto, v_ulepszenie, v_poziom) returning id into v_runda;
  select saldo into v_saldo from public.gra_konto where athlete_id = v_konto;
  return jsonb_build_object('ok', true, 'runda', v_runda, 'ulepszenie', v_ulepszenie, 'saldo', v_saldo, 'poziom', v_poziom);
end $function$
