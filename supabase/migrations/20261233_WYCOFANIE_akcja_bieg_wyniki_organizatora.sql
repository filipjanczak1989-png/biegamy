-- WYCOFANIE 20261233_akcja_bieg_wyniki_organizatora.sql: ranking, sprzątanie i liczby biegu wracają do treści sprzed zmiany (co do znaku, z bazy 27.11),
-- funkcje organizatora i tabela znikają RAZEM Z WPISAMI (imiona, czasy). Jeśli wpisy mają zostać, skopiuj je przed wycofaniem.
-- STANY: tabeli nie ma → bez zmian, komunikat.

begin;
set local lock_timeout = '5s';
create temp table if not exists _org_komunikat (komunikat text) on commit drop;
truncate _org_komunikat;

do $$
declare n integer;
begin
  if to_regclass('public.akcja_bieg_wyniki_org') is null then
    insert into _org_komunikat values ('bez zmian: tabeli akcja_bieg_wyniki_org nie ma');
    return;
  end if;
  select count(*) into n from public.akcja_bieg_wyniki_org;

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
    select u.imie, u.zgoda_imie, u.numer, u.rodzaj, u.ukonczony_at, u.wynik_dystans_km, coalesce(u.wynik_dystans_km::numeric, u.dystans_wlasny_km) as dystans, public.akcja_bieg_czas_rankingu(u, b) as czas, public.akcja_bieg_czas_bez_miejsca(u, b) as czas_bez_miejsca, public.akcja_bieg_z_tempa(u, b) as z_tempa, public.akcja_bieg_km_wyniku(u) as km_treningu, (u.rodzaj = 'ja' and not public.akcja_bieg_wynik_z_zegarka(u)) as reczny, case when u.rodzaj = 'ja' and u.zgoda_imie and public.akcja_bieg_wersja_od(b.regulamin_wersja, 8) and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od) and exists (select 1 from public.athletes a where a.id = u.konto_id and a.is_public and (a.date_of_birth is not null or u.ranking_zgoda_at is not null)) then u.konto_id end as profil
      from public.akcja_bieg_uczestnicy u
     where u.bieg_id = b.id and u.wycofany_at is null and u.ukonczony_at is not null
       and (p_dystans is null or (u.rodzaj = 'ja' and u.wynik_dystans_km = p_dystans))
  ), m as (
    select w.*, case when w.czas is not null then rank() over (partition by w.czas is not null, w.wynik_dystans_km order by w.czas) end as miejsce from w
  ), p as (
    select m.*, row_number() over (order by case when m.czas is not null then 0 else 1 end,
                                            case when m.czas is not null then m.wynik_dystans_km end, m.czas nulls last, m.ukonczony_at desc, m.numer) as poz from m
  )
  select (select count(*) from w), (select count(*) from w where w.czas is not null),
         coalesce((select jsonb_agg(jsonb_build_object('imie', case when p.zgoda_imie then p.imie end, 'numer', p.numer, 'dystans_km', p.dystans, 'dziecko', p.rodzaj = 'dziecko', 'reczny', p.reczny) || case when p.profil is not null then jsonb_build_object('profil', p.profil) else '{}'::jsonb end
                                    || case when p.czas is not null then jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) || case when p.z_tempa then jsonb_build_object('z_tempa', true) else '{}'::jsonb end when p.czas_bez_miejsca is not null then jsonb_build_object('czas_s', p.czas_bez_miejsca, 'trening_km', round(p.km_treningu, 2)) else '{}'::jsonb end order by p.poz)
                     from p where p.poz > v_od and p.poz <= v_od + v_ile), '[]'::jsonb)
    into v_razem, v_ranking, v_lista;
  return jsonb_build_object('slug', b.slug, 'dystans', p_dystans, 'razem', v_razem, 'w_rankingu', v_ranking, 'od', v_od, 'ile', v_ile, 'lista', v_lista);
end $function$;

CREATE OR REPLACE FUNCTION public.akcja_bieg_sprzatanie()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare b public.akcja_biegi; n integer := 0; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  for b in select * from public.akcja_biegi x where x.wynik_do + 90 < v_dzis
            and (x.podsumowanie is null or exists (select 1 from public.akcja_bieg_uczestnicy u where u.bieg_id = x.id)) loop
    update public.akcja_biegi set podsumowanie = coalesce(podsumowanie, public.akcja_bieg_liczby(b.id)) where id = b.id;
    delete from public.akcja_bieg_maile where bieg_id = b.id;
    delete from public.akcja_bieg_zgody where bieg_id = b.id;
    delete from public.akcja_bieg_uczestnicy where bieg_id = b.id;   -- zgłoszenia cegiełek: bieg_uczestnik_id → NULL (on delete set null); odznaki zostają w achievements
    n := n + 1;
  end loop;
  return n;
end $function$;

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
    'ukonczyli_n', count(*) filter (where u.wycofany_at is null and u.ukonczony_at is not null),
    'zlote', count(*) filter (where u.wycofany_at is null and u.odznaka = 'zlota'))
  from public.akcja_bieg_uczestnicy u where u.bieg_id = p_bieg;
$function$;

  drop function if exists public.akcja_bieg_org_wpisz(text, text, integer, integer, boolean, boolean, uuid);
  drop function if exists public.akcja_bieg_org_usun(uuid);
  drop function if exists public.akcja_bieg_org_lista(text);
  drop table public.akcja_bieg_wyniki_org;

  insert into _org_komunikat values ('wycofano: ranking, sprzątanie i liczby biegu jak przed zmianą; usunięto tabelę z ' || n || ' wpisami organizatora');
end $$;

select komunikat from _org_komunikat;
commit;
