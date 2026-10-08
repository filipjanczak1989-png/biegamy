-- UZUPEŁNIENIA SCHEMATU, KTÓRYCH `supabase db dump --schema-only` NIE ZABIERA (tylko odczyt z PROD).
-- Zmierzone 8.10.2026 (`supabase db dump --dry-run`): dump wyklucza schematy auth, storage, cron, net, vault,
-- realtime i komentuje publikację supabase_realtime. Na prod z tych obszarów jest w użyciu:
--   · 8 bucketów storage (konfiguracja, nie pliki) · 19 polityk na storage.objects
--   · trigger auth.users.on_auth_user_created → public.handle_new_user · publikacja realtime: public.athletes
-- Wynik: wiersze DDL (kolumna ddl), które tools/test-env/zaloz-baze-testowa.sh wykonuje na bazie TESTOWEJ.
-- NIE obejmuje (świadomie): zadań cron (wołałyby AI co godzinę), sekretów vault (wartości tworzy skrypt),
-- plików w bucketach, użytkowników auth, ustawień Auth (Site URL, providerzy) — patrz docs/srodowisko-testowe.md.
select ddl from (
  select 1 as k, id as s, format(
    'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L::boolean, %s, %s) on conflict (id) do nothing;',
    id, name, public::text, coalesce(file_size_limit::text, 'null'), coalesce(quote_literal(allowed_mime_types::text) || '::text[]', 'null')) as ddl
  from storage.buckets
  union all
  select 2, policyname, format('create policy %I on storage.objects as %s for %s to %s%s%s;',
    policyname, permissive, cmd,
    (select string_agg(quote_ident(r), ', ') from unnest(roles) r),
    case when qual is not null then ' using (' || qual || ')' else '' end,
    case when with_check is not null then ' with check (' || with_check || ')' else '' end)
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
  union all
  -- funkcja triggera ze schematem jawnie (pg_get_triggerdef pomija public. przy domyślnym search_path)
  select 3, t.tgname, regexp_replace(pg_get_triggerdef(t.oid), 'EXECUTE FUNCTION (?!public\.)', 'EXECUTE FUNCTION public.') || ';'
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
  where n.nspname in ('auth', 'storage') and not t.tgisinternal and p.pronamespace = 'public'::regnamespace
  union all
  select 4, tablename, format('alter publication supabase_realtime add table %I.%I;', schemaname, tablename)
  from pg_publication_tables where pubname = 'supabase_realtime'
) x order by k, s;
