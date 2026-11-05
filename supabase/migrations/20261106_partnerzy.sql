-- Partnerzy poprzednich wyzwań (Filip 5.11): budynki osiedle, galeria, fabryka, osobno od firm akcji. Uruchamia Filip: supabase db query --linked -f (ścieżka absolutna), nigdy db push.
--   akcja_firmy.rodzaj      — dochodzą osiedle, galeria, fabryka.
--   akcja_firmy.wsparcie    — dochodzi 'poprzednie'. Rodzaj i wsparcie idą razem: firma akcji nie stanie w takim budynku, partner poprzedniego wyzwania nie zostanie firmą akcji. Bez kwoty i bez potwierdzenia wpłaty: nikt nic tu nie wpłacał.
--   akcja_firmy.logo_zgoda  — przełącznik na wpisie. Bez zgody licznik nie oddaje ani logo, ani plakatu, ani tekstu plakatu: budynek stoi z samą nazwą. Firmy akcji: true jak dotąd, bo logo dały same. Partner: domyślnie false, ustawia panel.
--   akcja_firmy.plakat_url, plakat_tekst — plakat na billboardzie przy fabryce i tekst po dotknięciu. Kubełek firm, te same zasady co logo. Nazwy firm nie ma w repo: wpisy powstają w panelu.
--   akcja_licznik           — te trzy pola tylko przy zgodzie. Reszta bez zmian.
begin;

-- Produkcja bywa nowsza od repo: licznik podmieniamy tylko wtedy, gdy na bazie stoi dokładnie wersja, z której zrobiono tę migrację. Bez lower(): w definicji jest wielkie „Ź”, a lower() zależy od ustawień bazy.
do $$
declare v_odcisk text := md5(regexp_replace(pg_get_functiondef('public.akcja_licznik(text)'::regprocedure), '\s+', ' ', 'g'));
begin
  if v_odcisk <> 'f80376d7746c4ad10dbca1a0568421b0' then
    raise exception 'partnerzy: licznik na bazie zmienił się od 5.11 (odcisk %): dołóż pola do AKTUALNEJ definicji, nie nadpisuj jej starą', v_odcisk;
  end if;
end $$;

alter table public.akcja_firmy drop constraint if exists akcja_firmy_rodzaj_check;
alter table public.akcja_firmy add constraint akcja_firmy_rodzaj_check check (rodzaj in ('domek', 'wiezowiec', 'cegielka', 'osiedle', 'galeria', 'fabryka'));
alter table public.akcja_firmy drop constraint if exists akcja_firmy_wsparcie_check;
alter table public.akcja_firmy add constraint akcja_firmy_wsparcie_check check (wsparcie in ('wplata', 'rzeczowe', 'poprzednie'));
alter table public.akcja_firmy drop constraint akcja_firmy_potwierdzenie_widziane_check;
alter table public.akcja_firmy add constraint akcja_firmy_potwierdzenie_widziane_check check (potwierdzenie_widziane = true or wsparcie in ('rzeczowe', 'poprzednie'));
alter table public.akcja_firmy add constraint akcja_firmy_poprzednie_razem check ((wsparcie = 'poprzednie') = (rodzaj in ('osiedle', 'galeria', 'fabryka')));
alter table public.akcja_firmy add constraint akcja_firmy_poprzednie_bez_kwoty check (wsparcie <> 'poprzednie' or kwota_gr is null);

alter table public.akcja_firmy add column logo_zgoda boolean not null default true;
alter table public.akcja_firmy add column plakat_url text check (plakat_url is null or plakat_url ~ '^https://afqojgkaveykxbltxzwm\.supabase\.co/storage/v1/object/public/akcja-firmy-logo/[0-9a-f-]{36}\.(png|jpg|webp)$');
alter table public.akcja_firmy add column plakat_tekst text check (plakat_tekst is null or (char_length(plakat_tekst) between 2 and 120 and plakat_tekst !~ '[[:cntrl:]]'));
comment on column public.akcja_firmy.logo_zgoda is 'Zgoda firmy na logo i plakat. Bez zgody akcja_licznik ich nie oddaje, budynek stoi z samą nazwą.';
comment on column public.akcja_firmy.plakat_url is 'Plakat na billboardzie przy fabryce. Kubełek firm. Tylko przy logo_zgoda.';
comment on column public.akcja_firmy.plakat_tekst is 'Tekst po dotknięciu billboardu. Tylko przy logo_zgoda.';
grant insert (logo_zgoda, plakat_url, plakat_tekst) on public.akcja_firmy to authenticated;
grant update (logo_zgoda, plakat_url, plakat_tekst) on public.akcja_firmy to authenticated;

CREATE OR REPLACE FUNCTION public.akcja_licznik(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a public.akcje;
  v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
  v_suma numeric; v_wyprawa numeric := 0; v_sp_gr bigint; v_sp_n integer; v_dotarla boolean; v_glowny uuid; v_zapas uuid; v_firmy jsonb := '[]'::jsonb;
begin
  select * into a from public.akcje where slug = p_slug;
  if not found then return null; end if;

  -- PRZED STARTEM nic, co zdradza akcję: bez nazwy, imienia, linku, sumy (v3 pkt 6).
  if a.wystartowala_at is null then
    return jsonb_build_object('wystartowala', false, 'wystartowala_at', null, 'start', a.start,
                              'data_zapowiedzi', case when a.data_zapowiedzi is null then a.start
                                                      when a.zapowiedz_zmiana_at is not null and now() >= a.zapowiedz_zmiana_at then coalesce(a.data_zapowiedzi_po, a.start)
                                                      else a.data_zapowiedzi end,   -- Z: teaser ≠ start; start zostaje prawdziwy
                              'cel_km', a.cel_km, 'suma_km', null, 'pct', null, 'zamknieta', false);
  end if;

  v_suma := coalesce(case when a.testowa then a.proba_sym_km end, public.akcja_km_okna(a.id, a.start, v_dzis));
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
  -- firmy (20261104_akcja_firmy): tylko po starcie (gałąź „przed startem” wyżej ich nie zna). Pola wymienione po imieniu: kwota wyłącznie przy zgodzie, potwierdzenie i autor nie wychodzą.
  -- Własny blok wyjątku: awaria listy firm oddaje pustą listę i nie psuje licznika.
  begin
    select coalesce(jsonb_agg(jsonb_build_object('nazwa', f.nazwa, 'link', f.link, 'logo_url', case when f.logo_zgoda then f.logo_url end, 'rodzaj', f.rodzaj, 'wsparcie', f.wsparcie,
                                                 'plakat_url', case when f.logo_zgoda then f.plakat_url end, 'plakat_tekst', case when f.logo_zgoda then f.plakat_tekst end,
                                                 'kwota_gr', case when f.zgoda_na_kwote then f.kwota_gr end) order by f.dodano, f.id), '[]'::jsonb)
      into v_firmy from public.akcja_firmy f where f.akcja_slug = a.slug and not f.ukryta;
  exception when others then v_firmy := '[]'::jsonb;
  end;

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
    'firmy',               v_firmy,
    'ulica', public.akcja_ulica_publiczna(a.slug), 'koparka_postac', case when a.wizerunek_zgoda and not a.testowa and a.koparka_url is not null then a.koparka_postac end, 'koparka_url', case when a.wizerunek_zgoda and not a.testowa and a.koparka_postac is not null then a.koparka_url end, 'koparka_arkusz_url', case when a.wizerunek_zgoda and not a.testowa and a.koparka_postac is not null then a.koparka_arkusz_url end, 'film_akcji_url', case when a.wizerunek_zgoda and not a.testowa then a.film_akcji_url end, 'prog_domku_zl', a.prog_domku_zl, 'prog_wiezowca_zl', a.prog_wiezowca_zl, 'firmy_zgloszenia', a.firmy_zgloszenia, 'kontakt_firmy', a.kontakt_firmy, 'testowa',             a.testowa);
end $function$;
-- Uprawnień nie ruszamy: create or replace je zachowuje, a licznik woła tylko EF z kluczem serwisowym (decyzja Filipa 2.11, wariant b).

do $$
begin
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'partnerzy: anon woła licznik'; end if;
  if not has_function_privilege('service_role', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'partnerzy: EF straciła licznik'; end if;
  if has_table_privilege('anon', 'public.akcja_firmy', 'SELECT') or has_column_privilege('anon', 'public.akcja_firmy', 'logo_zgoda', 'SELECT') then raise exception 'partnerzy: anon sięga do firm'; end if;
  if not has_column_privilege('authenticated', 'public.akcja_firmy', 'logo_zgoda', 'UPDATE') then raise exception 'partnerzy: panel nie zmieni zgody'; end if;
  if exists (select 1 from public.akcja_firmy where wsparcie = 'poprzednie') then raise exception 'partnerzy: wpisy mają powstać w panelu'; end if;
  if exists (select 1 from public.akcja_firmy where not logo_zgoda) then raise exception 'partnerzy: firmy akcji straciły logo'; end if;
end $$;

commit;
notify pgrst, 'reload schema';
