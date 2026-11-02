-- Testy wyzwalacza okien odznak (20261102_odznaki_okna.sql). Uruchamia tools/odznaki-okna-test.sh: migracja (bez begin/commit,
-- póki nie jest na prod: ODZNAKI_Z_MIGRACJA=1) + ten blok w JEDNEJ transakcji, zawsze wycofanej (blok kończy się wyjątkiem).
-- Inserty jako authenticated przez RLS — tak jak przeglądarka.
do $T$
declare
  T_ATH constant uuid := '9c2df65c-6a46-410e-ad5f-474e5d973ec9'; T_UID constant uuid := '1dfb3b79-771e-46d7-8ac0-ff52df3cadd0';
  r_ath uuid; r_uid uuid; n int := 0; c int;
  procedure_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  select id, user_id into r_ath, r_uid from public.athletes
   where user_id is not null and coach_id is not null and id <> T_ATH and id <> '56092926-2cf1-44b6-952f-38614497fdc2'
     and not exists (select 1 from public.achievements x where x.athlete_id = athletes.id and x.badge_id in ('razem_wrzesien_2026','100km_wrzesien_2026'))
   order by created_at limit 1;
  delete from public.achievements where athlete_id in (r_ath, T_ATH) and badge_id like 'akcja-%';

  -- 1. #100kmDlaKasi po zamknięciu okna: zwykły zawodnik NIE dostaje (cicho, bez błędu)
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'razem_wrzesien_2026');
  reset role;
  if exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'razem_wrzesien_2026') then raise exception 'FAIL 1: odznaka wstecz po zamknięciu okna'; end if;
  n := n + 1;

  -- 2. odznaka bez okna przechodzi
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'test_bez_okna_xyz');
  reset role;
  if not exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'test_bez_okna_xyz') then raise exception 'FAIL 2: odznaka bez okna zablokowana'; end if;
  n := n + 1;

  -- 3. akcja przed startem: nikt
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'akcja-100');
  reset role;
  if exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'akcja-100') then raise exception 'FAIL 3: odznaka akcji przed startem'; end if;
  n := n + 1;

  -- 4. paczka (upsert) z odznaką spoza okna i bez okna: bez błędu, wchodzi tylko ta bez okna
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'akcja-500'), (r_ath, 'test_bez_okna_abc')
    on conflict (athlete_id, badge_id) do nothing;
  reset role;
  select count(*) into c from public.achievements where athlete_id = r_ath and badge_id in ('akcja-500', 'test_bez_okna_abc');
  if c <> 1 or not exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'test_bez_okna_abc') then raise exception 'FAIL 4: paczka (%)', c; end if;
  n := n + 1;

  -- 5. tylko próba wystartowała: konto testowe dostaje, zwykłe nie
  update public.akcje set wystartowala_at = now(), start = procedure_dzis where slug = 'proba';
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'akcja-1km');
  reset role;
  if exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'akcja-1km') then raise exception 'FAIL 5a: próba dała odznakę zwykłemu kontu'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', T_UID, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (T_ATH, 'akcja-1km');
  reset role;
  if not exists (select 1 from public.achievements where athlete_id = T_ATH and badge_id = 'akcja-1km') then raise exception 'FAIL 5b: konto testowe bez odznaki z próby'; end if;
  n := n + 2;

  -- 6. akcja wystartowała: zwykły zawodnik dostaje
  update public.akcje set wystartowala_at = now(), start = procedure_dzis where slug = 'dla-fabianka';
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'akcja-100');
  reset role;
  if not exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'akcja-100') then raise exception 'FAIL 6: odznaka akcji w oknie zablokowana'; end if;
  n := n + 1;

  -- 7. dzień zamknięcia włącznie przechodzi, dzień po — nie
  update public.akcje set koniec = procedure_dzis where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'akcja-co-tydzien');
  reset role;
  if not exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'akcja-co-tydzien') then raise exception 'FAIL 7a: dzień zamknięcia zablokowany'; end if;
  update public.akcje set start = procedure_dzis - 10, koniec = procedure_dzis - 1 where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  insert into public.achievements (athlete_id, badge_id) values (r_ath, 'akcja-200');
  reset role;
  if exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'akcja-200') then raise exception 'FAIL 7b: odznaka po zamknięciu'; end if;
  n := n + 2;

  raise exception 'TESTY OKIEN ODZNAK ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
