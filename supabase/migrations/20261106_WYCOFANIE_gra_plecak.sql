-- Wycofanie 20261106_gra_plecak.sql: funkcje wracają do wersji z 20261106_gra_poziomy.sql, zakup i kolumna znikają razem z zawartością plecaków. Złote cegły wydane na kask i bidon nie wracają. Najpierw cofnij front. Bonus za trening wycofaj wcześniej.
begin;

do $$
begin
  if to_regprocedure('public.bonus_treningu_odbierz()') is not null then raise exception 'wycofanie plecaka: najpierw wycofaj bonus za trening, on dokłada do plecaka'; end if;
end $$;

create or replace function public.gra_start_rundy(p_ulepszenie text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
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
end $$;

create or replace function public.gra_zapisz_wynik(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
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
  end;
  update public.gra_rundy set koniec_at = now() where id = p_runda;
  if v_powod is not null then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane)
    values (v_konto, p_runda, v_powod, jsonb_build_object('cegly', p_cegly, 'czas_s', p_czas, 'minelo_s', round(v_minelo, 1), 'zlote', v_zlote, 'salta', v_salta, 'seria', v_seria, 'upadki', v_upadki, 'bidony', v_bidony,
                                                          'poziom_rundy', v_poziom, 'poziom_klient', v_poziom_st,
                                                          'postac', case when p_postac in ('kasia', 'filip', 'rowerzysta', 'koparka') then p_postac end));
    -- Zablokowana postać to zwykle postęp z innego urządzenia, nie oszustwo: gracz dostaje prawdziwy powód.
    return jsonb_build_object('ok', false, 'powod', case when v_powod = 'postac_zablokowana' then v_powod else 'podejrzany' end);
  end if;

  -- Punkty liczy serwer: poziom, na którym runda naprawdę szła. Klient może zadeklarować niższy (gra otwarta przed awansem), wyższego nie przejdzie.
  v_punkty := round(p_cegly * public.gra_mnoznik_poziomu(least(coalesce(v_poziom_st::integer, v_poziom), v_poziom)));
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony)
  values (p_runda, v_konto, p_postac, p_cegly, v_punkty, p_czas, v_zlote, v_salta, v_seria, v_upadki, v_bidony);
  update public.gra_konto set saldo = saldo + v_zlote::integer where athlete_id = v_konto;   -- na saldo tylko złote; zwykłe idą do muru przez gra_wyniki
  -- Nagrody za rozdziały: tylko te, których gracz jeszcze nie ma. Kupiony wcześniej przedmiot zostaje i nie wraca na saldo.
  select coalesce(jsonb_agg(x.p), '[]'::jsonb) into v_nagrody
    from jsonb_array_elements(public.gra_nagrody_do_poziomu(public.gra_poziom(public.gra_suma_cegiel(v_konto)))) x(p)
   where not (select k.kupione @> x.p from public.gra_konto k where k.athlete_id = v_konto);
  update public.gra_konto set kupione = kupione || v_nagrody where athlete_id = v_konto and jsonb_array_length(v_nagrody) > 0;
  return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'saldo', (select saldo from public.gra_konto where athlete_id = v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto),
                            'punkty', v_punkty, 'kupione', (select kupione from public.gra_konto where athlete_id = v_konto), 'nagrody', v_nagrody);
end $$;

create or replace function public.gra_moj_postep()
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object('cegly', s.c, 'poziom', public.gra_poziom(s.c))
    from (select public.gra_suma_cegiel(public.auth_my_athlete_id()) c) s
$$;

drop function if exists public.gra_kup_do_plecaka(text);
alter table public.gra_konto drop column plecak;

do $$
begin
  if has_function_privilege('anon', 'public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_moj_postep()', 'EXECUTE') then raise exception 'wycofanie plecaka: funkcje gry dla anona'; end if;
  if pg_get_functiondef('public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb)'::regprocedure) ~ 'plecak' or pg_get_functiondef('public.gra_moj_postep()'::regprocedure) ~ 'plecak' then raise exception 'wycofanie plecaka: funkcje znają plecak'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
