-- Kontrola po 20261010_wyniki_001…005 (TYLKO ODCZYT). Każdy wiersz ma kolumnę ok; oczekiwane: same true/t.
-- Jedno zapytanie (union all) — przechodzi przez `supabase db query`. Samokontrola 9.10 (wersja 001): grant select
-- anonowi + disable RLS → 2× false. Na Supabase `create table` SAM nadaje anonowi ALL — o braku dostępu decyduje
-- revoke w migracjach, a nie brak grantu; ta kontrola sprawdza SKUTEK (has_*_privilege), nie tekst migracji.
select 'rls ' || c.relname as co, c.relrowsecurity as ok
from pg_class c
where c.oid in ('public.race_events'::regclass, 'public.race_results'::regclass, 'public.results_import_log'::regclass,
                'public.collect_seen'::regclass, 'public.collect_runs'::regclass, 'public.erasure_list'::regclass)
union all
select format('%s %s %s', r, p, t), not has_table_privilege(r, t, p)
from unnest(array['anon']) r, unnest(array['select','insert','update','delete']) p,
     unnest(array['public.race_events','public.race_results','public.results_import_log',
                  'public.collect_seen','public.collect_runs','public.erasure_list']) t
union all
select format('authenticated %s %s', p, t), not has_table_privilege('authenticated', t, p)
from unnest(array['insert','update']) p,
     unnest(array['public.race_events','public.race_results','public.results_import_log',
                  'public.collect_seen','public.collect_runs','public.erasure_list']) t
union all
select format('authenticated select/delete %s', t), not has_table_privilege('authenticated', t, 'select,delete')
from unnest(array['public.results_import_log','public.collect_seen','public.collect_runs','public.erasure_list']) t
union all
select 'authenticated select race_results', has_table_privilege('authenticated', 'public.race_results', 'select')
union all
select format('anon execute %s', f), not has_function_privilege('anon', f, 'execute')
from unnest(array['public.name_key(text)', 'public.search_runners(text,int)', 'public.runner_results(text)',
                  'public.race_results_set_key()', 'public.resolve_runners()', 'public.erase_runner(text,text)']) f
union all
select format('authenticated execute %s', f), has_function_privilege('authenticated', f, 'execute')
from unnest(array['public.name_key(text)', 'public.search_runners(text,int)', 'public.runner_results(text)']) f
union all
select format('authenticated BEZ execute %s', f), not has_function_privilege('authenticated', f, 'execute')
from unnest(array['public.resolve_runners()', 'public.erase_runner(text,text)']) f
union all
select 'polityk race_* = 3', (select count(*) from pg_policies where schemaname = 'public' and tablename in ('race_events', 'race_results', 'results_import_log')) = 3
union all
select 'polityk collect_*/erasure_list = 0', (select count(*) from pg_policies where schemaname = 'public' and tablename in ('collect_seen', 'collect_runs', 'erasure_list')) = 0
union all
select 'trigger blokady usunięcia', exists (select 1 from pg_trigger where tgname = 'race_results_zz_erasure_guard' and tgrelid = 'public.race_results'::regclass)
union all
select 'rozszerzenia w extensions', (select count(*) from pg_extension where extname in ('pg_trgm', 'unaccent') and extnamespace = 'extensions'::regnamespace) = 2
union all
select 'name_key kolejność i diakrytyki', public.name_key('Głogowski Krzysztof') = public.name_key('krzysztof glogowski');
