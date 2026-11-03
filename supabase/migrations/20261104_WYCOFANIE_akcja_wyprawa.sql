-- 20261104_WYCOFANIE_akcja_wyprawa.sql — cofa 20261104_akcja_wyprawa.sql: cron, tabela śladu, kolumna celu, akcja_licznik jak przed (dzień 5 + plakat).
begin;
select cron.unschedule('akcja-wyprawa-slad') where exists (select 1 from cron.job where jobname = 'akcja-wyprawa-slad');
drop table if exists public.akcja_wyprawa_slad;

create or replace function public.akcja_licznik(p_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a public.akcje;
  v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
  v_suma numeric; v_wyprawa numeric; v_sp_gr bigint; v_sp_n integer;
begin
  select * into a from public.akcje where slug = p_slug;
  if not found then return null; end if;
  if a.wystartowala_at is null then
    return jsonb_build_object('wystartowala', false, 'wystartowala_at', null, 'start', a.start,
                              'cel_km', a.cel_km, 'suma_km', null, 'pct', null, 'zamknieta', false);
  end if;
  v_suma := public.akcja_km_okna(a.id, a.start, v_dzis);
  if a.wyprawa_athlete_ids is not null then
    select coalesce(sum(l.distance_km), 0) into v_wyprawa from public.training_logs l
     where l.athlete_id = any(a.wyprawa_athlete_ids) and l.distance_km > 0
       and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
       and public.akcja_typ_liczy(l.training_type, l.external_type)
       and l.logged_at >= a.wystartowala_at and (a.wyprawa_dotarla_at is null or l.logged_at <= a.wyprawa_dotarla_at)
       and l.logged_at <= now();
  end if;
  select coalesce(sum(stawka_gr), 0), count(*) into v_sp_gr, v_sp_n from public.akcja_sponsorzy where akcja_id = a.id;
  return jsonb_build_object(
    'wystartowala', true, 'wystartowala_at', a.wystartowala_at, 'nazwa', a.nazwa, 'imie', a.imie_zbiorki, 'url_zbiorki', a.url_zbiorki,
    'start', a.start, 'koniec', a.koniec, 'cel_km', a.cel_km, 'suma_km', round(v_suma, 2),
    'pct', least(100, floor(v_suma / a.cel_km * 10000) / 100), 'zamknieta', (a.koniec is not null or v_suma >= a.cel_km),
    'filip_gr', floor(least(v_suma, a.cel_km) * a.stawka_gr_filip)::bigint, 'filip_max_gr', floor(a.cel_km * a.stawka_gr_filip)::bigint,
    'stawka_filip_gr', a.stawka_gr_filip, 'stawka_sponsorow_gr', v_sp_gr, 'sponsorzy_n', v_sp_n,
    'wyprawa_km', round(v_wyprawa, 2), 'wyprawa_cel_km', a.wyprawa_cel_km, 'wyprawa_dotarla_at', a.wyprawa_dotarla_at,
    'wizerunek', case when a.wizerunek_zgoda then a.wizerunek_url end, 'plakat_url', case when a.wizerunek_zgoda then a.plakat_url end,
    'testowa', a.testowa);
end $function$;

alter table public.akcje drop column if exists wyprawa_cel_nazwa;
notify pgrst, 'reload schema';
commit;
