-- UZUPEŁNIENIA SCHEMATU, KTÓRYCH `supabase db dump` NIE ZABIERA (tylko odczyt z PROD).
-- Zmierzone 8.10.2026 (`supabase db dump --dry-run`): dump wyklucza schematy auth, storage, cron, net, vault,
-- realtime. Na prod z tych obszarów jest w użyciu:
--   · 8 bucketów storage (konfiguracja, nie pliki) · 19 polityk na storage.objects
--   · trigger auth.users.on_auth_user_created → public.handle_new_user · publikacja realtime: public.athletes
-- Zmierzone 9.10 na zrzucie: publikację zrzut JUŻ MA (ALTER PUBLICATION … ADD TABLE athletes) — wykonanie padało
-- na „already member". Bucketów, polityk storage i triggera na auth.users w zrzucie jest 0.
-- Dlatego KAŻDA instrukcja jest warunkowa względem stanu bazy docelowej (buckety: on conflict, polityki i
-- publikacja: if not exists, trigger: create or replace) — idempotentna wobec zrzutu i wobec ponowienia.
-- DEPARSOWANIE PRZY PUSTYM search_path: pg_get_expr/pg_get_triggerdef pomijają schemat wszystkiego, co jest
-- widoczne w search_path sesji — „FROM athletes", „uid()" wykonane na bazie z innym search_path padają
-- („function uid() does not exist", 9.10). `supabase db query` przyjmuje JEDNĄ instrukcję (osobnego SET nie ma
-- jak wysłać), więc set_config(…, true) siedzi w CASE WHEN przed każdym deparsowaniem — WHEN liczy się przed THEN.
-- Wynik: wiersze DDL (kolumna ddl), które tools/test-env/zaloz-baze-testowa.sh wykonuje na bazie TESTOWEJ.
-- NIE obejmuje (świadomie): zadań cron (wołałyby AI co godzinę), sekretów vault (wartości tworzy skrypt),
-- plików w bucketach, użytkowników auth, ustawień Auth (Site URL, providerzy) — patrz docs/srodowisko-testowe.md.
select ddl from (
  select 1 as k, id as s, format(
    'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L::boolean, %s, %s) on conflict (id) do nothing;',
    id, name, public::text, coalesce(file_size_limit::text, 'null'), coalesce(quote_literal(allowed_mime_types::text) || '::text[]', 'null')) as ddl
  from storage.buckets
  union all
  select 2, p.polname, format(
    'do $u$ begin if not exists (select 1 from pg_catalog.pg_policies where schemaname = %L and tablename = %L and policyname = %L) then create policy %I on storage.objects as %s for %s to %s%s%s; end if; end $u$;',
    'storage', 'objects', p.polname,
    p.polname,
    case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
    case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
    case when p.polroles = '{0}' then 'public'
         else (select string_agg(quote_ident(r.rolname), ', ' order by r.rolname) from pg_roles r where r.oid = any (p.polroles)) end,
    case when p.polqual is null then ''
         when set_config('search_path', '', true) = '' then ' using (' || pg_get_expr(p.polqual, p.polrelid) || ')' end,
    case when p.polwithcheck is null then ''
         when set_config('search_path', '', true) = '' then ' with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')' end)
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass
  union all
  select 3, t.tgname, regexp_replace(
    case when set_config('search_path', '', true) = '' then pg_get_triggerdef(t.oid) end,
    '^CREATE TRIGGER', 'CREATE OR REPLACE TRIGGER') || ';'
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
  where n.nspname in ('auth', 'storage') and not t.tgisinternal and p.pronamespace = 'public'::regnamespace
  union all
  select 4, tablename, format(
    'do $u$ begin if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = %L and schemaname = %L and tablename = %L) then alter publication supabase_realtime add table %I.%I; end if; end $u$;',
    'supabase_realtime', schemaname, tablename, schemaname, tablename)
  from pg_publication_tables where pubname = 'supabase_realtime'
) x order by k, s;
