-- 20261105_gra_cegielki.sql — GRA „CEGIEŁKI”: konto, wyniki, rankingi, wspólny mur (Filip 4.11, gałąź akcja/gra). Cegiełki to zabawa, nigdy pieniądze.
--   gra_konto       — pseudonim po moderacji, saldo złotych cegieł, kupione. Klient czyta tylko swój wiersz. Zapis wyłącznie przez RPC.
--   gra_rundy       — każda runda dostaje numer z serwera; czas rundy liczy serwer od tego wpisu. Klient nie ma dostępu.
--   gra_wyniki      — przyjęte wyniki. Klient czyta tylko swoje wiersze. Publicznie wychodzą wyłącznie przez gra_ranking.
--   gra_podejrzane  — odrzucone wyniki do przeglądu: powód i liczby rozpisane po nazwie, nigdy surowy JSON od klienta. Czyta tylko baza.
-- DWIE LICZBY Z RUNDY: zwykłe cegły (gra_wyniki.cegly) idą do wspólnego muru i rankingów; złote cegły (gra_wyniki.zlote) idą na saldo i są jedyną walutą sklepiku. Zwykłe nie są walutą, złote nie wchodzą do muru.
-- SKLEPIK: gra_kup wymienia złote cegły na przedmiot atomowo, ceny tylko tutaj i w js/cegielki-logika.mjs (blizna-154 pilnuje zgodności). Start rundy z kaskiem albo bidonem płatny złotymi w gra_start_rundy.
-- WSPÓLNY MUR: suma zwykłych cegieł z przyjętych rund, cel 12 500 000, w gra_ranking (mur, mur_cel), osobno od kilometrów. Liczona z gra_wyniki, więc skasowanie oszukanego wyniku poprawia mur. Zero prawdziwych pieniędzy, zero zakupów.
-- KTO NAJWIĘCEJ DOŁOŻYŁ: suma zwykłych cegieł na gracza, wszech czasów i w czasie akcji (od wystartowala_at do końca dnia akcje.koniec), obok rankingu najlepszej rundy.
-- ROWERZYSTA: gra_ranking oddaje stan przełącznika akcje.rowerzysta_wlaczony (wdrażać PO 20261105_akcja_rowerzysta.sql), żeby Ulica i gra wiedziały, czy pokazać postać. Kilometry roweru nie wchodzą do żadnej sumy.
-- POZIOMY: 1-20 z sumy zwykłych cegieł gracza z gra_wyniki, progi tutaj (gra_poziom) i w js/cegielki-logika.mjs (blizna-154 pilnuje zgodności).
-- POSTACIE DO ODBLOKOWANIA: rowerzysta od poziomu 10, przy włączonym rowerzysta_wlaczony. Koparka od poziomu 20 albo po ukończeniu wspólnego muru dla wszystkich, przy włączonym fabianek_postac_gra (domyślnie false, włącza Filip).
--   Serwer sprawdza to przy zapisie wyniku: runda zablokowaną postacią nie wchodzi do rankingu ani muru. Rower i koparka to postacie w grze: nie mają związku z licznikiem akcji ani statystykami treningów.
-- PRZEŁĄCZNIK: akcje.gra_aktywna (domyślnie false). Wyłączony = gra zamknięta dla wszystkich i runda nie dostaje numeru, więc nic nie wchodzi do rankingu.
-- PRYWATNY LINK: gra-cegielki.html?t=<token> otwiera grę przy wyłączonym przełączniku, bez rankingu. W bazie tylko SHA-256 tokenu (akcje.gra_token_hash), sam token poza repo.
-- RPC: gra_start_rundy, gra_zapisz_wynik i gra_kup dla zalogowanych, gra_ranking dla zalogowanych i EF gra-ranking, gra_ustaw_pseudonim WYŁĄCZNIE service_role
--   (moderacja jest w JS, więc pseudonim zapisuje EF gra-pseudonim po sprawdzeniu). Anon nie dostaje niczego: niezalogowani czytają ranking przez EF, jak licznik akcji.
-- WALIDACJA WYNIKU: czas rundy na zegarze serwera, długość rundy zgodna z bidonami, osobne pułapy dla zwykłych (GRA_MAKS_NA_S) i złotych (ZLOTE_MAKS_NA_S), spójność liczb, limit rund na minutę, jeden wynik na rundę.
--   Pułapy z pomiaru 4.11 (silnik gry, kroki 1/60 s, combo ×5, złota cegła bez punktów): dobry bot 21,5 cegły/s, bot z saltem przy każdej przeszkodzie 27,9/s, nieśmiertelny bot zbierający wszystko 50,9/s.
--   Rower: bot z saltem 28,6/s. Koparka: dobry timing 17,9/s, mediana 1020 cegieł (dobry biegacz 880-915), bez dotykania mediana 142. Wszystkie poniżej pułapu.
--   Złotych: do 19 w rundzie bot zgodny z regułami, 20 nieśmiertelny, czyli ok. 0,3/s. Pułapy: 40 cegieł/s (2400 w rundzie 60 s) i 0,5 złotej/s (30 w rundzie 60 s). Zmiana balansu = nowy pomiar i nowe stałe tutaj.
--   ⚠️ Wynik liczy przeglądarka: kto przeczyta kod, wyśle liczbę poniżej pułapu. Na to jest przegląd czołówki i kasowanie wierszy, nie ten kod.
-- GRA NIE ZMIENIA licznika akcji ani statystyk treningowych: te funkcje piszą tylko do tabel gra_* (blizna-154).
-- KONTO: delete_my_account NIE kasuje wiersza athletes, tylko go anonimizuje, więc kaskada się nie odpala: tabele gry są dopisane do tej funkcji niżej, razem z pseudonimem z publicznego rankingu.
--   WDRAŻAĆ PO 20261105_usuwanie_konta_pelne.sql.
-- Test: tools/gra-test.sh (przed wdrożeniem GRA_Z_MIGRACJA=1). Wycofanie: 20261105_WYCOFANIE_gra_cegielki.sql.
begin;

alter table public.akcje add column gra_aktywna boolean not null default false;
alter table public.akcje add column gra_token_hash text;
comment on column public.akcje.gra_aktywna is 'Przełącznik gry Cegiełki. Wyłączony: gra zamknięta, runda bez numeru. Czytane wyłącznie przez funkcje gry.';
alter table public.akcje add column fabianek_postac_gra boolean not null default false;
comment on column public.akcje.fabianek_postac_gra is 'Grywalna koparka w grze Cegiełki. Domyślnie false, włącza Filip po starcie i zgodzie. Czytane wyłącznie przez funkcje gry.';
comment on column public.akcje.gra_token_hash is 'SHA-256 prywatnego linku do gry (hex). Sam token poza repo i poza bazą. Nie wychodzi z bazy.';

create table public.gra_konto (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  pseudonim  text check (pseudonim is null or (char_length(pseudonim) between 2 and 14 and pseudonim !~ '[[:cntrl:][:space:][:digit:]<>&"''`/\\]')),
  saldo      integer not null default 0 check (saldo >= 0),
  kupione    jsonb   not null default '[]'::jsonb check (jsonb_typeof(kupione) = 'array'),
  utworzono  timestamptz not null default now()
);
comment on table public.gra_konto is 'Konto gracza Cegiełek: waluta w grze, nigdy pieniądze. Klient czyta swój wiersz, zapis tylko przez RPC.';
comment on column public.gra_konto.pseudonim is 'Publiczny w rankingu. Zapisuje wyłącznie EF gra-pseudonim po moderacji. Bez pseudonimu gracz nie pojawia się w rankingu.';
comment on column public.gra_konto.saldo is 'Złote cegły do wydania w sklepiku gry. Jedyna waluta sklepiku. Nie ma związku z wpłatami ani licznikiem akcji.';
create unique index gra_konto_pseudonim_unikalny on public.gra_konto (lower(pseudonim)) where pseudonim is not null;

create table public.gra_rundy (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  start_at   timestamptz not null default now(),
  koniec_at  timestamptz,
  ulepszenie text check (ulepszenie in ('kask', 'bidon'))
);
comment on table public.gra_rundy is 'Numer i zegar rundy po stronie serwera. Tylko RPC gry.';
create index gra_rundy_konto_start on public.gra_rundy (athlete_id, start_at desc);

create table public.gra_wyniki (
  id         uuid primary key default gen_random_uuid(),
  runda_id   uuid not null unique references public.gra_rundy(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  postac     text not null check (postac in ('kasia', 'filip', 'rowerzysta', 'koparka')),
  cegly      integer not null check (cegly >= 0),
  czas_s     numeric(6,2) not null,
  zlote      integer not null,
  salta      integer not null,
  seria      integer not null,
  upadki     integer not null,
  bidony     integer not null,
  dzien      date not null default ((now() at time zone 'Europe/Warsaw')::date),
  kiedy      timestamptz not null default now()
);
comment on table public.gra_wyniki is 'Przyjęte wyniki Cegiełek. Klient czyta swoje wiersze, publicznie tylko najlepsze przez gra_ranking. Osobno od statystyk treningowych.';
create index gra_wyniki_okres on public.gra_wyniki (dzien, cegly desc);
create index gra_wyniki_konto on public.gra_wyniki (athlete_id, cegly desc);

create table public.gra_podejrzane (
  id         bigint generated always as identity primary key,
  athlete_id uuid references public.athletes(id) on delete cascade,
  runda_id   uuid,
  powod      text not null,
  dane       jsonb not null default '{}'::jsonb,
  kiedy      timestamptz not null default now()
);
comment on table public.gra_podejrzane is 'Odrzucone wyniki i przekroczony limit rund, do przeglądu przez Filipa. Bez dostępu klienta.';
create index gra_podejrzane_kiedy on public.gra_podejrzane (kiedy desc);

-- create table w Supabase nadaje anonowi i authenticated ALL przez default privileges: najpierw zabieramy, potem tylko to, co potrzebne.
alter table public.gra_konto enable row level security;
alter table public.gra_rundy enable row level security;
alter table public.gra_wyniki enable row level security;
alter table public.gra_podejrzane enable row level security;
revoke all on public.gra_konto, public.gra_rundy, public.gra_wyniki, public.gra_podejrzane from public;
revoke all on public.gra_konto, public.gra_rundy, public.gra_wyniki, public.gra_podejrzane from anon;
revoke all on public.gra_konto, public.gra_rundy, public.gra_wyniki, public.gra_podejrzane from authenticated;
grant select on public.gra_konto, public.gra_wyniki to authenticated;

create policy gra_konto_wlasne on public.gra_konto for select to authenticated
  using (athlete_id = (select public.auth_my_athlete_id()));
create policy gra_wyniki_wlasne on public.gra_wyniki for select to authenticated
  using (athlete_id = (select public.auth_my_athlete_id()));

create function public.gra_liczba(j jsonb)
 returns numeric language sql immutable set search_path to 'public', 'pg_temp'
as $$ select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric end $$;

-- Progi poziomów: pierwsze szybko, 20 to kilkaset rund. Te same liczby w js/cegielki-logika.mjs.
create function public.gra_poziom(p_cegly bigint)
 returns integer language sql immutable set search_path to 'public', 'pg_temp'
as $$
  select coalesce(max(p.n), 1)::integer
    from unnest(array[0, 100, 300, 800, 1600, 3200, 5600, 9000, 14000, 20000, 28000, 38000, 52000, 70000, 92000, 120000, 156000, 200000, 260000, 400000]::bigint[]) with ordinality p(prog, n)
   where coalesce(p_cegly, 0) >= p.prog
$$;

create function public.gra_suma_cegiel(p_konto uuid)
 returns bigint language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select coalesce(sum(w.cegly), 0)::bigint from public.gra_wyniki w where w.athlete_id = p_konto $$;

-- Czy gracz może grać tą postacią. Przełączniki z akcji, poziom z jego przyjętych rund. Liczy się stan sprzed zapisywanej rundy.
create function public.gra_postac_odblokowana(p_postac text, p_konto uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select case p_postac
    when 'kasia' then true
    when 'filip' then true
    when 'rowerzysta' then coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false)
                           and public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 10
    when 'koparka' then coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false)
                        and (public.gra_poziom(public.gra_suma_cegiel(p_konto)) >= 20 or (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w) >= 12500000)
    else false end
$$;

-- Postęp gracza do ekranu wyboru postaci.
create function public.gra_moj_postep()
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object('cegly', s.c, 'poziom', public.gra_poziom(s.c))
    from (select public.gra_suma_cegiel(public.auth_my_athlete_id()) c) s
$$;

create function public.gra_start_rundy(p_ulepszenie text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  RUND_NA_MINUTE constant integer := 3;   -- runda trwa minutę; zapas na wyjście i ponowny start
  v_konto uuid := public.auth_my_athlete_id();
  v_ile integer; v_runda uuid; v_saldo integer;
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
  insert into public.gra_rundy (athlete_id, ulepszenie) values (v_konto, v_ulepszenie) returning id into v_runda;
  select saldo into v_saldo from public.gra_konto where athlete_id = v_konto;
  return jsonb_build_object('ok', true, 'runda', v_runda, 'ulepszenie', v_ulepszenie, 'saldo', v_saldo);
end $$;

create function public.gra_ranking_od(p_od date)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'cegly', x.cegly, 'postac', x.postac) order by x.cegly desc, x.kiedy), '[]'::jsonb)
    from (select rank() over (order by n.cegly desc)::integer miejsce, n.pseudonim, n.cegly, n.postac, n.kiedy
            from (select distinct on (w.athlete_id) k.pseudonim, w.cegly, w.postac, w.kiedy
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where w.dzien >= p_od and k.pseudonim is not null
                   order by w.athlete_id, w.cegly desc, w.kiedy) n
           order by n.cegly desc, n.kiedy limit 20) x
$$;

-- Kto najwięcej dołożył do muru: suma zwykłych cegieł na gracza w oknie czasu. Tylko gracze z pseudonimem, bez identyfikatorów kont.
create function public.gra_dolozyli(p_od timestamptz, p_do timestamptz)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('miejsce', x.miejsce, 'pseudonim', x.pseudonim, 'cegly', x.cegly) order by x.cegly desc, x.pseudonim), '[]'::jsonb)
    from (select rank() over (order by n.cegly desc)::integer miejsce, n.pseudonim, n.cegly
            from (select k.pseudonim, sum(w.cegly)::bigint cegly
                    from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                   where k.pseudonim is not null and (p_od is null or w.kiedy >= p_od) and (p_do is null or w.kiedy < p_do)
                   group by k.pseudonim) n
           order by n.cegly desc, n.pseudonim limit 20) x
$$;

-- Trzy rankingi naraz, bez identyfikatorów kont. Tydzień od poniedziałku, doba i tydzień wg Warszawy.
create function public.gra_ranking()
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
    'mur',     (select coalesce(sum(w.cegly), 0) from public.gra_wyniki w),
    'mur_cel', 12500000,
    'aktywna', coalesce((select a.gra_aktywna from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta', coalesce((select a.rowerzysta_wlaczony from public.akcje a where a.slug = 'dla-fabianka'), false),
    'rowerzysta_opis', (select case when a.rowerzysta_wlaczony then a.rowerzysta_opis end from public.akcje a where a.slug = 'dla-fabianka'),
    'postac_koparki', coalesce((select a.fabianek_postac_gra from public.akcje a where a.slug = 'dla-fabianka'), false))
    from (select (now() at time zone 'Europe/Warsaw')::date d) t
$$;

-- Miejsce gracza w rankingu dołożonych cegieł. Liczą się ci sami gracze co na publicznej liście, plus sam pytający.
create function public.gra_moje_dolozone(p_konto uuid)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with okno as (
    select a.wystartowala_at od, case when a.koniec is not null then ((a.koniec + 1)::timestamp at time zone 'Europe/Warsaw') end doo from public.akcje a where a.slug = 'dla-fabianka'
  ), suma as (
    select w.athlete_id, sum(w.cegly)::bigint wszech,
           coalesce(sum(w.cegly) filter (where o.od is not null and w.kiedy >= o.od and (o.doo is null or w.kiedy < o.doo)), 0)::bigint akcja
      from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id left join okno o on true
     where k.pseudonim is not null or w.athlete_id = p_konto
     group by w.athlete_id
  )
  select coalesce((select jsonb_build_object(
      'dolozyli_wszech', jsonb_build_object('cegly', m.wszech, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.wszech > m.wszech)),
      'dolozyli_akcja', jsonb_build_object('cegly', m.akcja, 'miejsce', 1 + (select count(*) from suma s where s.athlete_id <> p_konto and s.akcja > m.akcja)))
    from suma m where m.athlete_id = p_konto), '{}'::jsonb)
$$;

-- Miejsce gracza w trzech rankingach, także poza pierwszą dwudziestką. Liczą się ci sami gracze co na publicznej liście.
create function public.gra_miejsca(p_konto uuid)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with okres(nazwa, od) as (
    select * from (values ('dzien', (now() at time zone 'Europe/Warsaw')::date),
                          ('tydzien', date_trunc('week', (now() at time zone 'Europe/Warsaw')::date)::date),
                          ('wszech', date '2000-01-01')) v(nazwa, od)
  ), moje as (
    select o.nazwa, o.od, (select max(w.cegly) from public.gra_wyniki w where w.athlete_id = p_konto and w.dzien >= o.od) cegly from okres o
  )
  select coalesce(jsonb_object_agg(m.nazwa, jsonb_build_object('cegly', m.cegly, 'miejsce',
           1 + (select count(*) from (select w.athlete_id from public.gra_wyniki w join public.gra_konto k on k.athlete_id = w.athlete_id
                                       where w.dzien >= m.od and k.pseudonim is not null and w.athlete_id <> p_konto
                                       group by w.athlete_id having max(w.cegly) > m.cegly) lepsi))), '{}'::jsonb) || public.gra_moje_dolozone(p_konto)
    from moje m where m.cegly is not null
$$;

create function public.gra_zapisz_wynik(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  GRA_MAKS_NA_S constant numeric := 40;     -- zwykłe cegły; pomiar w nagłówku migracji
  ZLOTE_MAKS_NA_S constant numeric := 0.5;  -- złote cegły, waluta sklepiku: osobny pułap, bo bicie waluty to inny zysk niż wyższy wynik
  RUNDA_S constant numeric := 60;
  BIDON_S constant numeric := 5;
  ZAPAS_ZEGARA_S constant numeric := 8;     -- numer rundy przychodzi z opóźnieniem sieci, gra już biegnie
  MAKS_RUNDA_S constant numeric := 1800;    -- pauza w tle jest dozwolona, ale runda nie żyje wiecznie
  v_konto uuid := public.auth_my_athlete_id();
  r public.gra_rundy;
  v_minelo numeric; v_powod text;
  v_zlote numeric := public.gra_liczba(p_st -> 'zlote');
  v_salta numeric := public.gra_liczba(p_st -> 'salta');
  v_seria numeric := public.gra_liczba(p_st -> 'seria');
  v_upadki numeric := public.gra_liczba(p_st -> 'upadki');
  v_bidony numeric := public.gra_liczba(p_st -> 'bidony');
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

  v_minelo := extract(epoch from (now() - r.start_at));
  v_powod := case
    when p_postac is null or p_postac not in ('kasia', 'filip', 'rowerzysta', 'koparka') or p_cegly is null or p_cegly < 0 or p_czas is null
      or v_zlote is null or v_salta is null or v_seria is null or v_upadki is null or v_bidony is null
      or least(v_zlote, v_salta, v_seria, v_upadki, v_bidony) < 0
      or v_zlote <> trunc(v_zlote) or v_salta <> trunc(v_salta) or v_seria <> trunc(v_seria) or v_upadki <> trunc(v_upadki) or v_bidony <> trunc(v_bidony)
      or greatest(v_zlote, v_salta, v_seria, v_upadki, v_bidony) > 100000 then 'zle_dane'
    when v_bidony > 15 or abs(p_czas - (RUNDA_S + BIDON_S * v_bidony)) > 1 then 'dlugosc_rundy'
    when v_minelo < p_czas - ZAPAS_ZEGARA_S then 'za_krotko'
    when v_minelo > MAKS_RUNDA_S then 'runda_wygasla'
    when p_cegly > GRA_MAKS_NA_S * p_czas then 'ponad_pulap'
    when v_zlote > ZLOTE_MAKS_NA_S * p_czas then 'ponad_pulap_zlotych'
    when v_salta > p_czas / 0.5 then 'sprzeczne_liczby'
    when not public.gra_postac_odblokowana(p_postac, v_konto) then 'postac_zablokowana'
  end;
  update public.gra_rundy set koniec_at = now() where id = p_runda;
  if v_powod is not null then
    insert into public.gra_podejrzane (athlete_id, runda_id, powod, dane)
    values (v_konto, p_runda, v_powod, jsonb_build_object('cegly', p_cegly, 'czas_s', p_czas, 'minelo_s', round(v_minelo, 1), 'zlote', v_zlote, 'salta', v_salta, 'seria', v_seria, 'upadki', v_upadki, 'bidony', v_bidony,
                                                          'postac', case when p_postac in ('kasia', 'filip', 'rowerzysta', 'koparka') then p_postac end));
    -- Zablokowana postać to zwykle postęp z innego urządzenia, nie oszustwo: gracz dostaje prawdziwy powód.
    return jsonb_build_object('ok', false, 'powod', case when v_powod = 'postac_zablokowana' then v_powod else 'podejrzany' end);
  end if;

  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, czas_s, zlote, salta, seria, upadki, bidony)
  values (p_runda, v_konto, p_postac, p_cegly, p_czas, v_zlote, v_salta, v_seria, v_upadki, v_bidony);
  update public.gra_konto set saldo = saldo + v_zlote::integer where athlete_id = v_konto;   -- na saldo tylko złote; zwykłe idą do muru przez gra_wyniki
  return jsonb_build_object('ok', true, 'miejsca', public.gra_miejsca(v_konto), 'saldo', (select saldo from public.gra_konto where athlete_id = v_konto), 'cegly_lacznie', public.gra_suma_cegiel(v_konto));
end $$;

-- Prywatny link: tylko EF gra-ranking. Porównanie po skrócie, sam skrót nie wychodzi. Brak skrótu w bazie = żaden token nie pasuje.
create function public.gra_token_ok(p_token text)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select a.gra_token_hash is not null and a.gra_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
                     from public.akcje a where a.slug = 'dla-fabianka'), false)
$$;

-- Sklepik: złote cegły z gry na przedmiot w grze. Blokada wiersza konta: dwa równoległe zakupy nie zejdą poniżej zera ani nie kupią dwa razy.
create function public.gra_kup(p_przedmiot text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_konto uuid := public.auth_my_athlete_id();
  k public.gra_konto;
  v_cena integer := case p_przedmiot
    when 'koszulka-czerwona' then 10
    when 'koszulka-niebieska' then 10
    when 'koszulka-zielona' then 10
    when 'koszulka-fioletowa' then 15
    when 'koszulka-zlota' then 50
    when 'kamizelka' then 25
    when 'spodenki-czerwone' then 8
    when 'spodenki-niebieskie' then 8
    when 'spodenki-zielone' then 8
    when 'spodenki-biale' then 12
    when 'opaska' then 10
    when 'czapka-pompon' then 15
    when 'kask-rowerowy' then 25
    when 'czapka-zlota' then 40
    when 'okulary' then 20
    when 'medal' then 30
    when 'peleryna' then 60
  end;
begin
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  if v_cena is null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  insert into public.gra_konto (athlete_id) values (v_konto) on conflict (athlete_id) do nothing;
  select * into k from public.gra_konto where athlete_id = v_konto for update;
  if k.kupione @> to_jsonb(p_przedmiot) then return jsonb_build_object('ok', false, 'powod', 'juz_masz', 'saldo', k.saldo, 'kupione', k.kupione); end if;
  if k.saldo < v_cena then return jsonb_build_object('ok', false, 'powod', 'za_malo', 'saldo', k.saldo, 'kupione', k.kupione); end if;
  update public.gra_konto set saldo = saldo - v_cena, kupione = kupione || to_jsonb(p_przedmiot) where athlete_id = v_konto returning * into k;
  return jsonb_build_object('ok', true, 'saldo', k.saldo, 'kupione', k.kupione);
end $$;

-- Tylko EF gra-pseudonim, po moderacji w JS (js/moderacja.mjs = _shared/moderacja.mjs). Użytkownik z tokena, nie z formularza.
create function public.gra_ustaw_pseudonim(p_user uuid, p_pseudonim text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_konto uuid;
begin
  select a.id into v_konto from public.athletes a where a.user_id = p_user limit 1;
  if v_konto is null then return jsonb_build_object('ok', false, 'powod', 'brak_profilu'); end if;
  insert into public.gra_konto (athlete_id, pseudonim) values (v_konto, p_pseudonim)
    on conflict (athlete_id) do update set pseudonim = excluded.pseudonim;
  return jsonb_build_object('ok', true, 'pseudonim', p_pseudonim);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'powod', 'zajety');
  when check_violation then return jsonb_build_object('ok', false, 'powod', 'zly_format');
end $$;

revoke all on function public.gra_liczba(jsonb) from public, anon, authenticated;
revoke all on function public.gra_poziom(bigint) from public, anon, authenticated;
revoke all on function public.gra_suma_cegiel(uuid) from public, anon, authenticated;
revoke all on function public.gra_postac_odblokowana(text, uuid) from public, anon, authenticated;
revoke all on function public.gra_moj_postep() from public, anon;
revoke all on function public.gra_start_rundy(text) from public, anon;
revoke all on function public.gra_kup(text) from public, anon;
revoke all on function public.gra_token_ok(text) from public, anon, authenticated;
revoke all on function public.gra_ranking_od(date) from public, anon, authenticated;
revoke all on function public.gra_dolozyli(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.gra_moje_dolozone(uuid) from public, anon, authenticated;
revoke all on function public.gra_ranking() from public, anon;
revoke all on function public.gra_miejsca(uuid) from public, anon, authenticated;
revoke all on function public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb) from public, anon;
revoke all on function public.gra_ustaw_pseudonim(uuid, text) from public, anon, authenticated;
grant execute on function public.gra_start_rundy(text) to authenticated;
grant execute on function public.gra_moj_postep() to authenticated;
grant execute on function public.gra_kup(text) to authenticated;
grant execute on function public.gra_token_ok(text) to service_role;
grant execute on function public.gra_ranking() to authenticated, service_role;
grant execute on function public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb) to authenticated;
grant execute on function public.gra_ustaw_pseudonim(uuid, text) to service_role;

comment on function public.gra_start_rundy(text) is 'Numer rundy z zegarem serwera; limit 3 rundy na minutę, nadmiar w gra_podejrzane. Ulepszenie startowe płatne z salda po przejściu limitu.';
comment on function public.gra_token_ok(text) is 'Czy token prywatnego linku pasuje do skrótu w akcje. Tylko EF gra-ranking.';
comment on function public.gra_kup(text) is 'Wymiana złotych cegieł z gry na przedmiot w grze. Atomowo, cena po stronie serwera. Nigdy prawdziwe pieniądze.';
comment on function public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb) is 'Jedyna droga zapisu wyniku. Walidacja: zegar serwera, długość rundy, pułap, spójność, jeden wynik na rundę; odrzucone w gra_podejrzane.';
comment on function public.gra_dolozyli(timestamptz, timestamptz) is 'Kto najwięcej dołożył do muru w oknie czasu. Bez identyfikatorów kont, tylko gracze z pseudonimem.';
comment on function public.gra_moje_dolozone(uuid) is 'Miejsce i suma gracza w rankingu dołożonych cegieł.';
comment on function public.gra_ranking() is 'Publiczne rankingi najlepszej rundy i dołożonych cegieł, wspólny mur. Tylko pseudonim, wynik, postać. Anon wyłącznie przez EF gra-ranking.';
comment on function public.gra_ustaw_pseudonim(uuid, text) is 'Tylko service_role, po moderacji w EF gra-pseudonim.';
comment on function public.gra_poziom(bigint) is 'Poziom 1-20 z sumy cegieł. Progi zgodne z js/cegielki-logika.mjs.';
comment on function public.gra_suma_cegiel(uuid) is 'Suma zwykłych cegieł gracza z przyjętych rund.';
comment on function public.gra_postac_odblokowana(text, uuid) is 'Czy postać jest dostępna dla gracza: przełącznik akcji i poziom albo ukończony mur.';
comment on function public.gra_moj_postep() is 'Suma cegieł i poziom zalogowanego gracza.';
comment on function public.gra_liczba(jsonb) is 'Liczba z niezaufanego JSON-a albo NULL; tekst nie wysadza walidacji.';
comment on function public.gra_ranking_od(date) is 'Dwadzieścia najlepszych wyników (jeden na gracza) od podanego dnia, tylko gracze z pseudonimem.';
comment on function public.gra_miejsca(uuid) is 'Miejsce i najlepszy wynik gracza w trzech rankingach.';

do $$
declare t text;
begin
  foreach t in array array['gra_konto', 'gra_rundy', 'gra_wyniki', 'gra_podejrzane'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'gra: RLS wyłączone na %', t; end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, REFERENCES') then raise exception 'gra: anon ma uprawnienia do %', t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('authenticated', 'public.' || t, 'INSERT, UPDATE, REFERENCES') then raise exception 'gra: authenticated może pisać do %', t; end if;
  end loop;
  if has_column_privilege('anon', 'public.akcje', 'gra_token_hash', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'gra_token_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.akcje', 'gra_aktywna', 'UPDATE') or has_column_privilege('authenticated', 'public.akcje', 'fabianek_postac_gra', 'UPDATE')
     or has_column_privilege('anon', 'public.akcje', 'fabianek_postac_gra', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'fabianek_postac_gra', 'SELECT') or has_function_privilege('authenticated', 'public.gra_token_ok(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.gra_token_ok(text)', 'EXECUTE') then raise exception 'gra: przełącznik albo token dostępne poza funkcjami gry'; end if;
  if has_table_privilege('authenticated', 'public.gra_rundy', 'SELECT') or has_table_privilege('authenticated', 'public.gra_podejrzane', 'SELECT') then raise exception 'gra: klient czyta rundy albo podejrzane'; end if;
  if has_function_privilege('anon', 'public.gra_moj_postep()', 'EXECUTE') or has_function_privilege('authenticated', 'public.gra_postac_odblokowana(text, uuid)', 'EXECUTE') then raise exception 'gra: postęp albo odblokowanie poza migracją'; end if;
  if exists (select 1 from public.akcje where fabianek_postac_gra) then raise exception 'gra: koparka ma być domyślnie wyłączona'; end if;
  if has_function_privilege('anon', 'public.gra_ranking()', 'EXECUTE') or has_function_privilege('anon', 'public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.gra_start_rundy(text)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_kup(text)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_ustaw_pseudonim(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.gra_ustaw_pseudonim(uuid, text)', 'EXECUTE') then raise exception 'gra: EXECUTE poza migracją'; end if;
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.delete_my_account()'::regprocedure);
  v_wzor text := $r$(DELETE\s+FROM\s+public\.wyniki_zgloszone\s+WHERE athlete_id = v_athlete_id;[^\n]*\n)$r$;
begin
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'gra: definicja delete_my_account inna, niż oczekiwana'; end if;
  execute regexp_replace(v_def, v_wzor, $n$\1  DELETE FROM public.gra_podejrzane WHERE athlete_id = v_athlete_id;
  DELETE FROM public.gra_wyniki WHERE athlete_id = v_athlete_id;
  DELETE FROM public.gra_rundy WHERE athlete_id = v_athlete_id;
  DELETE FROM public.gra_konto WHERE athlete_id = v_athlete_id;
$n$);
end $$;

notify pgrst, 'reload schema';
commit;
