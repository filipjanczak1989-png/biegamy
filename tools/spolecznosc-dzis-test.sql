-- Testy 20261228_spolecznosc_dzis.sql (kafel „Społeczność”, K1). Jedna transakcja, zawsze wycofana (runner: tools/spolecznosc-dzis-test.sh).
-- Konta: pięć istniejących profili (najstarsze z user_id). W transakcji dostają zmyślone imiona i miasta, testowe biegi i odznaki.
-- Prawdziwe publiczne biegi z doby zostają w bazie, więc liczby sprawdzamy RÓŻNICĄ (włączenie/wyłączenie jednego profilu),
-- a kolejność na wpisach testowych, które są najnowsze (sekundy przed now()).
-- Sprawdza (plan K1 + decyzje 27.11): tylko publiczni (także w podsumowaniu), bez własnych, samo pierwsze imię, '@' i krótkie → 'Zawodnik',
-- gość odrzucony, profil przestawiony na prywatny znika, okno 24 h, tylko rodzaje biegu, bez __badge__ i przyszłości, dwie RÓŻNE osoby,
-- „od północy”, tylko dozwolone pola, uprawnienia; odznaka: osobista z 7 dni przed odznaką akcji (akcja-…, bieg-…), akcji tylko gdy osobistej brak.
create or replace function pg_temp.spol_jako(p_uid uuid) returns jsonb language plpgsql as $f$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.spolecznosc_dzis();
  execute 'reset role';
  return r;
end $f$;

do $T$
declare
  n int := 0; ids uuid[]; uids uuid[];
  v uuid; a uuid; b uuid; c uuid; d uuid; v_u uuid; a_u uuid; b_u uuid; c_u uuid; d_u uuid;
  r1 jsonb; r2 jsonb; r3 jsonb; tekst text; c_km numeric; a_km numeric; polnoc timestamptz; p oid := to_regprocedure('public.spolecznosc_dzis()');
begin
  if p is null then raise exception 'FAIL 0: brak funkcji spolecznosc_dzis() (bez wdrożenia: SD_Z_MIGRACJA=1)'; end if;
  select array_agg(id order by created_at), array_agg(user_id order by created_at) into ids, uids
    from (select id, user_id, created_at from public.athletes where user_id is not null order by created_at limit 5) q;
  if coalesce(array_length(ids, 1), 0) < 5 then raise exception 'FAIL 0: za mało kont'; end if;
  v := ids[1]; a := ids[2]; b := ids[3]; c := ids[4]; d := ids[5];
  v_u := uids[1]; a_u := uids[2]; b_u := uids[3]; c_u := uids[4]; d_u := uids[5];

  -- profile: V pyta (publiczny), A publiczny z nazwiskiem i tabem, B publiczny z adresem w imieniu, C prywatny, D publiczny z krótkim imieniem
  update public.athletes set is_public = true,  full_name = 'Widz Testowy',                    city = 'Testowo' where id = v;
  update public.athletes set is_public = true,  full_name = E'  Zuzanna\tTestowa-Kowal ',     city = 'Testowo' where id = a;
  update public.athletes set is_public = true,  full_name = 'ktos.testowy@przyklad.test',     city = 'Testowo' where id = b;
  update public.athletes set is_public = false, full_name = 'Prywatny Testowy',               city = 'Ukryte'  where id = c;
  update public.athletes set is_public = true,  full_name = '  Al  Bo  ',                     city = null      where id = d;

  -- biegi (najnowsze w bazie): V −1 s (własny), C −1,5 s (prywatny), A −2 s i −2,5 s (ta sama osoba dwa razy), D −3 s, B −4 s;
  -- A ma też wpisy, które NIE mogą się liczyć
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, logged_at, source) values
    (v, 5.0,  '25:00', 'Spokojny',    now() - interval '1 second',    'manual'),
    (c, 7.0,  '35:00', 'Wybieganie',  now() - interval '1500 milliseconds', 'manual'),
    (a, 10.2, '52:10', 'Spokojny',    now() - interval '2 seconds',   'manual'),
    (a, 3.0,  '16:00', 'Wybieganie',  now() - interval '2500 milliseconds', 'manual'),
    (d, 6.0,  '33:00', 'Interwały',   now() - interval '3 seconds',   'manual'),
    (b, 4.0,  '22:00', 'Spokojny',    now() - interval '4 seconds',   'manual'),
    (a, 3.0,  '40:00', 'Siłownia',    now() - interval '500 milliseconds', 'manual'),
    (a, 8.0,  '40:00', 'Spokojny',    now() + interval '1 hour',      'manual'),
    (a, 9.0,  '45:00', 'Spokojny',    now() - interval '25 hours',    'manual');
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, logged_at, source) values
    (a, 1.0, '05:00', '__badge__test_k1', now() - interval '300 milliseconds', 'manual');

  -- 1. kolejność, różne osoby, bez własnych, bez prywatnych, rodzaj biegu, bez przyszłości
  r1 := pg_temp.spol_jako(v_u);
  if jsonb_array_length(r1->'biegi') <> 2 then raise exception 'FAIL 1a: biegi % (oczekiwane 2)', jsonb_array_length(r1->'biegi'); end if;
  if (r1->'biegi'->0->>'id')::uuid <> a then raise exception 'FAIL 1b: pierwszy bieg nie jest A (własny albo prywatny przeszedł?)'; end if;
  if (r1->'biegi'->1->>'id')::uuid <> d then raise exception 'FAIL 1c: drugi bieg nie jest D (ta sama osoba dwa razy?)'; end if;
  if r1->'biegi'->0->>'rodzaj' <> 'Spokojny' then raise exception 'FAIL 1d: rodzaj % (siłownia albo wpis odznaki przeszły)', r1->'biegi'->0->>'rodzaj'; end if;
  if (r1->'biegi'->0->>'kiedy')::timestamptz <> now() - interval '2 seconds' then raise exception 'FAIL 1e: kiedy (wpis z przyszłości przeszedł?)'; end if;
  if (r1->'biegi'->0->>'km')::numeric <> 10.2 then raise exception 'FAIL 1f: km %', r1->'biegi'->0->>'km'; end if;
  n := n + 6;

  -- 2. imię i miasto; tylko dozwolone pola; nic z nazwiska, adresu ani prywatnego profilu
  if r1->'biegi'->0->>'imie' <> 'Zuzanna' then raise exception 'FAIL 2a: imię A %', r1->'biegi'->0->>'imie'; end if;
  if r1->'biegi'->1->>'imie' <> 'Zawodnik' then raise exception 'FAIL 2b: krótkie imię D nie zamienione: %', r1->'biegi'->1->>'imie'; end if;
  if r1->'biegi'->0->>'miasto' <> 'Testowo' or jsonb_typeof(r1->'biegi'->1->'miasto') <> 'null' then raise exception 'FAIL 2c: miasta biegów'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(r1) k) <> array['biegi', 'km', 'miasta', 'od_polnocy', 'odznaka', 'osob'] then raise exception 'FAIL 2d: pola wyniku'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(r1->'biegi'->0) k) <> array['id', 'imie', 'kiedy', 'km', 'miasto', 'rodzaj'] then raise exception 'FAIL 2e: pola biegu'; end if;
  tekst := r1::text;
  if tekst ~* '(Testowa|Kowal|@|przyklad|Prywatny|Ukryte|Widz)' then raise exception 'FAIL 2f: w wyniku jest nazwisko, adres, prywatny albo własny profil'; end if;
  if jsonb_array_length(r1->'miasta') > 3 or exists (select 1 from jsonb_array_elements_text(r1->'miasta') m where btrim(m) = '') then raise exception 'FAIL 2g: miasta'; end if;
  n := n + 7;

  -- 3. podsumowanie tylko z publicznych: C przestawiony na publiczny = +1 osoba i +jego km; z powrotem na prywatny = jak przed
  select coalesce(sum(distance_km), 0) into c_km from public.training_logs
   where athlete_id = c and logged_at > now() - interval '24 hours' and logged_at <= now() and public.is_run_type(training_type) and training_type not like '\_\_badge\_\_%';
  update public.athletes set is_public = true where id = c;
  r2 := pg_temp.spol_jako(v_u);
  if (r2->>'osob')::int <> (r1->>'osob')::int + 1 then raise exception 'FAIL 3a: C publiczny, osób % (było %)', r2->>'osob', r1->>'osob'; end if;
  if abs((r2->>'km')::numeric - (r1->>'km')::numeric - c_km) > 0.11 then raise exception 'FAIL 3b: km % → % (C: %)', r1->>'km', r2->>'km', c_km; end if;
  if (r2->'biegi'->0->>'id')::uuid <> c then raise exception 'FAIL 3c: C publiczny, a nie ma go w biegach'; end if;
  update public.athletes set is_public = false where id = c;
  r3 := pg_temp.spol_jako(v_u);
  if r3 <> r1 then raise exception 'FAIL 3d: C z powrotem prywatny, a wynik inny niż na początku'; end if;
  n := n + 4;

  -- 4. profil przestawiony na prywatny znika od razu (biegi i podsumowanie); okno 24 h i rodzaje: różnica = tylko ważne biegi A
  select coalesce(sum(distance_km), 0) into a_km from public.training_logs
   where athlete_id = a and logged_at > now() - interval '24 hours' and logged_at <= now() and public.is_run_type(training_type) and training_type not like '\_\_badge\_\_%';
  update public.athletes set is_public = false where id = a;
  r2 := pg_temp.spol_jako(v_u);
  if r2->'biegi' @> jsonb_build_array(jsonb_build_object('id', a)) then raise exception 'FAIL 4a: A prywatny, a dalej w biegach'; end if;
  if (r2->>'osob')::int <> (r1->>'osob')::int - 1 then raise exception 'FAIL 4b: A prywatny, osób % (było %)', r2->>'osob', r1->>'osob'; end if;
  if abs((r1->>'km')::numeric - (r2->>'km')::numeric - a_km) > 0.11 then raise exception 'FAIL 4c: km A % (siłownia, wpis sprzed 25 h, z przyszłości albo odznaki policzone?)', (r1->>'km')::numeric - (r2->>'km')::numeric; end if;
  update public.athletes set is_public = true where id = a;
  n := n + 3;

  -- 5. bez własnych: dla C (pyta prywatny) V się liczy i jest pierwszy; dla V nie ma V, a osób jest o jedną mniej
  r2 := pg_temp.spol_jako(c_u);
  if (r2->'biegi'->0->>'id')::uuid <> v then raise exception 'FAIL 5a: dla innego pytającego V powinien być pierwszy'; end if;
  if (r2->>'osob')::int <> (r1->>'osob')::int + 1 then raise exception 'FAIL 5b: własne biegi w podsumowaniu (C: %, V: %)', r2->>'osob', r1->>'osob'; end if;
  if r1->'biegi' @> jsonb_build_array(jsonb_build_object('id', v)) then raise exception 'FAIL 5c: V widzi siebie'; end if;
  n := n + 3;

  -- 6. „od północy”: bieg D minutę przed północą (w oknie 24 h) = nie wszystkie od północy
  polnoc := date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw';
  if (r1->>'od_polnocy')::boolean <> coalesce((select min(l.logged_at) >= polnoc from public.training_logs l join public.athletes x on x.id = l.athlete_id
        where x.is_public and x.id <> v and l.logged_at > now() - interval '24 hours' and l.logged_at <= now() and public.is_run_type(l.training_type)), true) then
    raise exception 'FAIL 6a: od_polnocy niezgodne z danymi'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, logged_at, source) values (d, 5.0, '27:00', 'Spokojny', polnoc - interval '1 minute', 'manual');
  if (pg_temp.spol_jako(v_u)->>'od_polnocy')::boolean then raise exception 'FAIL 6b: bieg sprzed północy, a od_polnocy = true'; end if;
  n := n + 2;

  -- 7. odznaka: osobista z 7 dni przed nowszą odznaką akcji i biegu; bez własnych, prywatnych, z przyszłości
  insert into public.achievements (athlete_id, badge_id, earned_at) values
    (a, 'test_osobista_k1',      now() - interval '5 seconds'),
    (b, 'akcja-test-k1',         now()),
    (d, 'bieg-test-k1',          now() - interval '2 seconds'),
    (v, 'test_osobista_widz_k1', now()),
    (c, 'test_osobista_pryw_k1', now() - interval '1 second'),
    (a, 'test_przyszla_k1',      now() + interval '1 hour'),
    (b, 'test_stara_k1',         now() - interval '8 days');
  if (select count(*) from public.achievements where badge_id like '%test%k1') <> 7 then raise exception 'FAIL 7z: odznaki testowe nie weszły (wyzwalacze?)'; end if;
  r2 := pg_temp.spol_jako(v_u);
  if r2->'odznaka'->>'odznaka' <> 'test_osobista_k1' or (r2->'odznaka'->>'id')::uuid <> a or (r2->'odznaka'->>'akcji')::boolean then
    raise exception 'FAIL 7a: zamiast osobistej A: % (akcja/bieg przed osobistą, własna, prywatna albo z przyszłości?)', r2->'odznaka'; end if;
  if r2->'odznaka'->>'imie' <> 'Zuzanna' or (select array_agg(k order by k) from jsonb_object_keys(r2->'odznaka') k) <> array['akcji', 'id', 'imie', 'kiedy', 'odznaka'] then raise exception 'FAIL 7b: pola odznaki'; end if;
  if (pg_temp.spol_jako(a_u)->'odznaka'->>'odznaka') <> 'test_osobista_widz_k1' then raise exception 'FAIL 7c: dla A własna odznaka V powinna być widoczna (wykluczony ma być tylko pytający)'; end if;
  n := n + 3;

  -- 8. osobistych z 7 dni brak (ich właściciele prywatni, poza B i D) → odznaka akcji; stara osobista B (8 dni) nie wygrywa; e-mail w imieniu → 'Zawodnik'
  update public.athletes x set is_public = false
   where x.id not in (b, d) and exists (select 1 from public.achievements ac where ac.athlete_id = x.id and ac.earned_at > now() - interval '7 days'
          and ac.earned_at <= now() and ac.badge_id not like 'akcja-%' and ac.badge_id not like 'bieg-%');
  r2 := pg_temp.spol_jako(v_u);
  if r2->'odznaka'->>'odznaka' <> 'akcja-test-k1' or not (r2->'odznaka'->>'akcji')::boolean then raise exception 'FAIL 8a: bez osobistych powinna być odznaka akcji B: %', r2->'odznaka'; end if;
  if r2->'odznaka'->>'imie' <> 'Zawodnik' then raise exception 'FAIL 8b: adres w imieniu nie zamieniony: %', r2->'odznaka'->>'imie'; end if;
  update public.athletes set is_public = false where id = b;
  r2 := pg_temp.spol_jako(v_u);
  if r2->'odznaka'->>'odznaka' <> 'bieg-test-k1' or not (r2->'odznaka'->>'akcji')::boolean then raise exception 'FAIL 8c: odznaka biegu wirtualnego to odznaka akcji: %', r2->'odznaka'; end if;
  n := n + 3;

  -- 9. gość odrzucony; uprawnienia i ustawienia funkcji
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  begin perform public.spolecznosc_dzis(); raise exception 'FAIL 9a: gość woła funkcję'; exception when insufficient_privilege then null; end;
  reset role;
  if has_function_privilege('anon', p, 'EXECUTE') or not has_function_privilege('authenticated', p, 'EXECUTE') then raise exception 'FAIL 9b: uprawnienia'; end if;
  if exists (select 1 from pg_proc, aclexplode(proacl) x where pg_proc.oid = p and x.grantee = 0 and x.privilege_type = 'EXECUTE') then raise exception 'FAIL 9c: PUBLIC ma EXECUTE'; end if;
  if not (select prosecdef and provolatile = 's' and 'search_path=""' = any (proconfig) from pg_proc where oid = p) then raise exception 'FAIL 9d: SECURITY DEFINER, STABLE, stały search_path'; end if;
  n := n + 4;

  create temp table _spol_wynik as select 'TESTY SPOLECZNOSC_DZIS ZIELONE: ' || n || ' asercji' as wynik;
end $T$;
select wynik from _spol_wynik;
