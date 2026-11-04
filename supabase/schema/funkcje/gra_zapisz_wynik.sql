CREATE OR REPLACE FUNCTION public.gra_zapisz_wynik(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  GRA_MAKS_NA_S constant numeric := 40;     -- zwykłe cegły; pomiar w nagłówku migracji
  ZLOTE_MAKS_NA_S constant numeric := 0.5;  -- złote cegły, waluta sklepiku: osobny pułap, bo bicie waluty to inny zysk niż wyższy wynik
  RUNDA_S constant numeric := 60;
  BIDON_S constant numeric := 5;
  ZAPAS_ZEGARA_S constant numeric := 8;     -- numer rundy przychodzi z opóźnieniem sieci, gra już biegnie
  MAKS_RUNDA_S constant numeric := 1800;    -- pauza w tle jest dozwolona, ale runda nie żyje wiecznie
  v_konto uuid := public.auth_my_athlete_id();
  r public.gra_rundy;
  v_minelo numeric; v_powod text;
  v_zlote numeric := public.gra_liczba(p_st -> 'zlote');
  v_salta numeric := public.gra_liczba(p_st -> 'salta');
  v_seria numeric := public.gra_liczba(p_st -> 'seria');
  v_upadki numeric := public.gra_liczba(p_st -> 'upadki');
  v_bidony numeric := public.gra_liczba(p_st -> 'bidony');
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  select * into r from public.gra_rundy where id = p_runda and athlete_id = v_konto for update;
  if not found then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane) values (v_konto, null, 'obca_runda', jsonb_build_object('cegly', p_cegly));
    return jsonb_build_object('ok', false, 'powod', 'podejrzany');
  end if;
  if r.koniec_at is not null then
    -- Ponowienie po zerwanej sieci: drugi raz nic nie wchodzi, odpowiedź taka sama jak za pierwszym.
    if exists (select 1 from public.gra_wyniki where runda_id = p_runda) then return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto)); end if;
    return jsonb_build_object('ok', false, 'powod', 'podejrzany');
  end if;

  v_minelo := extract(epoch from (now() - r.start_at));
  v_powod := case
    when p_postac is null or p_postac not in ('kasia', 'filip', 'rowerzysta', 'koparka') or p_cegly is null or p_cegly < 0 or p_czas is null
      or v_zlote is null or v_salta is null or v_seria is null or v_upadki is null or v_bidony is null
      or least(v_zlote, v_salta, v_seria, v_upadki, v_bidony) < 0
      or v_zlote <> trunc(v_zlote) or v_salta <> trunc(v_salta) or v_seria <> trunc(v_seria) or v_upadki <> trunc(v_upadki) or v_bidony <> trunc(v_bidony)
      or greatest(v_zlote, v_salta, v_seria, v_upadki, v_bidony) > 100000 then 'zle_dane'
    when v_bidony > 15 or abs(p_czas - (RUNDA_S + BIDON_S * v_bidony)) > 1 then 'dlugosc_rundy'
    when v_minelo < p_czas - ZAPAS_ZEGARA_S then 'za_krotko'
    when v_minelo > MAKS_RUNDA_S then 'runda_wygasla'
    when p_cegly > GRA_MAKS_NA_S * p_czas then 'ponad_pulap'
    when v_zlote > ZLOTE_MAKS_NA_S * p_czas then 'ponad_pulap_zlotych'
    when v_salta > p_czas / 0.5 then 'sprzeczne_liczby'
    when not public.gra_postac_odblokowana(p_postac, v_konto) then 'postac_zablokowana'
  end;
  update public.gra_rundy set koniec_at = now() where id = p_runda;
  if v_powod is not null then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane)
    values (v_konto, p_runda, v_powod, jsonb_build_object('cegly', p_cegly, 'czas_s', p_czas, 'minelo_s', round(v_minelo, 1), 'zlote', v_zlote, 'salta', v_salta, 'seria', v_seria, 'upadki', v_upadki, 'bidony', v_bidony,
                                                          'postac', case when p_postac in ('kasia', 'filip', 'rowerzysta', 'koparka') then p_postac end));
    -- Zablokowana postać to zwykle postęp z innego urządzenia, nie oszustwo: gracz dostaje prawdziwy powód.
    return jsonb_build_object('ok', false, 'powod', case when v_powod = 'postac_zablokowana' then v_powod else 'podejrzany' end);
  end if;

  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, czas_s, zlote, salta, seria, upadki, bidony)
  values (p_runda, v_konto, p_postac, p_cegly, p_czas, v_zlote, v_salta, v_seria, v_upadki, v_bidony);
  update public.gra_konto set saldo = saldo + v_zlote::integer where athlete_id = v_konto;   -- na saldo tylko złote; zwykłe idą do muru przez gra_wyniki
  return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'saldo', (select saldo from public.gra_konto where athlete_id = v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto));
end $function$
