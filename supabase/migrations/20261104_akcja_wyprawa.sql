-- 20261104_akcja_wyprawa.sql — WYPRAWA (projekt F, komenda Filipa 4.11): SEKRET CELU w bazie + ślad GPS.
--   A0) wyprawa_km = DYSTANS TRASY, nie suma kont (Filip 4.11): per dzień warszawski km PIERWSZEGO konta z wyprawa_athlete_ids (Filip),
--       a gdy tego dnia nie ma jego aktywności — drugiego (Kasia, zapas); suma po dniach. Źródło: akcja_wyprawa_slad (dystans z intervals,
--       niezależny od synchronizacji logów), a gdy ślad pusty (cron jeszcze nie ruszył) — training_logs tą samą regułą. Suma AKCJI
--       bez zmian (oba konta). Test: obaj po 100 km tego samego dnia → wyprawa 100, akcja +200. wyprawa_cel_km = 240.
--   A) akcje.wyprawa_cel_nazwa — nazwa celu wyprawy żyje TYLKO w bazie (jak imię przed startem, plakat przed zgodą); akcja_licznik
--      oddaje wyprawa_cel_nazwa i wyprawa_cel_km WYŁĄCZNIE po „Dotarliśmy” (wyprawa_dotarla_at), przed tym tylko wyprawa_km + wyprawa_trwa.
--   B) akcja_wyprawa_slad — uproszczone punkty aktywności kont wyprawy (≤ 1 pkt / 50 m) z intervals; RLS: ZERO dostępu bezpośredniego
--      (anon/authenticated nic, bez polityk) — czyta i pisze wyłącznie EF akcja-wyprawa-slad kluczem service, oddaje tylko po starcie
--      i tylko po strefach prywatności (2 000 m od startu na zawsze, 2 000 m przed/po przerwie > 3 h, 500 m końcówek dopóki trwa).
--   Cron akcja-wyprawa-slad co 15 min → EF {rodzaj:'odswiez'} z sekretem z vault (jak akcja-push); intervals-webhook woła to samo po imporcie.
-- Test po skutku: tools/akcja-wyprawa-test.sh (transakcja z rollbackiem: licznik bez celu przed dotarciem, z celem po; próba to samo; RLS).
-- Wycofanie: 20261104_WYCOFANIE_akcja_wyprawa.sql.
begin;

alter table public.akcje add column wyprawa_cel_nazwa text check (wyprawa_cel_nazwa is null or char_length(wyprawa_cel_nazwa) between 1 and 60);
update public.akcje set wyprawa_cel_nazwa = 'Jasna Góra', wyprawa_cel_km = 240 where slug in ('dla-fabianka', 'proba');

create table public.akcja_wyprawa_slad (
  id                     bigint generated always as identity primary key,
  akcja_id               uuid not null references public.akcje(id) on delete cascade,
  athlete_id             uuid not null references public.athletes(id) on delete cascade,
  intervals_activity_id  text not null check (intervals_activity_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  start_at               timestamptz not null,
  koniec_at              timestamptz not null,
  dystans_m              integer not null default 0 check (dystans_m >= 0),
  punkty                 jsonb not null default '[]'::jsonb check (jsonb_typeof(punkty) = 'array' and pg_column_size(punkty) <= 2000000),
  pobrano_at             timestamptz not null default now(),
  constraint akcja_wyprawa_slad_jedna unique (akcja_id, intervals_activity_id)
);
comment on table public.akcja_wyprawa_slad is 'Ślad GPS wyprawy (uproszczone punkty [lat,lon,dist_m]); zero dostępu z przeglądarki — czyta i pisze tylko EF akcja-wyprawa-slad (service), oddaje po strefach prywatności.';
create index akcja_wyprawa_slad_akcja_start on public.akcja_wyprawa_slad (akcja_id, start_at);
alter table public.akcja_wyprawa_slad enable row level security;
revoke all on public.akcja_wyprawa_slad from public, anon, authenticated;

create or replace function public.akcja_licznik(p_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a public.akcje;
  v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
  v_suma numeric; v_wyprawa numeric := 0; v_sp_gr bigint; v_sp_n integer; v_dotarla boolean; v_glowny uuid; v_zapas uuid;
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
    -- wyprawa = DYSTANS TRASY (Filip 4.11): per dzień km głównego konta (pierwsze z listy), gdy brak — zapasu (drugie); nie suma obu.
    -- Źródło 1: ślad z intervals (akcja_wyprawa_slad, bieg/chód z zegarka, od naciśnięcia guzika do „Dotarliśmy"); źródło 2 (ślad pusty): training_logs.
    v_glowny := a.wyprawa_athlete_ids[1]; v_zapas := a.wyprawa_athlete_ids[2];
    select coalesce(sum(coalesce(nullif(d.km_glowny, 0), d.km_zapas)), 0) into v_wyprawa from (
      select (s.start_at at time zone 'Europe/Warsaw')::date dzien,
             sum(case when s.athlete_id = v_glowny then s.dystans_m end) / 1000.0 km_glowny,
             sum(case when s.athlete_id = v_zapas then s.dystans_m end) / 1000.0 km_zapas
        from public.akcja_wyprawa_slad s
       where s.akcja_id = a.id and s.start_at >= a.wystartowala_at and (a.wyprawa_dotarla_at is null or s.start_at <= a.wyprawa_dotarla_at)
       group by 1) d;
    if v_wyprawa = 0 then
      select coalesce(sum(coalesce(nullif(d.km_glowny, 0), d.km_zapas)), 0) into v_wyprawa from (
        select (l.logged_at at time zone 'Europe/Warsaw')::date dzien,
               sum(case when l.athlete_id = v_glowny then l.distance_km end) km_glowny,
               sum(case when l.athlete_id = v_zapas then l.distance_km end) km_zapas
          from public.training_logs l
         where l.athlete_id = any(a.wyprawa_athlete_ids) and l.distance_km > 0
           and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
           and public.akcja_typ_liczy(l.training_type, l.external_type)
           and l.logged_at >= a.wystartowala_at and (a.wyprawa_dotarla_at is null or l.logged_at <= a.wyprawa_dotarla_at)
           and l.logged_at <= now()
         group by 1) d;
    end if;
  end if;
  v_dotarla := a.wyprawa_dotarla_at is not null;
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
    'wyprawa_trwa',        (a.wyprawa_athlete_ids is not null and not v_dotarla),
    'wyprawa_km',          round(v_wyprawa, 2),
    'wyprawa_cel_km',      case when v_dotarla then a.wyprawa_cel_km end,        -- SEKRET (Filip 4.11): cel tylko po dotarciu
    'wyprawa_cel_nazwa',   case when v_dotarla then a.wyprawa_cel_nazwa end,
    'wyprawa_dotarla_at',  a.wyprawa_dotarla_at,
    'wizerunek',           case when a.wizerunek_zgoda then a.wizerunek_url end,
    'plakat_url',          case when a.wizerunek_zgoda then a.plakat_url end,   -- plakat: po starcie I tylko ze zgodą mamy (Filip 2.11 19:20)
    'testowa',             a.testowa);
end $function$;

select cron.schedule('akcja-wyprawa-slad', '*/15 * * * *', $job$
  select net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-wyprawa-slad',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
    body    := '{"rodzaj":"odswiez"}'::jsonb);
$job$);

do $$
declare j jsonb;
begin
  if has_table_privilege('anon', 'public.akcja_wyprawa_slad', 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', 'public.akcja_wyprawa_slad', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'akcja_wyprawa_slad: dostęp z przeglądarki — nie wdrażamy';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_wyprawa_slad') then raise exception 'akcja_wyprawa_slad: polityka na tabeli bez grantów'; end if;
  if (select count(*) from public.akcje where wyprawa_cel_nazwa is not null and wyprawa_cel_km = 240) < 2 then raise exception 'wyprawa_cel_nazwa/km: brak na akcji i próbie'; end if;
  if not exists (select 1 from cron.job where jobname = 'akcja-wyprawa-slad') then raise exception 'brak crona akcja-wyprawa-slad'; end if;
  -- licznik akcji, która nie wystartowała, nie zdradza niczego o wyprawie
  j := public.akcja_licznik('dla-fabianka');
  if j ? 'wyprawa_cel_nazwa' or j ? 'wyprawa_cel_km' then raise exception 'akcja_licznik: cel wyprawy widoczny przed startem'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
