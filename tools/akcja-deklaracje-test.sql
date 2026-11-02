-- Testy deklaracji sponsorów (20261102_akcja_deklaracje.sql). Uruchamia tools/akcja-deklaracje-test.sh — jedna transakcja,
-- zawsze wycofana (blok kończy się wyjątkiem). Póki migracja nie jest na prod: DEKLARACJE_Z_MIGRACJA=1.
do $T$
declare
  T_ATH constant uuid := '9c2df65c-6a46-410e-ad5f-474e5d973ec9'; T_UID constant uuid := '1dfb3b79-771e-46d7-8ac0-ff52df3cadd0';
  r_ath uuid; r_uid uuid; j jsonb; n int := 0; v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  select id, user_id into r_ath, r_uid from public.athletes
   where user_id is not null and coach_id is not null and id not in (T_ATH, '56092926-2cf1-44b6-952f-38614497fdc2') order by created_at limit 1;
  delete from public.achievements where athlete_id in (r_ath, T_ATH) and badge_id = 'akcja-sponsor';

  -- 1. anon → 42501 (brak EXECUTE)
  begin execute 'set local role anon'; perform public.akcja_deklaruj('dla-fabianka', 5); raise exception 'FAIL 1a'; exception when insufficient_privilege then null; end;
  begin execute 'set local role anon'; perform public.akcja_wycofaj_deklaracje('dla-fabianka'); raise exception 'FAIL 1b'; exception when insufficient_privilege then null; end;
  n := n + 2;

  -- 2. przed startem → poza oknem
  perform set_config('request.jwt.claims', json_build_object('sub', r_uid, 'role', 'authenticated')::text, true);
  begin execute 'set local role authenticated'; perform public.akcja_deklaruj('dla-fabianka', 5); raise exception 'FAIL 2'; exception when sqlstate '22023' then null; end;
  n := n + 1;

  -- 3. po starcie: deklaracja → wiersz + odznaka; zmiana stawki → nadal jeden wiersz; licznik widzi sumę i liczbę
  update public.akcje set wystartowala_at = now(), start = v_dzis, koniec = null where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.akcja_deklaruj('dla-fabianka', 5);
  reset role;
  if (j->>'stawka_gr')::int <> 5 then raise exception 'FAIL 3a: %', j; end if;
  if not exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'akcja-sponsor') then raise exception 'FAIL 3b: brak odznaki przy deklaracji'; end if;
  execute 'set local role authenticated';
  j := public.akcja_deklaruj('dla-fabianka', 7);
  reset role;
  if (select count(*) from public.akcja_sponsorzy s join public.akcje a on a.id = s.akcja_id where a.slug = 'dla-fabianka' and s.athlete_id = r_ath) <> 1
     or (j->>'stawka_gr')::int <> 7 then raise exception 'FAIL 3c: zmiana stawki %', j; end if;
  j := public.akcja_licznik('dla-fabianka');
  if (j->>'sponsorzy_n')::int < 1 or (j->>'stawka_sponsorow_gr')::int < 7 then raise exception 'FAIL 3d: licznik %', j; end if;
  if j::text ~* r_ath::text then raise exception 'FAIL 3e: licznik zdradza sponsora'; end if;
  n := n + 5;

  -- 4. zła stawka → 22023
  begin execute 'set local role authenticated'; perform public.akcja_deklaruj('dla-fabianka', 0); raise exception 'FAIL 4a'; exception when sqlstate '22023' then null; end;
  begin execute 'set local role authenticated'; perform public.akcja_deklaruj('dla-fabianka', 10001); raise exception 'FAIL 4b'; exception when sqlstate '22023' then null; end;
  n := n + 2;

  -- 5. wycofanie: wiersz znika, ODZNAKA ZOSTAJE
  execute 'set local role authenticated';
  j := public.akcja_wycofaj_deklaracje('dla-fabianka');
  reset role;
  if j->'stawka_gr' <> 'null'::jsonb then raise exception 'FAIL 5a: %', j; end if;
  if not exists (select 1 from public.achievements where athlete_id = r_ath and badge_id = 'akcja-sponsor') then raise exception 'FAIL 5b: odznaka zniknęła po wycofaniu'; end if;
  n := n + 2;

  -- 6. po zamknięciu → poza oknem
  update public.akcje set start = v_dzis - 10, koniec = v_dzis - 1 where slug = 'dla-fabianka';
  begin execute 'set local role authenticated'; perform public.akcja_deklaruj('dla-fabianka', 5); raise exception 'FAIL 6'; exception when sqlstate '22023' then null; end;
  n := n + 1;

  -- 7. próba: zwykłe konto nie, konto testowe tak
  update public.akcje set wystartowala_at = now(), start = v_dzis where slug = 'proba';
  begin execute 'set local role authenticated'; perform public.akcja_deklaruj('proba', 5); raise exception 'FAIL 7a: próba dla zwykłego konta'; exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', T_UID, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_deklaruj('proba', 3);
  reset role;
  if (j->>'stawka_gr')::int <> 3 then raise exception 'FAIL 7b: %', j; end if;
  n := n + 2;

  raise exception 'TESTY DEKLARACJI ZIELONE: % asercji (transakcja wycofana)', n;
end $T$;
