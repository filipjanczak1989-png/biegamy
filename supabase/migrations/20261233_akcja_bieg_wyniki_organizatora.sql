-- Wyniki biegu spoza aplikacji (bieg stacjonarny): wpisuje je organizator (PROJEKT 27.11.2026, niewdrożony).
--
-- PO CO: na biegu stacjonarnym biegną też osoby bez aplikacji. Ich wynik (imię, dystans, czas) wpisuje organizator i pokazuje się w rankingu
-- z oznaczeniem „wpisane przez organizatora”.
-- JAK: osobna tabela akcja_bieg_wyniki_org, NIE akcja_bieg_uczestnicy. Tam konto_id jest NOT NULL (FK do athletes), numer startowy wymagany,
-- a z tabeli czyta 28 funkcji (dyplom, odznaka, powiadomienia, przypomnienia, panel, liczby). Osobna tabela: dyplom, odznaki, powiadomienia,
-- licznik ulicy (akcja_km_okna, z training_logs) i kafel Społeczność (spolecznosc_dzis, z training_logs) jej nie widzą. Kilometry takich
-- wpisów NIE wchodzą do licznika ulicy.
-- DANE: samo imię albo imię + inicjał („Anna”, „Anna K.”), dystans z listy biegu, czas. Bez konta, e-maila i telefonu. Dwa pola wymagane:
-- osoba pełnoletnia (ranking z czasem tylko dla pełnoletnich, § 5 regulaminu) i zgoda na imię i czas w wynikach.
-- KTO: organizator = trener (auth_is_coach), ta sama bramka co panel biegu, „Usuń wynik” i weryfikacja. Poprawia i usuwa TYLKO własne wpisy.
-- Zapis wyłącznie przez funkcje SECURITY DEFINER; tabela bez polityk i bez uprawnień dla anon i authenticated.
-- KIEDY: jak „Zalicz ręcznie”: od startu biegu (faza trwa, wyniki, zakończony) do zalicz_do (domyślnie wynik_do + 7). Usunąć można zawsze.
-- SPRZĄTANIE: akcja_bieg_sprzatanie (90 dni po wynik_do) usuwa też te wpisy.
-- RANKING: akcja_bieg_ukonczyli dokleja wpisy (bez numeru, z „organizator”: true); miejsce w tym samym rankingu dystansu.
-- LICZBY: akcja_bieg_liczby dolicza je do „ukończyli” (decyzja 27.11: liczba na stronie biegu = liczba wierszy listy). Woła ją tylko
-- akcja_bieg_publiczny i akcja_bieg_sprzatanie (obie SECURITY DEFINER); anon i authenticated jej nie wykonują. Zapisani, dzieci, złote bez zmian.
-- STANY: tabela już jest → bez zmian, komunikat. Uruchomienie: db query --linked -f ze ścieżką bezwzględną. Test: tools/akcja-bieg-org-test.sh.
-- Wycofanie: 20261233_WYCOFANIE_akcja_bieg_wyniki_organizatora.sql

begin;
set local lock_timeout = '5s';
create temp table if not exists _org_komunikat (komunikat text) on commit drop;
truncate _org_komunikat;

do $$
begin
  if to_regclass('public.akcja_bieg_wyniki_org') is not null then
    insert into _org_komunikat values ('bez zmian: akcja_bieg_wyniki_org już jest');
    return;
  end if;
  if to_regprocedure('public.akcja_bieg_org_wpisz(text,text,integer,integer,boolean,boolean,uuid)') is not null then
    raise exception 'stan częściowy: funkcja akcja_bieg_org_wpisz jest, tabeli nie ma; nic nie zmieniono';
  end if;

  create table public.akcja_bieg_wyniki_org (
    id          uuid primary key default gen_random_uuid(),
    bieg_id     uuid not null references public.akcja_biegi(id) on delete cascade,
    imie        text not null,
    dystans_km  integer not null check (dystans_km between 1 and 100),
    wynik_s     integer not null check (wynik_s between 60 and 86400),
    pelnoletnia boolean not null check (pelnoletnia),
    zgoda_imie  boolean not null check (zgoda_imie),
    wpisal      uuid references auth.users(id) on delete set null,
    utworzono   timestamptz not null default now(),
    zmieniono   timestamptz,
    constraint akcja_bieg_org_imie check (char_length(imie) between 2 and 24 and imie ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]{2,}(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?( [A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]\.)?$')
  );
  create index akcja_bieg_wyniki_org_bieg on public.akcja_bieg_wyniki_org (bieg_id, utworzono);
  alter table public.akcja_bieg_wyniki_org enable row level security;
  revoke all on table public.akcja_bieg_wyniki_org from public, anon, authenticated;
  grant all on table public.akcja_bieg_wyniki_org to service_role;
  comment on table public.akcja_bieg_wyniki_org is 'Wyniki biegu spoza aplikacji, wpisane przez organizatora (20261233). Tylko imię (albo imię + inicjał), dystans, czas, zgody. Zapis przez akcja_bieg_org_wpisz/usun, odczyt przez akcja_bieg_org_lista i ranking akcja_bieg_ukonczyli.';

  create function public.akcja_bieg_org_wpisz(p_slug text, p_imie text, p_dystans_km integer, p_wynik_s integer, p_pelnoletnia boolean, p_zgoda_imie boolean, p_id uuid default null)
  returns jsonb language plpgsql volatile security definer set search_path = '' as $o$
  declare b public.akcja_biegi; v_imie text; v_id uuid; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
  begin
    if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_bieg_org_wpisz: tylko trener' using errcode = '42501'; end if;
    select * into b from public.akcja_biegi where slug = p_slug;
    if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma_biegu'); end if;
    if public.akcja_bieg_faza(b) not in ('trwa', 'wyniki', 'zakonczony') then return jsonb_build_object('ok', false, 'powod', 'przed_biegiem'); end if;
    if v_dzis > coalesce(b.zalicz_do, b.wynik_do + 7) then return jsonb_build_object('ok', false, 'powod', 'za_pozno'); end if;
    if p_pelnoletnia is not true or p_zgoda_imie is not true then return jsonb_build_object('ok', false, 'powod', 'zgoda'); end if;
    v_imie := regexp_replace(btrim(coalesce(p_imie, '')), '\s+', ' ', 'g');
    if v_imie ~ ' [A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]\.?$' then v_imie := rtrim(v_imie, '.'); v_imie := left(v_imie, -1) || upper(right(v_imie, 1)) || '.'; end if;   -- „Anna k” → „Anna K.”
    if char_length(v_imie) not between 2 and 24 or v_imie !~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]{2,}(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?( [A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]\.)?$' then return jsonb_build_object('ok', false, 'powod', 'imie'); end if;
    if p_dystans_km is null or not (p_dystans_km = any(b.dystanse_km)) then return jsonb_build_object('ok', false, 'powod', 'dystans'); end if;
    if p_wynik_s is null or p_wynik_s not between 60 and 86400 then return jsonb_build_object('ok', false, 'powod', 'czas'); end if;
    if p_id is null then
      if (select count(*) from public.akcja_bieg_wyniki_org o where o.bieg_id = b.id) >= 1000 then return jsonb_build_object('ok', false, 'powod', 'limit'); end if;
      insert into public.akcja_bieg_wyniki_org (bieg_id, imie, dystans_km, wynik_s, pelnoletnia, zgoda_imie, wpisal)
      values (b.id, v_imie, p_dystans_km, p_wynik_s, true, true, auth.uid()) returning id into v_id;
    else
      update public.akcja_bieg_wyniki_org o set imie = v_imie, dystans_km = p_dystans_km, wynik_s = p_wynik_s, zmieniono = now()
       where o.id = p_id and o.bieg_id = b.id and o.wpisal = auth.uid() returning o.id into v_id;
      if v_id is null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'imie', v_imie);
  end $o$;

  create function public.akcja_bieg_org_usun(p_id uuid)
  returns jsonb language plpgsql volatile security definer set search_path = '' as $o$
  declare v_id uuid;
  begin
    if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_bieg_org_usun: tylko trener' using errcode = '42501'; end if;
    delete from public.akcja_bieg_wyniki_org o where o.id = p_id and o.wpisal = auth.uid() returning o.id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
    return jsonb_build_object('ok', true);
  end $o$;

  create function public.akcja_bieg_org_lista(p_slug text)
  returns jsonb language plpgsql stable security definer set search_path = '' as $o$
  declare b public.akcja_biegi;
  begin
    if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_bieg_org_lista: tylko trener' using errcode = '42501'; end if;
    select * into b from public.akcja_biegi where slug = p_slug;
    if not found then return '[]'::jsonb; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'imie', o.imie, 'dystans_km', o.dystans_km, 'wynik_s', o.wynik_s, 'moj', o.wpisal = auth.uid(), 'utworzono', o.utworzono)
                       order by o.utworzono desc) from public.akcja_bieg_wyniki_org o where o.bieg_id = b.id), '[]'::jsonb);
  end $o$;

  revoke all on function public.akcja_bieg_org_wpisz(text, text, integer, integer, boolean, boolean, uuid) from public, anon;
  revoke all on function public.akcja_bieg_org_usun(uuid) from public, anon;
  revoke all on function public.akcja_bieg_org_lista(text) from public, anon;
  grant execute on function public.akcja_bieg_org_wpisz(text, text, integer, integer, boolean, boolean, uuid) to authenticated;
  grant execute on function public.akcja_bieg_org_usun(uuid) to authenticated;
  grant execute on function public.akcja_bieg_org_lista(text) to authenticated;

  -- ranking: te same kolumny, plus wpisy organizatora (treść z bazy 27.11, dwie wstawki oznaczone 20261233)
CREATE OR REPLACE FUNCTION public.akcja_bieg_ukonczyli(p_slug text, p_od integer DEFAULT 0, p_ile integer DEFAULT 50, p_dystans integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare b public.akcja_biegi; v_od integer := greatest(0, coalesce(p_od, 0)); v_ile integer := least(100, greatest(1, coalesce(p_ile, 50))); v_razem integer; v_ranking integer; v_lista jsonb;
begin
  select * into b from public.akcja_biegi where slug = p_slug and status <> 'szkic';
  if not found then return null; end if;
  if p_dystans is not null and not (p_dystans = any(b.dystanse_km)) then return null; end if;
  with w as (
    select u.imie, u.zgoda_imie, u.numer, u.rodzaj, u.ukonczony_at, u.wynik_dystans_km, coalesce(u.wynik_dystans_km::numeric, u.dystans_wlasny_km) as dystans, public.akcja_bieg_czas_rankingu(u, b) as czas, public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, public.akcja_bieg_z_tempa(u, b) as z_tempa, public.akcja_bieg_km_wyniku(u) as km_treningu, (u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny, case when u.rodzaj = 'ja' and u.zgoda_imie and public.akcja_bieg_wersja_od(b.regulamin_wersja, 8) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od) and exists (select 1 from public.athletes a where a.id = u.konto_id and a.is_public and (a.date_of_birth is not null or u.ranking_zgoda_at is not null)) then u.konto_id end as profil, false as org
      from public.akcja_bieg_uczestnicy u
     where u.bieg_id = b.id and u.wycofany_at is null and u.ukonczony_at is not null
       and (p_dystans is null or (u.rodzaj = 'ja' and u.wynik_dystans_km = p_dystans))
    union all   -- 20261233: wyniki spoza aplikacji (bieg stacjonarny) wpisane przez organizatora: pełnoletni, zgoda na imię i czas, bez numeru i bez konta
    select o.imie, true, null::integer, 'ja'::text, o.utworzono, o.dystans_km, o.dystans_km::numeric, o.wynik_s, null::integer, false, null::numeric, false, null::uuid, true
      from public.akcja_bieg_wyniki_org o
     where o.bieg_id = b.id and (p_dystans is null or o.dystans_km = p_dystans)
  ), m as (
    select w.*, case when w.czas is not null then rank() over (partition by w.czas is not null, w.wynik_dystans_km order by w.czas) end as miejsce from w
  ), p as (
    select m.*, row_number() over (order by case when m.czas is not null then 0 else 1 end,
                                            case when m.czas is not null then m.wynik_dystans_km end, m.czas nulls last, m.ukonczony_at desc, m.numer) as poz from m
  )
  select (select count(*) from w), (select count(*) from w where w.czas is not null),
         coalesce((select jsonb_agg(jsonb_build_object('imie', case when p.zgoda_imie then p.imie end, 'numer', p.numer, 'dystans_km', p.dystans, 'dziecko', p.rodzaj = 'dziecko', 'reczny', p.reczny) || case when p.org then jsonb_build_object('organizator', true) else '{}'::jsonb end || case when p.profil is not null then jsonb_build_object('profil', p.profil) else '{}'::jsonb end
                                    || case when p.czas is not null then jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) || case when p.z_tempa then jsonb_build_object('z_tempa', true) else '{}'::jsonb end when p.czas_bez_miejsca is not null then jsonb_build_object('czas_s', p.czas_bez_miejsca, 'trening_km', round(p.km_treningu, 2)) else '{}'::jsonb end order by p.poz)
                     from p where p.poz > v_od and p.poz <= v_od + v_ile), '[]'::jsonb)
    into v_razem, v_ranking, v_lista;
  return jsonb_build_object('slug', b.slug, 'dystans', p_dystans, 'razem', v_razem, 'w_rankingu', v_ranking, 'od', v_od, 'ile', v_ile, 'lista', v_lista);
end $function$;

  -- sprzątanie po 90 dniach obejmuje wpisy organizatora (treść z bazy 27.11, dwie wstawki oznaczone 20261233)
CREATE OR REPLACE FUNCTION public.akcja_bieg_sprzatanie()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare b public.akcja_biegi; n integer := 0; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  for b in select * from public.akcja_biegi x where x.wynik_do + 90 < v_dzis
            and (x.podsumowanie is null or exists (select 1 from public.akcja_bieg_uczestnicy u where u.bieg_id = x.id)
                 or exists (select 1 from public.akcja_bieg_wyniki_org o where o.bieg_id = x.id)) loop
    update public.akcja_biegi set podsumowanie = coalesce(podsumowanie, public.akcja_bieg_liczby(b.id)) where id = b.id;
    delete from public.akcja_bieg_maile where bieg_id = b.id;
    delete from public.akcja_bieg_zgody where bieg_id = b.id;
    delete from public.akcja_bieg_uczestnicy where bieg_id = b.id;   -- zgłoszenia cegiełek: bieg_uczestnik_id → NULL (on delete set null); odznaki zostają w achievements
    delete from public.akcja_bieg_wyniki_org where bieg_id = b.id;   -- 20261233: wyniki wpisane przez organizatora (imiona) po 90 dniach też znikają
    n := n + 1;
  end loop;
  return n;
end $function$;

  -- liczby biegu: „ukończyli” z wpisami organizatora (treść z bazy 27.11, jedna wstawka oznaczona 20261233)
CREATE OR REPLACE FUNCTION public.akcja_bieg_liczby(p_bieg uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'zapisani', count(*) filter (where u.wycofany_at is null),
    'zapisani_na', coalesce((select jsonb_object_agg(d::text, n) from (select y.dystans_km d, count(*) n from public.akcja_bieg_uczestnicy y where y.bieg_id = p_bieg and y.wycofany_at is null and y.rodzaj = 'ja' group by 1) q), '{}'::jsonb),
    'dzieci', count(*) filter (where u.wycofany_at is null and u.rodzaj = 'dziecko'),
    'ukonczyli_n', count(*) filter (where u.wycofany_at is null and u.ukonczony_at is not null)
                   + (select count(*) from public.akcja_bieg_wyniki_org o where o.bieg_id = p_bieg),   -- 20261233: wpisy organizatora, liczba = wiersze listy „ukończyli”
    'zlote', count(*) filter (where u.wycofany_at is null and u.odznaka = 'zlota'))
  from public.akcja_bieg_uczestnicy u where u.bieg_id = p_bieg;
$function$;

  insert into _org_komunikat values ('akcja_bieg_wyniki_org: tabela, trzy funkcje organizatora; ranking, sprzątanie i liczby biegu z wpisami organizatora');
end $$;

select komunikat from _org_komunikat;
commit;
