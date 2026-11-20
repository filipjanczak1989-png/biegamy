-- WYCOFANIE 20261220_crony_timeout_pg_net.sql: polecenia cronów akcja-wyprawa-slad i morning-brief-hourly z powrotem bez timeout_milliseconds (pg_net: domyślne 5 s).
-- Te same pary kotwic odwrotnie; plan i aktywność bez zmian.
begin;

do $wycofanie$
declare r record; j cron.job; n integer;
begin
  for r in select * from (values
      ('morning-brief-hourly', $k$body    := '{}'::jsonb, timeout_milliseconds := 60000$k$, $k$body    := '{}'::jsonb$k$),
      ('akcja-wyprawa-slad', $k$body    := '{"rodzaj":"odswiez"}'::jsonb, timeout_milliseconds := 150000);$k$, $k$body    := '{"rodzaj":"odswiez"}'::jsonb);$k$)
    ) as t(nazwa, kotwica, nowe)
  loop
    select * into j from cron.job where jobname = r.nazwa;
    if not found then raise exception 'wycofanie 20261220: brak zadania crona %, nic nie zmieniam', r.nazwa; end if;
    n := (length(j.command) - length(replace(j.command, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception 'wycofanie 20261220: %: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.nazwa, r.kotwica, n; end if;
    perform cron.alter_job(j.jobid, command := replace(j.command, r.kotwica, r.nowe));
  end loop;
end $wycofanie$;

commit;
