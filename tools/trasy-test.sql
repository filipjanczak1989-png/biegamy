-- Testy 20261232_trasy.sql (T1). Jedna transakcja, zawsze wycofana (runner: tools/trasy-test.sh).
-- Konta (istniejące, nic nie zostaje po rollback): A z trenerem (C = konto logowania trenera), X bez związku z A ani z C.
-- Sprawdza: odczyt właściciel i trener tak, obcy i anon nie; zapis z przeglądarki (insert, update, delete) odrzucony; kasowanie wpisu kasuje trasę;
-- limity (długość napisu, dystans); klucz obcy do training_logs (osadzanie w PostgREST).
create or replace function pg_temp.jako(p_uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.ile(p_uid uuid, p_log uuid) returns bigint language plpgsql as $f$
declare n bigint;
begin
  perform pg_temp.jako(p_uid);
  select count(*) into n from public.trasy where log_id = p_log;
  execute 'reset role';
  return n;
end $f$;
create or replace function pg_temp.akcja(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare w text := 'ok';
begin
  if p_uid is null then execute 'set local role anon'; else perform pg_temp.jako(p_uid); end if;
  begin execute p_sql; exception when others then w := sqlstate; end;
  execute 'reset role';
  return w;
end $f$;

do $T$
declare a uuid; a_u uuid; c_u uuid; x uuid; x_u uuid; log_a uuid; w text;
begin
  if to_regclass('public.trasy') is null then raise exception 'FAIL 0: brak tabeli trasy (bez wdrożenia: TR_Z_MIGRACJA=1)'; end if;
  select d.id, d.user_id, d.coach_id into a, a_u, c_u from public.athletes d where d.user_id is not null and d.coach_id is not null and d.coach_id <> d.user_id order by d.created_at limit 1;
  if a is null then raise exception 'FAIL 0: brak zawodnika z trenerem'; end if;
  select q.id, q.user_id into x, x_u from public.athletes q
   where q.user_id is not null and q.id <> a and q.user_id <> c_u and q.coach_id is distinct from c_u and q.coach_id is distinct from a_u order by q.created_at limit 1;
  if x is null then raise exception 'FAIL 0: brak obcego konta'; end if;

  insert into public.training_logs (athlete_id, distance_km, duration, training_type, logged_at, source)
    values (a, 5, '25:00', 'Spokojny', now() - interval '1 hour', 'manual') returning id into log_a;
  insert into public.trasy (log_id, athlete_id, ksztalt, ksztalt_pub, dystans_m) values (log_a, a, '??_ibE_ibE', null, 5000);

  if pg_temp.ile(a_u, log_a) <> 1 then raise exception 'FAIL T1: właściciel nie widzi swojej trasy'; end if;
  if pg_temp.ile(c_u, log_a) <> 1 then raise exception 'FAIL T2: trener nie widzi trasy podopiecznego'; end if;
  if pg_temp.ile(x_u, log_a) <> 0 then raise exception 'FAIL T3: obcy widzi cudzą trasę'; end if;
  w := pg_temp.akcja(null, 'select count(*) from public.trasy'); if w = 'ok' then raise exception 'FAIL T4: anon czyta trasy'; end if;
  w := pg_temp.akcja(a_u, format('insert into public.trasy (log_id, athlete_id, ksztalt) values (%L, %L, %L)', log_a, a, '??'));
  if w = 'ok' then raise exception 'FAIL T5: przeglądarka wstawiła trasę'; end if;
  w := pg_temp.akcja(a_u, format('update public.trasy set ksztalt = %L where log_id = %L', '??', log_a)); if w = 'ok' then raise exception 'FAIL T6: przeglądarka zmieniła trasę'; end if;
  w := pg_temp.akcja(a_u, format('delete from public.trasy where log_id = %L', log_a)); if w = 'ok' then raise exception 'FAIL T7: przeglądarka skasowała trasę'; end if;
  w := pg_temp.akcja(c_u, format('update public.trasy set ksztalt = %L where log_id = %L', '??', log_a)); if w = 'ok' then raise exception 'FAIL T8: trener zmienił trasę'; end if;
  if (select ksztalt from public.trasy where log_id = log_a) <> '??_ibE_ibE' then raise exception 'FAIL T9: kształt zmieniony mimo odmów'; end if;

  begin insert into public.trasy (log_id, athlete_id, ksztalt) values (gen_random_uuid(), a, '??'); raise exception 'FAIL T10: trasa bez wpisu treningu przeszła';
  exception when foreign_key_violation then null; end;
  begin update public.trasy set ksztalt = repeat('?', 4001) where log_id = log_a; raise exception 'FAIL T11: kształt dłuższy niż 4000 znaków przeszedł';
  exception when check_violation then null; end;
  begin update public.trasy set dystans_m = -1 where log_id = log_a; raise exception 'FAIL T12: ujemny dystans przeszedł';
  exception when check_violation then null; end;

  delete from public.training_logs where id = log_a;
  if exists (select 1 from public.trasy where log_id = log_a) then raise exception 'FAIL T13: skasowanie wpisu nie skasowało trasy'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.trasy'::regclass and contype = 'f' and confrelid = 'public.training_logs'::regclass) then
    raise exception 'FAIL T14: brak klucza obcego do training_logs (PostgREST nie osadzi trasy w zapytaniu o wpisy)'; end if;
end $T$;

select 'TESTY TRASY ZIELONE: T1–T14' as wynik;
