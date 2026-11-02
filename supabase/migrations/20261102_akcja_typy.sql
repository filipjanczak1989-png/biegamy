-- AKCJA: liczą się TYLKO bieg i chód (Filip 2.11 18:35). Jedna lista typów w jednym miejscu — public.akcja_typ_liczy.
--   LICZY: bieg w każdej odmianie (typy is_run_type + „Wzmacniający"; z zegarka Run/TrailRun/Treadmill/VirtualRun),
--          chód: Spacer, Marsz, Nordic walking, Wędrówka (z zegarka Walk/Hike/NordicWalk).
--   NIE LICZY: rower (każdy, też e-bike i wirtualny), pływanie, siła, Zastępczy, Odpoczynek, inny — i KAŻDY typ nieznany.
--   external_type (surowy typ z intervals/Stravy) — gdy jest, musi być biegiem albo chodem: rower przemianowany ręcznie
--   na „Spokojny" nadal nie liczy. Pusty external_type (ręczny wpis, stare importy) — decyduje training_type.
-- Używają: akcja_km_okna (licznik, wkład, akcja_tydzien = push niedzielny, zamknięcie doby, share-card, odznaki km),
--          wyprawa w akcja_licznik, akcja_moje_dni (NOWA — dni do odznaki „7 dni z rzędu"; dotąd liczone w przeglądarce
--          z każdego typu). Zwiad typów: docs/akcja-f-typy-2026-11-02.md. Testy: tools/akcje-test-transakcji.sh.
-- Wycofanie: 20261102_WYCOFANIE_akcja_typy.sql.
begin;

create function public.akcja_typ_liczy(p_typ text, p_ext text)
returns boolean
language sql immutable parallel safe
set search_path = pg_catalog
as $fn$
  select coalesce(public.is_run_type(p_typ)
                  or lower(btrim(p_typ)) = any (array['wzmacniający', 'spacer', 'marsz', 'nordic walking', 'nordic', 'wędrówka']), false)
     and (p_ext is null or btrim(p_ext) = '' or p_ext = any (array['Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Walk', 'Hike', 'NordicWalk']));
$fn$;
comment on function public.akcja_typ_liczy(text, text) is
  'Akcja (projekt F, Filip 2.11): czy wpis liczy się do akcji — tylko bieg i chód; nieznany typ = nie. Jedyna lista typów akcji.';

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
      and public.akcja_typ_liczy(l.training_type, l.external_type)   -- tylko bieg i chód (Filip 2.11 18:35)
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
    -- wyprawa: km kont wyprawy OD NACIŚNIĘCIA guzika DO „Dotarliśmy" (decyzja Filipa 2.11), tylko bieg i chód (akcja_typ_liczy, Filip 2.11 18:35), bez __badge__
    select coalesce(sum(l.distance_km), 0) into v_wyprawa from public.training_logs l
     where l.athlete_id = any(a.wyprawa_athlete_ids) and l.distance_km > 0
       and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
       and public.akcja_typ_liczy(l.training_type, l.external_type)
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

create function public.akcja_moje_dni(p_slug text)
returns date[]
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje; v_ja uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if auth.uid() is null then raise exception 'akcja_moje_dni: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null or a.wystartowala_at is null then return '{}'::date[]; end if;
  if a.testowa and not (v_ja = any (coalesce(a.konta_testowe, '{}'::uuid[]))) then return '{}'::date[]; end if;
  return coalesce((
    select array_agg(distinct (l.logged_at at time zone 'Europe/Warsaw')::date)
    from public.training_logs l
    where l.athlete_id = v_ja and l.distance_km > 0
      and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
      and public.akcja_typ_liczy(l.training_type, l.external_type)
      and (l.logged_at at time zone 'Europe/Warsaw')::date between a.start and least(coalesce(a.koniec, v_dzis), v_dzis)), '{}'::date[]);
end $fn$;

revoke all on function public.akcja_typ_liczy(text, text) from public, anon, authenticated;
revoke all on function public.akcja_moje_dni(text) from public, anon, authenticated;
grant execute on function public.akcja_moje_dni(text) to authenticated;

do $$
begin
  -- zasada (blizna-105 pilnuje tego samego w repo; tools/akcje-test-transakcji.sql — na danych)
  if public.akcja_typ_liczy('Rower', null) or public.akcja_typ_liczy('Rower', 'Ride') or public.akcja_typ_liczy('Rower', 'EBikeRide')
     or public.akcja_typ_liczy('Rower', 'VirtualRide') or public.akcja_typ_liczy('Pływanie', 'Swim') or public.akcja_typ_liczy('Siłownia', null)
     or public.akcja_typ_liczy('Zastępczy', null) or public.akcja_typ_liczy('Zastępczy', 'Other') or public.akcja_typ_liczy('Odpoczynek', null)
     or public.akcja_typ_liczy('inny', null) or public.akcja_typ_liczy('Nieznany typ', null) or public.akcja_typ_liczy(null, null)
     or public.akcja_typ_liczy('Spokojny', 'Ride') or public.akcja_typ_liczy('Spokojny', 'NieznanyZegarek') then
    raise exception 'akcja_typy: liczy coś, co nie jest biegiem ani chodem'; end if;
  if not (public.akcja_typ_liczy('Spokojny', null) and public.akcja_typ_liczy('Spokojny', 'Run') and public.akcja_typ_liczy('Wybieganie', 'TrailRun')
     and public.akcja_typ_liczy('Interwały', 'Treadmill') and public.akcja_typ_liczy('Tempo', 'VirtualRun') and public.akcja_typ_liczy('Start', null)
     and public.akcja_typ_liczy('Regeneracja', 'Run') and public.akcja_typ_liczy('Wzmacniający', null) and public.akcja_typ_liczy('Spacer', 'Walk')
     and public.akcja_typ_liczy('Spacer', 'Hike') and public.akcja_typ_liczy(' spacer ', null) and public.akcja_typ_liczy('Nordic walking', null)
     and public.akcja_typ_liczy('Wędrówka', null) and public.akcja_typ_liczy('Marsz', null)) then
    raise exception 'akcja_typy: nie liczy biegu albo chodu'; end if;
  if has_function_privilege('anon', 'public.akcja_moje_dni(text)', 'execute') or has_function_privilege('anon', 'public.akcja_typ_liczy(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.akcja_moje_dni(text)', 'execute') then raise exception 'akcja_typy: uprawnienia'; end if;
  if position('akcja_typ_liczy' in pg_get_functiondef('public.akcja_km_okna(uuid, date, date, uuid[])'::regprocedure)) = 0
     or position('akcja_typ_liczy' in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) = 0 then
    raise exception 'akcja_typy: licznik bez listy typów'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
