-- BIEG WIRTUALNY: WYNIK ZMIENIONY PRZEZ ORGANIZATORA I FLAGA „DO SPRAWDZENIA” (17.11; regulamin 2026-11-v2, § 9 ust. 3 i 4). NIE wykonywać przed 20261203.
-- 1. USUNIĘCIE WYNIKU (akcja_bieg_usun_wynik): tylko trener, bramka i okno jak akcja_bieg_zalicz_recznie (od weekendu biegu do wynik_do + 7 dni), powód obowiązkowy (3–200 znaków).
--    Uczestnik traci ukończenie: nie ma dyplomu ani miejsca na liście „ukończyli”. Odznaka w kolekcji ZOSTAJE (decyzja do potwierdzenia).
--    Automat i „Wskaż trening” nie przywracają usuniętego wyniku, także po wycofaniu i ponownym zapisie tego samego konta; rodzic nie wpisze dystansu dziecka od nowa.
--    Przywraca tylko organizator: „Zalicz ręcznie” czyści usunięcie.
-- 2. POWIADOMIENIE w dzwonku (notifications, typ 'bieg_wynik', ten sam wyzwalacz push co przy odznace) przy każdej zmianie wyniku przez organizatora: zaliczenie, poprawka, usunięcie.
--    „Popraw” bez zmiany wyniku nie wysyła nic. Zmiany uczestnika („Wskaż inny trening”, dystans dziecka) bez powiadomienia. W treści bez czasu.
-- 3. „Moje zapisy”: klucze wynik_usuniety i wynik_usuniety_powod (karta bez dyplomu, z powodem). Panel: te same klucze i do_sprawdzenia.
-- 4. FLAGA (akcja_bieg_do_sprawdzenia): liczona w bazie, do panelu idą tylko powody słownie, bez czasu i bez dystansu treningu. Progi: tempo szybsze niż 3:00/km;
--    szybciej niż 2:30/km (poniżej rekordu świata, zastępuje poprzedni powód); trening ponad 2 razy dłuższy niż dystans biegu; dziecko ponad 21 km. Nic nie usuwa samo.
-- Funkcje bierzemy Z BAZY (pg_get_functiondef) i zmieniamy po jednej kotwicy, jak 20261203: reszta zostaje 1:1, create or replace zachowuje uprawnienia.
-- Test po skutku: tools/akcja-bieg-dyplom-flagi-test.sh (przed wdrożeniem AKCJA_BIEG_DYPLOM_FLAGI_Z_MIGRACJA=1). Wycofanie: 20261206_WYCOFANIE_akcja_bieg_dyplom_flagi.sql.
begin;

alter table public.akcja_bieg_uczestnicy
  add column wynik_usuniety_at timestamptz,
  add column wynik_usuniety_powod text constraint akcja_bieg_wynik_usuniety_powod check (wynik_usuniety_powod is null or (char_length(btrim(wynik_usuniety_powod)) between 3 and 200 and wynik_usuniety_powod !~ '[[:cntrl:]]')),
  add column wynik_usuniety_przez uuid references auth.users(id) on delete set null;
comment on column public.akcja_bieg_uczestnicy.wynik_usuniety_at is 'Organizator usunął wynik (§ 9 ust. 3–4 regulaminu v2, akcja_bieg_usun_wynik): bez ukończenia, dyplomu i miejsca; automat go nie przywraca. Czyści „Zalicz ręcznie”.';
comment on column public.akcja_bieg_uczestnicy.wynik_usuniety_powod is 'Powód usunięcia wyniku od organizatora; widzi go uczestnik (karta i powiadomienie).';

create function public.akcja_bieg_do_sprawdzenia(u public.akcja_bieg_uczestnicy)
 returns text[]
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select case when u.ukonczony_at is null or u.wycofany_at is not null then '{}'::text[] else array_remove(array[
      case when u.rodzaj = 'ja' and u.wynik_s > 0 and k.km > 0 and u.wynik_s < k.km * 150 then 'szybciej niż 2:30/km (poniżej rekordu świata)'
           when u.rodzaj = 'ja' and u.wynik_s > 0 and k.km > 0 and u.wynik_s < k.km * 180 then 'tempo szybsze niż 3:00/km' end,
      case when u.rodzaj = 'ja' and k.km > 2 * coalesce(u.wynik_dystans_km, u.dystans_km) then 'trening ponad 2 razy dłuższy niż dystans biegu' end,
      case when u.rodzaj = 'dziecko' and u.dystans_wlasny_km > 21 then 'dziecko: ponad 21 km' end], null) end
    from (select coalesce((select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), u.wynik_dystans_km::numeric) as km) k;
$function$;
revoke all on function public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy) from public, anon, authenticated;

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
      ('public.akcja_bieg_dziecko_ukoncz(uuid, numeric)',
       $k$if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$,
       $k$if u.wynik_usuniety_at is not null then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if; if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$),
      ('public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)',
       $k$perform public.akcja_bieg_odznaka(u.id);$k$,
       $k$update public.akcja_bieg_uczestnicy set wynik_usuniety_at = null, wynik_usuniety_powod = null, wynik_usuniety_przez = null where id = u.id and wynik_usuniety_at is not null; perform public.akcja_bieg_wynik_powiadom(u); perform public.akcja_bieg_odznaka(u.id);$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id))$k$,
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod)$k$),
      ('public.akcja_bieg_panel(text)',
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null) order by u.numer)$k$,
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null, 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod, 'do_sprawdzenia', to_jsonb(public.akcja_bieg_do_sprawdzenia(u))) order by u.numer)$k$)
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
