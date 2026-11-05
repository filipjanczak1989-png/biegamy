-- Testy RAKIETY (20261107_gra_rakieta.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS, więc bez tego test byłby zielony zawsze).
-- Zakup za cenę z gry, użycie tylko rowerem, z posiadania i raz na rundę, zużycie schodzi z przyjętą rundą, kask i bidon bez zmian. Jedna transakcja, zawsze wycofana (tools/gra-rakieta-test.sh).
do $T$
declare
  n int := 0; j jsonb; u1 uuid; a1 uuid; r1 uuid; f record; v_powod text; ST constant jsonb := '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}';
begin
  select a.user_id, a.id into u1, a1 from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  if u1 is null then raise exception 'FAIL 0: brak konta do testu'; end if;
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  update public.akcje set gra_aktywna = true, rowerzysta_wlaczony = true where slug = 'dla-fabianka';
  if not found then raise exception 'FAIL 0b: brak wiersza akcji'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  insert into public.gra_konto (athlete_id, saldo) values (a1, 40);

  -- 1. zakup: cena jak w grze, kask i bidon bez zmian, za mało cegieł bez zmian, nieznane odmowa
  execute 'set local role authenticated';
  j := public.gra_kup_do_plecaka('rakieta');
  if not (j->>'ok')::boolean or (j->>'saldo')::int is distinct from 15 or (j #>> '{plecak,rakieta}')::int is distinct from 1 then raise exception 'FAIL 1a: rakieta %', j; end if;
  j := public.gra_kup_do_plecaka('kask');
  if (j->>'saldo')::int is distinct from 10 then raise exception 'FAIL 1b: kask %', j; end if;
  j := public.gra_kup_do_plecaka('bidon');
  if (j->>'saldo')::int is distinct from 6 then raise exception 'FAIL 1c: bidon %', j; end if;
  j := public.gra_kup_do_plecaka('rakieta');
  if (j->>'ok')::boolean or j->>'powod' <> 'za_malo' or (j->>'saldo')::int is distinct from 6 or (j #>> '{plecak,rakieta}')::int is distinct from 1 then raise exception 'FAIL 1d: za mało cegieł %', j; end if;
  j := public.gra_kup_do_plecaka('helikopter');
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 1e: nieznane %', j; end if;
  execute 'reset role';
  n := n + 5;

  -- 2. użycie: tylko rower, z posiadania, raz na rundę; odrzucona runda nie kosztuje i zostawia powód. Konto ma poziom 10, więc rower jest otwarty.
  for f in select * from (values
      ('rower z rakietą', 'rowerzysta', '{"rakieta":2}'::jsonb, '["rakieta"]'::jsonb, null::text, '{"rakieta":1}'::jsonb),
      ('ostatnia rakieta i kask', 'rowerzysta', '{"rakieta":1,"kask":1}', '["rakieta","kask"]', null, '{"rakieta":0,"kask":0}'),
      ('dwie w jednej rundzie', 'rowerzysta', '{"rakieta":3}', '["rakieta","rakieta"]', 'plecak_ponad_limit', '{"rakieta":3}'),
      ('bez posiadania', 'rowerzysta', '{}', '["rakieta"]', 'plecak_bez_posiadania', '{}'),
      ('zero sztuk', 'rowerzysta', '{"rakieta":0}', '["rakieta"]', 'plecak_bez_posiadania', '{"rakieta":0}'),
      ('Kasia z rakietą', 'kasia', '{"rakieta":1}', '["rakieta"]', 'plecak_zla_postac', '{"rakieta":1}'),
      ('Filip z rakietą', 'filip', '{"rakieta":1}', '["rakieta"]', 'plecak_zla_postac', '{"rakieta":1}'),
      ('kask dalej dla każdego', 'kasia', '{"kask":1}', '["kask"]', null, '{"kask":0}'),
      ('nieznany przedmiot', 'rowerzysta', '{"rakieta":1}', '["helikopter"]', 'zle_dane', '{"rakieta":1}')
    ) v(opis, postac, plecak, uzyte, powod, po)
  loop
    delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy;
    insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '5 minutes') returning id into r1;
    insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', 10400, 10400, 60, 0, 0, 0, 0, 0);
    update public.gra_konto set plecak = f.plecak, saldo = 0 where athlete_id = a1;
    execute 'set local role authenticated';
    j := public.gra_start_rundy(); r1 := (j->>'runda')::uuid;
    if r1 is null then raise exception 'FAIL 2a (%): start %', f.opis, j; end if;
    execute 'reset role';
    update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
    execute 'set local role authenticated';
    j := public.gra_zapisz_wynik(r1, f.postac, 100, 60, ST || jsonb_build_object('uzyte', f.uzyte));
    execute 'reset role';
    if ((j->>'ok')::boolean is distinct from (f.powod is null)) then raise exception 'FAIL 2b (%): %', f.opis, j; end if;
    if j->'plecak' is distinct from f.po then raise exception 'FAIL 2c (%): plecak w odpowiedzi %', f.opis, j; end if;
    if (select k.plecak from public.gra_konto k where k.athlete_id = a1) is distinct from f.po then raise exception 'FAIL 2d (%): plecak w bazie', f.opis; end if;
    select p.powod into v_powod from public.gra_podejrzane p where p.runda_id = r1;
    if v_powod is distinct from f.powod then raise exception 'FAIL 2e (%): powód %', f.opis, v_powod; end if;
    if exists (select 1 from public.gra_wyniki w where w.runda_id = r1) is distinct from (f.powod is null) then raise exception 'FAIL 2f (%): wynik', f.opis; end if;
    n := n + 5;
  end loop;

  -- 3. rakieta nie omija pułapu cegieł
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy;
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '5 minutes') returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', 10400, 10400, 60, 0, 0, 0, 0, 0);
  update public.gra_konto set plecak = '{"rakieta":1}', saldo = 0 where athlete_id = a1;
  execute 'set local role authenticated';
  j := public.gra_start_rundy(); r1 := (j->>'runda')::uuid;
  execute 'reset role';
  update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'rowerzysta', 2701, 60, ST || '{"uzyte":["rakieta"]}'::jsonb);
  execute 'reset role';
  if (j->>'ok')::boolean then raise exception 'FAIL 3a: 45,02 cegły na sekundę przeszło %', j; end if;
  select p.powod into v_powod from public.gra_podejrzane p where p.runda_id = r1;
  if v_powod is distinct from 'ponad_pulap' then raise exception 'FAIL 3b: powód %', v_powod; end if;
  if (select k.plecak from public.gra_konto k where k.athlete_id = a1) is distinct from '{"rakieta":1}'::jsonb then raise exception 'FAIL 3c: odrzucona kosztowała'; end if;
  n := n + 3;

  -- 4. uprawnienia i granice
  if has_function_privilege('anon', 'public.gra_kup_do_plecaka(text)', 'EXECUTE') or has_function_privilege('anon', 'public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb)', 'EXECUTE') then raise exception 'FAIL 4a: anon woła'; end if;
  if not has_function_privilege('authenticated', 'public.gra_kup_do_plecaka(text)', 'EXECUTE') then raise exception 'FAIL 4b: zalogowany nie woła'; end if;
  if pg_get_functiondef('public.gra_kup_do_plecaka(text)'::regprocedure) ~* 'training_logs|akcja_|achievements|athlete_stats|community' then raise exception 'FAIL 4c: zakup zna treningi lub akcję'; end if;
  n := n + 3;

  raise exception 'TESTY RAKIETY ZIELONE: % asercji', n;
end $T$;
