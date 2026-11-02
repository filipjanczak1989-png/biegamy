-- WYNIKI — etap 2 (2.11.2026, OK Filipa; docs/projekt-wyniki-jak-manager-2026-11-02.md §3 + decyzje 2.11 wieczór):
--   1) public.wyniki_zgloszone — wynik startu zgłoszony przez zawodnika albo trenera. Oficjalne wyniki żyją w F6 i ta tabela ich NIE
--      zastępuje (rekordy, odznaki, pb_* nigdy stąd). RLS: swój / trener swoich / profil publiczny (jak athletes_read_public);
--      CHECK tempa 2:20–20:00/km; UNIQUE (athlete_id, data, dystans_km); kolumny systemowe tylko przez RPC wynik_zgloszony_dopasuj.
--   2) athletes.f6_runner_key — poszerzony CHECK i RPC o klucze „k:<nazwisko>|<rocznik>" (wiersze bez id ze źródła; decyzja Filipa).
--   3) delete_my_account — kasuje wyniki_zgloszone (athletes jest anonimizowane, nie kasowane).
-- Test: tools/wyniki-zgloszone-test.sh (transakcja wycofana; RLS PO SKUTKU dla 3 kont — LEKCJE #19). Wycofanie: 20261102_WYCOFANIE_wyniki_zgloszone.sql.
begin;

create table public.wyniki_zgloszone (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references public.athletes(id) on delete cascade,
  nazwa_imprezy       text not null check (char_length(nazwa_imprezy) between 3 and 200),
  data                date not null,
  miejscowosc         text check (miejscowosc is null or char_length(miejscowosc) <= 80),
  dystans_km          numeric(6,3) not null check (dystans_km between 0.5 and 400),
  czas_s              integer not null check (czas_s between 60 and 360000),
  impreza_klucz       text check (impreza_klucz is null or impreza_klucz ~ '^(kalendarz|biegamy|wyniki|zgloszenie):[A-Za-z0-9:._-]{1,120}$'),
  race_id             uuid references public.races(id) on delete set null,
  zrodlo              text not null check (zrodlo in ('zawodnik','trener')),
  wpisal_user_id      uuid not null default auth.uid(),
  uwagi               text check (uwagi is null or char_length(uwagi) <= 300),
  stan                text not null default 'zgloszony' check (stan in ('zgloszony','zastapiony')),
  oficjalny_result_id text check (oficjalny_result_id is null or oficjalny_result_id ~ '^[A-Za-z0-9:._-]{1,120}$'),
  oficjalny_czas_s    integer check (oficjalny_czas_s is null or oficjalny_czas_s between 60 and 360000),
  roznica_pct         numeric(6,2),
  dopasowano_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint wz_tempo_rozsadne check (czas_s::numeric / dystans_km between 140 and 1200),   -- 2:20–20:00 /km
  constraint wz_jeden_na_start unique (athlete_id, data, dystans_km)
);
comment on table public.wyniki_zgloszone is 'Wyniki startów zgłoszone ręcznie (zawodnik/trener). Etykieta „zgłoszony", bez miejsca; oficjalny z F6 zastępuje (stan=zastapiony, wartości informacyjne). Nie wchodzi do rekordów ani odznak.';
create index wz_athlete_data on public.wyniki_zgloszone (athlete_id, data desc);
create index wz_impreza on public.wyniki_zgloszone (impreza_klucz) where impreza_klucz is not null;
create index wz_race on public.wyniki_zgloszone (race_id) where race_id is not null;

-- data nie z przyszłości: CHECK nie może użyć current_date (STABLE) → BEFORE INSERT/UPDATE
create function public.wz_data_nie_z_przyszlosci() returns trigger language plpgsql set search_path = public as $$
begin
  if new.data > current_date then raise exception 'wynik z przyszłości' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger wz_data_nie_z_przyszlosci before insert or update on public.wyniki_zgloszone for each row execute function public.wz_data_nie_z_przyszlosci();

-- kolumny systemowe tylko przez RPC dopasowania (wzorzec athletes_f6_klucz_tylko_rpc + training_logs_guard_coach_fields)
create function public.wz_guard_systemowe() returns trigger language plpgsql set search_path = public as $$
declare zm text[] := '{}';
begin
  if coalesce(current_setting('biegamy.wz_rpc', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.athlete_id is distinct from old.athlete_id then zm := array_append(zm, 'athlete_id'); end if;
    if new.zrodlo is distinct from old.zrodlo then zm := array_append(zm, 'zrodlo'); end if;
    if new.wpisal_user_id is distinct from old.wpisal_user_id then zm := array_append(zm, 'wpisal_user_id'); end if;
    if new.stan is distinct from old.stan then zm := array_append(zm, 'stan'); end if;
    if new.oficjalny_result_id is distinct from old.oficjalny_result_id or new.oficjalny_czas_s is distinct from old.oficjalny_czas_s
       or new.roznica_pct is distinct from old.roznica_pct or new.dopasowano_at is distinct from old.dopasowano_at then zm := array_append(zm, 'oficjalny_*'); end if;
  elsif new.stan <> 'zgloszony' or new.oficjalny_result_id is not null or new.oficjalny_czas_s is not null or new.roznica_pct is not null or new.dopasowano_at is not null then
    zm := array_append(zm, 'oficjalny_*');
  end if;
  if array_length(zm, 1) is null then return new; end if;
  raise exception 'wyniki_zgloszone: kolumny systemowe tylko przez wynik_zgloszony_dopasuj(). Odrzucone: %', array_to_string(zm, ', ') using errcode = '42501';
end $$;
create trigger wz_guard_systemowe before insert or update on public.wyniki_zgloszone for each row execute function public.wz_guard_systemowe();

-- dopasowanie z oficjalnym (wartości informacyjne — rekordy liczy F6, nie ta tabela)
create function public.wynik_zgloszony_dopasuj(p_id uuid, p_result_id text, p_czas_s integer) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ath uuid; v_czas integer;
begin
  if auth.uid() is null then raise exception 'brak sesji' using errcode = '42501'; end if;
  if p_result_id !~ '^[A-Za-z0-9:._-]{1,120}$' or p_czas_s is null or p_czas_s not between 60 and 360000 then raise exception 'złe dane' using errcode = '22023'; end if;
  select athlete_id, czas_s into v_ath, v_czas from public.wyniki_zgloszone where id = p_id;
  if v_ath is null then raise exception 'brak wiersza' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.athletes a where a.id = v_ath and (a.user_id = auth.uid() or a.coach_id = auth.uid())) then
    raise exception 'nie Twój wynik' using errcode = '42501'; end if;
  perform set_config('biegamy.wz_rpc', '1', true);
  update public.wyniki_zgloszone set stan = 'zastapiony', oficjalny_result_id = p_result_id, oficjalny_czas_s = p_czas_s,
    roznica_pct = round(abs(v_czas - p_czas_s)::numeric / p_czas_s * 100, 2), dopasowano_at = now() where id = p_id;
  perform set_config('biegamy.wz_rpc', '', true);
end $$;

-- RLS (widoczność jak profil: publiczny → wszyscy zalogowani; prywatny → sam + trener)
alter table public.wyniki_zgloszone enable row level security;
create policy wz_read_own      on public.wyniki_zgloszone for select to authenticated using (athlete_id = public.auth_my_athlete_id());
create policy wz_read_by_coach on public.wyniki_zgloszone for select to authenticated using (athlete_id in (select id from public.athletes where coach_id = auth.uid()));
create policy wz_read_public   on public.wyniki_zgloszone for select to authenticated using (exists (select 1 from public.athletes a where a.id = athlete_id and a.is_public = true));
create policy wz_insert_own    on public.wyniki_zgloszone for insert to authenticated with check (athlete_id = public.auth_my_athlete_id() and zrodlo = 'zawodnik' and wpisal_user_id = auth.uid());
create policy wz_insert_coach  on public.wyniki_zgloszone for insert to authenticated with check (zrodlo = 'trener' and wpisal_user_id = auth.uid() and athlete_id in (select id from public.athletes where coach_id = auth.uid()));
create policy wz_update_own    on public.wyniki_zgloszone for update to authenticated using (athlete_id = public.auth_my_athlete_id()) with check (athlete_id = public.auth_my_athlete_id());
create policy wz_update_coach  on public.wyniki_zgloszone for update to authenticated using (athlete_id in (select id from public.athletes where coach_id = auth.uid())) with check (athlete_id in (select id from public.athletes where coach_id = auth.uid()));
create policy wz_delete_own    on public.wyniki_zgloszone for delete to authenticated using (athlete_id = public.auth_my_athlete_id());
create policy wz_delete_coach  on public.wyniki_zgloszone for delete to authenticated using (athlete_id in (select id from public.athletes where coach_id = auth.uid()));

-- granty: najpierw odebrać wszystko (create table w Supabase nadaje anonowi ALL z default privileges), potem dokładnie tyle, ile trzeba
revoke all on public.wyniki_zgloszone from public, anon, authenticated;
grant select, insert, update, delete on public.wyniki_zgloszone to authenticated;
revoke all on function public.wynik_zgloszony_dopasuj(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.wynik_zgloszony_dopasuj(uuid, text, integer) to authenticated;
revoke all on function public.wz_guard_systemowe() from public, anon, authenticated;
revoke all on function public.wz_data_nie_z_przyszlosci() from public, anon, authenticated;

-- 2) klucze k:<nazwisko>|<rocznik> (decyzja Filipa 2.11)
alter table public.athletes drop constraint if exists athletes_f6_runner_key_check;
alter table public.athletes add constraint athletes_f6_runner_key_check check (f6_runner_key is null or f6_runner_key ~ '^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$|^k:[^|]{2,60}\|[0-9]{4}$');
create or replace function public.ustaw_f6_runner_key(p_key text) returns void
  language plpgsql security definer
  set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'brak sesji' using errcode = '42501'; end if;
  if p_key is not null and p_key !~ '^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$|^k:[^|]{2,60}\|[0-9]{4}$' then
    raise exception 'zły klucz biegacza' using errcode = '22023';
  end if;
  perform set_config('biegamy.f6_rpc', '1', true);
  update public.athletes set f6_runner_key = p_key where user_id = auth.uid();
  perform set_config('biegamy.f6_rpc', '', true);
end $$;

-- 3) delete_my_account z nową tabelą (pełna definicja z migawki + jedna linia)
create or replace function public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_athlete_id uuid;
  v_email      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Brak zalogowanego użytkownika';
  END IF;

  IF EXISTS (SELECT 1 FROM public.coaches WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Konto trenera nie może być usunięte tą drogą';
  END IF;

  SELECT id    INTO v_athlete_id FROM public.athletes WHERE user_id = v_uid;
  SELECT email INTO v_email      FROM auth.users      WHERE id      = v_uid;

  DELETE FROM public.wellness            WHERE athlete_id = v_athlete_id;

  DELETE FROM public.training_logs       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.push_subscriptions  WHERE athlete_id = v_athlete_id;
  DELETE FROM public.ai_reports          WHERE athlete_id = v_athlete_id;
  DELETE FROM public.ai_alerts           WHERE athlete_id = v_athlete_id;
  DELETE FROM public.achievements        WHERE athlete_id = v_athlete_id;
  DELETE FROM public.game_scores         WHERE athlete_id = v_athlete_id;
  DELETE FROM public.intervals_activities   WHERE athlete_id = v_athlete_id;
  DELETE FROM public.intervals_connections  WHERE athlete_id = v_athlete_id;
  DELETE FROM public.intervals_credentials  WHERE athlete_id = v_athlete_id;
  DELETE FROM public.strava_activities   WHERE athlete_id = v_athlete_id;
  DELETE FROM public.trainings           WHERE athlete_id = v_athlete_id;
  DELETE FROM public.training_plans      WHERE athlete_id = v_athlete_id;
  DELETE FROM public.race_signups        WHERE athlete_id = v_athlete_id;
  DELETE FROM public.wyniki_zgloszone    WHERE athlete_id = v_athlete_id;   -- B (2.11): athletes nie jest kasowane, tylko anonimizowane
  DELETE FROM public.coach_athlete_notes WHERE athlete_id = v_athlete_id;
  DELETE FROM public.profile_posts       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.notifications       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.follows             WHERE follower_id = v_athlete_id OR following_id = v_athlete_id;
  DELETE FROM public.friendships         WHERE requester_id = v_athlete_id OR addressee_id = v_athlete_id;

  DELETE FROM public.log_comments        WHERE athlete_id = v_athlete_id;
  DELETE FROM public.log_reactions       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.delivered_moments   WHERE athlete_id = v_athlete_id;

  DELETE FROM public.messages            WHERE athlete_id = v_athlete_id;
  DELETE FROM public.peer_messages       WHERE from_id = v_athlete_id OR to_id = v_athlete_id;

  DELETE FROM public.duels               WHERE challenger_id = v_athlete_id
                                            OR opponent_id   = v_athlete_id
                                            OR winner_id     = v_athlete_id;

  DELETE FROM public.athlete_intake_forms
    WHERE created_athlete_id = v_athlete_id
       OR (v_email IS NOT NULL AND email = v_email);

  DELETE FROM public.nutrition_profiles WHERE athlete_id = v_uid;
  DELETE FROM public.nutrition_meals    WHERE athlete_id = v_uid;
  DELETE FROM public.ai_usage_log       WHERE athlete_id = v_uid;
  DELETE FROM public.radio_playlists    WHERE owner_id   = v_uid;
  DELETE FROM public.radio_likes        WHERE user_id    = v_uid;

  DELETE FROM public.radio_comments     WHERE user_id    = v_uid;
  DELETE FROM public.radio_plays        WHERE user_id    = v_uid;

  DELETE FROM public.recipe_favorites   WHERE athlete_id = v_uid
                                           OR athlete_id = v_athlete_id;

  UPDATE public.client_errors SET user_id = NULL WHERE user_id = v_uid;

  IF v_athlete_id IS NOT NULL THEN
    UPDATE public.athletes SET
      full_name = 'Usunięty użytkownik',
      email = NULL, phone = NULL, date_of_birth = NULL, avatar_url = NULL, city = NULL,
      pb_5k = NULL, pb_10k = NULL, pb_half = NULL, pb_marathon = NULL,
      race_goals = NULL, goal = NULL, target_race = NULL, target_date = NULL,
      link_strava = NULL, link_garmin = NULL, link_instagram = NULL, link_facebook = NULL,
      coach_message = NULL, coach_message_at = NULL,
      klaudiusz_brief = NULL, profile_data = NULL, tdee = NULL,
      strava_access_token = NULL, strava_refresh_token = NULL,
      strava_athlete_id = NULL, strava_token_expires_at = NULL, strava_connected_at = NULL,
      is_public = false, active = false,
      email_reports_enabled = false, auto_report_enabled = false, auto_monthly_enabled = false,
      coach_id = NULL
    WHERE id = v_athlete_id;
  END IF;

  UPDATE public.profiles SET
    full_name = 'Usunięty użytkownik',
    avatar_url = NULL
  WHERE id = v_uid;

  DELETE FROM auth.identities      WHERE user_id = v_uid;
  DELETE FROM auth.sessions        WHERE user_id = v_uid;
  DELETE FROM auth.refresh_tokens  WHERE user_id = v_uid::text;
  DELETE FROM auth.one_time_tokens WHERE user_id = v_uid;
  DELETE FROM auth.mfa_factors     WHERE user_id = v_uid;

  DELETE FROM auth.oauth_authorizations  WHERE user_id = v_uid;
  DELETE FROM auth.oauth_consents        WHERE user_id = v_uid;
  DELETE FROM auth.webauthn_challenges   WHERE user_id = v_uid;
  DELETE FROM auth.webauthn_credentials  WHERE user_id = v_uid;

  UPDATE auth.users SET
    email = 'deleted+' || v_uid::text || '@deleted.invalid',
    phone = NULL,
    raw_user_meta_data = '{}'::jsonb,
    banned_until = '9999-12-31 23:59:59+00'::timestamptz,
    updated_at = now()
  WHERE id = v_uid;

  INSERT INTO public.account_deletions_audit (uid, deleted_at) VALUES (v_uid, now());
END;
$function$;

do $$
begin
  if has_table_privilege('anon', 'public.wyniki_zgloszone', 'select') then raise exception 'wyniki_zgloszone: anon ma SELECT'; end if;
  if has_function_privilege('anon', 'public.wynik_zgloszony_dopasuj(uuid,text,integer)', 'execute') then raise exception 'anon ma EXECUTE'; end if;
  if not has_function_privilege('authenticated', 'public.wynik_zgloszony_dopasuj(uuid,text,integer)', 'execute') then raise exception 'authenticated bez EXECUTE'; end if;
  if (select count(*) from pg_policies where tablename = 'wyniki_zgloszone') <> 9 then raise exception 'wyniki_zgloszone: polityki'; end if;
  if not (select rowsecurity from pg_tables where tablename = 'wyniki_zgloszone') then raise exception 'wyniki_zgloszone: RLS'; end if;
  if position('wyniki_zgloszone' in pg_get_functiondef('public.delete_my_account()'::regprocedure)) = 0 then raise exception 'delete_my_account bez wyniki_zgloszone'; end if;
  if not exists (select 1 from pg_constraint where conname = 'athletes_f6_runner_key_check' and pg_get_constraintdef(oid) like '%k:%') then raise exception 'f6_runner_key: CHECK bez k:'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
