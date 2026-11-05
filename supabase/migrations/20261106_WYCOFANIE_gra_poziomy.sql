-- Wycofanie 20261106_gra_poziomy.sql: przywraca funkcje i progi sprzed migracji, kasuje punkty, poziom w rundach, funkcje mnożnika, nagród i muru, premierę Szefa z jej cegłami, podpis Magazynu, stroje osobno na postać (zapis strojów na urządzeniach zostaje). Wyniki, zebrane cegły, salda, pseudonimy i przyznane dodatki zostają.
-- Po wycofaniu ranking i mur znów liczą cegły. Najpierw cofnij front, jeśli jest już wdrożony: nowy front czyta punkty, ale przy ich braku pokazuje cegły.
begin;
create or replace function public.gra_poziom(p_cegly bigint)
 returns integer language sql immutable set search_path to 'public', 'pg_temp'
as $$
  select coalesce(max(p.n), 1)::integer
    from unnest(array[0, 100, 300, 800, 1600, 3200, 5600, 9000, 14000, 20000, 28000, 38000, 52000, 70000, 92000, 120000, 156000, 200000, 260000, 400000]::bigint[]) with ordinality p(prog, n)
   where coalesce(p_cegly, 0) >= p.prog
$$;

create or replace function public.gra_postac_odblokowana(p_postac text, p_konto uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select case p_postac
    when 'kasia' then true
    when 'filip' then true
    when 'rowerzysta' then coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false)
                           and public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 10
    when 'koparka' then coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false)
                        and (public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 20 or (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w) >= 12500000)
    else false end
$$;

create or replace function public.gra_start_rundy(p_ulepszenie text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  RUND_NA_MINUTE constant integer := 3;   -- runda trwa minutę; zapas na wyjście i ponowny start
  v_konto uuid := public.auth_my_athlete_id();
  v_ile integer; v_runda uuid; v_saldo integer;
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
  insert into public.gra_rundy (athlete_id, ulepszenie) values (v_konto, v_ulepszenie) returning id into v_runda;
  select saldo into v_saldo from public.gra_konto where athlete_id = v_konto;
  return jsonb_build_object('ok', true, 'runda', v_runda, 'ulepszenie', v_ulepszenie, 'saldo', v_saldo);
end $$;

create or replace function public.gra_ranking_od(p_od date)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'cegly', x.cegly, 'postac', x.postac) order by x.cegly desc, x.kiedy), '[]'::jsonb)
    from (select rank() over (order by n.cegly desc)::integer miejsce, n.pseudonim, n.cegly, n.postac, n.kiedy
            from (select distinct on (w.athlete_id) k.pseudonim, w.cegly, w.postac, w.kiedy
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where w.dzien >= p_od and k.pseudonim is not null
                   order by w.athlete_id, w.cegly desc, w.kiedy) n
           order by n.cegly desc, n.kiedy limit 20) x
$$;

create or replace function public.gra_dolozyli(p_od timestamptz, p_do timestamptz)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'cegly', x.cegly) order by x.cegly desc, x.pseudonim), '[]'::jsonb)
    from (select rank() over (order by n.cegly desc)::integer miejsce, n.pseudonim, n.cegly
            from (select k.pseudonim, sum(w.cegly)::bigint cegly
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where k.pseudonim is not null and (p_od is null or w.kiedy >= p_od) and (p_do is null or w.kiedy < p_do)
                   group by k.pseudonim) n
           order by n.cegly desc, n.pseudonim limit 20) x
$$;

create or replace function public.gra_ranking()
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'dzien',   public.gra_ranking_od(d),
    'tydzien', public.gra_ranking_od(date_trunc('week', d)::date),
    'wszech',  public.gra_ranking_od(date '2000-01-01'),
    'dolozyli_wszech', public.gra_dolozyli(null, null),
    'dolozyli_akcja', coalesce((select case when a.wystartowala_at is null then '[]'::jsonb
                                            else public.gra_dolozyli(a.wystartowala_at, case when a.koniec is not null then ((a.koniec + 1)::timestamp at time zone 'Europe/Warsaw') end) end
                                  from public.akcje a where a.slug = 'dla-fabianka'), '[]'::jsonb),
    'mur',     (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w),
    'mur_cel', 12500000,
    'aktywna', coalesce((select a.gra_aktywna from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta', coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta_opis', (select case when a.rowerzysta_wlaczony then a.rowerzysta_opis end from public.akcje a where a.slug = 'dla-fabianka'),
    'postac_koparki', coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false))
    from (select (now() at time zone 'Europe/Warsaw')::date d) t
$$;

create or replace function public.gra_moje_dolozone(p_konto uuid)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with okno as (
    select a.wystartowala_at od, case when a.koniec is not null then ((a.koniec + 1)::timestamp at time zone 'Europe/Warsaw') end doo from public.akcje a where a.slug = 'dla-fabianka'
  ), suma as (
    select w.athlete_id, sum(w.cegly)::bigint wszech,
           coalesce(sum(w.cegly) filter (where o.od is not null and w.kiedy >= o.od and (o.doo is null or w.kiedy < o.doo)), 0)::bigint akcja
      from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id left join okno o on true
     where k.pseudonim is not null or w.athlete_id = p_konto
     group by w.athlete_id
  )
  select coalesce((select jsonb_build_object(
      'dolozyli_wszech', jsonb_build_object('cegly', m.wszech, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.wszech > m.wszech)),
      'dolozyli_akcja', jsonb_build_object('cegly', m.akcja, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.akcja > m.akcja)))
    from suma m where m.athlete_id = p_konto), '{}'::jsonb)
$$;

create or replace function public.gra_miejsca(p_konto uuid)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with okres(nazwa, od) as (
    select * from (values ('dzien', (now() at time zone 'Europe/Warsaw')::date),
                          ('tydzien', date_trunc('week', (now() at time zone 'Europe/Warsaw')::date)::date),
                          ('wszech', date '2000-01-01')) v(nazwa, od)
  ), moje as (
    select o.nazwa, o.od, (select max(w.cegly) from public.gra_wyniki w where w.athlete_id = p_konto and w.dzien >= o.od) cegly from okres o
  )
  select coalesce(jsonb_object_agg(m.nazwa, jsonb_build_object('cegly', m.cegly, 'miejsce',
           1 + (select count(*) from (select w.athlete_id from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                                       where w.dzien >= m.od and k.pseudonim is not null and w.athlete_id <> p_konto
                                       group by w.athlete_id having max(w.cegly) > m.cegly) lepsi))), '{}'::jsonb) || public.gra_moje_dolozone(p_konto)
    from moje m where m.cegly is not null
$$;

create or replace function public.gra_zapisz_wynik(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
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
end $$;

drop function if exists public.gra_zapisz_stroje(jsonb);
alter table public.gra_konto drop column if exists stroje;
drop function if exists public.premiera_szefa_zapisz(integer, numeric);
drop function if exists public.gra_mur();
drop table if exists public.gra_pierwsze_cegly;
alter table public.akcje drop column if exists magazyn_podpis;
drop function if exists public.gra_mnoznik_poziomu(integer);
drop function if exists public.gra_nagrody_do_poziomu(integer);
drop index if exists public.gra_wyniki_okres;
drop index if exists public.gra_wyniki_konto;
alter table public.gra_wyniki drop column if exists punkty;
create index gra_wyniki_okres on public.gra_wyniki (dzien, cegly desc);
create index gra_wyniki_konto on public.gra_wyniki (athlete_id, cegly desc);
alter table public.gra_rundy drop column if exists poziom;

do $$
begin
  if to_regclass('public.gra_pierwsze_cegly') is not null or to_regprocedure('public.premiera_szefa_zapisz(integer, numeric)') is not null or to_regprocedure('public.gra_mnoznik_poziomu(integer)') is not null or to_regprocedure('public.gra_nagrody_do_poziomu(integer)') is not null then raise exception 'wycofanie gra_poziomy: funkcja została'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and ((table_name = 'gra_rundy' and column_name = 'poziom') or (table_name = 'gra_wyniki' and column_name = 'punkty'))) then raise exception 'wycofanie gra_poziomy: kolumna została'; end if;
  if position('GRA_MAKS_NA_S constant numeric := 40' in pg_get_functiondef('public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb)'::regprocedure)) = 0 then raise exception 'wycofanie gra_poziomy: stary pułap nie wrócił'; end if;
  if pg_get_functiondef('public.gra_ranking()'::regprocedure) ~ 'rozdzial_meta|punkty' then raise exception 'wycofanie gra_poziomy: ranking zna punkty'; end if;
  if public.gra_poziom(20000) <> 10 or public.gra_poziom(400000) <> 20 then raise exception 'wycofanie gra_poziomy: stare progi nie wróciły'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
