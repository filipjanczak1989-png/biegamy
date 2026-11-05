-- Testy BUTÓW (20261107_gra_buty.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS, więc bez tego test byłby zielony zawsze).
-- Ceny jak w grze, dawne przedmioty bez zmian, miejsce „stopy” w zapisie strojów tylko dla kupionych. Jedna transakcja, zawsze wycofana (tools/gra-buty-test.sh); wynikiem jest treść wyjątku na końcu.
do $T$
declare
  n int := 0; j jsonb; u1 uuid; a1 uuid; u2 uuid; a2 uuid; w record; v_saldo int;
begin
  select a.user_id, a.id into u1, a1 from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  select a.user_id, a.id into u2, a2 from public.athletes a where a.user_id is not null and a.user_id <> u1 order by a.created_at limit 1;
  if u2 is null then raise exception 'FAIL 0: za mało kont do testu'; end if;
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  insert into public.gra_konto (athlete_id, saldo) values (a1, 1000), (a2, 50);

  -- 1. każda para za cenę z gry, saldo schodzi o tyle i kupione rośnie
  execute 'set local role authenticated';
  v_saldo := 1000;
  for w in select * from (values ('buty-czerwone', 12), ('buty-niebieskie', 12), ('buty-zielone', 12), ('buty-fioletowe', 15), ('buty-robocze', 20)) t(id, cena) loop
    j := public.gra_kup(w.id); v_saldo := v_saldo - w.cena; n := n + 1;
    if not (j->>'ok')::boolean or (j->>'saldo')::int is distinct from v_saldo or not (j->'kupione') ? w.id then raise exception 'FAIL 1a: % %', w.id, j; end if;
  end loop;

  -- 2. drugi raz nie płaci, nieznane odmowa, dawne ceny bez zmian, korona i nagroda za serię dalej nie na sprzedaż
  j := public.gra_kup('buty-czerwone');
  if (j->>'ok')::boolean or j->>'powod' <> 'juz_masz' or (j->>'saldo')::int is distinct from v_saldo then raise exception 'FAIL 2a: drugi zakup %', j; end if;
  j := public.gra_kup('buty-zlote');
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 2b: nieznane buty %', j; end if;
  for w in select * from (values ('koszulka-czerwona', 10), ('koszulka-fioletowa', 15), ('koszulka-zlota', 50), ('kamizelka', 25), ('spodenki-czerwone', 8), ('spodenki-biale', 12), ('opaska', 10), ('czapka-pompon', 15), ('kask-rowerowy', 25), ('czapka-zlota', 40), ('okulary', 20), ('medal', 30), ('peleryna', 60)) t(id, cena) loop
    j := public.gra_kup(w.id); v_saldo := v_saldo - w.cena; n := n + 1;
    if not (j->>'ok')::boolean or (j->>'saldo')::int is distinct from v_saldo then raise exception 'FAIL 2c: dawna cena % %', w.id, j; end if;
  end loop;
  for w in select * from (values ('korona'), ('kamizelka-wytrwalych')) t(id) loop
    j := public.gra_kup(w.id); n := n + 1;
    if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 2d: % na sprzedaż %', w.id, j; end if;
  end loop;
  n := n + 2;

  -- 3. za mało cegieł: bez zmian
  execute 'reset role';
  update public.gra_konto set saldo = 11, kupione = '[]'::jsonb where athlete_id = a1;
  execute 'set local role authenticated';
  j := public.gra_kup('buty-czerwone');
  if (j->>'ok')::boolean or j->>'powod' <> 'za_malo' or (j->>'saldo')::int is distinct from 11 or (j->'kupione') ? 'buty-czerwone' then raise exception 'FAIL 3a: za mało cegieł %', j; end if;
  n := n + 1;

  -- 4. zapis strojów: stopy tylko z kupionych, każda postać ze strojem, koparka bez, reszta miejsc jak dotąd
  execute 'reset role';
  update public.gra_konto set saldo = 0, kupione = '["buty-czerwone","medal"]'::jsonb where athlete_id = a1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_stroje('{"kasia":{"stopy":"buty-czerwone","szyja":"medal","nogi":"buty-czerwone"},"filip":{"stopy":"buty-robocze"},"rowerzysta":{"stopy":"buty-czerwone"},"koparka":{"stopy":"buty-czerwone"}}'::jsonb);
  if not (j->>'ok')::boolean then raise exception 'FAIL 4a: zapis %', j; end if;
  if j #>> '{stroje,kasia,stopy}' is distinct from 'buty-czerwone' or j #>> '{stroje,kasia,szyja}' is distinct from 'medal' then raise exception 'FAIL 4b: strój Kasi %', j; end if;
  if (j #> '{stroje,kasia}') ? 'nogi' then raise exception 'FAIL 4c: nieznane miejsce %', j; end if;
  if (j #> '{stroje,filip}') ? 'stopy' then raise exception 'FAIL 4d: niekupione buty %', j; end if;
  if j #>> '{stroje,rowerzysta,stopy}' is distinct from 'buty-czerwone' then raise exception 'FAIL 4e: buty rowerzysty %', j; end if;
  if (j->'stroje') ? 'koparka' then raise exception 'FAIL 4f: koparka bez dodatków %', j; end if;
  n := n + 6;
  execute 'reset role';
  if (select stroje #>> '{kasia,stopy}' from public.gra_konto where athlete_id = a1) is distinct from 'buty-czerwone' then raise exception 'FAIL 4g: nie zapisane'; end if;
  if (select saldo from public.gra_konto where athlete_id = a2) <> 50 or (select kupione from public.gra_konto where athlete_id = a2) <> '[]'::jsonb then raise exception 'FAIL 4h: cudze konto ruszone'; end if;
  n := n + 2;

  -- 5. uprawnienia: anon nic, klient nie pisze wprost do konta
  if has_function_privilege('anon', 'public.gra_kup(text)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_zapisz_stroje(jsonb)', 'EXECUTE') then raise exception 'FAIL 5a: anon woła'; end if;
  if not has_function_privilege('authenticated', 'public.gra_kup(text)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.gra_zapisz_stroje(jsonb)', 'EXECUTE') then raise exception 'FAIL 5b: zalogowany nie woła'; end if;
  if has_column_privilege('authenticated', 'public.gra_konto', 'kupione', 'UPDATE') or has_column_privilege('authenticated', 'public.gra_konto', 'saldo', 'UPDATE') or has_column_privilege('authenticated', 'public.gra_konto', 'stroje', 'UPDATE') then raise exception 'FAIL 5c: klient pisze do konta'; end if;
  n := n + 3;

  -- 6. gra dalej nie zna treningów ani akcji
  if pg_get_functiondef('public.gra_kup(text)'::regprocedure) ~* 'training_logs|akcja_|achievements|athlete_stats|community' then raise exception 'FAIL 6a: zakup zna treningi lub akcję'; end if;
  n := n + 1;

  raise exception 'TESTY BUTOW ZIELONE: % asercji', n;
end $T$;
