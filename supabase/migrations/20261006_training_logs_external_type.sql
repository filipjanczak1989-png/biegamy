-- training_logs.external_type — SUROWY typ aktywności z intervals.icu (np. 'Walk',
-- 'OpenWaterSwim', 'WeightTraining'), zapisywany obok zmapowanego `training_type`.
--
-- PO CO (feedback Maćka 14.08, pkt 1b „LUKA W OBSERWOWALNOŚCI"): do 06.10.2026 mapowanie
-- intervals → typ BiegaMy było jednokierunkowe i bezśladowe. Gdy 258 wpisów wpadło jako
-- 'Zastępczy', nie dało się ustalić z bazy, CO przyszło z API — i przez 10 tygodni nikt nie
-- zauważył, że webhook nie ma ACT_MAP. Z tą kolumną każda przyszła pomyłka mapy jest
-- diagnozowalna jednym zapytaniem, a naprawa danych — odtwarzalna (LEKCJE #3: pole ma nieść
-- informację, o której mówi nazwa).
--
-- ⚠️ GRANTU TU NIE MA I TO JEST SPRAWDZONE, NIE POMINIĘTE (ten sam przypadek co
-- 20260816_training_logs_casual_effort.sql i 20260817_training_logs_planned_training_id.sql):
--   migawka supabase/schema/rls/training_logs.txt → `authenticated` ma SELECT TABELOWO,
--   nowa kolumna dziedziczy. `anon` nie ma nic i ma nie mieć. Zapis idzie z EF przez
--   service_role. Kontrola przed wykonaniem (pamięć: granty po ADD COLUMN SPRAWDŹ, nie zakładaj):
--     select unnest(relacl)::text from pg_class where oid = 'public.training_logs'::regclass;
--   oczekiwane: `authenticated=arwdDxtm/postgres` (tabelowo), brak wpisu dla anon.
--
-- ⚠️ TRIGGER training_logs_guard_coach_fields (20260906) porównuje kolumny JAWNIE, po jednej —
-- jego komentarz twierdzi „nowa kolumna chroniona domyślnie", a kod robi odwrotnie: kolumna
-- NIEWYMIENIONA nie jest sprawdzana, więc trener mógłby ją zmienić. Dlatego ta migracja
-- przepisuje funkcję z JEDNĄ dodaną linią (external_type). Zmiana w kodzie funkcji poza tą
-- linią = ZERO (porównaj z supabase/schema/funkcje/training_logs_guard_coach_fields.sql).
--
-- BEZ BACKFILLU: dla ~2616 wierszy sprzed tej migracji surowego typu już nie ma skąd wziąć
-- (intervals_activities to cache „na żądanie", 5 wierszy u Maćka przy 440 logach). NULL =
-- „nie zapisano", nie „brak typu". Ewentualny backfill z API intervals to osobna decyzja
-- (745 wywołań szczegółów — patrz karty-rodzaje-spec, obserwacja 2).
--
-- IDEMPOTENTNA: add column if not exists, create or replace, drop trigger if exists.
-- WYCOFANIE: 20261006_WYCOFANIE_training_logs_external_type.sql

begin;

alter table public.training_logs
  add column if not exists external_type text;

comment on column public.training_logs.external_type is
  'Surowy typ aktywności ze źródła zewnętrznego (intervals.icu: Run, Walk, Ride, OpenWaterSwim…), '
  'zapisywany przez intervals-sync i intervals-webhook obok zmapowanego training_type. NULL = wiersz '
  'sprzed 06.10.2026 albo wpis ręczny. Służy do diagnozy i naprawy mapowania; aplikacja go nie czyta.';

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
  if uid is null then return new; end if;
  select exists (select 1 from athletes a
                 where a.id = old.athlete_id and a.user_id = uid)
    into wlasciciel;
  if wlasciciel then return new; end if;
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
  if new.external_type is distinct from old.external_type then zmienione := array_append(zmienione, 'external_type'); end if;   -- 06.10.2026
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
  raise exception 'To jest log zawodnika — trenerowi wolno zmienic tylko wlasne pola. Odrzucone: %',
                  array_to_string(zmienione, ', ')
    using errcode = '42501',
          hint = 'Dla trenera otwarte sa: coach_comment, coach_gif, read_by_coach.';
end;
$fn$;

comment on function public.training_logs_guard_coach_fields() is
  'Chroni log zawodnika przed przepisaniem przez trenera. Dla trenera otwarte '
  'WYLACZNIE: coach_comment, coach_gif, read_by_coach — reszta z 31 kolumn (od 06.10.2026 '
  'takze external_type) jest sprawdzana JAWNIE, po jednej. Nowa kolumna NIE jest chroniona '
  'domyslnie: trzeba ja tu dopisac. Przepuszcza wlasciciela wiersza i brak JWT (service_role).';

commit;
