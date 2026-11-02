-- PROJEKT F — akcje („12 500 km dla Fabianka”, start guzikiem 8.11.2026).
-- Spec: F-dla-Fabianka-spec-v3.md (+ v2 tam, gdzie v3 nic nie zmienia). Raport dnia 1: docs/akcja-f-zwiad.md.
--
-- Tabele (zero dostępu z przeglądarki poza własnym wierszem sponsora — wszystko przez RPC):
--   akcje              — jeden wiersz na akcję; nowa akcja = nowy slug, nigdy UPDATE celu/stawki starej
--   akcja_startujacy   — kto może nacisnąć guzik (auth.uid() → athletes.id, NIE rola z user_metadata — LEKCJA z K5)
--   akcja_sponsorzy    — deklaracje stawek; wiersz widzi tylko właściciel, publiczna jest suma i liczba
-- RPC (security definer):
--   akcja_licznik(slug)               authenticated + service_role — WYŁĄCZNIE agregaty; przed startem suma_km = null i zero nazwy dziecka
--   akcja_moj_wklad(slug)             authenticated — po auth.uid(), bez parametru osoby
--   akcja_tydzien(slug, poniedzialek) tylko startujący — rozliczenie tygodnia, suma tygodni ≤ cel × stawka
--   akcja_start(slug, nacisnieto_at)  tylko startujący — w oknie, raz; drugi raz zwraca istniejący stan
--   akcja_proba_reset()               tylko startujący — zeruje start akcji testowej 'proba'
--
-- ⚠️ ROLA ANONIMOWA NIE DOSTAJE NICZEGO (decyzja Filipa 2.11, wariant b). Niezalogowani (landing, dla-fabianka.html)
--    czytają licznik przez EF `akcja-licznik` (verify_jwt off, klucz serwisowy WYŁĄCZNIE do tego RPC, cache 60 s).
--    Strażnik bramki commitów (uprawnienia dla roli anonimowej = blokada twarda) zostaje bez wyjątku.
--    Asercja niżej pilnuje, że rola anonimowa nie ma EXECUTE na żadnej akcja_*.
--
-- Suma (akcja_km_okna) — przeniesione 1:1 z licznika #100kmDlaKasi (20260814_cap_licznika, _licznik_bez_przyszlosci):
--   * doba warszawska: (logged_at at time zone 'Europe/Warsaw')::date, start..min(koniec, dziś) włącznie;
--     cały dzień startu się liczy (v3: także poranny bieg przed naciśnięciem);
--   * WSZYSTKIE typy 1:1 (v2), bez wierszy __badge__%, tylko distance_km > 0;
--   * bez przyszłości: wpis z datą w przód nie wchodzi, dopóki ten dzień nie nadejdzie;
--   * cap na dobę i osobę (akcje.cap_km_doba, domyślnie 100 jak w #100kmDlaKasi) — chroni wspólną pulę przed
--     literówką/złośliwością; training_logs, statystyki i profil zostają nietknięte. ⚠️ Do potwierdzenia przez Filipa.
--   * akcja testowa liczy wyłącznie akcje.konta_testowe.
-- Brak triggera na training_logs i brak indeksu po logged_at: ~5 tys. wierszy, pełny skan = milisekundy.
--
-- PUSTE DO CZASU, AŻ PODA FILIP (nie zgadujemy): url_zbiorki, imie_zbiorki, nazwa (zawiera formę imienia),
-- wyprawa_athlete_ids i wyprawa_cel_km. konta_testowe próby = persona zawodnika Filipa (konto testów okienka M3b, decyzja 2.11).

begin;

create table public.akcje (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  nazwa               text,
  imie_zbiorki        text,
  url_zbiorki         text check (url_zbiorki is null or url_zbiorki ~ '^https://'),
  start               date not null,
  koniec              date,
  cel_km              numeric not null check (cel_km > 0),
  stawka_gr_filip     integer not null check (stawka_gr_filip >= 0),
  cap_km_doba         numeric not null default 100 check (cap_km_doba > 0),
  okno_startu_od      timestamptz,
  okno_startu_do      timestamptz,
  wystartowala_at     timestamptz,
  wizerunek_zgoda     boolean not null default false,
  wizerunek_url       text check (wizerunek_url is null or wizerunek_url ~ '^https://'),
  wyprawa_cel_km      numeric check (wyprawa_cel_km is null or wyprawa_cel_km > 0),
  wyprawa_dotarla_at  timestamptz,
  wyprawa_athlete_ids uuid[],
  testowa             boolean not null default false,
  konta_testowe       uuid[],
  created_at          timestamptz not null default now(),
  constraint akcje_wizerunek_tylko_za_zgoda check (wizerunek_url is null or wizerunek_zgoda),
  constraint akcje_okno_kolejnosc check (okno_startu_od is null or okno_startu_do is null or okno_startu_od < okno_startu_do),
  constraint akcje_koniec_po_starcie check (koniec is null or koniec >= start)
);

create table public.akcja_startujacy (
  akcja_id   uuid not null references public.akcje(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  primary key (akcja_id, athlete_id)
);

create table public.akcja_sponsorzy (
  akcja_id   uuid not null references public.akcje(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  stawka_gr  integer not null check (stawka_gr between 1 and 10000),
  created_at timestamptz not null default now(),
  primary key (akcja_id, athlete_id)
);

alter table public.akcje            enable row level security;
alter table public.akcja_startujacy enable row level security;
alter table public.akcja_sponsorzy  enable row level security;

-- Supabase nadaje anon/authenticated ALL na nowe tabele przez default privileges (LEKCJE: kasacja community_stats) —
-- revoke z nazwy, nie poleganie na RLS.
revoke all on public.akcje, public.akcja_startujacy, public.akcja_sponsorzy from public, anon, authenticated;
grant select on public.akcja_sponsorzy to authenticated;
create policy akcja_sponsorzy_wlasny_odczyt on public.akcja_sponsorzy
  for select to authenticated using (athlete_id = public.auth_my_athlete_id());
-- zapis deklaracji: RPC w dniu 5 (sponsorzy), nie insert z przeglądarki.

-- ── suma okna (wewnętrzna, bez EXECUTE dla kogokolwiek poza właścicielem) ────────────────────────────────────
create function public.akcja_km_okna(p_akcja_id uuid, p_od date, p_do date, p_tylko uuid[] default null)
returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $fn$
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
$fn$;

-- ── licznik publiczny ───────────────────────────────────────────────────────────────────────────────────────
create function public.akcja_licznik(p_slug text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
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
    v_wyprawa := public.akcja_km_okna(a.id, a.start,
                   coalesce((a.wyprawa_dotarla_at at time zone 'Europe/Warsaw')::date, v_dzis), a.wyprawa_athlete_ids);
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
end $fn$;

-- ── wkład własny ────────────────────────────────────────────────────────────────────────────────────────────
create function public.akcja_moj_wklad(p_slug text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje; v_ja uuid; v_stawka integer;
begin
  if auth.uid() is null then raise exception 'akcja_moj_wklad: brak sesji' using errcode = '42501'; end if;
  v_ja := public.auth_my_athlete_id();
  select * into a from public.akcje where slug = p_slug;
  if not found or v_ja is null then return null; end if;
  select stawka_gr into v_stawka from public.akcja_sponsorzy where akcja_id = a.id and athlete_id = v_ja;
  return jsonb_build_object(
    'wystartowala', a.wystartowala_at is not null,
    'km', case when a.wystartowala_at is null then null
               else round(public.akcja_km_okna(a.id, a.start, (now() at time zone 'Europe/Warsaw')::date, array[v_ja]), 2) end,
    'stawka_gr', v_stawka);
end $fn$;

-- ── rozliczenie tygodnia (Filip) ────────────────────────────────────────────────────────────────────────────
-- kwota tygodnia = floor(min(narastająco po tygodniu, cel) × stawka) − floor(min(narastająco przed, cel) × stawka):
-- suma wszystkich tygodni teleskopuje się do floor(min(suma, cel) × stawka) ≤ cel × stawka (v2: ≤ 125 000 gr).
create function public.akcja_tydzien(p_slug text, p_poniedzialek date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje; v_przed numeric; v_tydz numeric; v_kw bigint;
begin
  select * into a from public.akcje where slug = p_slug;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_tydzien: tylko startujący' using errcode = '42501';
  end if;
  if extract(isodow from p_poniedzialek) <> 1 then
    raise exception 'akcja_tydzien: % to nie poniedziałek', p_poniedzialek using errcode = '22023';
  end if;
  v_przed := public.akcja_km_okna(a.id, a.start, p_poniedzialek - 1);
  v_tydz  := public.akcja_km_okna(a.id, p_poniedzialek, p_poniedzialek + 6);
  v_kw := floor(least(v_przed + v_tydz, a.cel_km) * a.stawka_gr_filip)::bigint
        - floor(least(v_przed, a.cel_km) * a.stawka_gr_filip)::bigint;
  return jsonb_build_object('poniedzialek', p_poniedzialek, 'km', round(v_tydz, 2), 'kwota_gr', v_kw,
                            'przycieta', (v_przed + v_tydz) > a.cel_km and v_tydz > 0);
end $fn$;

-- ── guzik ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Czas naciśnięcia z klienta (offline pod domem) przyjmowany tylko, gdy: w oknie startu (jeśli jest), nie później
-- niż teraz + 2 min, nie wcześniej niż doba temu. Inaczej czas serwera. Drugie naciśnięcie nic nie zmienia.
create function public.akcja_start(p_slug text, p_nacisnieto_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje; v_t timestamptz := now();
begin
  select * into a from public.akcje where slug = p_slug for update;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_start: tylko startujący' using errcode = '42501';
  end if;
  if a.wystartowala_at is not null then return public.akcja_licznik(p_slug); end if;

  if p_nacisnieto_at is not null
     and p_nacisnieto_at <= now() + interval '2 minutes'
     and p_nacisnieto_at >= now() - interval '1 day'
     and (a.okno_startu_od is null or p_nacisnieto_at >= a.okno_startu_od)
     and (a.okno_startu_do is null or p_nacisnieto_at <= a.okno_startu_do) then
    v_t := p_nacisnieto_at;
  end if;
  if (a.okno_startu_od is not null and v_t < a.okno_startu_od) or (a.okno_startu_do is not null and v_t > a.okno_startu_do) then
    raise exception 'akcja_start: poza oknem startu' using errcode = '22023';
  end if;

  update public.akcje
     set wystartowala_at = v_t,
         start = case when testowa then (v_t at time zone 'Europe/Warsaw')::date else start end
   where id = a.id and wystartowala_at is null;
  return public.akcja_licznik(p_slug);
end $fn$;

-- ── reset próby (tylko akcja testowa 'proba') ───────────────────────────────────────────────────────────────
create function public.akcja_proba_reset()
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
declare a public.akcje;
begin
  select * into a from public.akcje where slug = 'proba' and testowa;
  if auth.uid() is null or not found or not exists (
       select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = public.auth_my_athlete_id()) then
    raise exception 'akcja_proba_reset: tylko startujący' using errcode = '42501';
  end if;
  update public.akcje set wystartowala_at = null, wyprawa_dotarla_at = null where id = a.id;
  return public.akcja_licznik('proba');
end $fn$;

-- create function w public nadaje EXECUTE anon/authenticated jawnie (LEKCJE #23) — revoke z nazwy, potem granty.
revoke all on function public.akcja_km_okna(uuid, date, date, uuid[]) from public, anon, authenticated;
revoke all on function public.akcja_licznik(text)                      from public, anon, authenticated;
revoke all on function public.akcja_moj_wklad(text)                    from public, anon, authenticated;
revoke all on function public.akcja_tydzien(text, date)                from public, anon, authenticated;
revoke all on function public.akcja_start(text, timestamptz)           from public, anon, authenticated;
revoke all on function public.akcja_proba_reset()                      from public, anon, authenticated;
grant execute on function public.akcja_licznik(text)            to authenticated, service_role;
grant execute on function public.akcja_moj_wklad(text)          to authenticated;
grant execute on function public.akcja_tydzien(text, date)      to authenticated;
grant execute on function public.akcja_start(text, timestamptz) to authenticated;
grant execute on function public.akcja_proba_reset()            to authenticated;

-- ── wiersze ─────────────────────────────────────────────────────────────────────────────────────────────────
-- dla-fabianka: okno guzika 8.11 06:00–23:59:59 Europe/Warsaw; nazwa, imię i link PUSTE do czasu, aż poda Filip.
insert into public.akcje (slug, nazwa, imie_zbiorki, url_zbiorki, start, cel_km, stawka_gr_filip, okno_startu_od, okno_startu_do)
values ('dla-fabianka', null, null, null, date '2026-11-08', 12500, 10,
        timestamp '2026-11-08 06:00:00' at time zone 'Europe/Warsaw',
        timestamp '2026-11-08 23:59:59' at time zone 'Europe/Warsaw');
-- proba: guzik w dowolnej chwili, start = dzień naciśnięcia, liczy wyłącznie konta_testowe: persona zawodnika Filipa
-- (filipjanczak1989@gmail.com — konto, na którym testowano okienko M3b; decyzja Filipa 2.11).
insert into public.akcje (slug, nazwa, start, cel_km, stawka_gr_filip, testowa, konta_testowe)
values ('proba', 'Próba guzika', date '2026-11-02', 12500, 10, true, array['56092926-2cf1-44b6-952f-38614497fdc2'::uuid]);
-- startujący: konto trenera Filipa (biegamy.run@gmail.com) — jeden wpis na akcję.
insert into public.akcja_startujacy (akcja_id, athlete_id)
select a.id, t.id from public.akcje a cross join public.athletes t
 where a.slug in ('dla-fabianka', 'proba') and t.id = '9c2df65c-6a46-410e-ad5f-474e5d973ec9';

-- ── asercje (nie zostawiają nic: błąd = cała migracja wycofana) ─────────────────────────────────────────────
do $$
declare v text;
begin
  if (select count(*) from public.akcja_startujacy) <> 2 then raise exception 'akcje: startujący ≠ 2'; end if;
  if exists (select 1 from pg_class c where c.relname in ('akcje','akcja_startujacy','akcja_sponsorzy')
               and c.relnamespace = 'public'::regnamespace and not c.relrowsecurity) then
    raise exception 'akcje: tabela bez RLS'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('akcje','akcja_startujacy')) then
    raise exception 'akcje: polityka na tabeli bez odczytu z przeglądarki'; end if;
  foreach v in array array['akcje','akcja_startujacy','akcja_sponsorzy'] loop
    if has_table_privilege('anon', 'public.'||v, 'select,insert,update,delete') then raise exception 'akcje: anon ma prawo do %', v; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.akcje', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.akcja_startujacy', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.akcja_sponsorzy', 'insert,update,delete') then
    raise exception 'akcje: authenticated ma zapis/odczyt poza RPC'; end if;
  -- rola anonimowa: ZERO z akcja_* (wariant b — licznik publiczny przez EF akcja-licznik)
  select string_agg(p.proname, ',') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'akcja\_%'
     and has_function_privilege('anon', p.oid, 'execute');
  if v is not null then raise exception 'akcje: anon ma EXECUTE na %', v; end if;
  if not has_function_privilege('service_role', 'public.akcja_licznik(text)', 'execute') then raise exception 'akcje: service_role bez licznika'; end if;
  if not has_function_privilege('authenticated', 'public.akcja_licznik(text)', 'execute') then raise exception 'akcje: authenticated bez licznika'; end if;
  if (select konta_testowe from public.akcje where slug = 'proba') is distinct from array['56092926-2cf1-44b6-952f-38614497fdc2'::uuid] then
    raise exception 'akcje: konta_testowe próby'; end if;
  if has_function_privilege('authenticated', 'public.akcja_km_okna(uuid,date,date,uuid[])', 'execute') then
    raise exception 'akcje: akcja_km_okna wystawiona'; end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'akcja\_%' and not prosecdef) then
    raise exception 'akcje: funkcja bez security definer'; end if;
end $$;

notify pgrst, 'reload schema';

commit;
