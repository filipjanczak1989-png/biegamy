CREATE OR REPLACE FUNCTION public.gra_zapisz_wynik(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  GRA_MAKS_NA_S constant numeric := 45;     -- zebrane cegły, w punktach 45 × mnożnik poziomu; pomiar w nagłówku migracji
  ZLOTE_MAKS_NA_S constant numeric := 0.5;  -- złote cegły, waluta sklepiku: osobny pułap, bo bicie waluty to inny zysk niż wyższy wynik
  RUNDA_S constant numeric := 60;
  BIDON_S constant numeric := 5;
  ZAPAS_ZEGARA_S constant numeric := 8;     -- numer rundy przychodzi z opóźnieniem sieci, gra już biegnie
  MAKS_RUNDA_S constant numeric := 1800;    -- pauza w tle jest dozwolona, ale runda nie żyje wiecznie
  v_konto uuid := public.auth_my_athlete_id();
  r public.gra_rundy;
  v_minelo numeric; v_powod text; v_poziom integer; v_punkty integer; v_nagrody jsonb;
  v_zlote numeric := public.gra_liczba(p_st -> 'zlote');
  v_salta numeric := public.gra_liczba(p_st -> 'salta');
  v_seria numeric := public.gra_liczba(p_st -> 'seria');
  v_upadki numeric := public.gra_liczba(p_st -> 'upadki');
  v_bidony numeric := public.gra_liczba(p_st -> 'bidony');
  v_poziom_st numeric := public.gra_liczba(p_st -> 'poziom');
  v_uzyte jsonb := p_st -> 'uzyte';
  v_plecak jsonb; v_powod_plecaka text;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  select * into r from public.gra_rundy where id = p_runda and athlete_id = v_konto for update;
  if not found then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane) values (v_konto, null, 'obca_runda', jsonb_build_object('cegly', p_cegly));
    return jsonb_build_object('ok', false, 'powod', 'podejrzany');
  end if;
  if r.koniec_at is not null then
    -- Ponowienie po zerwanej sieci: drugi raz nic nie wchodzi, odpowiedź taka sama jak za pierwszym.
    if exists (select 1 from public.gra_wyniki where runda_id = p_runda) then return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto), 'plecak', (select k.plecak from public.gra_konto k where k.athlete_id = v_konto)); end if;
    return jsonb_build_object('ok', false, 'powod', 'podejrzany');
  end if;

  -- Plecak: po jednej sztuce każdego rodzaju na rundę i tylko to, co jest. Czytane pod blokadą konta: dwie rundy naraz nie zużyją jednej sztuki dwa razy. Stary front nie wysyła pola.
  select k.plecak into v_plecak from public.gra_konto k where k.athlete_id = v_konto for update;
  if v_uzyte is not null then
    if jsonb_typeof(v_uzyte) <> 'array' then v_powod_plecaka := 'zle_dane';
    elsif exists (select 1 from jsonb_array_elements(v_uzyte) x(e) where jsonb_typeof(x.e) <> 'string' or x.e #>> '{}' not in ('kask', 'bidon')) then v_powod_plecaka := 'zle_dane';
    elsif (select count(*) from jsonb_array_elements_text(v_uzyte) x(t)) > (select count(distinct x.t) from jsonb_array_elements_text(v_uzyte) x(t)) then v_powod_plecaka := 'plecak_ponad_limit';
    elsif exists (select 1 from jsonb_array_elements_text(v_uzyte) x(t) where coalesce((v_plecak ->> x.t)::integer, 0) < 1) then v_powod_plecaka := 'plecak_bez_posiadania';
    end if;
  end if;

  v_poziom := coalesce(r.poziom, public.gra_poziom(public.gra_suma_cegiel(v_konto)));   -- runda sprzed migracji: poziom z konta
  v_minelo := extract(epoch from (now() - r.start_at));
  v_powod := case
    when p_postac is null or p_postac not in ('kasia', 'filip', 'rowerzysta', 'koparka') or p_cegly is null or p_cegly < 0 or p_czas is null
      or v_zlote is null or v_salta is null or v_seria is null or v_upadki is null or v_bidony is null
      or least(v_zlote, v_salta, v_seria, v_upadki, v_bidony) < 0
      or v_zlote <> trunc(v_zlote) or v_salta <> trunc(v_salta) or v_seria <> trunc(v_seria) or v_upadki <> trunc(v_upadki) or v_bidony <> trunc(v_bidony)
      or greatest(v_zlote, v_salta, v_seria, v_upadki, v_bidony) > 100000
      or (p_st -> 'poziom' is not null and (v_poziom_st is null or v_poziom_st <> trunc(v_poziom_st) or v_poziom_st < 1 or v_poziom_st > 100000)) then 'zle_dane'
    when v_bidony > 15 or abs(p_czas - (RUNDA_S + BIDON_S * v_bidony)) > 1 then 'dlugosc_rundy'
    when v_minelo < p_czas - ZAPAS_ZEGARA_S then 'za_krotko'
    when v_minelo > MAKS_RUNDA_S then 'runda_wygasla'
    when v_poziom_st > v_poziom then 'poziom_ponad_konto'
    when p_cegly > GRA_MAKS_NA_S * p_czas then 'ponad_pulap'
    when v_zlote > ZLOTE_MAKS_NA_S * p_czas then 'ponad_pulap_zlotych'
    when v_salta > p_czas / 0.5 then 'sprzeczne_liczby'
    when not public.gra_postac_odblokowana(p_postac, v_konto) then 'postac_zablokowana'
    else v_powod_plecaka
  end;
  update public.gra_rundy set koniec_at = now() where id = p_runda;
  if v_powod is not null then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane)
    values (v_konto, p_runda, v_powod, jsonb_build_object('cegly', p_cegly, 'czas_s', p_czas, 'minelo_s', round(v_minelo, 1), 'zlote', v_zlote, 'salta', v_salta, 'seria', v_seria, 'upadki', v_upadki, 'bidony', v_bidony,
                                                          'poziom_rundy', v_poziom, 'poziom_klient', v_poziom_st, 'uzyte', case when octet_length(v_uzyte::text) <= 100 then v_uzyte end,
                                                          'postac', case when p_postac in ('kasia', 'filip', 'rowerzysta', 'koparka') then p_postac end));
    -- Zablokowana postać to zwykle postęp z innego urządzenia, nie oszustwo: gracz dostaje prawdziwy powód.
    return jsonb_build_object('ok', false, 'powod', case when v_powod = 'postac_zablokowana' then v_powod else 'podejrzany' end, 'plecak', v_plecak);
  end if;

  -- Punkty liczy serwer: poziom, na którym runda naprawdę szła. Klient może zadeklarować niższy (gra otwarta przed awansem), wyższego nie przejdzie.
  v_punkty := round(p_cegly * public.gra_mnoznik_poziomu(least(coalesce(v_poziom_st::integer, v_poziom), v_poziom)));
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony)
  values (p_runda, v_konto, p_postac, p_cegly, v_punkty, p_czas, v_zlote, v_salta, v_seria, v_upadki, v_bidony);
  update public.gra_konto set saldo = saldo + v_zlote::integer where athlete_id = v_konto;   -- na saldo tylko złote; zwykłe idą do muru przez gra_wyniki
  -- Zużyte schodzą dopiero z przyjętą rundą: odrzucona nie kosztuje.
  update public.gra_konto k set plecak = k.plecak || (select jsonb_object_agg(x.t, coalesce((k.plecak ->> x.t)::integer, 0) - 1) from jsonb_array_elements_text(v_uzyte) x(t))
   where k.athlete_id = v_konto and jsonb_array_length(coalesce(v_uzyte, '[]'::jsonb)) > 0;
  -- Nagrody za rozdziały: tylko te, których gracz jeszcze nie ma. Kupiony wcześniej przedmiot zostaje i nie wraca na saldo.
  select coalesce(jsonb_agg(x.p), '[]'::jsonb) into v_nagrody
    from jsonb_array_elements(public.gra_nagrody_do_poziomu(public.gra_poziom(public.gra_suma_cegiel(v_konto)))) x(p)
   where not (select k.kupione @> x.p from public.gra_konto k where k.athlete_id = v_konto);
  update public.gra_konto set kupione = kupione || v_nagrody where athlete_id = v_konto and jsonb_array_length(v_nagrody) > 0;
  return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'saldo', (select saldo from public.gra_konto where athlete_id = v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto),
                            'punkty', v_punkty, 'kupione', (select kupione from public.gra_konto where athlete_id = v_konto), 'nagrody', v_nagrody, 'plecak', (select k.plecak from public.gra_konto k where k.athlete_id = v_konto));
end $function$
