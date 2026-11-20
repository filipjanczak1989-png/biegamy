-- CRONY: timeout_milliseconds w akcja-wyprawa-slad (co 15 min) i morning-brief-hourly (co godzinę) — decyzja Filipa 20.11 po zwiadzie końca biegu.
-- Oba wołają EF przez net.http_post bez timeout_milliseconds, więc pg_net czeka domyślne 5 s i zapisuje w net._http_response „Timeout of 5000 ms” (24 h: 30 z 44 wpisów).
-- Funkcje i tak kończą pracę (skutki w bazie po czasie), więc to szum, nie awaria. Zmiana tylko w poleceniu crona, kotwicą (dokładnie raz):
--   akcja-wyprawa-slad:   + timeout_milliseconds := 150000 (jak bieg-przypomnienie; odczyt 20.11: zapis śladu zwykle 3–9 s po kwadransie, pojedyncze później);
--   morning-brief-hourly: + timeout_milliseconds := 60000 (odczyt 20.11: powiadomienia 5–17 s po pełnej godzinie, ostatnie 10 dni).
-- Plan, aktywność, adres, sekret z vault i reszta polecenia bez zmian (cron.alter_job tylko z command). Bramki: zadanie istnieje, jedno net.http_post, jeszcze bez timeout.
-- Test po skutku: tools/crony-timeout-test.sh (przed wdrożeniem CRONY_TIMEOUT_Z_MIGRACJA=1). Wycofanie: 20261220_WYCOFANIE_crony_timeout_pg_net.sql.
begin;

do $migracja$
declare r record; j cron.job; n integer;
begin
  for r in select * from (values
      ('akcja-wyprawa-slad', $k$body    := '{"rodzaj":"odswiez"}'::jsonb);$k$, $k$body    := '{"rodzaj":"odswiez"}'::jsonb, timeout_milliseconds := 150000);$k$),
      ('morning-brief-hourly', $k$body    := '{}'::jsonb$k$, $k$body    := '{}'::jsonb, timeout_milliseconds := 60000$k$)
    ) as t(nazwa, kotwica, nowe)
  loop
    select * into j from cron.job where jobname = r.nazwa;
    if not found then raise exception '20261220: brak zadania crona %, nic nie zmieniam', r.nazwa; end if;
    if position('timeout_milliseconds' in j.command) > 0 then raise exception '20261220: % ma już timeout_milliseconds (migracja wykonana?), nic nie zmieniam', r.nazwa; end if;
    if (select count(*) from regexp_matches(j.command, 'net\.http_post\(', 'gi')) <> 1 then raise exception '20261220: % nie ma dokładnie jednego net.http_post, nic nie zmieniam', r.nazwa; end if;
    n := (length(j.command) - length(replace(j.command, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '20261220: %: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.nazwa, r.kotwica, n; end if;
    perform cron.alter_job(j.jobid, command := replace(j.command, r.kotwica, r.nowe));
  end loop;
end $migracja$;

commit;
