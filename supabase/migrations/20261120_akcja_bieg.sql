-- 20261120_akcja_bieg.sql — BIEG WIRTUALNY Z PRAWDZIWYMI ZAPISAMI (decyzje 12.11; etap 1 projektu biegu, dokument poza repo).
--   Uczestnik ≠ konto: jedno konto zapisuje siebie (rodzaj 'ja', najwyżej raz na bieg) i dzieci samym imieniem z oświadczeniem rodzica (rodzaj 'dziecko', bez kont dzieci).
--   Każdy uczestnik ma własny numer startowy. Publicznie (przez akcja_licznik → pole `bieg`) wychodzą tylko liczby zbiorcze i lista „ukończyli” (imię za zgodą, numer,
--   dystans); konta, e-maile i oświadczenia nigdy. Czas i miejsce tylko za zgodą na ranking (decyzja 13.11): dorosły zapis „ja”, osobno 5 i 10 km; dzieci i konta
--   niepełnoletnie (data urodzenia) nigdy, logika w jednym miejscu: akcja_bieg_czas_rankingu. Tabele bez dostępu z przeglądarki (RLS włączone, wszystko odebrane): jedyna droga to funkcje SECURITY DEFINER
--   dla roli authenticated. Zgłoszenia cegiełek dostają od razu bieg_uczestnik_id, żeby złotą odznakę (etap 3) dało się przyznać wstecznie po zatwierdzeniu wpłaty.
--   Organizator biegu: BiegaMy (decyzja 13.11). Opiekun dziecka, dla którego jest zbiórka, wyraża tylko zgodę na bieg, imię i rysunek (poza bazą). „Wesprzyj zbiórkę”
--   to wyłącznie publiczny link zbiórki z akcji (akcje.url_zbiorki przez licznik); bieg nie ma własnego linku ani pola na pieniądze.
--   Bieg zakłada Filip wpisem w akcja_biegi (najpierw 'szkic', niewidoczny i bez zapisów; 'otwarty' na jego słowo); fazę (zapisy / trwa / wyniki / zakonczony) liczy akcja_bieg_faza z dat, bez crona i bez kroków na produkcji.
--   Bez wpisowego: BiegaMy nie przyjmuje opłat, kwot wsparcia nie sprawdza i nie pokazuje. Imię dziecka, na które jest zbiórka, nie występuje w tym pliku (nazwa biegu w wierszu).
-- Test: tools/akcja-bieg-test.sh (przed wdrożeniem AKCJA_BIEG_Z_MIGRACJA=1, jedna transakcja zawsze wycofana). Wycofanie: 20261120_WYCOFANIE_akcja_bieg.sql.
begin;

create table public.akcja_biegi (
  id                  uuid primary key default gen_random_uuid(),
  akcja_slug          text not null references public.akcje(slug) on delete cascade,
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  nazwa               text not null check (char_length(btrim(nazwa)) between 3 and 80 and nazwa !~ '[[:cntrl:]]'),
  dzien_od            date not null,
  dzien_do            date not null,
  wynik_do            date not null,
  termin_zapasowy_od  date,
  dystanse_km         integer[] not null default '{5,10}' check (cardinality(dystanse_km) between 1 and 4),
  status              text not null default 'szkic' check (status in ('szkic', 'otwarty', 'zakonczony')),
  regulamin_wersja    text not null check (char_length(regulamin_wersja) between 3 and 40),
  plakat_sciezka      text check (plakat_sciezka is null or plakat_sciezka ~ '^[0-9a-f-]{36}/plakat\.(png|jpg|webp)$'),
  wsparcie_kwoty_zl   integer[] not null default '{20,30,50}' check (cardinality(wsparcie_kwoty_zl) between 1 and 5),
  limit_dzieci        integer not null default 6 check (limit_dzieci between 0 and 20),
  utworzono           timestamptz not null default now(),
  constraint akcja_biegi_dni check (dzien_do >= dzien_od and dzien_do - dzien_od <= 1 and wynik_do >= dzien_do and wynik_do - dzien_do <= 7)
);
comment on table public.akcja_biegi is 'Bieg wirtualny ulicy (jeden weekend). Organizator: BiegaMy; opiekun dziecka wyraża tylko zgodę (bieg, imię, rysunek). Zakłada Filip SQL-em (szkic, potem otwarty); faza z dat (akcja_bieg_faza). Bez dostępu z przeglądarki; publicznie przez akcja_licznik → bieg.';
comment on column public.akcja_biegi.wynik_do is 'Do kiedy można dopisać wynik (decyzja 12.11: wtorek po biegu).';
comment on column public.akcja_biegi.regulamin_wersja is 'Wersja tekstu regulaminu, którą akceptuje zapis; zmiana wersji nie unieważnia starych zapisów (zapisana przy uczestniku).';
comment on column public.akcja_biegi.wsparcie_kwoty_zl is 'Podpowiedzi przy „Wesprzyj zbiórkę” (pierwsza wyróżniona). Wpłata tylko u organizacji; kwot nie sprawdzamy ani nie pokazujemy.';
create index akcja_biegi_akcja on public.akcja_biegi (akcja_slug, dzien_od desc);

create table public.akcja_bieg_uczestnicy (
  id                      uuid primary key default gen_random_uuid(),
  bieg_id                 uuid not null references public.akcja_biegi(id) on delete cascade,
  konto_id                uuid not null references public.athletes(id) on delete cascade,
  rodzaj                  text not null check (rodzaj in ('ja', 'dziecko')),
  imie                    text not null constraint akcja_bieg_jedno_imie check (char_length(imie) between 2 and 20 and imie ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$'),
  zgoda_imie              boolean not null default false,
  numer                   integer not null check (numer > 0),
  dystans_km              integer check (dystans_km is null or dystans_km between 1 and 100),
  dystans_wlasny_km       numeric(6,2) check (dystans_wlasny_km is null or dystans_wlasny_km between 0.1 and 100),
  oswiadczenie_rodzica_at timestamptz,
  regulamin_wersja        text not null,
  regulamin_at            timestamptz not null default now(),
  zgoda_email             boolean not null default false,
  wynik_log_id            uuid references public.training_logs(id) on delete set null,
  wynik_s                 integer check (wynik_s is null or wynik_s between 60 and 86400),
  wynik_dystans_km        integer check (wynik_dystans_km is null or wynik_dystans_km between 1 and 100),
  ukonczony_at            timestamptz,
  zaliczony_przez         uuid references auth.users(id) on delete set null,
  odznaka                 text not null default 'brak' check (odznaka in ('brak', 'zwykla', 'zlota')),
  utworzono               timestamptz not null default now(),
  wycofany_at             timestamptz,
  ranking_zgoda_at        timestamptz,
  constraint akcja_bieg_ranking_tylko_ja check (ranking_zgoda_at is null or rodzaj = 'ja'),
  constraint akcja_bieg_uczestnik_rodzaj check (
    (rodzaj = 'ja' and dystans_km is not null and oswiadczenie_rodzica_at is null)
    or (rodzaj = 'dziecko' and dystans_km is null and oswiadczenie_rodzica_at is not null)),
  constraint akcja_bieg_numer unique (bieg_id, numer)
);
comment on table public.akcja_bieg_uczestnicy is 'Uczestnicy biegu: konto (rodzaj ja) i dzieci konta samym imieniem (rodzaj dziecko, oświadczenie rodzica). Bez nazwisk, e-maili i wieku. Publicznie tylko przez akcja_bieg_publiczny i akcja_bieg_ukonczyli: imię za zgodą, numer, dystans; czas i miejsce tylko za zgodą na ranking (dorośli).';
comment on column public.akcja_bieg_uczestnicy.konto_id is 'Konto, które zapisało (siebie albo dziecko). Nie wychodzi publicznie.';
comment on column public.akcja_bieg_uczestnicy.wynik_s is 'Czas w sekundach: na dyplomie; publicznie tylko przez akcja_bieg_czas_rankingu (zgoda na ranking, dorosły zapis „ja”). Dziecko bez czasu.';
comment on column public.akcja_bieg_uczestnicy.ranking_zgoda_at is 'Zgoda „pokaż mnie w rankingu” (decyzja 13.11): kiedy dana, NULL = brak (domyślnie). Osobna od zgody na imię. Tylko rodzaj ja (CHECK); niepełnoletni z daty urodzenia odrzucani w funkcjach i odfiltrowani w liście.';
comment on column public.akcja_bieg_uczestnicy.odznaka is 'zwykla po ukończeniu; zlota po zatwierdzeniu cegiełki ze zgłoszenia z bieg_uczestnik_id (etap 3).';
create unique index akcja_bieg_jeden_zapis on public.akcja_bieg_uczestnicy (bieg_id, konto_id) where rodzaj = 'ja' and wycofany_at is null;
create index akcja_bieg_uczestnicy_bieg on public.akcja_bieg_uczestnicy (bieg_id, wycofany_at, utworzono);
create index akcja_bieg_uczestnicy_konto on public.akcja_bieg_uczestnicy (konto_id, bieg_id);

-- zgłoszenia cegiełek: powiązanie z uczestnikiem biegu od razu, żeby złotą odznakę dało się przyznać wstecznie (zatwierdzenie zrzutu wpłaty = cegła w murze + złota)
alter table public.akcja_firmy_zgloszenia add column bieg_uczestnik_id uuid references public.akcja_bieg_uczestnicy(id) on delete set null;
comment on column public.akcja_firmy_zgloszenia.bieg_uczestnik_id is 'Zgłoszenie cegiełki wysłane z biegu („Wesprzyj zbiórkę”): po zatwierdzeniu uczestnik dostaje złotą odznakę (etap 3). NULL = zwykła cegiełka.';
create index akcja_firmy_zgloszenia_bieg on public.akcja_firmy_zgloszenia (bieg_uczestnik_id) where bieg_uczestnik_id is not null;

alter table public.akcja_biegi enable row level security;
alter table public.akcja_bieg_uczestnicy enable row level security;
revoke all on public.akcja_biegi, public.akcja_bieg_uczestnicy from public, anon, authenticated;

-- faza biegu z dat: szkic → zapisy (przed weekendem) → trwa (sobota, niedziela) → wyniki (do wynik_do) → zakonczony. Bez crona.
create or replace function public.akcja_bieg_faza(b public.akcja_biegi, p_dzis date default (now() at time zone 'Europe/Warsaw')::date)
 returns text
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select case when b.status = 'szkic' then 'szkic'
              when b.status = 'zakonczony' or p_dzis > b.wynik_do then 'zakonczony'
              when p_dzis < b.dzien_od then 'zapisy'
              when p_dzis <= b.dzien_do then 'trwa'
              else 'wyniki' end;
$function$;
revoke all on function public.akcja_bieg_faza(public.akcja_biegi, date) from public, anon, authenticated;

-- publiczna część biegu dla licznika: TYLKO liczby zbiorcze (przegląd 12.11). Żadnych kont, czasów, e-maili, oświadczeń; termin zapasowy nie wychodzi. Lista „ukończyli” osobno (akcja_bieg_ukonczyli).
create or replace function public.akcja_bieg_publiczny(p_akcja_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare b public.akcja_biegi; v_dzis date := (now() at time zone 'Europe/Warsaw')::date; v_na jsonb;
begin
  select * into b from public.akcja_biegi where akcja_slug = p_akcja_slug and status <> 'szkic' order by dzien_od desc, utworzono desc limit 1;
  if not found then return null; end if;
  select coalesce(jsonb_object_agg(d::text, n), '{}'::jsonb) into v_na
    from (select u.dystans_km d, count(*) n from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.rodzaj = 'ja' group by 1) x;
  return jsonb_build_object(
    'slug', b.slug, 'nazwa', b.nazwa, 'dzien_od', b.dzien_od, 'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do,
    'dystanse_km', to_jsonb(b.dystanse_km), 'faza', public.akcja_bieg_faza(b, v_dzis), 'regulamin_wersja', b.regulamin_wersja,
    'wsparcie_kwoty_zl', to_jsonb(b.wsparcie_kwoty_zl), 'limit_dzieci', b.limit_dzieci,
    'zapisani', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null),
    'zapisani_na', v_na,
    'dzieci', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.rodzaj = 'dziecko'),
    'ukonczyli_n', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.ukonczony_at is not null),
    'zlote', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.odznaka = 'zlota'));
end $function$;
revoke all on function public.akcja_bieg_publiczny(text) from public, anon, authenticated, service_role;

-- RANKING (decyzja 13.11): konto niepełnoletnie w dniu biegu wg daty urodzenia (brak daty = brak dowodu; zgoda na ranking zawiera oświadczenie „mam 18 lat”).
create or replace function public.akcja_bieg_niepelnoletni(p_konto uuid, p_dzien date)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.athletes a where a.id = p_konto and a.date_of_birth is not null and a.date_of_birth > (p_dzien - interval '18 years')::date);
$function$;
revoke all on function public.akcja_bieg_niepelnoletni(uuid, date) from public, anon, authenticated;
-- czas do rankingu albo NULL: JEDYNE miejsce, które decyduje, czy czas wychodzi publicznie. Zapis „ja” (dzieci nigdy), zgoda na ranking, ukończony z wynikiem
-- na dystansie biegu, nie wycofany, konto nie niepełnoletnie w dniu startu. Wołają ją tylko funkcje SECURITY DEFINER; role klienta bez dostępu.
create or replace function public.akcja_bieg_czas_rankingu(u public.akcja_bieg_uczestnicy, b public.akcja_biegi)
 returns integer
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select case when u.rodzaj = 'ja' and u.ranking_zgoda_at is not null and u.wycofany_at is null and u.ukonczony_at is not null
                   and u.wynik_s is not null and u.wynik_dystans_km is not null and u.wynik_dystans_km = any(b.dystanse_km)
                   and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)
              then u.wynik_s end;
$function$;
revoke all on function public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi) from public, anon, authenticated;

-- lista „ukończyli” ze stronicowaniem: imię za zgodą, numer, dystans, dziecko; bez kont. Czas i miejsce tylko z akcja_bieg_czas_rankingu, miejsce osobno w każdym dystansie
-- (remis = to samo miejsce). p_dystans (5 albo 10): sam ten dystans dorosłych, najpierw ranking wg miejsca, potem reszta bez czasu; bez p_dystans wszyscy jak dotąd (najnowsi pierwsi).
-- Tylko rola serwisowa (EF bieg-ukonczyli, ta sama droga co licznik), nigdy anon ani przeglądarka.
create or replace function public.akcja_bieg_ukonczyli(p_slug text, p_od integer default 0, p_ile integer default 50, p_dystans integer default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare b public.akcja_biegi; v_od integer := greatest(0, coalesce(p_od, 0)); v_ile integer := least(100, greatest(1, coalesce(p_ile, 50))); v_razem integer; v_ranking integer; v_lista jsonb;
begin
  select * into b from public.akcja_biegi where slug = p_slug and status <> 'szkic';
  if not found then return null; end if;
  if p_dystans is not null and not (p_dystans = any(b.dystanse_km)) then return null; end if;
  with w as (
    select u.imie, u.zgoda_imie, u.numer, u.rodzaj, u.ukonczony_at, u.wynik_dystans_km, coalesce(u.wynik_dystans_km::numeric, u.dystans_wlasny_km) as dystans, public.akcja_bieg_czas_rankingu(u, b) as czas
      from public.akcja_bieg_uczestnicy u
     where u.bieg_id = b.id and u.wycofany_at is null and u.ukonczony_at is not null
       and (p_dystans is null or (u.rodzaj = 'ja' and u.wynik_dystans_km = p_dystans))
  ), m as (
    select w.*, case when w.czas is not null then rank() over (partition by w.czas is not null, w.wynik_dystans_km order by w.czas) end as miejsce from w
  ), p as (
    select m.*, row_number() over (order by case when p_dystans is not null and m.czas is not null then 0 else 1 end,
                                            case when p_dystans is not null then m.czas end nulls last, m.ukonczony_at desc, m.numer) as poz from m
  )
  select (select count(*) from w), (select count(*) from w where w.czas is not null),
         coalesce((select jsonb_agg(jsonb_build_object('imie', case when p.zgoda_imie then p.imie end, 'numer', p.numer, 'dystans_km', p.dystans, 'dziecko', p.rodzaj = 'dziecko')
                                    || case when p.czas is not null then jsonb_build_object('czas_s', p.czas, 'miejsce', p.miejsce) else '{}'::jsonb end order by p.poz)
                     from p where p.poz > v_od and p.poz <= v_od + v_ile), '[]'::jsonb)
    into v_razem, v_ranking, v_lista;
  return jsonb_build_object('slug', b.slug, 'dystans', p_dystans, 'razem', v_razem, 'w_rankingu', v_ranking, 'od', v_od, 'ile', v_ile, 'lista', v_lista);
end $function$;
revoke all on function public.akcja_bieg_ukonczyli(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.akcja_bieg_ukonczyli(text, integer, integer, integer) to service_role;

-- zapis siebie: raz na bieg (częściowy unikalny indeks + blokada doradcza na numer), w fazie zapisy/trwa/wyniki (do wynik_do), dystans z listy biegu, regulamin w bieżącej wersji;
-- imię: podane albo pierwsze słowo full_name; numer = max+1 w biegu (nie wraca po wycofaniu). Nabijanie numerów: najwyżej 3 zapisy „ja” na konto i bieg łącznie z wycofanymi.
-- p_zgoda_ranking (13.11): domyślnie nie; z datą urodzenia poniżej 18 lat w dniu startu odmowa 'ranking_wiek' (zapis nie powstaje, strona prosi o odznaczenie).
create or replace function public.akcja_bieg_zapisz(p_slug text, p_dystans integer, p_zgoda_imie boolean, p_zgoda_email boolean, p_regulamin_wersja text, p_imie text default null, p_zgoda_ranking boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); b public.akcja_biegi; v_faza text; v_imie text; v_numer integer; v_id uuid; v_stary public.akcja_bieg_uczestnicy;
begin
  if v_ja is null then raise exception 'akcja_bieg_zapisz: zaloguj się' using errcode = '42501'; end if;
  select * into b from public.akcja_biegi where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  v_faza := public.akcja_bieg_faza(b);
  if v_faza not in ('zapisy', 'trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'zamkniete', 'faza', v_faza); end if;
  if p_regulamin_wersja is distinct from b.regulamin_wersja then return jsonb_build_object('ok', false, 'powod', 'regulamin', 'regulamin_wersja', b.regulamin_wersja); end if;
  if p_dystans is null or not (p_dystans = any(b.dystanse_km)) then return jsonb_build_object('ok', false, 'powod', 'dystans'); end if;
  if coalesce(p_zgoda_ranking, false) and public.akcja_bieg_niepelnoletni(v_ja, b.dzien_od) then return jsonb_build_object('ok', false, 'powod', 'ranking_wiek'); end if;
  v_imie := coalesce(nullif(btrim(p_imie), ''), (select split_part(btrim(a.full_name), ' ', 1) from public.athletes a where a.id = v_ja));
  if v_imie is null or char_length(v_imie) not between 2 and 20 or v_imie !~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$' then return jsonb_build_object('ok', false, 'powod', 'imie'); end if;
  perform pg_advisory_xact_lock(hashtext('akcja_bieg:' || b.id::text));
  select * into v_stary from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = v_ja and u.rodzaj = 'ja' and u.wycofany_at is null;
  if found then return jsonb_build_object('ok', false, 'powod', 'juz_zapisany', 'id', v_stary.id, 'numer', v_stary.numer); end if;
  if (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = v_ja and u.rodzaj = 'ja') >= 3 then return jsonb_build_object('ok', false, 'powod', 'limit_zapisow'); end if;
  select coalesce(max(numer), 0) + 1 into v_numer from public.akcja_bieg_uczestnicy where bieg_id = b.id;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, dystans_km, regulamin_wersja, zgoda_email, ranking_zgoda_at)
    values (b.id, v_ja, 'ja', v_imie, coalesce(p_zgoda_imie, false), v_numer, p_dystans, b.regulamin_wersja, coalesce(p_zgoda_email, false), case when coalesce(p_zgoda_ranking, false) then now() end)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'numer', v_numer, 'imie', v_imie);
end $function$;
revoke all on function public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean) from public, anon;
grant execute on function public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean) to authenticated;

-- zgoda na ranking po zapisie (włącz albo wyłącz), tylko własny aktywny zapis „ja”; dzieci nie mają tej zgody (CHECK). Włączenie z datą urodzenia poniżej 18 lat: odmowa.
create or replace function public.akcja_bieg_ranking_zgoda(p_slug text, p_zgoda boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); b public.akcja_biegi; v_id uuid;
begin
  if v_ja is null then raise exception 'akcja_bieg_ranking_zgoda: zaloguj się' using errcode = '42501'; end if;
  select * into b from public.akcja_biegi where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if coalesce(p_zgoda, false) and public.akcja_bieg_niepelnoletni(v_ja, b.dzien_od) then return jsonb_build_object('ok', false, 'powod', 'ranking_wiek'); end if;
  update public.akcja_bieg_uczestnicy set ranking_zgoda_at = case when coalesce(p_zgoda, false) then coalesce(ranking_zgoda_at, now()) end
   where bieg_id = b.id and konto_id = v_ja and rodzaj = 'ja' and wycofany_at is null
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'powod', 'brak_zapisu'); end if;
  return jsonb_build_object('ok', true, 'ranking', coalesce(p_zgoda, false));
end $function$;
revoke all on function public.akcja_bieg_ranking_zgoda(text, boolean) from public, anon;
grant execute on function public.akcja_bieg_ranking_zgoda(text, boolean) to authenticated;

-- dziecko: samo imię, oświadczenie rodzica (data), bez konta, bez dystansu z listy („swój dystans” po biegu), limit na konto i bieg
create or replace function public.akcja_bieg_dopisz_dziecko(p_slug text, p_imie text, p_zgoda_imie boolean, p_oswiadczenie boolean, p_regulamin_wersja text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); b public.akcja_biegi; v_faza text; v_imie text := btrim(coalesce(p_imie, '')); v_numer integer; v_id uuid; v_ile integer;
begin
  if v_ja is null then raise exception 'akcja_bieg_dopisz_dziecko: zaloguj się' using errcode = '42501'; end if;
  select * into b from public.akcja_biegi where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  v_faza := public.akcja_bieg_faza(b);
  if v_faza not in ('zapisy', 'trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'zamkniete', 'faza', v_faza); end if;
  if p_regulamin_wersja is distinct from b.regulamin_wersja then return jsonb_build_object('ok', false, 'powod', 'regulamin', 'regulamin_wersja', b.regulamin_wersja); end if;
  if p_oswiadczenie is distinct from true then return jsonb_build_object('ok', false, 'powod', 'oswiadczenie'); end if;
  if char_length(v_imie) not between 2 and 20 or v_imie !~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$' then return jsonb_build_object('ok', false, 'powod', 'imie'); end if;
  perform pg_advisory_xact_lock(hashtext('akcja_bieg:' || b.id::text));
  select count(*) into v_ile from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = v_ja and u.rodzaj = 'dziecko' and u.wycofany_at is null;
  if v_ile >= b.limit_dzieci then return jsonb_build_object('ok', false, 'powod', 'limit', 'limit', b.limit_dzieci); end if;
  -- nabijanie numerów: dzieci łącznie z wycofanymi najwyżej 3 × limit
  if (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = v_ja and u.rodzaj = 'dziecko') >= 3 * b.limit_dzieci then return jsonb_build_object('ok', false, 'powod', 'limit', 'limit', b.limit_dzieci); end if;
  select coalesce(max(numer), 0) + 1 into v_numer from public.akcja_bieg_uczestnicy where bieg_id = b.id;
  insert into public.akcja_bieg_uczestnicy (bieg_id, konto_id, rodzaj, imie, zgoda_imie, numer, oswiadczenie_rodzica_at, regulamin_wersja)
    values (b.id, v_ja, 'dziecko', v_imie, coalesce(p_zgoda_imie, false), v_numer, now(), b.regulamin_wersja)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'numer', v_numer, 'imie', v_imie);
end $function$;
revoke all on function public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text) from public, anon;
grant execute on function public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text) to authenticated;

-- wycofanie własnego zapisu (siebie albo dziecka) przed ukończeniem; wiersz zostaje z datą, numer nie wraca
create or replace function public.akcja_bieg_wycofaj(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); u public.akcja_bieg_uczestnicy;
begin
  if v_ja is null then raise exception 'akcja_bieg_wycofaj: zaloguj się' using errcode = '42501'; end if;
  select * into u from public.akcja_bieg_uczestnicy where id = p_id for update;
  if not found or u.konto_id <> v_ja then return jsonb_build_object('ok', false, 'powod', 'nie_twoj'); end if;
  if u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'juz_wycofany'); end if;
  if u.ukonczony_at is not null then return jsonb_build_object('ok', false, 'powod', 'ukonczony'); end if;
  update public.akcja_bieg_uczestnicy set wycofany_at = now() where id = u.id;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.akcja_bieg_wycofaj(uuid) from public, anon;
grant execute on function public.akcja_bieg_wycofaj(uuid) to authenticated;

-- moje zapisy w biegu (ja + dzieci), tylko własne konto; czas i odznaka dla dyplomu
create or replace function public.akcja_bieg_moi(p_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); b public.akcja_biegi;
begin
  if v_ja is null then raise exception 'akcja_bieg_moi: zaloguj się' using errcode = '42501'; end if;
  select * into b from public.akcja_biegi where slug = p_slug;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'rodzaj', u.rodzaj, 'imie', u.imie, 'zgoda_imie', u.zgoda_imie, 'numer', u.numer, 'dystans_km', u.dystans_km,
                                                        'dystans_wlasny_km', u.dystans_wlasny_km, 'zgoda_email', u.zgoda_email, 'wynik_s', u.wynik_s, 'wynik_dystans_km', u.wynik_dystans_km,
                                                        'ukonczony_at', u.ukonczony_at, 'odznaka', u.odznaka, 'regulamin_wersja', u.regulamin_wersja,
                                                        'ranking_zgoda', u.ranking_zgoda_at is not null) order by u.numer)
                     from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = v_ja and u.wycofany_at is null), '[]'::jsonb);
end $function$;
revoke all on function public.akcja_bieg_moi(text) from public, anon;
grant execute on function public.akcja_bieg_moi(text) to authenticated;

-- licznik: pole `bieg` z akcja_bieg_publiczny. Produkcja bywa nowsza od repo (20261105, 20261113): poprawka na ŻYWEJ definicji, tylko gdy kotwica występuje dokładnie raz.
do $$
declare v_def text; v_kotwica text := $k$'firmy_zgloszenia', a.firmy_zgloszenia,$k$; v_n integer;
begin
  v_def := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  if position('akcja_bieg_publiczny' in v_def) > 0 then return; end if;
  v_n := (char_length(v_def) - char_length(replace(v_def, v_kotwica, ''))) / char_length(v_kotwica);
  if v_n <> 1 then raise exception 'akcja_licznik: kotwica % razy zamiast 1 — popraw ręcznie', v_n; end if;
  execute replace(v_def, v_kotwica, $k$'bieg', public.akcja_bieg_publiczny(a.slug), 'firmy_zgloszenia', a.firmy_zgloszenia,$k$);
end $$;

notify pgrst, 'reload schema';
commit;
