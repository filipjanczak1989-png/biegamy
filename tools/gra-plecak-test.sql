-- Testy PLECAKA (20261106_gra_plecak.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS, więc bez tego test byłby zielony zawsze).
-- Zakup za złote cegły, użycie tylko z posiadania i po jednej sztuce na rundę, zużyte schodzą z przyjętą rundą, odrzucona nie kosztuje, stary front działa jak dotąd.
-- Jedna transakcja, zawsze wycofana (tools/gra-plecak-test.sh); wynikiem jest treść wyjątku na końcu. now() stoi w transakcji, więc upływ czasu = przesunięcie start_at.
do $T$
declare
  n int := 0; j jsonb; u1 uuid; a1 uuid; u2 uuid; a2 uuid; r1 uuid; f record; ST constant jsonb := '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}';
begin
  select a.user_id, a.id into u1, a1 from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  select a.user_id, a.id into u2, a2 from public.athletes a where a.user_id is not null and a.user_id <> u1 order by a.created_at limit 1;
  if u2 is null then raise exception 'FAIL 0: za mało kont do testu'; end if;
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  update public.akcje set gra_aktywna = true where slug = 'dla-fabianka';
  if not found then raise exception 'FAIL 0b: brak wiersza akcji'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

  -- 1. zakup: ceny jak w sklepiku, za mało cegieł bez zmian, nieznany przedmiot odmowa
  insert into public.gra_konto (athlete_id, saldo) values (a1, 7), (a2, 50);
  execute 'set local role authenticated';
  j := public.gra_kup_do_plecaka('kask');
  if not (j->>'ok')::boolean or (j->>'saldo')::int is distinct from 2 or (j #>> '{plecak,kask}')::int is distinct from 1 then raise exception 'FAIL 1a: kask %', j; end if;
  j := public.gra_kup_do_plecaka('bidon');
  if (j->>'ok')::boolean or j->>'powod' <> 'za_malo' or (j->>'saldo')::int is distinct from 2 then raise exception 'FAIL 1b: bidon bez cegieł %', j; end if;
  j := public.gra_kup_do_plecaka('helikopter');
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 1c: nieznany przedmiot %', j; end if;
  j := public.gra_moj_postep();
  if (j #>> '{plecak,kask}')::int is distinct from 1 then raise exception 'FAIL 1d: postęp bez plecaka %', j; end if;
  execute 'reset role';
  if (select plecak from public.gra_konto where athlete_id = a2) <> '{}'::jsonb then raise exception 'FAIL 1e: cudzy plecak'; end if;
  update public.gra_konto set saldo = 4 where athlete_id = a1;
  execute 'set local role authenticated';
  j := public.gra_kup_do_plecaka('bidon');
  if (j->>'saldo')::int is distinct from 0 or (j #>> '{plecak,bidon}')::int is distinct from 1 or (j #>> '{plecak,kask}')::int is distinct from 1 then raise exception 'FAIL 1f: bidon obok kasku %', j; end if;
  execute 'reset role';
  n := n + 6;

  -- 2. użycie: po jednej sztuce każdego rodzaju i tylko z posiadania; odrzucona runda nie kosztuje i nie zostawia śladu
  for f in select * from (values
      ('stary front bez pola', '{"kask":2}'::jsonb, null::jsonb, 60.0, 0, null, '{"kask":2}'::jsonb),
      ('pusta lista', '{"kask":1}', '[]', 60.0, 0, null, '{"kask":1}'),
      ('kask z plecaka', '{"kask":2}', '["kask"]', 60.0, 0, null, '{"kask":1}'),
      ('ostatni bidon', '{"bidon":1}', '["bidon"]', 65.0, 1, null, '{"bidon":0}'),
      ('oba naraz', '{"kask":1,"bidon":3}', '["kask","bidon"]', 65.0, 1, null, '{"kask":0,"bidon":2}'),
      ('dwa kaski', '{"kask":3}', '["kask","kask"]', 60.0, 0, 'plecak_ponad_limit', '{"kask":3}'),
      ('kask bez posiadania', '{}', '["kask"]', 60.0, 0, 'plecak_bez_posiadania', '{}'),
      ('zero sztuk', '{"kask":0}', '["kask"]', 60.0, 0, 'plecak_bez_posiadania', '{"kask":0}'),
      ('drugi rodzaj bez posiadania', '{"kask":1}', '["kask","bidon"]', 65.0, 1, 'plecak_bez_posiadania', '{"kask":1}'),
      ('nieznany przedmiot', '{"kask":1}', '["helikopter"]', 60.0, 0, 'zle_dane', '{"kask":1}'),
      ('liczba na liście', '{"kask":1}', '[1]', 60.0, 0, 'zle_dane', '{"kask":1}'),
      ('tekst zamiast listy', '{"kask":1}', '"kask"', 60.0, 0, 'zle_dane', '{"kask":1}'),
      ('obiekt zamiast listy', '{"kask":1}', '{"kask":1}', 60.0, 0, 'zle_dane', '{"kask":1}')
    ) v(opis, plecak, uzyte, czas, bidony, powod, po)
  loop
    delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy;
    update public.gra_konto set plecak = f.plecak, saldo = 0 where athlete_id = a1;
    execute 'set local role authenticated';
    j := public.gra_start_rundy();
    if j->'plecak' is distinct from f.plecak then raise exception 'FAIL 2a (%): start bez plecaka %', f.opis, j; end if;
    r1 := (j->>'runda')::uuid;
    execute 'reset role';
    update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
    execute 'set local role authenticated';
    j := public.gra_zapisz_wynik(r1, 'kasia', 100, f.czas, ST || jsonb_build_object('bidony', f.bidony) || case when f.uzyte is null then '{}'::jsonb else jsonb_build_object('uzyte', f.uzyte) end);
    execute 'reset role';
    if (select k.plecak from public.gra_konto k where k.athlete_id = a1) is distinct from f.po then raise exception 'FAIL 2b (%): plecak po rundzie %', f.opis, (select k.plecak from public.gra_konto k where k.athlete_id = a1); end if;
    if j->'plecak' is distinct from f.po then raise exception 'FAIL 2c (%): odpowiedź bez plecaka %', f.opis, j; end if;
    if f.powod is null then
      if not (j->>'ok')::boolean then raise exception 'FAIL 2d (%): odrzucone %', f.opis, j; end if;
      if not exists (select 1 from public.gra_wyniki where runda_id = r1) then raise exception 'FAIL 2e (%): brak wyniku', f.opis; end if;
      n := n + 3;
    else
      if (j->>'ok')::boolean or exists (select 1 from public.gra_wyniki where runda_id = r1) then raise exception 'FAIL 2f (%): runda przeszła %', f.opis, j; end if;
      if (select p.powod from public.gra_podejrzane p where p.runda_id = r1) is distinct from f.powod then raise exception 'FAIL 2g (%): powód %', f.opis, (select p.powod from public.gra_podejrzane p where p.runda_id = r1); end if;
      n := n + 3;
    end if;
    n := n + 2;
  end loop;

  -- 3. ponowienie po zerwanej sieci: drugi raz nic nie schodzi, odpowiedź z tym samym plecakiem
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy;
  update public.gra_konto set plecak = '{"kask":2}', saldo = 0 where athlete_id = a1;
  execute 'set local role authenticated'; j := public.gra_start_rundy(); r1 := (j->>'runda')::uuid; execute 'reset role';
  update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 100, 60.0, ST || '{"uzyte":["kask"]}');
  j := public.gra_zapisz_wynik(r1, 'kasia', 100, 60.0, ST || '{"uzyte":["kask"]}');
  execute 'reset role';
  if not (j->>'ok')::boolean or (j #>> '{plecak,kask}')::int is distinct from 1 or (select (k.plecak ->> 'kask')::int from public.gra_konto k where k.athlete_id = a1) is distinct from 1 then raise exception 'FAIL 3a: ponowienie %', j; end if;
  n := n + 1;

  -- 4. stary front: ulepszenie na start płaci złotymi cegłami i nie rusza plecaka
  update public.gra_konto set plecak = '{"kask":1}', saldo = 7 where athlete_id = a1;
  execute 'set local role authenticated'; j := public.gra_start_rundy('kask'); execute 'reset role';
  if j->>'ulepszenie' is distinct from 'kask' or (j->>'saldo')::int is distinct from 2 or (j #>> '{plecak,kask}')::int is distinct from 1 then raise exception 'FAIL 4a: stary front %', j; end if;
  n := n + 1;

  -- 5. zamki: klient czyta swój wiersz, nie pisze do plecaka; anon bez funkcji; kolumna odrzuca śmieci
  execute 'set local role authenticated';
  if (select count(*) from public.gra_konto) <> 1 or (select count(*) from public.gra_konto where plecak is not null and athlete_id = a2) <> 0 then raise exception 'FAIL 5a: cudzy wiersz widoczny'; end if;
  begin update public.gra_konto set plecak = '{"kask":99}'; raise exception 'FAIL 5b: klient zmienia plecak'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.gra_kup_do_plecaka('kask'); raise exception 'FAIL 5c: anon kupuje'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.gra_konto; raise exception 'FAIL 5d: anon czyta konta'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  begin update public.gra_konto set plecak = '[]' where athlete_id = a1; raise exception 'FAIL 5e: lista zamiast plecaka'; exception when check_violation then null; end;
  n := n + 5;

  -- 6. gra dalej nie zna treningów ani akcji
  if pg_get_functiondef('public.gra_kup_do_plecaka(text)'::regprocedure) ~* 'training_logs|akcja_|achievements|athlete_stats|community' then raise exception 'FAIL 6a: zakup zna treningi lub akcję'; end if;
  n := n + 1;

  raise exception 'TESTY PLECAKA ZIELONE: % asercji', n;
end $T$;
