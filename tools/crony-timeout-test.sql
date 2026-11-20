-- Test po skutku 20261220 (timeout_milliseconds w cronach akcja-wyprawa-slad i morning-brief-hourly). W transakcji z .sh, zawsze wycofanej. Nic nie woła funkcji.
-- _cron_przed = stan cron.job zapisany przez .sh PRZED migracją (z flagą: przed migracją w tej samej transakcji; bez flagi: stan po wdrożeniu).
do $test$
declare n int := 0; r record; j cron.job; p record;
begin
  for r in select * from (values
      ('akcja-wyprawa-slad', '*/15 * * * *', '/functions/v1/akcja-wyprawa-slad''', 'timeout_milliseconds := 150000', $k$body    := '{"rodzaj":"odswiez"}'::jsonb, timeout_milliseconds := 150000);$k$),
      ('morning-brief-hourly', '0 * * * *', '/functions/v1/morning-brief-cron''', 'timeout_milliseconds := 60000', $k$body    := '{}'::jsonb, timeout_milliseconds := 60000$k$)
    ) as t(nazwa, plan, adres, timeout, wstawka)
  loop
    select * into j from cron.job where jobname = r.nazwa;
    if not found then raise exception 'FAIL 1: brak zadania %', r.nazwa; end if;
    -- 1. polecenie: dokładnie jeden timeout właściwej wartości, jedno net.http_post, ten sam adres i sekret z vault; plan i aktywność bez zmian
    if (length(j.command) - length(replace(j.command, 'timeout_milliseconds', ''))) / length('timeout_milliseconds') <> 1 or position(r.timeout in j.command) = 0 then raise exception 'FAIL 1a: %: timeout w poleceniu', r.nazwa; end if;
    if position(r.wstawka in j.command) = 0 then raise exception 'FAIL 1b: %: timeout nie w wywołaniu net.http_post', r.nazwa; end if;
    if (select count(*) from regexp_matches(j.command, 'net\.http_post\(', 'gi')) <> 1 or position(r.adres in j.command) = 0 or position('push_hook_secret' in j.command) = 0 then raise exception 'FAIL 1c: %: adres, sekret albo liczba wywołań', r.nazwa; end if;
    if j.schedule <> r.plan or not j.active then raise exception 'FAIL 1d: %: plan % / aktywne %', r.nazwa, j.schedule, j.active; end if;
    -- 2. różnica względem stanu przed migracją (tylko gdy test idzie z flagą, przed wdrożeniem): jedyna zmiana to wstawiony timeout
    select * into p from _cron_przed x where x.jobname = r.nazwa;
    if p.command is not null and position('timeout_milliseconds' in p.command) = 0 then
      if replace(j.command, ', ' || r.timeout, '') is distinct from p.command or p.schedule <> j.schedule or p.active <> j.active then raise exception 'FAIL 2: %: zmieniło się coś poza timeoutem', r.nazwa; end if;
      n := n + 1;
    end if;
    n := n + 4;
  end loop;
  -- 3. inne zadania crona bez zmian
  if (select md5(coalesce(string_agg(x.jobname || '|' || x.schedule || '|' || x.command || '|' || x.active, '#' order by x.jobname), '')) from cron.job x where x.jobname not in ('akcja-wyprawa-slad', 'morning-brief-hourly'))
     is distinct from (select md5(coalesce(string_agg(x.jobname || '|' || x.schedule || '|' || x.command || '|' || x.active, '#' order by x.jobname), '')) from _cron_przed x where x.jobname not in ('akcja-wyprawa-slad', 'morning-brief-hourly')) then
    raise exception 'FAIL 3: zmieniło się inne zadanie crona'; end if;
  n := n + 1;
  raise exception 'TESTY TIMEOUTOW CRONOW ZIELONE: % sprawdzeń', n;
end $test$;
