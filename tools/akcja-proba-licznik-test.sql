-- Licznik próby PO SKUTKU (20261107_akcja_proba_licznik.sql): trening konta testowego przesuwa licznik, wkład i kwotę; suwak się dokłada; próba i prawdziwa akcja mają ten sam cel i stawki; prawdziwa akcja bez zmian.
-- Jedna transakcja, zawsze wycofana (tools/akcja-proba-licznik-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; j jsonb; j0 jsonb; w jsonb; ak public.akcje; re public.akcje; realny_przed jsonb; ath uuid; uzyt uuid; km0 numeric;
  DZIS constant date := (now() at time zone 'Europe/Warsaw')::date;
begin
  select * into re from public.akcje where slug = 'dla-fabianka';
  select * into ak from public.akcje where slug = 'proba' and testowa;
  if ak.id is null or re.id is null then raise exception 'FAIL 0a: brak akcji'; end if;
  ath := ak.konta_testowe[1];
  select a.user_id into uzyt from public.athletes a where a.id = ath;
  if ath is null or uzyt is null then raise exception 'FAIL 0b: brak konta testowego'; end if;
  realny_przed := public.akcja_licznik('dla-fabianka');

  -- 1. ta sama liczba celu i stawek na próbie i na prawdziwej akcji
  if ak.cel_km is distinct from re.cel_km then raise exception 'FAIL 1a: cel próby % a akcji %', ak.cel_km, re.cel_km; end if;
  if ak.stawka_gr_filip is distinct from re.stawka_gr_filip then raise exception 'FAIL 1b: stawka próby % a akcji %', ak.stawka_gr_filip, re.stawka_gr_filip; end if;
  if ak.cap_km_doba is distinct from re.cap_km_doba then raise exception 'FAIL 1c: limit doby próby % a akcji %', ak.cap_km_doba, re.cap_km_doba; end if;
  n := n + 3;

  -- 2. guzik: od zera, po naciśnięciu. Licznik startuje od km z dziś, tak jak w sobotę.
  update public.akcje set wystartowala_at = now(), push_start_at = now(), wyprawa_dotarla_at = null, koniec = null, start = DZIS, proba_sym_km = 0 where id = ak.id;
  km0 := public.akcja_km_okna(ak.id, DZIS, DZIS);
  j0 := public.akcja_licznik('proba');
  if (j0->>'suma_km')::numeric <> round(km0, 2) then raise exception 'FAIL 2a: licznik % a km %', j0->>'suma_km', km0; end if;
  if (j0->>'testowa')::boolean is not true then raise exception 'FAIL 2b: próba bez znacznika testowa'; end if;
  n := n + 2;

  -- 3. log 1 km: licznik, pasek, kwota i wkład przeskakują od razu
  insert into public.training_logs (athlete_id, distance_km, training_type, external_type, logged_at) values (ath, 1, 'Spokojny', 'Run', now());
  j := public.akcja_licznik('proba');
  if (j->>'suma_km')::numeric <> round(km0 + 1, 2) then raise exception 'FAIL 3a: po logu 1 km licznik % zamiast %', j->>'suma_km', km0 + 1; end if;
  if (j->>'filip_gr')::bigint <> floor(least(km0 + 1, ak.cel_km) * ak.stawka_gr_filip)::bigint then raise exception 'FAIL 3b: kwota %', j->>'filip_gr'; end if;
  if (j->>'pct')::numeric < (j0->>'pct')::numeric then raise exception 'FAIL 3c: procent spadł'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uzyt, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  w := public.akcja_moj_wklad('proba');
  j := public.akcja_licznik('proba');
  execute 'reset role';
  if (w->>'km')::numeric <> round(km0 + 1, 2) then raise exception 'FAIL 3d: wkład % zamiast %', w->>'km', km0 + 1; end if;
  if (j->>'suma_km')::numeric <> round(km0 + 1, 2) then raise exception 'FAIL 3e: zalogowany widzi licznik %', j->>'suma_km'; end if;
  n := n + 5;

  -- 4. rower nie przesuwa
  insert into public.training_logs (athlete_id, distance_km, training_type, external_type, logged_at) values (ath, 30, 'Rower', 'Ride', now());
  j := public.akcja_licznik('proba');
  if (j->>'suma_km')::numeric <> round(km0 + 1, 2) then raise exception 'FAIL 4a: rower w liczniku %', j->>'suma_km'; end if;
  n := n + 1;

  -- 5. suwak się dokłada do prawdziwych km, a brak symulacji znaczy same km
  update public.akcje set proba_sym_km = 3125 where id = ak.id;
  j := public.akcja_licznik('proba');
  if (j->>'suma_km')::numeric <> round(3125 + km0 + 1, 2) then raise exception 'FAIL 5a: suwak + km = %', j->>'suma_km'; end if;
  update public.akcje set proba_sym_km = null where id = ak.id;
  j := public.akcja_licznik('proba');
  if (j->>'suma_km')::numeric <> round(km0 + 1, 2) then raise exception 'FAIL 5b: bez symulacji %', j->>'suma_km'; end if;
  n := n + 2;

  -- 6. prawdziwa akcja bez zmian, a rysunek i film próby nadal nie wychodzą przez licznik
  if public.akcja_licznik('dla-fabianka') - 'suma_km' - 'pct' - 'filip_gr' - 'zamknieta' is distinct from realny_przed - 'suma_km' - 'pct' - 'filip_gr' - 'zamknieta' then raise exception 'FAIL 6a: prawdziwa akcja się zmieniła'; end if;
  if j ? 'koparka_url' and j->>'koparka_url' is not null then raise exception 'FAIL 6b: rysunek w liczniku próby'; end if;
  if j ? 'film_akcji_url' and j->>'film_akcji_url' is not null then raise exception 'FAIL 6c: film w liczniku próby'; end if;
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'FAIL 6d: anon woła licznik'; end if;
  n := n + 4;

  raise exception 'TESTY LICZNIKA PROBY ZIELONE: % asercji', n;
end $T$;
