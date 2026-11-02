-- ZMIANA DATY STARTU (Filip 2.11 16:22): akcja startuje w SOBOTĘ 7.11.2026, nie 8.11 (to niedziela). Data w JEDNYM miejscu:
-- akcje.start (dla-fabianka i proba) + okno guzika 7.11 06:00–23:59:59 Europe/Warsaw; front czyta datę z licznika (start)
-- albo z jednej stałej BM_AKCJA_CYTATY.DZIEN_STARTU. Cały dzień 7.11 liczy się do sumy; okna odznak (odznaki_okna) idą
-- z akcje.start, więc przesuwają się same.
-- WYPRAWA (decyzja Filipa 2.11): km z kont Filipa (56092926…) i Kasi (2dd9206b… — konto z jej zawodnikami ma jej własne
-- treningi z intervals: osobne konto intervals, 0 wspólnych aktywności z Filipem) od naciśnięcia guzika do „Dotarliśmy";
-- cel (wyprawa_cel_km) poda Filip. Próba: wyprawa = konto testowe.
-- Przed zmianą: żadna akcja nie wystartowała (asercja).
begin;

do $$ begin
  if exists (select 1 from public.akcje where slug in ('dla-fabianka', 'proba') and wystartowala_at is not null) then
    raise exception 'zmiana daty: akcja już wystartowała — nie przesuwamy'; end if;
end $$;

update public.akcje
   set start = date '2026-11-07',
       okno_startu_od = timestamp '2026-11-07 06:00:00' at time zone 'Europe/Warsaw',
       okno_startu_do = timestamp '2026-11-07 23:59:59' at time zone 'Europe/Warsaw',
       wyprawa_athlete_ids = array['56092926-2cf1-44b6-952f-38614497fdc2'::uuid, '2dd9206b-d2f0-4bdc-a1ef-4d7765e446b8'::uuid]
 where slug = 'dla-fabianka';
update public.akcje
   set start = date '2026-11-07', wyprawa_athlete_ids = konta_testowe
 where slug = 'proba';

CREATE OR REPLACE FUNCTION public.akcja_licznik(p_slug text)
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

revoke all on function public.akcja_licznik(text) from public, anon, authenticated;
grant execute on function public.akcja_licznik(text) to authenticated, service_role;

do $$
declare a public.akcje; j jsonb;
begin
  select * into a from public.akcje where slug = 'dla-fabianka';
  if a.start <> date '2026-11-07' then raise exception 'data: start'; end if;
  if a.okno_startu_od <> timestamp '2026-11-07 06:00:00' at time zone 'Europe/Warsaw'
     or a.okno_startu_do <> timestamp '2026-11-07 23:59:59' at time zone 'Europe/Warsaw' then raise exception 'data: okno'; end if;
  if (select start from public.akcje where slug = 'proba') <> date '2026-11-07' then raise exception 'data: proba'; end if;
  if array_length(a.wyprawa_athlete_ids, 1) <> 2 then raise exception 'data: wyprawa'; end if;
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'execute') then raise exception 'data: anon na liczniku'; end if;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  j := public.akcja_licznik('dla-fabianka');
  reset role;
  if j->>'start' <> '2026-11-07' or (j->>'wystartowala')::boolean or j::text ~* 'fabian|borowczyk|siepomaga' then raise exception 'data: licznik %', j; end if;
end $$;

notify pgrst, 'reload schema';
commit;
