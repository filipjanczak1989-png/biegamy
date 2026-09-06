CREATE OR REPLACE FUNCTION public.training_logs_guard_coach_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
$function$
