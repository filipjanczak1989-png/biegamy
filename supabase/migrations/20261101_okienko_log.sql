-- 20261101_okienko_log.sql — log „Zapytaj" (M1, EF okienko): kto pytał, jakie narzędzia, ile tokenów, czy strażnik odrzucił.
--
-- DOSTĘP:
--   * właściciel czyta SWOJE wpisy (SELECT po athletes.user_id = auth.uid());
--   * zapis WYŁĄCZNIE EF okienko kluczem service_role (omija RLS) — authenticated nie ma INSERT/UPDATE/DELETE ani polityk
--     zapisu, więc z przeglądarki wpisu nie da się ani dodać, ani zmienić (limity dzienne liczą się z tej tabeli);
--   * anon: nic. ⚠️ create table w Supabase SAM nadaje anon/authenticated ALL (default privileges — LEKCJE
--     community_stats), dlatego revoke all jest jawny, a asercja niżej to sprawdza.
-- RETENCJA: pg_cron 'okienko-log-30d' codziennie 03:27 UTC kasuje wpisy starsze niż 30 dni (poza oknem kolektorów
--   maszyny wyników 03:17/03:47 — to inna baza, ale ta sama minuta byłaby myląca w logach).
-- KONTO: athlete_id → athletes(id) ON DELETE CASCADE — delete_my_account kasuje athletes na końcu, więc wpisy znikają
--   z kontem bez zmiany tej funkcji.
-- TEKST pytania to dane osoby: trzymamy max 300 znaków (EF tnie), 30 dni, czyta tylko właściciel.
--
-- Wycofanie: 20261101_WYCOFANIE_okienko_log.sql.

begin;

create table if not exists public.okienko_log (
  id                bigint generated always as identity primary key,
  athlete_id        uuid not null references public.athletes(id) on delete cascade,
  kiedy             timestamptz not null default now(),
  tekst             text not null check (char_length(tekst) <= 300),
  narzedzia         text[] not null default '{}',
  tryb              text not null check (tryb in ('router', 'flash', 'limit', 'blad', 'budzet80')),
  tok_we            integer not null default 0 check (tok_we >= 0),
  tok_wy            integer not null default 0 check (tok_wy >= 0),
  ok                boolean not null default true,
  powod_odrzucenia  text
);

create index if not exists okienko_log_athlete_kiedy on public.okienko_log (athlete_id, kiedy desc);
create index if not exists okienko_log_kiedy on public.okienko_log (kiedy);

alter table public.okienko_log enable row level security;

revoke all on public.okienko_log from anon, authenticated;
grant select on public.okienko_log to authenticated;

drop policy if exists okienko_log_wlasciciel_czyta on public.okienko_log;
create policy okienko_log_wlasciciel_czyta on public.okienko_log
  for select to authenticated
  using (athlete_id = (select a.id from public.athletes a where a.user_id = auth.uid() limit 1));

select cron.schedule('okienko-log-30d', '27 3 * * *',
  $job$ delete from public.okienko_log where kiedy < now() - interval '30 days' $job$);

do $$
begin
  if has_table_privilege('anon', 'public.okienko_log', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'okienko_log: anon ma grant — nie wdrażamy';
  end if;
  if has_table_privilege('authenticated', 'public.okienko_log', 'INSERT, UPDATE, DELETE') then
    raise exception 'okienko_log: authenticated może pisać — limity dałoby się obejść, nie wdrażamy';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'okienko_log' and cmd <> 'SELECT') then
    raise exception 'okienko_log: polityka inna niż SELECT — nie wdrażamy';
  end if;
  if not exists (select 1 from cron.job where jobname = 'okienko-log-30d') then
    raise exception 'okienko_log: brak zadania retencji okienko-log-30d';
  end if;
end $$;

commit;
