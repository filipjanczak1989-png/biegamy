-- PROJEKT F (Filip 2.11 19:00, pkt B i D): plakat akcji + podmiana linku zbiórki bez wdrożenia.
--   akcje.plakat_url — adres plakatu w Storage (plik pod LOSOWĄ nazwą, wgrany ręcznie; repo publiczne, przed startem nic
--                      nie zdradza akcji). akcja_licznik zwraca plakat_url WYŁĄCZNIE po starcie (asercja niżej).
--   akcja_url_zbiorki(slug, url) — startujący (auth.uid() ∈ akcja_startujacy) podmienia url_zbiorki; tylko
--                      https://www.siepomaga.pl/… (zbiórka kończy się 27.11 — nowy link bez wdrożenia). Zwraca licznik.
-- Wycofanie: 20261102_WYCOFANIE_akcja_plakat_url.sql.
begin;

alter table public.akcje add column plakat_url text;

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
    'plakat_url',          a.plakat_url,   -- plakat akcji (Filip 2.11 19:00) — WYŁĄCZNIE po starcie (gałąź wyżej go nie zna)
    'testowa',             a.testowa);
end $function$;

create function public.akcja_url_zbiorki(p_slug text, p_url text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje; v_url text := btrim(coalesce(p_url, ''));
begin
  select * into a from public.akcje where slug = p_slug for update;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_url_zbiorki: tylko startujący' using errcode = '42501';
  end if;
  if v_url !~ '^https://www\.siepomaga\.pl/[A-Za-z0-9._~/-]{1,200}$' then
    raise exception 'akcja_url_zbiorki: link musi być https://www.siepomaga.pl/…' using errcode = '22023';
  end if;
  update public.akcje set url_zbiorki = v_url where id = a.id;
  return public.akcja_licznik(p_slug);
end $fn$;

revoke all on function public.akcja_url_zbiorki(text, text) from public, anon, authenticated;
grant execute on function public.akcja_url_zbiorki(text, text) to authenticated;

do $$
declare v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure); v_przed text;
begin
  -- plakat tylko po starcie: gałąź „wystartowala_at is null" nie zna plakatu
  v_przed := substring(v_def from 'wystartowala_at is null then(.*?)end if');
  if v_przed is null or position('plakat' in v_przed) > 0 then raise exception 'plakat: licznik zdradza plakat przed startem'; end if;
  if position('plakat_url' in v_def) = 0 then raise exception 'plakat: licznik nie zwraca plakatu po starcie'; end if;
  if (select count(*) from public.akcje where plakat_url is not null) <> 0 then raise exception 'plakat: kolumna nie jest pusta'; end if;
  if has_function_privilege('anon', 'public.akcja_url_zbiorki(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.akcja_url_zbiorki(text, text)', 'execute') then raise exception 'url_zbiorki: uprawnienia'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
