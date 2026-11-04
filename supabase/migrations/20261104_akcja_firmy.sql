-- 20261104_akcja_firmy.sql — FIRMY WSPIERAJĄCE AKCJĘ (Filip 4.11, gałąź akcja/firmy). Podziękowanie, nie reklama.
--   akcja_firmy      — lista firm: nazwa, link (tylko https), logo_url (tylko nasz bucket), kwota_gr + zgoda_na_kwote, potwierdzenie_widziane i zgoda_na_wymienienie (oba w bazie zawsze true), kto i kiedy dodał.
--                      Dodaje i kasuje tylko trener: RLS przez auth_is_coach() (tabela coaches), NIE user_metadata, które użytkownik zmienia sam. Poprawka = usuń i dodaj od nowa,
--                      bez UPDATE dla przeglądarki. Autora i datę stawia baza (brak grantu na te kolumny, polityka sprawdza dodal = auth.uid()).
--   Odczyt publiczny — tabela zamknięta dla anona i zwykłych kont. Lista wychodzi WYŁĄCZNIE przez akcja_licznik, tylko po starcie, tylko pola wymienione po imieniu; kwota tylko przy zgodzie.
--                      dla-fabianka.html działa bez logowania i czyta licznik przez EF akcja-licznik (klucz serwisowy, jedno RPC), więc anon nie dostaje NICZEGO nowego;
--                      zalogowani (karta na Dziś) mają EXECUTE na liczniku od dawna. EF bez zmian i bez wdrożenia. Nowa firma widoczna po najwyżej 2 min (cache 60 s w EF + 60 s w przeglądarce).
--   akcja-firmy-logo — bucket publiczny do odczytu; wgrywa i kasuje tylko trener; PNG/JPEG/WebP (bez SVG: wektor XSS), do 1 MB, nazwa pliku UUID + rozszerzenie.
--   akcja_slug       — poza listą ze zlecenia: bez tego próba guzika (akcje.slug = 'proba') pokazywałaby prawdziwe firmy.
--   Bez klucza do athletes, więc delete_my_account nie dotyka tej tabeli; dodal → auth.users ON DELETE SET NULL, żeby firma nie blokowała kasowania konta trenera.
-- Test: tools/akcja-firmy-test.sh (przed wdrożeniem FIRMY_Z_MIGRACJA=1). Wycofanie: 20261104_WYCOFANIE_akcja_firmy.sql.
begin;

-- Produkcja bywa nowsza od repo: licznik podmieniamy tylko wtedy, gdy na bazie stoi dokładnie wersja, z której zrobiono tę migrację.
do $$
declare v_odcisk text := md5(regexp_replace(lower(pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)), '\s+', ' ', 'g'));
begin
  if v_odcisk <> '59888acf24052229c518d61220536913' then
    raise exception 'akcja_firmy: licznik na bazie zmienił się od 4.11 (odcisk %): dołóż firmy do AKTUALNEJ definicji, nie nadpisuj jej starą', v_odcisk;
  end if;
end $$;

create table public.akcja_firmy (
  id                     uuid primary key default gen_random_uuid(),
  akcja_slug             text not null default 'dla-fabianka' references public.akcje(slug) on delete cascade,
  nazwa                  text not null check (char_length(btrim(nazwa)) between 2 and 120 and nazwa !~ '[[:cntrl:]]'),
  link                   text not null check (char_length(link) <= 500 and link ~ '^https://[^[:space:]/?#<>"''@\\]+\.[^[:space:]/?#<>"''@\\]+([/?#][^[:space:]<>"'']*)?$'),
  logo_url               text check (logo_url is null or logo_url ~ '^https://afqojgkaveykxbltxzwm\.supabase\.co/storage/v1/object/public/akcja-firmy-logo/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  kwota_gr               integer check (kwota_gr is null or kwota_gr between 1 and 1000000000),
  zgoda_na_kwote         boolean not null default false,
  potwierdzenie_widziane boolean not null check (potwierdzenie_widziane = true),
  zgoda_na_wymienienie   boolean not null check (zgoda_na_wymienienie = true),
  dodano                 timestamptz not null default now(),
  dodal                  uuid default auth.uid() references auth.users(id) on delete set null,
  constraint akcja_firmy_zgoda_wymaga_kwoty check (not zgoda_na_kwote or kwota_gr is not null)
);
comment on table public.akcja_firmy is 'Firmy wspierające akcję (podziękowanie, nie reklama). Dodaje i kasuje trener (RLS: auth_is_coach). Publicznie tylko przez akcja_licznik, kwota wyłącznie przy zgodzie.';
comment on column public.akcja_firmy.kwota_gr is 'Grosze. Bez zgoda_na_kwote nie wychodzi z bazy poza panel trenera.';
comment on column public.akcja_firmy.potwierdzenie_widziane is 'Trener widział potwierdzenie wpłaty. CHECK = true, nie wychodzi publicznie.';
comment on column public.akcja_firmy.zgoda_na_wymienienie is 'Firma zgodziła się na wymienienie (Filip 4.11: nazwa firmy jednoosobowej to często imię i nazwisko, publicznie i z linkiem). CHECK = true, nie wychodzi publicznie. Cofnięcie zgody = trener kasuje wpis.';
comment on column public.akcja_firmy.dodal is 'Trener, który dodał wpis (auth.uid() przy zapisie; bez grantu dla przeglądarki).';
create index akcja_firmy_lista on public.akcja_firmy (akcja_slug, dodano, id);

-- create table w Supabase nadaje anonowi i authenticated ALL przez default privileges (pg_default_acl): najpierw zabieramy, potem tylko to, co potrzebne.
alter table public.akcja_firmy enable row level security;
revoke all on public.akcja_firmy from public;
revoke all on public.akcja_firmy from anon;
revoke all on public.akcja_firmy from authenticated;
grant select, delete on public.akcja_firmy to authenticated;
grant insert (akcja_slug, nazwa, link, logo_url, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane, zgoda_na_wymienienie) on public.akcja_firmy to authenticated;

create policy akcja_firmy_trener_odczyt on public.akcja_firmy for select to authenticated using (public.auth_is_coach());
create policy akcja_firmy_trener_dodaje on public.akcja_firmy for insert to authenticated with check (public.auth_is_coach() and dodal = auth.uid());
create policy akcja_firmy_trener_kasuje on public.akcja_firmy for delete to authenticated using (public.auth_is_coach());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('akcja-firmy-logo', 'akcja-firmy-logo', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Odczyt pliku idzie publicznym adresem; polityka SELECT jest dla .remove() w Storage API (wymaga SELECT + DELETE). UPDATE celowo brak: pliku nie da się nadpisać.
create policy akcja_firmy_logo_trener_odczyt on storage.objects for select to authenticated
  using (bucket_id = 'akcja-firmy-logo' and public.auth_is_coach());
create policy akcja_firmy_logo_trener_wgrywa on storage.objects for insert to authenticated
  with check (bucket_id = 'akcja-firmy-logo' and public.auth_is_coach() and name ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$');
create policy akcja_firmy_logo_trener_kasuje on storage.objects for delete to authenticated
  using (bucket_id = 'akcja-firmy-logo' and public.auth_is_coach());

create or replace function public.akcja_licznik(p_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  -- firmy (20261104_akcja_firmy): tylko po starcie (gałąź „przed startem” wyżej ich nie zna). Pola wymienione po imieniu: kwota wyłącznie przy zgodzie, potwierdzenie i autor nie wychodzą.
  -- Własny blok wyjątku: awaria listy firm oddaje pustą listę i nie psuje licznika.
  begin
    select coalesce(jsonb_agg(jsonb_build_object('nazwa', f.nazwa, 'link', f.link, 'logo_url', f.logo_url,
                                                 'kwota_gr', case when f.zgoda_na_kwote then f.kwota_gr end) order by f.dodano, f.id), '[]'::jsonb)
      into v_firmy from public.akcja_firmy f where f.akcja_slug = a.slug;
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
    'testowa',             a.testowa);
end $function$;

do $$
declare v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure); v_przed text; j jsonb;
begin
  -- anon: nic, ani tabelowo, ani kolumnowo
  if has_table_privilege('anon', 'public.akcja_firmy', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('anon', 'public.akcja_firmy', 'SELECT, INSERT, UPDATE, REFERENCES') then
    raise exception 'akcja_firmy: anon ma uprawnienia — nie wdrażamy';
  end if;
  -- authenticated: odczyt i kasowanie (dalej decyduje RLS), zapis tylko na kolumnach z formularza, autor i data poza zasięgiem
  if has_table_privilege('authenticated', 'public.akcja_firmy', 'INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('authenticated', 'public.akcja_firmy', 'UPDATE')
     or has_column_privilege('authenticated', 'public.akcja_firmy', 'dodal', 'INSERT')
     or has_column_privilege('authenticated', 'public.akcja_firmy', 'dodano', 'INSERT')
     or has_column_privilege('authenticated', 'public.akcja_firmy', 'id', 'INSERT')
     or not has_column_privilege('authenticated', 'public.akcja_firmy', 'potwierdzenie_widziane', 'INSERT')
     or not has_column_privilege('authenticated', 'public.akcja_firmy', 'zgoda_na_wymienienie', 'INSERT') then
    raise exception 'akcja_firmy: granty authenticated niezgodne z migracją';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.akcja_firmy'::regclass) then raise exception 'akcja_firmy: RLS wyłączone'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy') <> 3
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy'
                 and ((coalesce(qual, '') || coalesce(with_check, '')) not like '%auth_is_coach()%' or roles <> '{authenticated}')) then
    raise exception 'akcja_firmy: polityki niezgodne z migracją';
  end if;
  -- bucket: jeśli już istniał, on conflict go nie poprawił
  if not exists (select 1 from storage.buckets where id = 'akcja-firmy-logo' and public and file_size_limit = 1048576
                  and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp'] and array_length(allowed_mime_types, 1) = 3) then
    raise exception 'akcja-firmy-logo: bucket niezgodny z migracją (typy, limit, publiczny)';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'akcja\_firmy\_logo\_trener\_%' and cmd in ('SELECT', 'INSERT', 'DELETE')) <> 3
     or exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'ALL') and (coalesce(qual, '') || coalesce(with_check, '')) like '%akcja-firmy-logo%') then
    raise exception 'akcja-firmy-logo: polityki storage niezgodne z migracją';
  end if;
  -- licznik: firmy tylko po starcie, kwota tylko przy zgodzie, potwierdzenie i autor nie wychodzą, sekrety celu wyprawy i plakatu bez zmian
  v_przed := substring(v_def from 'wystartowala_at is null then(.*?)end if');
  if v_przed is null or position('firmy' in v_przed) > 0 then raise exception 'licznik: firmy przed startem'; end if;
  if position('case when f.zgoda_na_kwote then f.kwota_gr end' in v_def) = 0 then raise exception 'licznik: kwota bez warunku zgody'; end if;
  if regexp_replace(v_def, '--[^\n]*', '', 'g') ~* 'potwierdzenie|zgoda_na_wymienienie|f\.dodal|to_jsonb\(f\)|row_to_json' then raise exception 'licznik: wychodzi pole niepubliczne'; end if;
  if position('case when v_dotarla then a.wyprawa_cel_nazwa end' in v_def) = 0 or position('case when a.wizerunek_zgoda then a.plakat_url end' in v_def) = 0 then raise exception 'licznik: zgubiony warunek celu wyprawy albo plakatu'; end if;
  j := public.akcja_licznik('dla-fabianka');
  if (j->>'wystartowala')::boolean then
    if jsonb_typeof(j->'firmy') <> 'array' then raise exception 'licznik: po starcie brak listy firm'; end if;
  elsif j ? 'firmy' or j ? 'nazwa' or j ? 'imie' then raise exception 'licznik: przed startem zdradza akcję'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
