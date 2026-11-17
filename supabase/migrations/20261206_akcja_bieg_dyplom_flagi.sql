-- BIEG WIRTUALNY: WYNIK ZMIENIONY PRZEZ ORGANIZATORA, „DO SPRAWDZENIA” I NOWA ZASADA RANKINGU (17.11; regulamin 2026-11-v2, § 5 ust. 5, § 9 ust. 2–4). NIE wykonywać przed 20261203.
-- 1. USUNIĘCIE WYNIKU (akcja_bieg_usun_wynik, § 9 ust. 4): tylko trener, bramka i okno jak akcja_bieg_zalicz_recznie (od startu biegu do wynik_do + 7 dni), powód obowiązkowy (3–200 znaków).
--    Uczestnik traci ukończenie: nie ma dyplomu ani miejsca na liście „ukończyli”. Odznaka w kolekcji ZOSTAJE (decyzja do potwierdzenia).
--    Automat i „Wskaż trening” nie przywracają usuniętego wyniku, także po wycofaniu i ponownym zapisie tego samego konta; rodzic nie wpisze dystansu dziecka od nowa.
--    Przywraca tylko organizator: „Zalicz ręcznie” czyści usunięcie.
-- 2. POWIADOMIENIE w dzwonku (notifications, typ 'bieg_wynik', ten sam wyzwalacz push co przy odznace) przy każdej zmianie wyniku przez organizatora: zaliczenie, poprawka, usunięcie,
--    zatwierdzenie i odrzucenie do rankingu. Bez zmiany nic. Zmiany uczestnika („Wskaż inny trening”, dystans dziecka) bez powiadomienia. W treści bez czasu.
-- 3. RANKING (decyzja Filipa 17.11, zastępuje „tylko z zegarka” z 20261203): czas i miejsce ma każdy dorosły ze zgodą na ranking, także z wynikiem wpisanym ręcznie
--    (na liście dalej klucz 'reczny' = dopisek „wynik ręczny”). Dalej tylko trening od dystansu do dystans + 0,49 km (wynik bez treningu: dystans zaliczony).
--    WIARYGODNOŚĆ (akcja_bieg_do_weryfikacji): tempo szybsze niż 3:00/km albo wolniejsze niż 36:00/km (5 km: poniżej 15:00 albo powyżej 3:00:00), także z zegarka
--    = „do weryfikacji”: ukończenie i dyplom są, do rankingu dopiero po „Zatwierdź” w panelu (akcja_bieg_weryfikuj); „Odrzuć” = poza rankingiem i prośba o dowód.
--    Decyzja dotyczy jednego wyniku: zmiana czasu, dystansu albo treningu kasuje ją (wyzwalacz akcja_bieg_weryfikacja_od_nowa).
--    Automat przy tym samym zaliczonym dystansie bierze najpierw trening w zakresie rankingu, potem wiarygodne tempo, potem najlepsze tempo.
-- 4. „Moje zapisy” i panel: wynik_usuniety, wynik_usuniety_powod, do_weryfikacji, weryfikacja; panel też do_sprawdzenia (powody słownie, bez czasu:
--    tempo spoza 3:00–36:00/km, trening ponad 2 razy dłuższy niż dystans biegu, dziecko ponad 21 km).
-- Funkcje bierzemy Z BAZY (pg_get_functiondef) i zmieniamy po kotwicy, jak 20261203: reszta zostaje 1:1, create or replace zachowuje uprawnienia.
-- Test po skutku: tools/akcja-bieg-dyplom-flagi-test.sh (przed wdrożeniem AKCJA_BIEG_DYPLOM_FLAGI_Z_MIGRACJA=1), potem regresja z tools/akcja-bieg-ranking-gps-test.sh
-- (zaktualizowany do tej zasady). Wycofanie: 20261206_WYCOFANIE_akcja_bieg_dyplom_flagi.sql (wraca do stanu po 20261203).
begin;

alter table public.akcja_bieg_uczestnicy
  add column wynik_usuniety_at timestamptz,
  add column wynik_usuniety_powod text constraint akcja_bieg_wynik_usuniety_powod check (wynik_usuniety_powod is null or (char_length(btrim(wynik_usuniety_powod)) between 3 and 200 and wynik_usuniety_powod !~ '[[:cntrl:]]')),
  add column wynik_usuniety_przez uuid references auth.users(id) on delete set null,
  add column weryfikacja text constraint akcja_bieg_weryfikacja check (weryfikacja is null or weryfikacja in ('zatwierdzony', 'odrzucony')),
  add column weryfikacja_at timestamptz,
  add column weryfikacja_przez uuid references auth.users(id) on delete set null;
comment on column public.akcja_bieg_uczestnicy.weryfikacja is 'Decyzja organizatora o wyniku do weryfikacji (tempo spoza 3:00–36:00/km): zatwierdzony = w rankingu, odrzucony = poza rankingiem z prośbą o dowód. NULL = bez decyzji. Zmiana wyniku kasuje decyzję.';
comment on column public.akcja_bieg_uczestnicy.wynik_usuniety_at is 'Organizator usunął wynik (§ 9 ust. 4 regulaminu v2, akcja_bieg_usun_wynik): bez ukończenia, dyplomu i miejsca; automat go nie przywraca. Czyści „Zalicz ręcznie”.';
comment on column public.akcja_bieg_uczestnicy.wynik_usuniety_powod is 'Powód usunięcia wyniku od organizatora; widzi go uczestnik (karta i powiadomienie).';

-- kilometry wyniku: prawdziwy dystans własnego treningu, bez treningu dystans zaliczony
create function public.akcja_bieg_km_wyniku(u public.akcja_bieg_uczestnicy)
 returns numeric
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), u.wynik_dystans_km::numeric);
$function$;
revoke all on function public.akcja_bieg_km_wyniku(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

-- wynik dorosłego z czasem, którego tempo jest spoza 3:00–36:00/km (180–2160 s/km): do rankingu dopiero po zatwierdzeniu
create function public.akcja_bieg_do_weryfikacji(u public.akcja_bieg_uczestnicy)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(u.rodzaj = 'ja' and u.wynik_s > 0 and k.km > 0 and (u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160), false)
    from (select public.akcja_bieg_km_wyniku(u) as km) k;
$function$;
revoke all on function public.akcja_bieg_do_weryfikacji(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

-- czeka na decyzję organizatora: ukończony, w zakresie długości rankingu, tempo do weryfikacji (z decyzją albo bez; status w kolumnie weryfikacja)
create function public.akcja_bieg_czeka_na_weryfikacje(u public.akcja_bieg_uczestnicy)
 returns boolean
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(u.ukonczony_at is not null and u.wycofany_at is null and u.wynik_dystans_km is not null
                  and public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49 and public.akcja_bieg_do_weryfikacji(u), false);
$function$;
revoke all on function public.akcja_bieg_czeka_na_weryfikacje(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

create function public.akcja_bieg_do_sprawdzenia(u public.akcja_bieg_uczestnicy)
 returns text[]
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select case when u.ukonczony_at is null or u.wycofany_at is not null then '{}'::text[] else array_remove(array[
      case when u.rodzaj = 'ja' and u.wynik_s > 0 and k.km > 0 and u.wynik_s < k.km * 180 then 'tempo szybsze niż 3:00/km'
           when u.rodzaj = 'ja' and u.wynik_s > 0 and k.km > 0 and u.wynik_s > k.km * 2160 then 'tempo wolniejsze niż 36:00/km' end,
      case when u.rodzaj = 'ja' and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) then 'trening ponad 2 razy dłuższy niż dystans biegu' end,
      case when u.rodzaj = 'dziecko' and u.dystans_wlasny_km > 21 then 'dziecko: ponad 21 km' end], null) end
    from (select public.akcja_bieg_km_wyniku(u) as km) k;
$function$;
revoke all on function public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

-- zmiana wyniku (czas, dystans, trening) kasuje decyzję o weryfikacji: decyzja dotyczy tego jednego wyniku
create function public.akcja_bieg_weryfikacja_od_nowa()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  new.weryfikacja := null; new.weryfikacja_at := null; new.weryfikacja_przez := null;
  return new;
end $function$;
revoke all on function public.akcja_bieg_weryfikacja_od_nowa() from public, anon, authenticated;
create trigger akcja_bieg_weryfikacja_od_nowa before update of wynik_s, wynik_dystans_km, wynik_log_id on public.akcja_bieg_uczestnicy for each row
  when ((old.wynik_s, old.wynik_dystans_km, old.wynik_log_id) is distinct from (new.wynik_s, new.wynik_dystans_km, new.wynik_log_id) and old.weryfikacja is not null)
  execute function public.akcja_bieg_weryfikacja_od_nowa();

-- „Zatwierdź” / „Odrzuć” wynik do weryfikacji (§ 9 ust. 3): tylko trener, okno jak zaliczenie; odrzucenie = poza rankingiem i prośba o dowód w dzwonku
create function public.akcja_bieg_weryfikuj(p_id uuid, p_decyzja text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; v text := case p_decyzja when 'zatwierdz' then 'zatwierdzony' when 'odrzuc' then 'odrzucony' end;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_bieg_weryfikuj: tylko trener' using errcode = '42501'; end if;
  if v is null then return jsonb_build_object('ok', false, 'powod', 'decyzja'); end if;
  select * into u from public.akcja_bieg_uczestnicy where id = p_id for update;
  if not found or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if u.rodzaj <> 'ja' then return jsonb_build_object('ok', false, 'powod', 'dziecko'); end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  if public.akcja_bieg_faza(b) in ('szkic', 'zapisy') then return jsonb_build_object('ok', false, 'powod', 'przed_biegiem'); end if;
  if (now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then return jsonb_build_object('ok', false, 'powod', 'za_pozno'); end if;
  if u.ukonczony_at is null or u.wynik_s is null then return jsonb_build_object('ok', false, 'powod', 'bez_wyniku'); end if;
  if u.weryfikacja is not distinct from v then return jsonb_build_object('ok', true, 'weryfikacja', v); end if;
  update public.akcja_bieg_uczestnicy set weryfikacja = v, weryfikacja_at = now(), weryfikacja_przez = auth.uid() where id = u.id;
  insert into public.notifications (athlete_id, type, from_athlete_id, message, read, created_at) values (u.konto_id, 'bieg_wynik', null,
    case when v = 'zatwierdzony' then 'Organizator sprawdził Twój wynik w biegu „' || b.nazwa || '”. Przy zgodzie na ranking czas i miejsce są na liście „ukończyli”.'
         else 'Organizator prosi o dowód Twojego wyniku w biegu „' || b.nazwa || '” (np. zapis z zegarka, zrzut z aplikacji). Do czasu sprawdzenia wynik jest poza rankingiem; ukończenie i dyplom zostają. Kontakt na stronie biegu.' end,
    false, now());
  return jsonb_build_object('ok', true, 'weryfikacja', v);
end $function$;
revoke all on function public.akcja_bieg_weryfikuj(uuid, text) from public, anon;
grant execute on function public.akcja_bieg_weryfikuj(uuid, text) to authenticated;

-- powiadomienie o zmianie wyniku przez organizatora: p_stary = wiersz sprzed zmiany; rodzaj zmiany z porównania z wierszem po zmianie, bez zmiany nic
create function public.akcja_bieg_wynik_powiadom(p_stary public.akcja_bieg_uczestnicy)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; v_dz boolean; v_msg text;
begin
  select * into u from public.akcja_bieg_uczestnicy where id = p_stary.id;
  if not found then return; end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  v_dz := u.rodzaj = 'dziecko';
  if u.wynik_usuniety_at is not null and p_stary.wynik_usuniety_at is null then
    v_msg := case when v_dz then 'Organizator usunął wynik dziecka ' || u.imie || ' w biegu „' || b.nazwa || '” (powód: ' || u.wynik_usuniety_powod || '). Dyplomu dziecka już nie ma.'
                  else 'Organizator usunął Twój wynik w biegu „' || b.nazwa || '” (powód: ' || u.wynik_usuniety_powod || '). Dyplomu i miejsca na liście już nie ma.' end
             || ' Jeśli to pomyłka, napisz do organizatora (kontakt na stronie biegu).';
  elsif u.ukonczony_at is not null and p_stary.ukonczony_at is null then
    v_msg := case when v_dz then 'Organizator zaliczył bieg dziecka ' || u.imie || ' („' || b.nazwa || '”).' else 'Organizator zaliczył Twój bieg „' || b.nazwa || '”.' end || ' Dyplom pobierzesz na stronie biegu.';
  elsif u.ukonczony_at is not null and (u.wynik_dystans_km, u.wynik_s, u.dystans_wlasny_km, u.wynik_log_id) is distinct from (p_stary.wynik_dystans_km, p_stary.wynik_s, p_stary.dystans_wlasny_km, p_stary.wynik_log_id) then
    v_msg := case when v_dz then 'Wynik dziecka ' || u.imie || ' w biegu „' || b.nazwa || '” się zmienił' else 'Twój wynik w biegu „' || b.nazwa || '” się zmienił' end || ' (poprawka organizatora), pobierz dyplom jeszcze raz.';
  else
    return;
  end if;
  insert into public.notifications (athlete_id, type, from_athlete_id, message, read, created_at) values (u.konto_id, 'bieg_wynik', null, v_msg, false, now());
end $function$;
revoke all on function public.akcja_bieg_wynik_powiadom(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

-- „Usuń wynik” w panelu trenera (§ 9 ust. 3–4): ukończenie, wynik i dyplom znikają, odznaka w kolekcji zostaje; wiersz zapisu i numer zostają
create function public.akcja_bieg_usun_wynik(p_id uuid, p_powod text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u public.akcja_bieg_uczestnicy; b public.akcja_biegi; v_powod text := btrim(coalesce(p_powod, ''));
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_bieg_usun_wynik: tylko trener' using errcode = '42501'; end if;
  select * into u from public.akcja_bieg_uczestnicy where id = p_id for update;
  if not found or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  select * into b from public.akcja_biegi where id = u.bieg_id;
  if public.akcja_bieg_faza(b) in ('szkic', 'zapisy') then return jsonb_build_object('ok', false, 'powod', 'przed_biegiem'); end if;
  if (now() at time zone 'Europe/Warsaw')::date > b.wynik_do + 7 then return jsonb_build_object('ok', false, 'powod', 'za_pozno'); end if;
  if char_length(v_powod) not between 3 and 200 or v_powod ~ '[[:cntrl:]]' then return jsonb_build_object('ok', false, 'powod', 'zly_powod'); end if;
  if u.ukonczony_at is null then return jsonb_build_object('ok', false, 'powod', 'bez_wyniku'); end if;
  update public.akcja_bieg_uczestnicy
     set ukonczony_at = null, wynik_log_id = null, wynik_s = null, wynik_dystans_km = null, wynik_wskazany = false, zaliczony_przez = null, dystans_wlasny_km = null,
         wynik_usuniety_at = now(), wynik_usuniety_powod = v_powod, wynik_usuniety_przez = auth.uid()
   where id = u.id;
  perform public.akcja_bieg_wynik_powiadom(u);
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.akcja_bieg_usun_wynik(uuid, text) from public, anon;
grant execute on function public.akcja_bieg_usun_wynik(uuid, text) to authenticated;

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;$k$,
       $k$if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if; if exists (select 1 from public.akcja_bieg_uczestnicy x where x.bieg_id = u.bieg_id and x.konto_id = u.konto_id and x.rodzaj = 'ja' and x.wynik_usuniety_at is not null) then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if;$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(x.source is not distinct from 'intervals' and x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc,$k$,
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc, coalesce(public.akcja_bieg_sekundy(x.duration) between x.distance_km * 180 and x.distance_km * 2160, false) desc,$k$),
      ('public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)',
       $k$select public.akcja_bieg_wynik_z_zegarka(u) and u.wynik_dystans_km is not null$k$,
       $k$select u.rodzaj = 'ja' and u.wynik_s is not null and u.wynik_dystans_km is not null and public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49 and coalesce(u.weryfikacja = 'zatwierdzony', not public.akcja_bieg_do_weryfikacji(u))$k$),
      ('public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)',
       $k$and exists (select 1 from public.training_logs l where l.id = u.wynik_log_id and l.distance_km <= u.wynik_dystans_km + 0.49);$k$,
       $k$and u.wynik_dystans_km > 0;$k$),
      ('public.akcja_bieg_dziecko_ukoncz(uuid, numeric)',
       $k$if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$,
       $k$if u.wynik_usuniety_at is not null then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if; if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$),
      ('public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)',
       $k$perform public.akcja_bieg_odznaka(u.id);$k$,
       $k$update public.akcja_bieg_uczestnicy set wynik_usuniety_at = null, wynik_usuniety_powod = null, wynik_usuniety_przez = null where id = u.id and wynik_usuniety_at is not null; perform public.akcja_bieg_wynik_powiadom(u); perform public.akcja_bieg_odznaka(u.id);$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id))$k$,
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod, 'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja)$k$),
      ('public.akcja_bieg_panel(text)',
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null) order by u.numer)$k$,
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null, 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod, 'do_sprawdzenia', to_jsonb(public.akcja_bieg_do_sprawdzenia(u)), 'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja) order by u.numer)$k$)
    ) as t(funkcja, kotwica, nowe)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $migracja$;

commit;
notify pgrst, 'reload schema';
