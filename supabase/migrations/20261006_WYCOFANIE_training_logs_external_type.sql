-- WYCOFANIE 20261006_training_logs_external_type.sql.
--
-- ⚠️ KOLEJNOŚĆ MA ZNACZENIE: najpierw funkcja triggera bez linii external_type, DOPIERO potem
-- drop column — odwrotnie `drop column` wywróci istniejącą funkcję przy pierwszym UPDATE
-- (odwołanie do nieistniejącej kolumny w plpgsql to błąd w czasie wykonania, nie definicji).
-- ⚠️ Przed wykonaniem WYŁĄCZYĆ zapis z EF (intervals-sync, intervals-webhook piszą
-- external_type; po drop column każdy insert z tym polem padnie na PGRST204 / 42703).
-- Dane w kolumnie przepadają — to jest ich jedyne miejsce.

begin;

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

alter table public.training_logs drop column if exists external_type;

commit;
