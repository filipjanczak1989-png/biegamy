-- 20261106_gra_poziomy.sql — poziom gracza jako trudność, PUNKTY w rankingu i murze, dodatek za rozdział (Filip 4.11 i 5.11, fabuła pkt 1–9).
--   gra_rundy.poziom        — poziom z konta w chwili startu rundy.
--   gra_wyniki.punkty       — cegły × mnożnik poziomu, liczy SERWER z zebranych cegieł. Ranking i „kto najwięcej dołożył” liczą punkty; wspólny mur i koparka za mur liczą ZEBRANE CEGŁY, cel 1 250 000 = 100 cegieł na km akcji (Filip 5.11). Wiersze sprzed migracji: punkty = cegły.
--   gra_wyniki.cegly        — zebrane cegły. Z nich rośnie poziom gracza (gra_suma_cegiel).
--   gra_mnoznik_poziomu(n)  — 1 + 0,17 × (poziom − 1), sufit ×4,23 na poziomie 20. Dobrany z pomiaru tak, żeby dobry gracz na poziomie 20 miał w punktach 10–20% więcej niż dobry na poziomie 1, a poziom 1 to ×1. Te same liczby w js/cegielki-logika.mjs (blizna-164).
--   gra_poziom(n)           — nowe progi: poziom 4 w pierwszych 5 rundach nowego gracza, poziom 10 po ok. 40 rundach dobrego, poziom 20 po ok. 300. Te same liczby w js/cegielki-logika.mjs (blizna-154).
--   gra_zapisz_wynik        — limit 45 zebranych cegieł/s, czyli w punktach 45 × mnożnik. p_st.poziom opcjonalne: wyższe niż poziom rundy = podejrzana (poziom_ponad_konto), bez wpisu do rankingu, muru i salda; niższe = mnożnik tego niższego poziomu. Brak pola = stary front, działa jak dotąd.
--   gra_nagrody_do_poziomu  — dodatek za ukończony rozdział, za darmo. Przyznaje gra_zapisz_wynik po przyjętej rundzie, odrzucona runda nic nie daje. Te same pary w js/cegielki-logika.mjs (blizna-165). To przedmioty w grze, nigdy pieniądze.
--   gra_ranking             — rozdzial_meta: wizerunek_zgoda i fabianek_postac_gra razem, bez adresów; pierwsze_cegly; magazyn_podpis; zamknieta (finał gry).
--   gra_pierwsze_cegly      — PREMIERA SZEFA: cegły z pierwszej rundy na świecie, jeden wiersz. Mur = cegły z wyników + te cegły (gra_mur). Osobna tabela gry, bo gra nie pisze do akcji (blizna-154). Bez konta w środku: nazywają się „Szef”.
--   premiera_szefa_zapisz   — tylko startujący, tylko prawdziwa akcja po starcie, tylko przy wizerunek_zgoda, raz, limit 45 cegieł/s. Próba tu nie zagląda: front jej nie woła, a przed startem prawdziwej akcji funkcja odmawia.
--   gra_konto.stroje        — strój osobno na postać (kasia, filip, rowerzysta). Klient czyta swój wiersz jak resztę konta, zapis tylko przez gra_zapisz_stroje: wyłącznie to, co gracz kupił (korona: warunek sprawdza gra przy zakładaniu). Koparki tu nie ma, rysunek zostaje bez dodatków.
--   akcje.magazyn_podpis    — podpis w Magazynie Szefa. NULL = wyłączony, wartość ustawia Filip po zgodzie firmy. Nazwa firmy nie ma prawa być w repo przed zgodą.
--   gra_postac_odblokowana  — koparka także po zamknięciu akcji (akcje.koniec), nie tylko po ukończonym murze. Przełącznik fabianek_postac_gra dalej wymagany.
-- Odpowiedzi rankingu mają punkty i cegły: stary front czyta `cegly`, nowy `punkty`. Sygnatury bez zmian, więc kolejność wdrożenia frontu i bazy jest dowolna. Klient nie dostaje niczego nowego.
-- Pomiar 4.11–5.11 (silnik, kroki 1/60 s): nieśmiertelny bot zbierający wszystko 32 cegły/s na poziomie 1, 21 na poziomie 20. Limit 45/s.
-- ⚠️ Wynik liczy przeglądarka: kto przeczyta kod, wyśle liczbę poniżej pułapu. Na to jest przegląd czołówki i kasowanie wierszy, nie ten kod.
-- WDRAŻAĆ PO 20261105_gra_cegielki.sql. Test: tools/gra-poziomy-test.sh, potem tools/gra-test.sh. Wycofanie: 20261106_WYCOFANIE_gra_poziomy.sql.
begin;

alter table public.gra_rundy add column poziom integer check (poziom between 1 and 20);
comment on column public.gra_rundy.poziom is 'Poziom z konta w chwili startu rundy. Rundy sprzed migracji: NULL, wtedy poziom z konta przy zapisie.';

alter table public.gra_wyniki add column punkty integer;
update public.gra_wyniki set punkty = cegly;
alter table public.gra_wyniki alter column punkty set not null;
alter table public.gra_wyniki add constraint gra_wyniki_punkty_nieujemne check (punkty >= 0);
comment on column public.gra_wyniki.punkty is 'Cegły × mnożnik poziomu rundy, liczone przez serwer. Ranking i dołożone liczą punkty. Poziom, mur i koparka za mur liczą cegły.';
comment on column public.gra_wyniki.cegly is 'Zebrane cegły. Z ich sumy liczy się poziom gracza.';
drop index public.gra_wyniki_okres;
drop index public.gra_wyniki_konto;
create index gra_wyniki_okres on public.gra_wyniki (dzien, punkty desc);
create index gra_wyniki_konto on public.gra_wyniki (athlete_id, punkty desc);

alter table public.gra_konto add column stroje jsonb not null default '{}'::jsonb check (jsonb_typeof(stroje) = 'object' and octet_length(stroje::text) <= 2000);
comment on column public.gra_konto.stroje is 'Strój osobno na postać: { kasia, filip, rowerzysta }. Sam wygląd, bez wpływu na wynik. Zapis tylko przez gra_zapisz_stroje.';

create function public.gra_zapisz_stroje(p_stroje jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_konto uuid := public.auth_my_athlete_id();
  v_kupione jsonb; v_wynik jsonb := '{}'::jsonb; v_czysty jsonb; p record; s record;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  if jsonb_typeof(p_stroje) is distinct from 'object' or octet_length(p_stroje::text) > 2000 then return jsonb_build_object('ok', false, 'powod', 'zle_dane'); end if;
  insert into public.gra_konto (athlete_id) values (v_konto) on conflict (athlete_id) do nothing;
  select k.kupione into v_kupione from public.gra_konto k where k.athlete_id = v_konto for update;
  for p in select e.key, e.value from jsonb_each(p_stroje) e where e.key in ('kasia', 'filip', 'rowerzysta') and jsonb_typeof(e.value) = 'object' loop
    v_czysty := '{}'::jsonb;
    for s in select t.key, t.value from jsonb_each_text(p.value) t where t.key in ('tulow', 'spodenki', 'glowa', 'oczy', 'szyja', 'plecy') and t.value is not null loop
      if v_kupione ? s.value or s.value = 'korona' then v_czysty := v_czysty || jsonb_build_object(s.key, s.value); end if;
    end loop;
    v_wynik := v_wynik || jsonb_build_object(p.key, v_czysty);
  end loop;
  update public.gra_konto set stroje = v_wynik where athlete_id = v_konto;
  return jsonb_build_object('ok', true, 'stroje', v_wynik);
end $$;
revoke all on function public.gra_zapisz_stroje(jsonb) from public, anon;
grant execute on function public.gra_zapisz_stroje(jsonb) to authenticated;
comment on function public.gra_zapisz_stroje(jsonb) is 'Stroje osobno na postać. Tylko własne konto, tylko kupione przedmioty, tylko postacie ze strojem. Nie rusza salda ani kupionych.';

alter table public.akcje add column magazyn_podpis text check (magazyn_podpis is null or (char_length(magazyn_podpis) <= 80 and magazyn_podpis !~ '[<>&"`]'));
comment on column public.akcje.magazyn_podpis is 'Podpis w Magazynie Szefa. NULL = bez podpisu. Ustawia Filip po zgodzie firmy.';

create table public.gra_pierwsze_cegly (
  slug text primary key check (slug = 'dla-fabianka'),
  cegly      integer not null check (cegly >= 0),
  czas_s     numeric(6,2) not null,
  kiedy      timestamptz not null default now()
);
comment on table public.gra_pierwsze_cegly is 'Premiera Szefa: cegły z pierwszej rundy na świecie, w murze jako pierwsze. Bez konta gracza. Tylko przez premiera_szefa_zapisz.';
alter table public.gra_pierwsze_cegly enable row level security;
revoke all on public.gra_pierwsze_cegly from public, anon, authenticated;

-- Wspólny mur: zebrane cegły z przyjętych rund i pierwsze cegły Szefa. Bez mnożnika.
create function public.gra_mur()
 returns bigint language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w)::bigint + coalesce((select p.cegly from public.gra_pierwsze_cegly p where p.slug = 'dla-fabianka'), 0) $$;
revoke all on function public.gra_mur() from public, anon, authenticated;
comment on function public.gra_mur() is 'Wspólny mur: zebrane cegły z przyjętych rund i pierwsze cegły Szefa. Bez mnożnika.';

-- Premiera: pierwsza runda na świecie, zaraz po guziku. Nazwa bez przedrostka gra_, bo sprawdza akcja_startujacy, a funkcje gra_ nie mają prawa znać tabel akcji (blizna-154). Pisze wyłącznie do tabeli gry.
create function public.premiera_szefa_zapisz(p_cegly integer, p_czas numeric)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  a public.akcje;
  v_ja uuid := public.auth_my_athlete_id();
  v_ile integer;
begin
  if v_ja is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  select * into a from public.akcje where slug = 'dla-fabianka';
  if not found or not exists (select 1 from public.akcja_startujacy s where s.akcja_id = a.id and s.athlete_id = v_ja) then return jsonb_build_object('ok', false, 'powod', 'nie_startujacy'); end if;
  if a.wystartowala_at is null then return jsonb_build_object('ok', false, 'powod', 'przed_startem'); end if;
  if not a.wizerunek_zgoda then return jsonb_build_object('ok', false, 'powod', 'bez_zgody'); end if;
  if p_cegly is null or p_czas is null or p_cegly < 0 or p_czas < 59 or p_czas > 136 or p_cegly > 45 * p_czas then return jsonb_build_object('ok', false, 'powod', 'zle_dane'); end if;
  if extract(epoch from (now() - a.wystartowala_at)) < p_czas - 8 then return jsonb_build_object('ok', false, 'powod', 'za_krotko'); end if;
  insert into public.gra_pierwsze_cegly (slug, cegly, czas_s) values ('dla-fabianka', p_cegly, p_czas) on conflict (slug) do nothing;
  get diagnostics v_ile = row_count;
  return jsonb_build_object('ok', true, 'juz', v_ile = 0, 'cegly', (select p.cegly from public.gra_pierwsze_cegly p where p.slug = 'dla-fabianka'));
end $$;
revoke all on function public.premiera_szefa_zapisz(integer, numeric) from public, anon;
grant execute on function public.premiera_szefa_zapisz(integer, numeric) to authenticated;
comment on function public.premiera_szefa_zapisz(integer, numeric) is 'Premiera Szefa: pierwsze cegły w murze. Tylko startujący, po starcie, przy zgodzie, raz. Pisze wyłącznie do gra_pierwsze_cegly.';

create function public.gra_mnoznik_poziomu(p_poziom integer)
 returns numeric language sql immutable set search_path to 'public', 'pg_temp'
as $$ select least(4.23, 1 + 0.17 * (greatest(coalesce(p_poziom, 1), 1) - 1)) $$;
revoke all on function public.gra_mnoznik_poziomu(integer) from public, anon, authenticated;
comment on function public.gra_mnoznik_poziomu(integer) is 'Punkty za cegłę na danym poziomie: 1 + 0,17 × (poziom − 1), sufit ×4,23. Zgodne z js/cegielki-logika.mjs.';

create function public.gra_nagrody_do_poziomu(p_poziom integer)
 returns jsonb language sql immutable set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(n.przedmiot order by n.po, n.przedmiot), '[]'::jsonb)
    from (values (4, 'opaska'), (7, 'spodenki-czerwone'), (10, 'kamizelka'), (11, 'kask-rowerowy'), (15, 'czapka-pompon'), (20, 'medal'), (20, 'czapka-zlota')) n(po, przedmiot)
   where coalesce(p_poziom, 1) >= n.po
$$;
revoke all on function public.gra_nagrody_do_poziomu(integer) from public, anon, authenticated;
comment on function public.gra_nagrody_do_poziomu(integer) is 'Dodatki za ukończone rozdziały do danego poziomu. Zgodne z js/cegielki-logika.mjs.';

-- Progi poziomów w zebranych cegłach. Te same liczby w js/cegielki-logika.mjs.
create or replace function public.gra_poziom(p_cegly bigint)
 returns integer language sql immutable set search_path to 'public', 'pg_temp'
as $$
  select coalesce(max(p.n), 1)::integer
    from unnest(array[0, 100, 300, 700, 1800, 3100, 4600, 6400, 8300, 10400, 12900, 15700, 18900, 22500, 26400, 30600, 35300, 40400, 45900, 52200]::bigint[]) with ordinality p(prog, n)
   where coalesce(p_cegly, 0) >= p.prog
$$;

-- Czy gracz może grać tą postacią. Przełączniki z akcji, poziom z jego cegieł; koparka także przy ukończonym murze albo po zamknięciu akcji, dla wszystkich. Liczy się stan sprzed zapisywanej rundy.
create or replace function public.gra_postac_odblokowana(p_postac text, p_konto uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select case p_postac
    when 'kasia' then true
    when 'filip' then true
    when 'rowerzysta' then coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false)
                           and public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 10
    when 'koparka' then coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false)
                        and (public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 20 or public.gra_mur() >= 1250000
                             or coalesce((select a.koniec is not null from public.akcje a where a.slug = 'dla-fabianka'), false))
    else false end
$$;

create or replace function public.gra_start_rundy(p_ulepszenie text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  RUND_NA_MINUTE constant integer := 3;   -- runda trwa minutę; zapas na wyjście i ponowny start
  v_konto uuid := public.auth_my_athlete_id();
  v_ile integer; v_runda uuid; v_saldo integer; v_poziom integer;
  v_cena integer := case p_ulepszenie when 'kask' then 5 when 'bidon' then 4 end;
  v_ulepszenie text;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  if not coalesce((select a.gra_aktywna from public.akcje a where a.slug = 'dla-fabianka'), false) then return jsonb_build_object('ok', false, 'powod', 'wylaczona'); end if;
  insert into public.gra_konto (athlete_id) values (v_konto) on conflict (athlete_id) do nothing;
  perform 1 from public.gra_konto where athlete_id = v_konto for update;   -- kolejka per konto: równoległe starty nie przeskoczą limitu
  select count(*) into v_ile from public.gra_rundy where athlete_id = v_konto and start_at > now() - interval '60 seconds';
  if v_ile >= RUND_NA_MINUTE then
    if not exists (select 1 from public.gra_podejrzane where athlete_id = v_konto and powod = 'za_czesto' and kiedy > now() - interval '60 seconds') then
      insert into public.gra_podejrzane (athlete_id, powod, dane) values (v_konto, 'za_czesto', jsonb_build_object('rund_w_minucie', v_ile));
    end if;
    return jsonb_build_object('ok', false, 'powod', 'za_czesto');
  end if;
  -- Ulepszenie płatne dopiero tutaj, po limicie: odrzucony start nie kosztuje. Za mało cegiełek = runda bez ulepszenia, nie brak rundy.
  if v_cena is not null then
    update public.gra_konto set saldo = saldo - v_cena where athlete_id = v_konto and saldo >= v_cena;
    if found then v_ulepszenie := p_ulepszenie; end if;
  end if;
  v_poziom := public.gra_poziom(public.gra_suma_cegiel(v_konto));
  insert into public.gra_rundy (athlete_id, ulepszenie, poziom) values (v_konto, v_ulepszenie, v_poziom) returning id into v_runda;
  select saldo into v_saldo from public.gra_konto where athlete_id = v_konto;
  return jsonb_build_object('ok', true, 'runda', v_runda, 'ulepszenie', v_ulepszenie, 'saldo', v_saldo, 'poziom', v_poziom);
end $$;

create or replace function public.gra_ranking_od(p_od date)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'punkty', x.punkty, 'cegly', x.cegly, 'postac', x.postac) order by x.punkty desc, x.kiedy), '[]'::jsonb)
    from (select rank() over (order by n.punkty desc)::integer miejsce, n.pseudonim, n.punkty, n.cegly, n.postac, n.kiedy
            from (select distinct on (w.athlete_id) k.pseudonim, w.punkty, w.cegly, w.postac, w.kiedy
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where w.dzien >= p_od and k.pseudonim is not null
                   order by w.athlete_id, w.punkty desc, w.kiedy) n
           order by n.punkty desc, n.kiedy limit 20) x
$$;

-- Kto najwięcej dołożył do muru: suma punktów na gracza w oknie czasu. Tylko gracze z pseudonimem, bez identyfikatorów kont.
create or replace function public.gra_dolozyli(p_od timestamptz, p_do timestamptz)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'punkty', x.punkty, 'cegly', x.cegly) order by x.punkty desc, x.pseudonim), '[]'::jsonb)
    from (select rank() over (order by n.punkty desc)::integer miejsce, n.pseudonim, n.punkty, n.cegly
            from (select k.pseudonim, sum(w.punkty)::bigint punkty, sum(w.cegly)::bigint cegly
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where k.pseudonim is not null and (p_od is null or w.kiedy >= p_od) and (p_do is null or w.kiedy < p_do)
                   group by k.pseudonim) n
           order by n.punkty desc, n.pseudonim limit 20) x
$$;

-- Trzy rankingi naraz, bez identyfikatorów kont. Tydzień od poniedziałku, doba i tydzień wg Warszawy. Mur w punktach.
create or replace function public.gra_ranking()
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'dzien',   public.gra_ranking_od(d),
    'tydzien', public.gra_ranking_od(date_trunc('week', d)::date),
    'wszech',  public.gra_ranking_od(date '2000-01-01'),
    'dolozyli_wszech', public.gra_dolozyli(null, null),
    'dolozyli_akcja', coalesce((select case when a.wystartowala_at is null then '[]'::jsonb
                                            else public.gra_dolozyli(a.wystartowala_at, case when a.koniec is not null then ((a.koniec + 1)::timestamp at time zone 'Europe/Warsaw') end) end
                                  from public.akcje a where a.slug = 'dla-fabianka'), '[]'::jsonb),
    'mur',     public.gra_mur(),
    'pierwsze_cegly', (select p.cegly from public.gra_pierwsze_cegly p where p.slug = 'dla-fabianka'),
    'magazyn_podpis', (select a.magazyn_podpis from public.akcje a where a.slug = 'dla-fabianka'),
    'zamknieta', coalesce((select a.koniec is not null from public.akcje a where a.slug = 'dla-fabianka'), false),
    'mur_cel', 1250000,
    'aktywna', coalesce((select a.gra_aktywna from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta', coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta_opis', (select case when a.rowerzysta_wlaczony then a.rowerzysta_opis end from public.akcje a where a.slug = 'dla-fabianka'),
    'postac_koparki', coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rozdzial_meta', coalesce((select a.fabianek_postac_gra and a.wizerunek_zgoda from public.akcje a where a.slug = 'dla-fabianka'), false))
    from (select (now() at time zone 'Europe/Warsaw')::date d) t
$$;

-- Miejsce gracza w rankingu dołożonych punktów. Liczą się ci sami gracze co na publicznej liście, plus sam pytający.
create or replace function public.gra_moje_dolozone(p_konto uuid)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with okno as (
    select a.wystartowala_at od, case when a.koniec is not null then ((a.koniec + 1)::timestamp at time zone 'Europe/Warsaw') end doo from public.akcje a where a.slug = 'dla-fabianka'
  ), suma as (
    select w.athlete_id, sum(w.punkty)::bigint wszech, sum(w.cegly)::bigint ceg_wszech,
           coalesce(sum(w.punkty) filter (where o.od is not null and w.kiedy >= o.od and (o.doo is null or w.kiedy < o.doo)), 0)::bigint akcja,
           coalesce(sum(w.cegly) filter (where o.od is not null and w.kiedy >= o.od and (o.doo is null or w.kiedy < o.doo)), 0)::bigint ceg_akcja
      from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id left join okno o on true
     where k.pseudonim is not null or w.athlete_id = p_konto
     group by w.athlete_id
  )
  select coalesce((select jsonb_build_object(
      'dolozyli_wszech', jsonb_build_object('punkty', m.wszech, 'cegly', m.ceg_wszech, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.wszech > m.wszech)),
      'dolozyli_akcja', jsonb_build_object('punkty', m.akcja, 'cegly', m.ceg_akcja, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.akcja > m.akcja)))
    from suma m where m.athlete_id = p_konto), '{}'::jsonb)
$$;

-- Miejsce gracza w trzech rankingach, także poza pierwszą dwudziestką. Liczą się ci sami gracze co na publicznej liście.
create or replace function public.gra_miejsca(p_konto uuid)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with okres(nazwa, od) as (
    select * from (values ('dzien', (now() at time zone 'Europe/Warsaw')::date),
                          ('tydzien', date_trunc('week', (now() at time zone 'Europe/Warsaw')::date)::date),
                          ('wszech', date '2000-01-01')) v(nazwa, od)
  ), moje as (
    select o.nazwa, o.od, (select max(w.punkty) from public.gra_wyniki w where w.athlete_id = p_konto and w.dzien >= o.od) punkty,
           (select max(w.cegly) from public.gra_wyniki w where w.athlete_id = p_konto and w.dzien >= o.od) cegly from okres o
  )
  select coalesce(jsonb_object_agg(m.nazwa, jsonb_build_object('punkty', m.punkty, 'cegly', m.cegly, 'miejsce',
           1 + (select count(*) from (select w.athlete_id from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                                       where w.dzien >= m.od and k.pseudonim is not null and w.athlete_id <> p_konto
                                       group by w.athlete_id having max(w.punkty) > m.punkty) lepsi))), '{}'::jsonb) || public.gra_moje_dolozone(p_konto)
    from moje m where m.punkty is not null
$$;

create or replace function public.gra_zapisz_wynik(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  GRA_MAKS_NA_S constant numeric := 45;     -- zebrane cegły, w punktach 45 × mnożnik poziomu; pomiar w nagłówku migracji
  ZLOTE_MAKS_NA_S constant numeric := 0.5;  -- złote cegły, waluta sklepiku: osobny pułap, bo bicie waluty to inny zysk niż wyższy wynik
  RUNDA_S constant numeric := 60;
  BIDON_S constant numeric := 5;
  ZAPAS_ZEGARA_S constant numeric := 8;     -- numer rundy przychodzi z opóźnieniem sieci, gra już biegnie
  MAKS_RUNDA_S constant numeric := 1800;    -- pauza w tle jest dozwolona, ale runda nie żyje wiecznie
  v_konto uuid := public.auth_my_athlete_id();
  r public.gra_rundy;
  v_minelo numeric; v_powod text; v_poziom integer; v_punkty integer; v_nagrody jsonb;
  v_zlote numeric := public.gra_liczba(p_st -> 'zlote');
  v_salta numeric := public.gra_liczba(p_st -> 'salta');
  v_seria numeric := public.gra_liczba(p_st -> 'seria');
  v_upadki numeric := public.gra_liczba(p_st -> 'upadki');
  v_bidony numeric := public.gra_liczba(p_st -> 'bidony');
  v_poziom_st numeric := public.gra_liczba(p_st -> 'poziom');
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  select * into r from public.gra_rundy where id = p_runda and athlete_id = v_konto for update;
  if not found then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane) values (v_konto, null, 'obca_runda', jsonb_build_object('cegly', p_cegly));
    return jsonb_build_object('ok', false, 'powod', 'podejrzany');
  end if;
  if r.koniec_at is not null then
    -- Ponowienie po zerwanej sieci: drugi raz nic nie wchodzi, odpowiedź taka sama jak za pierwszym.
    if exists (select 1 from public.gra_wyniki where runda_id = p_runda) then return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto)); end if;
    return jsonb_build_object('ok', false, 'powod', 'podejrzany');
  end if;

  v_poziom := coalesce(r.poziom, public.gra_poziom(public.gra_suma_cegiel(v_konto)));   -- runda sprzed migracji: poziom z konta
  v_minelo := extract(epoch from (now() - r.start_at));
  v_powod := case
    when p_postac is null or p_postac not in ('kasia', 'filip', 'rowerzysta', 'koparka') or p_cegly is null or p_cegly < 0 or p_czas is null
      or v_zlote is null or v_salta is null or v_seria is null or v_upadki is null or v_bidony is null
      or least(v_zlote, v_salta, v_seria, v_upadki, v_bidony) < 0
      or v_zlote <> trunc(v_zlote) or v_salta <> trunc(v_salta) or v_seria <> trunc(v_seria) or v_upadki <> trunc(v_upadki) or v_bidony <> trunc(v_bidony)
      or greatest(v_zlote, v_salta, v_seria, v_upadki, v_bidony) > 100000
      or (p_st -> 'poziom' is not null and (v_poziom_st is null or v_poziom_st <> trunc(v_poziom_st) or v_poziom_st < 1 or v_poziom_st > 100000)) then 'zle_dane'
    when v_bidony > 15 or abs(p_czas - (RUNDA_S + BIDON_S * v_bidony)) > 1 then 'dlugosc_rundy'
    when v_minelo < p_czas - ZAPAS_ZEGARA_S then 'za_krotko'
    when v_minelo > MAKS_RUNDA_S then 'runda_wygasla'
    when v_poziom_st > v_poziom then 'poziom_ponad_konto'
    when p_cegly > GRA_MAKS_NA_S * p_czas then 'ponad_pulap'
    when v_zlote > ZLOTE_MAKS_NA_S * p_czas then 'ponad_pulap_zlotych'
    when v_salta > p_czas / 0.5 then 'sprzeczne_liczby'
    when not public.gra_postac_odblokowana(p_postac, v_konto) then 'postac_zablokowana'
  end;
  update public.gra_rundy set koniec_at = now() where id = p_runda;
  if v_powod is not null then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane)
    values (v_konto, p_runda, v_powod, jsonb_build_object('cegly', p_cegly, 'czas_s', p_czas, 'minelo_s', round(v_minelo, 1), 'zlote', v_zlote, 'salta', v_salta, 'seria', v_seria, 'upadki', v_upadki, 'bidony', v_bidony,
                                                          'poziom_rundy', v_poziom, 'poziom_klient', v_poziom_st,
                                                          'postac', case when p_postac in ('kasia', 'filip', 'rowerzysta', 'koparka') then p_postac end));
    -- Zablokowana postać to zwykle postęp z innego urządzenia, nie oszustwo: gracz dostaje prawdziwy powód.
    return jsonb_build_object('ok', false, 'powod', case when v_powod = 'postac_zablokowana' then v_powod else 'podejrzany' end);
  end if;

  -- Punkty liczy serwer: poziom, na którym runda naprawdę szła. Klient może zadeklarować niższy (gra otwarta przed awansem), wyższego nie przejdzie.
  v_punkty := round(p_cegly * public.gra_mnoznik_poziomu(least(coalesce(v_poziom_st::integer, v_poziom), v_poziom)));
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony)
  values (p_runda, v_konto, p_postac, p_cegly, v_punkty, p_czas, v_zlote, v_salta, v_seria, v_upadki, v_bidony);
  update public.gra_konto set saldo = saldo + v_zlote::integer where athlete_id = v_konto;   -- na saldo tylko złote; zwykłe idą do muru przez gra_wyniki
  -- Nagrody za rozdziały: tylko te, których gracz jeszcze nie ma. Kupiony wcześniej przedmiot zostaje i nie wraca na saldo.
  select coalesce(jsonb_agg(x.p), '[]'::jsonb) into v_nagrody
    from jsonb_array_elements(public.gra_nagrody_do_poziomu(public.gra_poziom(public.gra_suma_cegiel(v_konto)))) x(p)
   where not (select k.kupione @> x.p from public.gra_konto k where k.athlete_id = v_konto);
  update public.gra_konto set kupione = kupione || v_nagrody where athlete_id = v_konto and jsonb_array_length(v_nagrody) > 0;
  return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'saldo', (select saldo from public.gra_konto where athlete_id = v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto),
                            'punkty', v_punkty, 'kupione', (select kupione from public.gra_konto where athlete_id = v_konto), 'nagrody', v_nagrody);
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.gra_mnoznik_poziomu(integer)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_mnoznik_poziomu(integer)', 'EXECUTE') then raise exception 'gra_poziomy: mnożnik dostępny poza funkcjami gry'; end if;
  if has_function_privilege('anon', 'public.gra_zapisz_stroje(jsonb)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.gra_zapisz_stroje(jsonb)', 'EXECUTE') then raise exception 'gra_poziomy: zapis strojów z złymi uprawnieniami'; end if;
  if has_function_privilege('anon', 'public.premiera_szefa_zapisz(integer, numeric)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.premiera_szefa_zapisz(integer, numeric)', 'EXECUTE') or has_function_privilege('authenticated', 'public.gra_mur()', 'EXECUTE') then raise exception 'gra_poziomy: premiera lub mur z złymi uprawnieniami'; end if;
  if has_table_privilege('authenticated', 'public.gra_pierwsze_cegly', 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('anon', 'public.gra_pierwsze_cegly', 'SELECT, INSERT, UPDATE, DELETE') or not (select relrowsecurity from pg_class where oid = 'public.gra_pierwsze_cegly'::regclass) then raise exception 'gra_poziomy: klient sięga do pierwszych cegieł'; end if;
  if exists (select 1 from public.akcje where magazyn_podpis is not null) then raise exception 'gra_poziomy: podpis firmy ma być domyślnie wyłączony'; end if;
  if has_function_privilege('authenticated', 'public.gra_nagrody_do_poziomu(integer)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_nagrody_do_poziomu(integer)', 'EXECUTE') then raise exception 'gra_poziomy: nagrody dostępne poza funkcjami gry'; end if;
  if public.gra_nagrody_do_poziomu(3) <> '[]'::jsonb or jsonb_array_length(public.gra_nagrody_do_poziomu(20)) <> 7 then raise exception 'gra_poziomy: nagrody'; end if;
  if has_table_privilege('authenticated', 'public.gra_rundy', 'SELECT') or has_column_privilege('authenticated', 'public.gra_rundy', 'poziom', 'SELECT, UPDATE') then raise exception 'gra_poziomy: klient sięga do rund'; end if;
  if has_table_privilege('authenticated', 'public.gra_wyniki', 'INSERT, UPDATE') or has_any_column_privilege('authenticated', 'public.gra_wyniki', 'INSERT, UPDATE') then raise exception 'gra_poziomy: klient pisze do wyników'; end if;
  if has_function_privilege('anon', 'public.gra_ranking()', 'EXECUTE') or has_function_privilege('anon', 'public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_start_rundy(text)', 'EXECUTE') then raise exception 'gra_poziomy: EXECUTE dla anona'; end if;
  if has_function_privilege('authenticated', 'public.gra_poziom(bigint)', 'EXECUTE') or has_function_privilege('authenticated', 'public.gra_postac_odblokowana(text, uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'public.gra_ranking_od(date)', 'EXECUTE') or has_function_privilege('authenticated', 'public.gra_dolozyli(timestamptz, timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'public.gra_moje_dolozone(uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'public.gra_miejsca(uuid)', 'EXECUTE') then raise exception 'gra_poziomy: funkcje wewnętrzne dostępne dla klienta'; end if;
  if not has_function_privilege('authenticated', 'public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.gra_start_rundy(text)', 'EXECUTE') or not has_function_privilege('service_role', 'public.gra_ranking()', 'EXECUTE') then raise exception 'gra_poziomy: zabrane EXECUTE'; end if;
  if public.gra_mnoznik_poziomu(1) <> 1 or public.gra_mnoznik_poziomu(20) <> 4.23 or public.gra_mnoznik_poziomu(25) <> 4.23 then raise exception 'gra_poziomy: mnożnik'; end if;
  if public.gra_poziom(699) <> 3 or public.gra_poziom(700) <> 4 or public.gra_poziom(10400) <> 10 or public.gra_poziom(52200) <> 20 then raise exception 'gra_poziomy: progi'; end if;
  if exists (select 1 from public.gra_wyniki where punkty <> cegly) then raise exception 'gra_poziomy: stare wyniki bez punktów'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
