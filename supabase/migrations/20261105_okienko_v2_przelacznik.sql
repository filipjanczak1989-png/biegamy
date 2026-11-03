-- 20261105_okienko_v2_przelacznik.sql — Okienko 2.0, etap E0 (docs/projekt-okienko-2-0-2026-11-03.md §2, OK Filipa 3.11):
--   * okienko_ustawienia   — v2_wlaczone / v2_dla_wszystkich (POWRÓT JEDNYM PRZEŁĄCZNIKIEM: v2_wlaczone='false');
--   * okienko_v2_konta     — lista kont, które front kieruje do EF okienko-v2 (Filip + konto testowe);
--   * okienko_wersja()     — RPC dla zalogowanych: 'v1' | 'v2' (SECURITY DEFINER; jedyna droga odczytu dwóch tabel wyżej);
--   * okienko_v2_log       — log v2 jak okienko_log + intencja, pewnosc, plan, ms (opóźnienie), samosprawdzenie, ocena (kciuki, E7);
--   * okienko_v2_rozmowa   — pamięć rozmowy (E4): 5 ostatnich tur ≤ 30 min, czyta/pisze WYŁĄCZNIE EF kluczem service.
-- DOSTĘP: anon nic; authenticated: SELECT własnych wierszy okienko_v2_log i EXECUTE okienko_wersja() — nic więcej
--   (ustawienia i konta czyta tylko RPC, rozmowa tylko EF). ⚠️ create table w Supabase SAM nadaje anon/authenticated ALL
--   (default privileges — LEKCJE community_stats), dlatego revoke all jest jawny, a asercje niżej to sprawdzają.
-- RETENCJA: pg_cron okienko-v2-log-30d (03:29 UTC), okienko-v2-rozmowa-1d (03:31 UTC) — minuty inne niż 03:27 (okienko_log)
--   i 03:17/03:47 (kolektory maszyny wyników, inna baza), żeby logi crona dało się czytać.
-- KONTO: athlete_id → athletes ON DELETE CASCADE — delete_my_account kasuje athletes, wpisy znikają bez zmiany funkcji.
-- Test po skutku (RLS, RPC dla trzech kont, w transakcji z rollbackiem): tools/okienko-v2-test.sh.
-- Wycofanie: 20261105_WYCOFANIE_okienko_v2_przelacznik.sql.

begin;

-- ── przełącznik ──
create table if not exists public.okienko_ustawienia (
  klucz      text primary key check (klucz ~ '^[a-z0-9_]{1,40}$'),
  wartosc    text not null check (char_length(wartosc) <= 200),
  zmieniono  timestamptz not null default now()
);
insert into public.okienko_ustawienia (klucz, wartosc) values ('v2_wlaczone', 'true'), ('v2_dla_wszystkich', 'false')
  on conflict (klucz) do nothing;

create table if not exists public.okienko_v2_konta (
  athlete_id  uuid primary key references public.athletes(id) on delete cascade,
  od          timestamptz not null default now(),
  kto         text not null check (char_length(kto) between 1 and 60)
);
insert into public.okienko_v2_konta (athlete_id, kto) values
  ('56092926-2cf1-44b6-952f-38614497fdc2', 'Filip — konto główne'),
  ('9c2df65c-6a46-410e-ad5f-474e5d973ec9', 'konto testowe (próba akcji)')
  on conflict (athlete_id) do nothing;

alter table public.okienko_ustawienia enable row level security;
alter table public.okienko_v2_konta enable row level security;
revoke all on public.okienko_ustawienia from anon, authenticated;
revoke all on public.okienko_v2_konta from anon, authenticated;

create or replace function public.okienko_wersja()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select case
    when coalesce((select u.wartosc from public.okienko_ustawienia u where u.klucz = 'v2_wlaczone'), 'false') <> 'true' then 'v1'
    when coalesce((select u.wartosc from public.okienko_ustawienia u where u.klucz = 'v2_dla_wszystkich'), 'false') = 'true' then 'v2'
    when auth.uid() is not null
         and exists (select 1 from public.okienko_v2_konta k where k.athlete_id = public.auth_my_athlete_id()) then 'v2'
    else 'v1' end
$fn$;
comment on function public.okienko_wersja() is 'Okienko 2.0 E0: ''v2'' gdy v2_wlaczone i (v2_dla_wszystkich albo konto na liście okienko_v2_konta); inaczej ''v1''. Czyta tylko RPC.';
revoke all on function public.okienko_wersja() from public, anon, authenticated;
grant execute on function public.okienko_wersja() to authenticated;

-- ── log v2 ──
create table if not exists public.okienko_v2_log (
  id                bigint generated always as identity primary key,
  athlete_id        uuid not null references public.athletes(id) on delete cascade,
  kiedy             timestamptz not null default now(),
  tekst             text not null check (char_length(tekst) <= 300),
  narzedzia         text[] not null default '{}',
  tryb              text not null check (tryb in ('router', 'flash', 'siec', 'siec-cache', 'osoba', 'impreza', 'limit', 'blad', 'budzet80', 'v2', 'v2-awaria', 'v2-niepewne')),
  tok_we            integer not null default 0 check (tok_we >= 0),
  tok_wy            integer not null default 0 check (tok_wy >= 0),
  zapytania_sieci   integer not null default 0 check (zapytania_sieci >= 0),
  ok                boolean not null default true,
  powod_odrzucenia  text check (powod_odrzucenia is null or char_length(powod_odrzucenia) <= 500),
  intencja          text check (intencja is null or intencja ~ '^[a-z_]{1,40}$'),
  pewnosc           numeric(3,2) check (pewnosc is null or (pewnosc >= 0 and pewnosc <= 1)),
  plan              text[] not null default '{}',
  ms                integer check (ms is null or ms >= 0),
  samosprawdzenie   boolean,
  ocena             smallint check (ocena is null or ocena in (-1, 1))
);
create index if not exists okienko_v2_log_athlete_kiedy on public.okienko_v2_log (athlete_id, kiedy desc);
create index if not exists okienko_v2_log_kiedy on public.okienko_v2_log (kiedy);
alter table public.okienko_v2_log enable row level security;
revoke all on public.okienko_v2_log from anon, authenticated;
grant select on public.okienko_v2_log to authenticated;
drop policy if exists okienko_v2_log_wlasciciel_czyta on public.okienko_v2_log;
create policy okienko_v2_log_wlasciciel_czyta on public.okienko_v2_log
  for select to authenticated
  using (athlete_id = (select a.id from public.athletes a where a.user_id = auth.uid() limit 1));
select cron.schedule('okienko-v2-log-30d', '29 3 * * *',
  $job$ delete from public.okienko_v2_log where kiedy < now() - interval '30 days' $job$);

-- ── pamięć rozmowy (E4) ──
create table if not exists public.okienko_v2_rozmowa (
  id          bigint generated always as identity primary key,
  athlete_id  uuid not null references public.athletes(id) on delete cascade,
  kiedy       timestamptz not null default now(),
  intencja    text not null check (intencja ~ '^[a-z_]{1,40}$'),
  sloty       jsonb not null default '{}'::jsonb check (pg_column_size(sloty) <= 2000)
);
create index if not exists okienko_v2_rozmowa_athlete_kiedy on public.okienko_v2_rozmowa (athlete_id, kiedy desc);
alter table public.okienko_v2_rozmowa enable row level security;
revoke all on public.okienko_v2_rozmowa from anon, authenticated;
select cron.schedule('okienko-v2-rozmowa-1d', '31 3 * * *',
  $job$ delete from public.okienko_v2_rozmowa where kiedy < now() - interval '1 day' $job$);

-- ── asercje ──
do $$
declare t text;
begin
  foreach t in array array['okienko_ustawienia', 'okienko_v2_konta', 'okienko_v2_log', 'okienko_v2_rozmowa'] loop
    if has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE') then
      raise exception '%: anon ma grant — nie wdrażamy', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT, UPDATE, DELETE') then
      raise exception '%: authenticated może pisać — nie wdrażamy', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception '%: RLS wyłączone', t;
    end if;
  end loop;
  foreach t in array array['okienko_ustawienia', 'okienko_v2_konta', 'okienko_v2_rozmowa'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception '%: authenticated czyta wprost — ma czytać tylko RPC / EF', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception '%: polityka na tabeli bez grantów — niepotrzebna', t;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'okienko_v2_log') <> 1
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'okienko_v2_log' and cmd <> 'SELECT') then
    raise exception 'okienko_v2_log: ma być dokładnie jedna polityka SELECT';
  end if;
  if has_function_privilege('anon', 'public.okienko_wersja()', 'EXECUTE') then
    raise exception 'okienko_wersja: anon może wołać — nie wdrażamy';
  end if;
  if not has_function_privilege('authenticated', 'public.okienko_wersja()', 'EXECUTE') then
    raise exception 'okienko_wersja: authenticated nie może wołać';
  end if;
  if (select count(*) from public.okienko_v2_konta) < 2 then
    raise exception 'okienko_v2_konta: brak dwóch kont (Filip + testowe)';
  end if;
  if public.okienko_wersja() <> 'v1' then   -- bez sesji (auth.uid() null) i bez v2_dla_wszystkich → v1
    raise exception 'okienko_wersja: bez sesji ma zwracać v1';
  end if;
  if (select count(*) from cron.job where jobname in ('okienko-v2-log-30d', 'okienko-v2-rozmowa-1d')) <> 2 then
    raise exception 'brak zadań retencji okienko-v2-*';
  end if;
end $$;

commit;
