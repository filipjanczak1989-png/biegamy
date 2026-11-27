-- 20261232_trasy.sql — kształty tras treningów (T1, plan dzis\spolecznosc\plan-s2.md §1, decyzje Filipa 27.11).
--
-- public.trasy: jeden wiersz na wpis treningu ze śladem GPS. Kształt BEZ WSPÓŁRZĘDNYCH (pudełko 0–1000, polilinia różnic; liczy go
--   supabase/functions/_shared/trasa-ksztalt.mjs przy imporcie z intervals, za flagą TRASY_WLACZONE):
--   ksztalt     — cały ślad (mała trasa w „Ostatnim treningu”), widzi właściciel i jego trener;
--   ksztalt_pub — tylko bieg, z ucięciem 300–500 m wokół startu i mety, co najmniej 2 km; do Społeczności dopiero przez funkcję ze zgodą (T5).
-- ZASADY: RLS włączone; ODCZYT tylko właściciel (athletes.user_id) i jego trener (athletes.coach_id); ZAPIS z przeglądarki żaden (brak polityk
--   i grantów insert/update/delete dla authenticated, anon bez dostępu) — piszą tylko funkcje Edge kluczem serwisowym.
--   Klucz obcy log_id → training_logs: kasowanie wpisu kasuje trasę, a PostgREST może osadzić trasy(ksztalt) w zapytaniu o wpisy (zero nowych zapytań).
--   Limit długości napisów (4000 znaków) i nieujemny dystans pilnują, żeby nikt nie wpisał tu surowego śladu.
-- WAGA: ok. 0,5 kB na trening (oba kształty + narzut), przy dzisiejszym ruchu ok. 3 MB rocznie.
-- STANY: tabeli nie ma → utworzona; jest → zasady (RLS, polityka, granty) ustawione od nowa, dane zostają. Komunikat w wyniku.
--   Wyjątek (nic nie zmienione) tylko, gdy istniejąca tabela ma inne kolumny niż ta wersja (stan częściowy) albo asercje nie przejdą.
-- Test po skutku (w transakcji, zawsze wycofanej): tools/trasy-test.sh (przed wdrożeniem z TR_Z_MIGRACJA=1).
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261232_trasy.sql"
-- Wycofanie: 20261232_WYCOFANIE_trasy.sql (kasuje tabelę; kształty da się policzyć od nowa z intervals).

begin;

create temp table if not exists _trasy_komunikat (komunikat text) on commit drop;
truncate _trasy_komunikat;
insert into _trasy_komunikat
select case when to_regclass('public.trasy') is null then 'utworzono trasy'
            else 'trasy już była: zasady dostępu ustawione od nowa, dane bez zmian' end;

do $$
declare kol text;
begin
  if to_regclass('public.trasy') is not null then
    select string_agg(column_name, ',' order by column_name) into kol from information_schema.columns where table_schema = 'public' and table_name = 'trasy';
    if kol is distinct from 'athlete_id,dystans_m,ksztalt,ksztalt_pub,log_id,utworzono,wersja' then
      raise exception 'trasy: istniejąca tabela ma inne kolumny (%): stan częściowy, nic nie zmienione', kol; end if;
  end if;
end $$;

create table if not exists public.trasy (
  log_id      uuid primary key references public.training_logs(id) on delete cascade,
  athlete_id  uuid not null references public.athletes(id) on delete cascade,
  ksztalt     text not null check (char_length(ksztalt) between 1 and 4000),
  ksztalt_pub text check (ksztalt_pub is null or char_length(ksztalt_pub) between 1 and 4000),
  dystans_m   integer check (dystans_m is null or dystans_m >= 0),
  wersja      smallint not null default 1,
  utworzono   timestamptz not null default now()
);
create index if not exists trasy_athlete_id_idx on public.trasy (athlete_id);
comment on table public.trasy is 'T1 (20261232): kształt trasy treningu bez współrzędnych (0–1000). Odczyt: właściciel i jego trener. Zapis: tylko funkcje Edge.';

alter table public.trasy enable row level security;
revoke all on table public.trasy from public, anon, authenticated;
grant select on table public.trasy to authenticated;
grant select, insert, update, delete on table public.trasy to service_role;

drop policy if exists trasy_odczyt_wlasciciel_trener on public.trasy;
create policy trasy_odczyt_wlasciciel_trener on public.trasy for select to authenticated
  using (athlete_id in (select a.id from public.athletes a where a.user_id = (select auth.uid()) or a.coach_id = (select auth.uid())));

-- ── asercje: przy błędzie wyjątek i nic nie zmienione ──
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.trasy'::regclass) then raise exception 'trasy: RLS wyłączone'; end if;
  if has_table_privilege('anon', 'public.trasy', 'SELECT') or has_table_privilege('anon', 'public.trasy', 'INSERT') then raise exception 'trasy: anon ma dostęp'; end if;
  if not has_table_privilege('authenticated', 'public.trasy', 'SELECT') then raise exception 'trasy: authenticated nie czyta'; end if;
  if has_table_privilege('authenticated', 'public.trasy', 'INSERT') or has_table_privilege('authenticated', 'public.trasy', 'UPDATE')
     or has_table_privilege('authenticated', 'public.trasy', 'DELETE') then raise exception 'trasy: przeglądarka mogłaby pisać'; end if;
  if not (has_table_privilege('service_role', 'public.trasy', 'INSERT') and has_table_privilege('service_role', 'public.trasy', 'UPDATE')) then raise exception 'trasy: funkcje Edge nie mogą pisać'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'trasy') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trasy' and policyname = 'trasy_odczyt_wlasciciel_trener' and cmd = 'SELECT') then
    raise exception 'trasy: inne polityki niż jedna polityka odczytu'; end if;
end $$;

notify pgrst, 'reload schema';

select komunikat from _trasy_komunikat;
commit;
