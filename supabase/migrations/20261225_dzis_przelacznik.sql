-- 20261225_dzis_przelacznik.sql — nowe Dziś, etap E0 (plan 13.11 §1, decyzja Filipa 23.11): przełącznik widoczności per konto, wzorem Okienka 2.0.
--   * dzis_ustawienia  — nowe_wlaczone / nowe_dla_wszystkich (oba 'false'). POWRÓT jednym poleceniem, bez migracji:
--                        update public.dzis_ustawienia set wartosc = 'false', zmieniono = now() where klucz = 'nowe_wlaczone';
--   * dzis_nowe_konta  — lista kont z nowym Dziś (user_id → auth.users ON DELETE CASCADE). Migracja ma PUSTĄ listę: bez UUID, e-maili i imion
--                        (repo publiczne); konto dopisuje Filip poleceniem poza repo;
--   * dzis_wersja()    — RPC dla zalogowanych: 'stary' | 'nowy' (SECURITY DEFINER; jedyna droga odczytu dwóch tabel wyżej).
-- Przełącznik służy WYŁĄCZNIE widoczności, nie jest zabezpieczeniem (Filip 23.11): nowe Dziś czyta i pisze to samo co stare, a RPC zwraca tylko słowo.
-- DOSTĘP: anon nic; authenticated tylko EXECUTE dzis_wersja(). ⚠️ create table w Supabase SAM nadaje anon/authenticated ALL (default privileges),
--   dlatego odebranie jest jawne, a asercje niżej to sprawdzają. Bez polityk RLS: tabel nie czyta nikt poza funkcją.
-- Test po skutku (w transakcji, zawsze wycofanej): tools/dzis-przelacznik-test.sh (przed wdrożeniem z DZIS_PRZELACZNIK_Z_MIGRACJA=1).
-- Wycofanie: 20261225_WYCOFANIE_dzis_przelacznik.sql (front bez funkcji = stary ekran dla wszystkich).

begin;

do $$ begin
  if to_regclass('public.dzis_ustawienia') is not null or to_regprocedure('public.dzis_wersja()') is not null then
    raise exception '20261225: przełącznik Dziś już jest (migracja weszła wcześniej)';
  end if;
end $$;

create table public.dzis_ustawienia (
  klucz      text primary key check (klucz in ('nowe_wlaczone', 'nowe_dla_wszystkich')),
  wartosc    text not null check (wartosc in ('true', 'false')),
  zmieniono  timestamptz not null default now()
);
insert into public.dzis_ustawienia (klucz, wartosc) values ('nowe_wlaczone', 'false'), ('nowe_dla_wszystkich', 'false');

create table public.dzis_nowe_konta (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  od       timestamptz not null default now(),
  kto      text not null check (char_length(kto) between 1 and 60)
);

alter table public.dzis_ustawienia enable row level security;
alter table public.dzis_nowe_konta enable row level security;
revoke all on public.dzis_ustawienia from public, anon, authenticated;
revoke all on public.dzis_nowe_konta from public, anon, authenticated;

create function public.dzis_wersja()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select case
    when coalesce((select u.wartosc from public.dzis_ustawienia u where u.klucz = 'nowe_wlaczone'), 'false') <> 'true' then 'stary'
    when coalesce((select u.wartosc from public.dzis_ustawienia u where u.klucz = 'nowe_dla_wszystkich'), 'false') = 'true' then 'nowy'
    when auth.uid() is not null and exists (select 1 from public.dzis_nowe_konta k where k.user_id = auth.uid()) then 'nowy'
    else 'stary' end
$fn$;
comment on function public.dzis_wersja() is 'Nowe Dziś E0: ''nowy'' gdy nowe_wlaczone i (nowe_dla_wszystkich albo konto na liście dzis_nowe_konta); inaczej ''stary''. Tylko widoczność.';
revoke all on function public.dzis_wersja() from public, anon, authenticated;
grant execute on function public.dzis_wersja() to authenticated;

-- ── asercje ──
do $$
declare t text;
begin
  foreach t in array array['dzis_ustawienia', 'dzis_nowe_konta'] loop
    if has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE') then raise exception '%: anon ma uprawnienia — nie wdrażamy', t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE') then raise exception '%: authenticated czyta albo pisze wprost — ma tylko RPC', t; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception '%: RLS wyłączone', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then raise exception '%: polityka na tabeli bez uprawnień — niepotrzebna', t; end if;
  end loop;
  if has_function_privilege('anon', 'public.dzis_wersja()', 'EXECUTE') then raise exception 'dzis_wersja: anon może wołać — nie wdrażamy'; end if;
  if not has_function_privilege('authenticated', 'public.dzis_wersja()', 'EXECUTE') then raise exception 'dzis_wersja: authenticated nie może wołać'; end if;
  if (select count(*) from public.dzis_nowe_konta) <> 0 then raise exception 'dzis_nowe_konta: migracja ma pustą listę'; end if;
  if public.dzis_wersja() <> 'stary' then raise exception 'dzis_wersja: po migracji ma zwracać stary'; end if;
end $$;

notify pgrst, 'reload schema';

commit;
