-- KONTROLA po 20261008_revoke_insert_update_bez_polityki.sql (tylko odczyt). Oczekiwane: 0 WIERSZY.
-- Pary tabela:polecenie w public, gdzie authenticated ma INSERT/UPDATE (tabelowo ALBO na którejkolwiek
-- kolumnie — has_any_column_privilege), a RLS nie ma polityki dla tego polecenia (ani ALL) dla
-- authenticated/public. Wyjątek jawny: race_signups:UPDATE (zapis istnieje — upsert DO UPDATE z frontu,
-- osobna decyzja). Jeśli wyjątek zniknie z tej listy, usuń go stąd.
with t as (
  select c.oid, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
), cmd as (select unnest(array['INSERT','UPDATE']) as polecenie)
select t.relname || ':' || cmd.polecenie as para
from t cross join cmd
where has_any_column_privilege('authenticated', t.oid, cmd.polecenie)
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.relname
      and (p.cmd = cmd.polecenie or p.cmd = 'ALL')
      and (p.roles && array['authenticated','public']::name[])
  )
  and t.relname || ':' || cmd.polecenie not in ('race_signups:UPDATE')
order by 1;
