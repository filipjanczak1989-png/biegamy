-- WYCOFANIE 20261102_akcja_typy.sql: powrót do „wszystkie typy" (definicje sprzed zmiany = migawka z 2.11, zgodna z prod).
begin;
create or replace function public.akcja_km_okna(p_akcja_id uuid, p_od date, p_do date, p_tylko uuid[] DEFAULT NULL::uuid[])
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- ⚠️ JOIN, nie LEFT JOIN: least() w Postgresie POMIJA NULL — least(NULL, 100) = 100, więc pusty wiersz
  --    z left join dawał akcji bez jednego wpisu 100 km (złapane testem 5a, 2.11.2026).
  select coalesce(sum(least(dz.km, a.cap_km_doba)), 0)::numeric
  from public.akcje a
  join lateral (
    select l.athlete_id, (l.logged_at at time zone 'Europe/Warsaw')::date as d, sum(l.distance_km) as km
    from public.training_logs l
    where l.distance_km > 0
      and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
      and (l.logged_at at time zone 'Europe/Warsaw')::date >= greatest(a.start, p_od)
      and (l.logged_at at time zone 'Europe/Warsaw')::date <= least(p_do, coalesce(a.koniec, p_do),
                                                                  (now() at time zone 'Europe/Warsaw')::date)
      and (not a.testowa or l.athlete_id = any(coalesce(a.konta_testowe, '{}'::uuid[])))
      and (p_tylko is null or l.athlete_id = any(p_tylko))
    group by 1, 2
  ) dz on true
  where a.id = p_akcja_id;
$function$;

create or replace function public.akcja_licznik(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a public.akcje;
  v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
  v_suma numeric; v_wyprawa numeric; v_sp_gr bigint; v_sp_n integer;
begin
  select * into a from public.akcje where slug = p_slug;
  if not found then return null; end if;

  -- PRZED STARTEM nic, co zdradza akcję: bez nazwy, imienia, linku, sumy (v3 pkt 6).
  if a.wystartowala_at is null then
    return jsonb_build_object('wystartowala', false, 'wystartowala_at', null, 'start', a.start,
                              'cel_km', a.cel_km, 'suma_km', null, 'pct', null, 'zamknieta', false);
  end if;

  v_suma := public.akcja_km_okna(a.id, a.start, v_dzis);
  if a.wyprawa_athlete_ids is not null then
    -- wyprawa: km kont wyprawy OD NACIŚNIĘCIA guzika DO „Dotarliśmy" (decyzja Filipa 2.11), wszystkie typy, bez __badge__
    select coalesce(sum(l.distance_km), 0) into v_wyprawa from public.training_logs l
     where l.athlete_id = any(a.wyprawa_athlete_ids) and l.distance_km > 0
       and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
       and l.logged_at >= a.wystartowala_at and (a.wyprawa_dotarla_at is null or l.logged_at <= a.wyprawa_dotarla_at)
       and l.logged_at <= now();
  end if;
  select coalesce(sum(stawka_gr), 0), count(*) into v_sp_gr, v_sp_n from public.akcja_sponsorzy where akcja_id = a.id;

  return jsonb_build_object(
    'wystartowala',        true,
    'wystartowala_at',     a.wystartowala_at,
    'nazwa',               a.nazwa,
    'imie',                a.imie_zbiorki,
    'url_zbiorki',         a.url_zbiorki,
    'start',               a.start,
    'koniec',              a.koniec,
    'cel_km',              a.cel_km,
    'suma_km',             round(v_suma, 2),
    'pct',                 least(100, floor(v_suma / a.cel_km * 10000) / 100),
    'zamknieta',           (a.koniec is not null or v_suma >= a.cel_km),
    'filip_gr',            floor(least(v_suma, a.cel_km) * a.stawka_gr_filip)::bigint,
    'filip_max_gr',        floor(a.cel_km * a.stawka_gr_filip)::bigint,
    'stawka_filip_gr',     a.stawka_gr_filip,
    'stawka_sponsorow_gr', v_sp_gr,
    'sponsorzy_n',         v_sp_n,
    'wyprawa_km',          round(v_wyprawa, 2),
    'wyprawa_cel_km',      a.wyprawa_cel_km,
    'wyprawa_dotarla_at',  a.wyprawa_dotarla_at,
    'wizerunek',           case when a.wizerunek_zgoda then a.wizerunek_url end,
    'testowa',             a.testowa);
end $function$;

drop function if exists public.akcja_moje_dni(text);
drop function if exists public.akcja_typ_liczy(text, text);
notify pgrst, 'reload schema';
commit;
