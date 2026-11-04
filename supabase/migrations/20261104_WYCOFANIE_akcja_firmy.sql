-- WYCOFANIE 20261104_akcja_firmy.sql — licznik wraca do wersji sprzed firm (treść z produkcji 4.11), znika tabela i polityki.
-- ⛔ KOLEJNOŚĆ: najpierw front bez sekcji firm (js/akcja.mjs firmyHtml, dla-fabianka.html, js/okienko.js, trener.html). Front bez tabeli nie psuje strony (sekcja ukryta),
--    ale formularz w panelu trenera dostanie błąd.
-- ⛔ DANE: drop kasuje listę firm i kwoty. Przed wycofaniem zrzut poza repo (kwoty bez zgody są niepubliczne, a repo jest publiczne):
--    select * from public.akcja_firmy;
-- ⛔ BUCKET ZOSTAJE: storage blokuje bezpośredni DELETE (wyzwalacze protect_buckets_delete, protect_objects_delete, 42501). Po wycofaniu: Dashboard → Storage → akcja-firmy-logo → Empty, potem Delete.
--    Pliki pozostają publiczne pod swoimi adresami, dopóki bucket nie zostanie opróżniony.
begin;

-- Ten plik nadpisuje licznik wersją sprzed firm. Po nowszych migracjach skasowałby ich pola, więc odmawia: najpierw ich wycofania.
do $$
declare v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
begin
  if v_def ~ 'koparka_url|film_akcji_url|koparka_arkusz_url|kontakt_firmy|ulica' then raise exception 'wycofanie akcja_firmy: najpierw wycofaj nowsze migracje licznika (kolejność: gra, rowerzysta, szyldy, film, arkusz, koparka, ulica_licznik, ulica)'; end if;
end $$;

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
                              'data_zapowiedzi', case when a.data_zapowiedzi is null then a.start
                                                      when a.zapowiedz_zmiana_at is not null and now() >= a.zapowiedz_zmiana_at then coalesce(a.data_zapowiedzi_po, a.start)
                                                      else a.data_zapowiedzi end,   -- Z: teaser ≠ start; start zostaje prawdziwy
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

drop policy if exists akcja_firmy_logo_trener_odczyt on storage.objects;
drop policy if exists akcja_firmy_logo_trener_wgrywa on storage.objects;
drop policy if exists akcja_firmy_logo_trener_kasuje on storage.objects;

drop table public.akcja_firmy;

do $$
declare v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
begin
  if md5(regexp_replace(lower(v_def), '\s+', ' ', 'g')) <> '59888acf24052229c518d61220536913' then raise exception 'wycofanie: licznik nie wrócił do wersji sprzed firm'; end if;
  if to_regclass('public.akcja_firmy') is not null then raise exception 'wycofanie: tabela nadal jest'; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'akcja\_firmy\_logo\_%') then raise exception 'wycofanie: polityki storage nadal są'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
