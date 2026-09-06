-- Trener moze dopisac KOMENTARZ do logu zawodnika, nie przepisac samego logu.
--
-- DZIURA: po zdjeciu duplikatu `athletes_update_own_logs` (migracja
-- 20260906_zawezenie_polityk_trenera.sql) jedyna droga trenera do UPDATE zostala
-- polityka o nazwie "coach can mark logs read". Wbrew nazwie NIE OGRANICZALA ONA
-- KOLUMN — warunek to samo `athlete_id IN (moi podopieczni)`, wiec trener mogl
-- zmienic kazda z 30 kolumn: dystans, czas, tempo, tetno, samopoczucie,
-- komentarz zawodnika. Zasieg: 3191 wierszy.
--
-- ⚠️ NAZWA OBIECUJACA MNIEJ, NIZ MECHANIZM DAJE, to ta sama klasa co katalog
--    sugerujacy gwarancje (LEKCJE #17) i co skaner pilnujacy jednej z dwoch drog.
--    Dlatego zmieniamy JEDNO I DRUGIE: kolumny triggerem, nazwe polityki na koncu.
--
-- ⚠️ DLACZEGO TRIGGER, A NIE POLITYKA. RLS dziala na WIERSZACH. Trzy kolumny
--    trenerskie da sie oddzielic wylacznie GRANT-em kolumnowym albo triggerem,
--    a GRANT dziala na ROLE — trener i zawodnik to ta sama rola `authenticated`.
--    Ta sama analiza co przy `trainings`; ten trigger jest jej blizniakiem.
--
-- ⚠️ CO SPRAWDZONO: `trener.html` pisze do `training_logs` w TRZECH miejscach
--    i wylacznie te trzy kolumny — saveCoachComment (coach_comment + coach_gif),
--    removeCoachGif (coach_gif) i oznaczanie przeczytanych (read_by_coach).
--    Zero wywolan `.delete()`. Panel nie traci nic.

create or replace function public.training_logs_guard_coach_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $fn$
declare
  uid uuid := auth.uid();
  wlasciciel boolean;
  zmienione text[] := '{}';
begin
  -- Brak JWT => service_role albo SQL admina. `anon` ma na tej tabeli grant,
  -- ale ZADNA polityka go nie obejmuje, wiec pusty uid nie jest tu furtka.
  -- Sprzatanie duplikatow przez `cc` idzie tedy.
  if uid is null then return new; end if;

  -- WLASCICIEL logu moze wszystko — to jego trening i jego zapis.
  select exists (select 1 from athletes a
                 where a.id = old.athlete_id and a.user_id = uid)
    into wlasciciel;
  if wlasciciel then return new; end if;

  -- ⚠️ BIALA LISTA, NIE CZARNA. `training_logs` ma 30 kolumn i bedzie ich
  -- przybywac; czarna lista chronilaby tylko to, co ktos pamietal wpisac w dniu
  -- pisania triggera. Wymieniamy TRZY dozwolone przez POMINIECIE ich tutaj,
  -- a kazda inna zmiane odrzucamy — nowa kolumna jest chroniona domyslnie.
  -- (`array_append`, nie `||` — operator z nieotypowanym literalem PostgreSQL
  --  parsuje jako tablice i wywala 22P02; zlapane samokontrola przy `trainings`.)
  if new.id is distinct from old.id then zmienione := array_append(zmienione, 'id'); end if;
  if new.training_id is distinct from old.training_id then zmienione := array_append(zmienione, 'training_id'); end if;
  if new.athlete_id is distinct from old.athlete_id then zmienione := array_append(zmienione, 'athlete_id'); end if;
  if new.distance_km is distinct from old.distance_km then zmienione := array_append(zmienione, 'distance_km'); end if;
  if new.duration is distinct from old.duration then zmienione := array_append(zmienione, 'duration'); end if;
  if new.pace is distinct from old.pace then zmienione := array_append(zmienione, 'pace'); end if;
  if new.heart_rate is distinct from old.heart_rate then zmienione := array_append(zmienione, 'heart_rate'); end if;
  if new.feel is distinct from old.feel then zmienione := array_append(zmienione, 'feel'); end if;
  if new.comment is distinct from old.comment then zmienione := array_append(zmienione, 'comment'); end if;
  if new.attachment_url is distinct from old.attachment_url then zmienione := array_append(zmienione, 'attachment_url'); end if;
  if new.strava_link is distinct from old.strava_link then zmienione := array_append(zmienione, 'strava_link'); end if;
  if new.logged_at is distinct from old.logged_at then zmienione := array_append(zmienione, 'logged_at'); end if;
  if new.training_type is distinct from old.training_type then zmienione := array_append(zmienione, 'training_type'); end if;
  if new.athlete_reaction is distinct from old.athlete_reaction then zmienione := array_append(zmienione, 'athlete_reaction'); end if;
  if new.elevation_gain is distinct from old.elevation_gain then zmienione := array_append(zmienione, 'elevation_gain'); end if;
  if new.source is distinct from old.source then zmienione := array_append(zmienione, 'source'); end if;
  if new.external_id is distinct from old.external_id then zmienione := array_append(zmienione, 'external_id'); end if;
  if new.external_source is distinct from old.external_source then zmienione := array_append(zmienione, 'external_source'); end if;
  if new.calories is distinct from old.calories then zmienione := array_append(zmienione, 'calories'); end if;
  if new.icu_load is distinct from old.icu_load then zmienione := array_append(zmienione, 'icu_load'); end if;
  if new.cadence is distinct from old.cadence then zmienione := array_append(zmienione, 'cadence'); end if;
  if new.gap_pace is distinct from old.gap_pace then zmienione := array_append(zmienione, 'gap_pace'); end if;
  if new.icu_intensity is distinct from old.icu_intensity then zmienione := array_append(zmienione, 'icu_intensity'); end if;
  if new.card_bg_url is distinct from old.card_bg_url then zmienione := array_append(zmienione, 'card_bg_url'); end if;
  if new.created_at is distinct from old.created_at then zmienione := array_append(zmienione, 'created_at'); end if;
  if new.casual_effort is distinct from old.casual_effort then zmienione := array_append(zmienione, 'casual_effort'); end if;
  if new.planned_training_id is distinct from old.planned_training_id then zmienione := array_append(zmienione, 'planned_training_id'); end if;

  if array_length(zmienione, 1) is null then return new; end if;

  -- 42501 = insufficient_privilege -> PostgREST oddaje 403, nie 500.
  raise exception 'To jest log zawodnika — trenerowi wolno zmienic tylko wlasne pola. Odrzucone: %',
                  array_to_string(zmienione, ', ')
    using errcode = '42501',
          hint = 'Dla trenera otwarte sa: coach_comment, coach_gif, read_by_coach.';
end;
$fn$;

comment on function public.training_logs_guard_coach_fields() is
  'Chroni log zawodnika przed przepisaniem przez trenera. Dla trenera otwarte '
  'WYLACZNIE: coach_comment, coach_gif, read_by_coach — reszta z 30 kolumn '
  'odrzucana (biala lista, wiec nowa kolumna jest chroniona domyslnie). '
  'Przepuszcza: brak JWT (service_role) i WLASCICIELA logu. Powod: polityka '
  'zaweza wiersze, a kolumn RLS zawezic nie umie — GRANT kolumnowy tez nie, bo '
  'trener i zawodnik to ta sama rola authenticated.';

drop trigger if exists trg_training_logs_guard_coach_fields on public.training_logs;
create trigger trg_training_logs_guard_coach_fields
  before update on public.training_logs
  for each row execute function public.training_logs_guard_coach_fields();

-- ── NAZWA POLITYKI MA MOWIC PRAWDE ─────────────────────────────────────────
-- "coach can mark logs read" opisywalo JEDNO z trzech pol i sugerowalo, ze
-- polityka daje tylko tyle. Po dolozeniu triggera zakres jest naprawde waski —
-- ale nazwa ma to mowic sama, bez czytania triggera.
alter policy "coach can mark logs read" on public.training_logs
  rename to "coach_updates_coach_fields";

-- ══ SAMOKONTROLA — WYKONANA 6.09.2026, WYNIK PONIZEJ ══════════════════════
-- ⚠️ SELECT na pg_trigger dowodzi, ze trigger ISTNIEJE. Ze BRONI — dowodzi
--    wylacznie podszycie sie pod uzytkownika. `supabase db query` leci jako
--    `postgres` z rolbypassrls, czyli sciezka, ktora trigger przepuszcza
--    (uid IS NULL); bez `set local role authenticated` kazdy taki test
--    swiecilby na zielono niezaleznie od tresci funkcji.
--        begin; set local role authenticated;
--          set local request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
--          <update>; rollback;
--
--   1. trener zmienia `distance_km` cudzego logu   ODMOWA 42501, nazywa kolumne
--   2. trener zmienia `comment` ZAWODNIKA          ODMOWA 42501, nazywa kolumne
--   3. trener pisze coach_comment+coach_gif+       PRZESZLO, wartosc zapisana
--      read_by_coach naraz
--   4. wlasciciel zmienia wlasny `distance_km`     PRZESZLO
--
-- ⚠️ TEST MUSI CELOWAC W CUDZY LOG. Trener JEST TEZ ZAWODNIKIEM, wiec log
--    nalezacy do niego samego przechodzi galezia `wlasciciel` i test mierzylby
--    wlasnosc zamiast relacji trener-zawodnik. Ta sama pulapka co przy dietach
--    6.09.2026, gdzie pierwsze podejscie dalo falszywe "1 zmieniony".
