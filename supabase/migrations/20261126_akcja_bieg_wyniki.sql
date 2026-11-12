-- 20261126_akcja_bieg_wyniki.sql — BIEG WIRTUALNY, ETAP 2 (12/13.11 noc): wyniki, zgoda na e-mail na poziomie konta, ręczne zaliczenie przez trenera, odznaki, przypomnienie, sprzątanie.
--   NIE wykonywać przed 20261120_akcja_bieg.sql. Test po skutku: tools/akcja-bieg-wyniki-test.sh (jedna transakcja, zawsze wycofana). Wycofanie: 20261126_WYCOFANIE_akcja_bieg_wyniki.sql.
--   Cron e-maila osobno (20261128_akcja_bieg_przypomnienie_cron.sql), dopiero po próbie funkcji bieg-przypomnienie z ?test=1.
--
-- WYNIK „ja”: najlepszy pasujący trening z weekendu biegu (bieg albo marsz wg akcja_typ_liczy, dzień Warszawy w dzien_od..dzien_do, dystans ≥ zapisany):
--   najpierw najdłuższy dystans z listy biegu, który trening osiągnął (zapis na 5, zrobione 10 → dyplom na 10), potem najszybsze tempo. Tolerancja GPS 2 %: 9,8 km zalicza 10.
--   Automat: strona przy wejściu (akcja_bieg_wynik_ustal bez treningu) i cron co godzinę (akcja_bieg_automat) dla zapisów bez wyniku w fazie trwa/wyniki.
--   Uczestnik może wskazać inny własny trening z okna (akcja_bieg_treningi_z_okna → akcja_bieg_wynik_ustal z p_log_id). Wpis ręczny = zwykły trening z formularza na Dziś.
--   Czas na dyplomie = czas całego wskazanego treningu (prywatny: nie wychodzi na listę ani do panelu).
-- DZIECKO: rodzic wpisuje „swój dystans” (0,1–100 km), bez czasu.
-- TRENER: lista uczestników (imię, numer, stan; bez czasów, kont i e-maili) i ręczne zaliczenie do wynik_do + 7 dni; bramka auth_is_coach() w ciele funkcji.
-- ODZNAKA zwykła po ukończeniu: achievements.badge_id = 'bieg-<slug>' (konto), dla dziecka 'bieg-<slug>-dziecko-<numer>' w kolekcji rodzica; złota w etapie 3.
-- ZGODA NA E-MAIL: tabela akcja_bieg_zgody (bieg, konto), także dla rodzica, który dopisał tylko dzieci; token do rezygnacji z linku bez logowania (EF bieg-rezygnacja).
-- SPRZĄTANIE: 90 dni po wynik_do wiersze uczestników, zgód i logu wysyłek znikają; w akcja_biegi.podsumowanie zostają liczby, w achievements odznaki.
begin;

-- ── ZGODA NA E-MAIL NA POZIOMIE KONTA W BIEGU ──
create table public.akcja_bieg_zgody (
  bieg_id      uuid not null references public.akcja_biegi(id) on delete cascade,
  konto_id     uuid not null references public.athletes(id) on delete cascade,
  zgoda_email  boolean not null default false,
  token        uuid not null default gen_random_uuid() unique,
  zmieniono_at timestamptz not null default now(),
  primary key (bieg_id, konto_id)
);
comment on table public.akcja_bieg_zgody is 'Zgoda konta na jeden e-mail przypominający dzień przed biegiem (także rodzic z samymi dziećmi). Token = link rezygnacji bez logowania. Bez dostępu z przeglądarki; sprzątane 90 dni po wynik_do.';
alter table public.akcja_bieg_zgody enable row level security;
revoke all on public.akcja_bieg_zgody from public, anon, authenticated;

-- zgody zaznaczone w etapie 1 (wiersz „ja”) przechodzą do konta
insert into public.akcja_bieg_zgody (bieg_id, konto_id, zgoda_email)
  select distinct u.bieg_id, u.konto_id, true from public.akcja_bieg_uczestnicy u where u.rodzaj = 'ja' and u.zgoda_email and u.wycofany_at is null
  on conflict (bieg_id, konto_id) do nothing;

-- zapis „ja” z zaznaczoną zgodą (akcja_bieg_zapisz z etapu 1) dopisuje zgodę konta; odznaczone pole przy zapisie niczego nie cofa
create function public.akcja_bieg_zgoda_z_zapisu()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.rodzaj = 'ja' and new.zgoda_email then
    insert into public.akcja_bieg_zgody (bieg_id, konto_id, zgoda_email) values (new.bieg_id, new.konto_id, true)
      on conflict (bieg_id, konto_id) do update set zgoda_email = true, zmieniono_at = now();
  end if;
  return new;
end $function$;
revoke all on function public.akcja_bieg_zgoda_z_zapisu() from public, anon, authenticated;
create trigger akcja_bieg_zgoda_z_zapisu after insert on public.akcja_bieg_uczestnicy for each row execute function public.akcja_bieg_zgoda_z_zapisu();

-- moja zgoda w biegu (strona): zgoda konta i czy jest choć jeden aktywny zapis (siebie albo dziecka)
create function public.akcja_bieg_moja_zgoda(p_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); b public.akcja_biegi;
begin
  if v_ja is null then raise exception 'akcja_bieg_moja_zgoda: zaloguj się' using errcode = '42501'; end if;
  select * into b from public.akcja_biegi where slug = p_slug;
  if not found then return jsonb_build_object('zgoda_email', false, 'ma_zapis', false); end if;
  return jsonb_build_object(
    'zgoda_email', coalesce((select z.zgoda_email from public.akcja_bieg_zgody z where z.bieg_id = b.id and z.konto_id = v_ja), false),
    'ma_zapis', exists (select 1 from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = v_ja and u.wycofany_at is null));
end $function$;
revoke all on function public.akcja_bieg_moja_zgoda(text) from public, anon;
grant execute on function public.akcja_bieg_moja_zgoda(text) to authenticated;

-- zmiana zgody: konto z aktywnym zapisem w biegu (siebie albo dziecka), w fazie zapisy/trwa/wyniki; kolumna w wierszu „ja” idzie za zgodą konta
create function public.akcja_bieg_zgoda_email(p_slug text, p_zgoda boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); b public.akcja_biegi; v boolean := coalesce(p_zgoda, false);
begin
  if v_ja is null then raise exception 'akcja_bieg_zgoda_email: zaloguj się' using errcode = '42501'; end if;
  select * into b from public.akcja_biegi where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if public.akcja_bieg_faza(b) not in ('zapisy', 'trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'zamkniete'); end if;
  if not exists (select 1 from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = v_ja and u.wycofany_at is null) then
    return jsonb_build_object('ok', false, 'powod', 'brak_zapisu');
  end if;
  insert into public.akcja_bieg_zgody (bieg_id, konto_id, zgoda_email) values (b.id, v_ja, v)
    on conflict (bieg_id, konto_id) do update set zgoda_email = excluded.zgoda_email, zmieniono_at = now();
  update public.akcja_bieg_uczestnicy set zgoda_email = v where bieg_id = b.id and konto_id = v_ja and rodzaj = 'ja';
  return jsonb_build_object('ok', true, 'zgoda_email', v);
end $function$;
revoke all on function public.akcja_bieg_zgoda_email(text, boolean) from public, anon;
grant execute on function public.akcja_bieg_zgoda_email(text, boolean) to authenticated;

-- rezygnacja z linku w e-mailu, bez logowania: token z wiadomości; tylko rola serwisowa (EF bieg-rezygnacja, jeden RPC). Oddaje nazwę biegu do komunikatu.
create function public.akcja_bieg_rezygnacja(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare z public.akcja_bieg_zgody; v_nazwa text;
begin
  if p_token is null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  update public.akcja_bieg_zgody set zgoda_email = false, zmieniono_at = now() where token = p_token returning * into z;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  update public.akcja_bieg_uczestnicy set zgoda_email = false where bieg_id = z.bieg_id and konto_id = z.konto_id and rodzaj = 'ja';
  select b.nazwa into v_nazwa from public.akcja_biegi b where b.id = z.bieg_id;
  return jsonb_build_object('ok', true, 'nazwa', v_nazwa);
end $function$;
revoke all on function public.akcja_bieg_rezygnacja(uuid) from public, anon, authenticated;
grant execute on function public.akcja_bieg_rezygnacja(uuid) to service_role;

-- ── WYNIKI ──
-- „45:30” / „1:02:05” / „5400” → sekundy; nic sensownego → null (training_logs.duration to tekst: „H:MM:SS” z zegarka, „MM:SS” albo „H:MM:SS” z formularza)
create function public.akcja_bieg_sekundy(p_tekst text)
 returns integer
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_tekst ~ '^\s*\d{1,6}\s*$' then nullif(btrim(p_tekst)::integer, 0)
    when p_tekst ~ '^\s*\d{1,2}:[0-5]\d:[0-5]\d\s*$' then split_part(btrim(p_tekst), ':', 1)::integer * 3600 + split_part(btrim(p_tekst), ':', 2)::integer * 60 + split_part(btrim(p_tekst), ':', 3)::integer
    when p_tekst ~ '^\s*\d{1,3}:[0-5]\d\s*$' then split_part(btrim(p_tekst), ':', 1)::integer * 60 + split_part(btrim(p_tekst), ':', 2)::integer
    else null end;
$function$;
revoke all on function public.akcja_bieg_sekundy(text) from public, anon, authenticated;

-- największy dystans z listy biegu osiągnięty przez trening (tolerancja GPS 2 %); null = żaden
create function public.akcja_bieg_dystans_zaliczony(p_dystanse integer[], p_km numeric)
 returns integer
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select max(d) from unnest(p_dystanse) d where p_km >= d * 0.98;
$function$;
revoke all on function public.akcja_bieg_dystans_zaliczony(integer[], numeric) from public, anon, authenticated;

-- odznaka biegu w kolekcji konta (raz), dla dziecka osobne id z numerem; powiadomienie w dzwonku tylko przy nowej. Złota: etap 3.
create function public.akcja_bieg_odznaka(p_uczestnik uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; v_id text; v_n integer;
begin
  select * into u from public.akcja_bieg_uczestnicy where id = p_uczestnik;
  if not found or u.ukonczony_at is null then return; end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  v_id := 'bieg-' || b.slug || case when u.rodzaj = 'dziecko' then '-dziecko-' || u.numer else '' end;
  insert into public.achievements (athlete_id, badge_id) select u.konto_id, v_id
    where not exists (select 1 from public.achievements a where a.athlete_id = u.konto_id and a.badge_id = v_id);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.notifications (athlete_id, type, from_athlete_id, message, read, created_at)
      values (u.konto_id, 'badge', null, case when u.rodzaj = 'dziecko' then 'Odznaka dla ' || u.imie || ': ' || b.nazwa || ' 🏅' else 'Zdobyłeś odznakę: ' || b.nazwa || ' 🏅' end, false, now());
  end if;
end $function$;
revoke all on function public.akcja_bieg_odznaka(uuid) from public, anon, authenticated;

-- rdzeń wyniku „ja” bez sprawdzania konta i fazy (wołają: akcja_bieg_wynik_ustal za konto, akcja_bieg_automat z crona). Bez treningu w oknie: ok=false, nic się nie zmienia.
create function public.akcja_bieg_wynik_z_treningu(p_uczestnik uuid, p_log_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; l record;
begin
  select * into u from public.akcja_bieg_uczestnicy where id = p_uczestnik for update;
  if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  select x.id, x.distance_km, public.akcja_bieg_sekundy(x.duration) as s, public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) as d into l
    from public.training_logs x
   where x.athlete_id = u.konto_id and x.distance_km > 0
     and coalesce(x.training_type, '') not like '\_\_badge\_\_%' and public.akcja_typ_liczy(x.training_type, x.external_type)
     and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do
     and public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) >= u.dystans_km
     and (p_log_id is null or x.id = p_log_id)
   order by public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) desc,
            (public.akcja_bieg_sekundy(x.duration) is null),
            public.akcja_bieg_sekundy(x.duration)::numeric / x.distance_km asc,
            x.logged_at
   limit 1;
  if not found then return jsonb_build_object('ok', false, 'powod', 'brak_treningu', 'dystans_km', u.dystans_km); end if;
  update public.akcja_bieg_uczestnicy
     set wynik_log_id = l.id, wynik_s = case when l.s between 60 and 86400 then l.s end, wynik_dystans_km = l.d, zaliczony_przez = null,
         ukonczony_at = coalesce(ukonczony_at, now()), odznaka = case when odznaka = 'zlota' then 'zlota' else 'zwykla' end
   where id = u.id;
  perform public.akcja_bieg_odznaka(u.id);
  return jsonb_build_object('ok', true, 'wynik_s', case when l.s between 60 and 86400 then l.s end, 'wynik_dystans_km', l.d, 'log_id', l.id);
end $function$;
revoke all on function public.akcja_bieg_wynik_z_treningu(uuid, uuid) from public, anon, authenticated;

-- wynik „ja” za konto: automat (bez p_log_id) albo wskazany własny trening z okna; tylko w fazie trwa/wyniki
create function public.akcja_bieg_wynik_ustal(p_id uuid, p_log_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); u public.akcja_bieg_uczestnicy; b public.akcja_biegi; v_faza text;
begin
  if v_ja is null then raise exception 'akcja_bieg_wynik_ustal: zaloguj się' using errcode = '42501'; end if;
  select * into u from public.akcja_bieg_uczestnicy where id = p_id;
  if not found or u.konto_id <> v_ja or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_twoj'); end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  v_faza := public.akcja_bieg_faza(b);
  if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;
  return public.akcja_bieg_wynik_z_treningu(u.id, p_log_id);
end $function$;
revoke all on function public.akcja_bieg_wynik_ustal(uuid, uuid) from public, anon;
grant execute on function public.akcja_bieg_wynik_ustal(uuid, uuid) to authenticated;

-- własne treningi z okna biegu do „wskaż inny trening”: id, dzień, km, czas, dystans z listy, który zalicza (null = za krótki); tylko wołającego
create function public.akcja_bieg_treningi_z_okna(p_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); b public.akcja_biegi;
begin
  if v_ja is null then raise exception 'akcja_bieg_treningi_z_okna: zaloguj się' using errcode = '42501'; end if;
  select * into b from public.akcja_biegi where slug = p_slug;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'dzien', (x.logged_at at time zone 'Europe/Warsaw')::date, 'km', x.distance_km, 'czas_s', public.akcja_bieg_sekundy(x.duration),
                                                       'typ', x.training_type, 'zalicza_km', public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km)) order by x.logged_at)
    from public.training_logs x
   where x.athlete_id = v_ja and x.distance_km > 0 and coalesce(x.training_type, '') not like '\_\_badge\_\_%' and public.akcja_typ_liczy(x.training_type, x.external_type)
     and (x.logged_at at time zone 'Europe/Warsaw')::date between b.dzien_od and b.dzien_do), '[]'::jsonb);
end $function$;
revoke all on function public.akcja_bieg_treningi_z_okna(text) from public, anon;
grant execute on function public.akcja_bieg_treningi_z_okna(text) to authenticated;

-- automat z crona: zapisy „ja” bez wyniku w biegach w fazie trwa/wyniki; zwraca liczbę ustalonych
create function public.akcja_bieg_automat()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r record; n integer := 0;
begin
  for r in select u.id from public.akcja_bieg_uczestnicy u join public.akcja_biegi b on b.id = u.bieg_id
            where b.status = 'otwarty' and public.akcja_bieg_faza(b) in ('trwa', 'wyniki') and u.rodzaj = 'ja' and u.wycofany_at is null and u.ukonczony_at is null loop
    if (public.akcja_bieg_wynik_z_treningu(r.id, null)->>'ok')::boolean then n := n + 1; end if;
  end loop;
  return n;
end $function$;
revoke all on function public.akcja_bieg_automat() from public, anon, authenticated;
grant execute on function public.akcja_bieg_automat() to service_role;

-- dziecko: rodzic wpisuje „swój dystans” (0,1–100 km), bez czasu; tylko własne dziecko, w fazie trwa/wyniki; można poprawić
create function public.akcja_bieg_dziecko_ukoncz(p_id uuid, p_dystans_km numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_ja uuid := public.auth_my_athlete_id(); u public.akcja_bieg_uczestnicy; b public.akcja_biegi; v_faza text;
begin
  if v_ja is null then raise exception 'akcja_bieg_dziecko_ukoncz: zaloguj się' using errcode = '42501'; end if;
  select * into u from public.akcja_bieg_uczestnicy where id = p_id for update;
  if not found or u.konto_id <> v_ja or u.rodzaj <> 'dziecko' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_twoj'); end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  v_faza := public.akcja_bieg_faza(b);
  if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;
  if p_dystans_km is null or p_dystans_km < 0.1 or p_dystans_km > 100 then return jsonb_build_object('ok', false, 'powod', 'dystans'); end if;
  update public.akcja_bieg_uczestnicy set dystans_wlasny_km = round(p_dystans_km, 2), ukonczony_at = coalesce(ukonczony_at, now()), zaliczony_przez = null,
         odznaka = case when odznaka = 'zlota' then 'zlota' else 'zwykla' end where id = u.id;
  perform public.akcja_bieg_odznaka(u.id);
  return jsonb_build_object('ok', true, 'dystans_wlasny_km', round(p_dystans_km, 2));
end $function$;
revoke all on function public.akcja_bieg_dziecko_ukoncz(uuid, numeric) from public, anon;
grant execute on function public.akcja_bieg_dziecko_ukoncz(uuid, numeric) to authenticated;

-- ── PANEL TRENERA ──
-- ręczne zaliczenie: „ja” na dystans z listy biegu, dziecko na własny dystans; czas opcjonalny (prywatny, tylko na dyplomie); do wynik_do + 7 dni
create function public.akcja_bieg_zalicz_recznie(p_id uuid, p_dystans_km numeric, p_wynik_s integer default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_bieg_zalicz_recznie: tylko trener' using errcode = '42501'; end if;
  select * into u from public.akcja_bieg_uczestnicy where id = p_id for update;
  if not found or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  if public.akcja_bieg_faza(b) in ('szkic', 'zapisy') then return jsonb_build_object('ok', false, 'powod', 'przed_biegiem'); end if;
  if (now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then return jsonb_build_object('ok', false, 'powod', 'za_pozno'); end if;
  if p_wynik_s is not null and (u.rodzaj = 'dziecko' or p_wynik_s not between 60 and 86400) then return jsonb_build_object('ok', false, 'powod', 'czas'); end if;
  if u.rodzaj = 'ja' then
    if p_dystans_km is null or p_dystans_km <> trunc(p_dystans_km) or not (p_dystans_km::integer = any(b.dystanse_km)) then return jsonb_build_object('ok', false, 'powod', 'dystans'); end if;
    update public.akcja_bieg_uczestnicy set wynik_dystans_km = p_dystans_km::integer, wynik_s = p_wynik_s, wynik_log_id = null, ukonczony_at = coalesce(ukonczony_at, now()),
           zaliczony_przez = auth.uid(), odznaka = case when odznaka = 'zlota' then 'zlota' else 'zwykla' end where id = u.id;
  else
    if p_dystans_km is null or p_dystans_km < 0.1 or p_dystans_km > 100 then return jsonb_build_object('ok', false, 'powod', 'dystans'); end if;
    update public.akcja_bieg_uczestnicy set dystans_wlasny_km = round(p_dystans_km, 2), ukonczony_at = coalesce(ukonczony_at, now()), zaliczony_przez = auth.uid(),
           odznaka = case when odznaka = 'zlota' then 'zlota' else 'zwykla' end where id = u.id;
  end if;
  perform public.akcja_bieg_odznaka(u.id);
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.akcja_bieg_zalicz_recznie(uuid, numeric, integer) from public, anon;
grant execute on function public.akcja_bieg_zalicz_recznie(uuid, numeric, integer) to authenticated;

-- lista dla trenera: biegi akcji do wyboru i uczestnicy wskazanego (domyślnie najnowszego): imię, numer, rodzaj, dystanse, stan; bez czasów, kont i e-maili
create function public.akcja_bieg_panel(p_slug text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare b public.akcja_biegi;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_bieg_panel: tylko trener' using errcode = '42501'; end if;
  if p_slug is null then select * into b from public.akcja_biegi order by dzien_od desc, utworzono desc limit 1;
  else select * into b from public.akcja_biegi where slug = p_slug; end if;
  if not found then return jsonb_build_object('biegi', '[]'::jsonb, 'bieg', null, 'uczestnicy', '[]'::jsonb); end if;
  return jsonb_build_object(
    'biegi', coalesce((select jsonb_agg(jsonb_build_object('slug', x.slug, 'nazwa', x.nazwa, 'dzien_od', x.dzien_od, 'faza', public.akcja_bieg_faza(x)) order by x.dzien_od desc) from public.akcja_biegi x), '[]'::jsonb),
    'bieg', jsonb_build_object('slug', b.slug, 'nazwa', b.nazwa, 'dzien_od', b.dzien_od, 'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do, 'dystanse_km', to_jsonb(b.dystanse_km),
                               'faza', public.akcja_bieg_faza(b), 'status', b.status, 'zalicz_do', b.wynik_do + 7, 'posprzatany', b.podsumowanie is not null,
                               'zgody_email', (select count(*) from public.akcja_bieg_zgody z where z.bieg_id = b.id and z.zgoda_email), 'maile_na_dobe', 90, 'maile_dob', 2),
    'uczestnicy', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'numer', u.numer, 'imie', u.imie, 'rodzaj', u.rodzaj, 'dystans_km', u.dystans_km,
        'dystans_wlasny_km', u.dystans_wlasny_km, 'wynik_dystans_km', u.wynik_dystans_km, 'ukonczony', u.ukonczony_at is not null, 'zaliczony_recznie', u.zaliczony_przez is not null,
        'z_treningu', u.wynik_log_id is not null, 'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null) order by u.numer)
      from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id), '[]'::jsonb));
end $function$;
revoke all on function public.akcja_bieg_panel(text) from public, anon;
grant execute on function public.akcja_bieg_panel(text) to authenticated;

-- ── E-MAIL DZIEŃ PRZED (EF bieg-przypomnienie, tylko rola serwisowa) ──
create table public.akcja_bieg_maile (
  id         uuid primary key default gen_random_uuid(),
  bieg_id    uuid not null references public.akcja_biegi(id) on delete cascade,
  konto_id   uuid not null references public.athletes(id) on delete cascade,
  rodzaj     text not null default 'przypomnienie' check (rodzaj in ('przypomnienie')),
  wyslano_at timestamptz not null default now(),
  blad       text,
  unique (bieg_id, konto_id, rodzaj)
);
comment on table public.akcja_bieg_maile is 'Log wysyłek e-maila dzień przed biegiem: blokada podwójnej wysyłki. Bez adresów. Sprzątany razem z uczestnikami 90 dni po wynik_do.';
alter table public.akcja_bieg_maile enable row level security;
revoke all on public.akcja_bieg_maile from public, anon, authenticated;

-- odbiorcy: konta ze zgodą konta i choć jednym aktywnym zapisem (także same dzieci); adres z auth.users tylko tutaj; token do linku rezygnacji.
-- DWIE DOBY (decyzja 13.11): dwa dni przed startem od 18:00 i dzień przed startem od 8:00 (czas polski); bieg w sobotę = czwartek wieczór i piątek rano.
-- LIMIT DOBOWY 90 (Resend: 100 na dobę na całe konto, 10 zostaje dla innych e-maili): ile wolnych miejsc dziś, liczy log wysyłek wszystkich biegów z tej doby.
-- Kolejność: najwcześniejsza zgoda pierwsza. Ponad 180 zgód część osób nie dostanie e-maila: panel trenera ostrzega. p_teraz i p_limit (najwyżej 90) dla testów.
create function public.akcja_bieg_do_przypomnienia(p_teraz timestamptz default now(), p_limit integer default 90)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_dzis date := (p_teraz at time zone 'Europe/Warsaw')::date; v_godz time := (p_teraz at time zone 'Europe/Warsaw')::time; v_wolne integer;
begin
  v_wolne := greatest(0, least(coalesce(p_limit, 90), 90)
                         - (select count(*)::integer from public.akcja_bieg_maile m where (m.wyslano_at at time zone 'Europe/Warsaw')::date = v_dzis));
  if v_wolne = 0 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(r.o order by r.kolejnosc) from (
    select row_number() over (order by b.dzien_od, z.zmieniono_at, z.konto_id) as kolejnosc,
           jsonb_build_object('bieg_id', b.id, 'slug', b.slug, 'nazwa', b.nazwa, 'dzien_od', b.dzien_od, 'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do, 'dni_do_biegu', b.dzien_od - v_dzis,
                              'konto_id', z.konto_id, 'email', au.email, 'token', z.token, 'uczestnicy', x.lista) as o
    from public.akcja_biegi b
    join public.akcja_bieg_zgody z on z.bieg_id = b.id and z.zgoda_email
    join lateral (select jsonb_agg(jsonb_build_object('imie', u.imie, 'numer', u.numer, 'rodzaj', u.rodzaj, 'dystans_km', u.dystans_km) order by u.numer) as lista
                    from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.konto_id = z.konto_id and u.wycofany_at is null) x on x.lista is not null
    join public.athletes a on a.id = z.konto_id
    join auth.users au on au.id = a.user_id
   where b.status = 'otwarty' and au.email is not null
     and ((b.dzien_od = v_dzis + 2 and v_godz >= time '18:00') or (b.dzien_od = v_dzis + 1 and v_godz >= time '08:00'))
     and not exists (select 1 from public.akcja_bieg_maile m where m.bieg_id = b.id and m.konto_id = z.konto_id and m.rodzaj = 'przypomnienie')
   order by b.dzien_od, z.zmieniono_at, z.konto_id
   limit v_wolne) r), '[]'::jsonb);
end $function$;
revoke all on function public.akcja_bieg_do_przypomnienia(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.akcja_bieg_do_przypomnienia(timestamptz, integer) to service_role;

create function public.akcja_bieg_mail_zapisz(p_bieg_id uuid, p_konto_id uuid, p_blad text default null)
 returns void
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  insert into public.akcja_bieg_maile (bieg_id, konto_id, blad) values (p_bieg_id, p_konto_id, left(p_blad, 300))
    on conflict (bieg_id, konto_id, rodzaj) do update set wyslano_at = now(), blad = excluded.blad;
$function$;
revoke all on function public.akcja_bieg_mail_zapisz(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.akcja_bieg_mail_zapisz(uuid, uuid, text) to service_role;

-- ── SPRZĄTANIE 90 DNI PO wynik_do ──
alter table public.akcja_biegi add column podsumowanie jsonb;
comment on column public.akcja_biegi.podsumowanie is 'Liczby zbiorcze zapisane przy sprzątaniu (90 dni po wynik_do), gdy wiersze uczestników już nie istnieją. NULL = dane jeszcze w tabeli uczestników.';

create function public.akcja_bieg_liczby(p_bieg uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'zapisani', count(*) filter (where u.wycofany_at is null),
    'zapisani_na', coalesce((select jsonb_object_agg(d::text, n) from (select y.dystans_km d, count(*) n from public.akcja_bieg_uczestnicy y where y.bieg_id = p_bieg and y.wycofany_at is null and y.rodzaj = 'ja' group by 1) q), '{}'::jsonb),
    'dzieci', count(*) filter (where u.wycofany_at is null and u.rodzaj = 'dziecko'),
    'ukonczyli_n', count(*) filter (where u.wycofany_at is null and u.ukonczony_at is not null),
    'zlote', count(*) filter (where u.wycofany_at is null and u.odznaka = 'zlota'))
  from public.akcja_bieg_uczestnicy u where u.bieg_id = p_bieg;
$function$;
revoke all on function public.akcja_bieg_liczby(uuid) from public, anon, authenticated;

create function public.akcja_bieg_sprzatanie()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
revoke all on function public.akcja_bieg_sprzatanie() from public, anon, authenticated;
grant execute on function public.akcja_bieg_sprzatanie() to service_role;

-- publiczne liczby biegu: po sprzątaniu z podsumowania (wersja 20261120 liczyła tylko z wierszy uczestników)
create or replace function public.akcja_bieg_publiczny(p_akcja_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare b public.akcja_biegi; v jsonb;
begin
  select * into b from public.akcja_biegi where akcja_slug = p_akcja_slug and status <> 'szkic' order by dzien_od desc, utworzono desc limit 1;
  if not found then return null; end if;
  v := coalesce(b.podsumowanie, public.akcja_bieg_liczby(b.id));
  return jsonb_build_object(
    'slug', b.slug, 'nazwa', b.nazwa, 'dzien_od', b.dzien_od, 'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do,
    'dystanse_km', to_jsonb(b.dystanse_km), 'faza', public.akcja_bieg_faza(b), 'regulamin_wersja', b.regulamin_wersja,
    'organizator_rodzaj', b.organizator_rodzaj, 'wsparcie_kwoty_zl', to_jsonb(b.wsparcie_kwoty_zl), 'limit_dzieci', b.limit_dzieci,
    'zapisani', coalesce((v->>'zapisani')::integer, 0), 'zapisani_na', coalesce(v->'zapisani_na', '{}'::jsonb), 'dzieci', coalesce((v->>'dzieci')::integer, 0),
    'ukonczyli_n', coalesce((v->>'ukonczyli_n')::integer, 0), 'zlote', coalesce((v->>'zlote')::integer, 0));
end $function$;
revoke all on function public.akcja_bieg_publiczny(text) from public, anon, authenticated, service_role;

-- ── CRON (samo SQL, bez sieci): automat wyników co godzinę, sprzątanie raz na dobę ──
select cron.schedule('akcja-bieg-automat', '25 * * * *', $job$ select public.akcja_bieg_automat(); $job$);
select cron.schedule('akcja-bieg-sprzatanie', '43 3 * * *', $job$ select public.akcja_bieg_sprzatanie(); $job$);

notify pgrst, 'reload schema';
commit;
