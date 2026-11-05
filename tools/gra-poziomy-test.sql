-- Testy POZIOMÓW I PUNKTÓW GRY (20261106_gra_poziomy.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS, więc bez tego test byłby zielony zawsze).
-- Punkty = cegły × mnożnik liczone przez serwer, poziom z cegieł, limit 45 cegieł/s co do cegły, runda z poziomem ponad konto podejrzana i bez śladu, weteran przed nowym w rankingu, dołożone po punktach, mur i koparka za mur po cegłach, nagrody, rozdział Meta, premiera Szefa.
-- Jedna transakcja, zawsze wycofana (tools/gra-poziomy-test.sh); wynikiem jest treść wyjątku na końcu. now() stoi w transakcji, więc upływ czasu = przesunięcie start_at.
do $T$
declare
  n int := 0; j jsonb; u1 uuid; a1 uuid; u2 uuid; a2 uuid; r1 uuid; f record; v_saldo int; v_mur numeric; rola text;
begin
  select a.user_id, a.id into u1, a1 from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  select a.user_id, a.id into u2, a2 from public.athletes a where a.user_id is not null and a.user_id <> u1 order by a.created_at limit 1;
  if u2 is null then raise exception 'FAIL 0: za mało kont do testu'; end if;
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  update public.akcje set gra_aktywna = true where slug = 'dla-fabianka';
  if not found then raise exception 'FAIL 0b: brak wiersza akcji'; end if;

  -- 1. mnożnik: 1 + 0,17 × (poziom − 1), sufit ×4,23; progi poziomów z cegieł
  if public.gra_mnoznik_poziomu(1) <> 1 or public.gra_mnoznik_poziomu(2) <> 1.17 or public.gra_mnoznik_poziomu(5) <> 1.68 or public.gra_mnoznik_poziomu(10) <> 2.53 or public.gra_mnoznik_poziomu(19) <> 4.06 or public.gra_mnoznik_poziomu(20) <> 4.23 or public.gra_mnoznik_poziomu(30) <> 4.23 or public.gra_mnoznik_poziomu(null) <> 1 then raise exception 'FAIL 1a: mnożnik'; end if;
  if public.gra_poziom(0) <> 1 or public.gra_poziom(99) <> 1 or public.gra_poziom(100) <> 2 or public.gra_poziom(299) <> 2 or public.gra_poziom(300) <> 3 or public.gra_poziom(699) <> 3 or public.gra_poziom(700) <> 4 or public.gra_poziom(10399) <> 9 or public.gra_poziom(10400) <> 10 or public.gra_poziom(52199) <> 19 or public.gra_poziom(52200) <> 20 or public.gra_poziom(9000000) <> 20 then raise exception 'FAIL 1b: progi'; end if;
  n := n + 2;

  -- 2. limit co do cegły, punkty liczone przez serwer, poziom z sumy cegieł; deklaracja klienta go nie podnosi
  for f in select * from (values
      ('poziom 1 na limicie', 0, 1, 2700, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":1}'::jsonb, null, 2700),
      ('poziom 1 nad limitem', 0, 1, 2701, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":1}'::jsonb, 'ponad_pulap', 0),
      ('poziom 10 na limicie', 10400, 10, 2700, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":10}'::jsonb, null, 6831),
      ('poziom 10 nad limitem', 10400, 10, 2701, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":10}'::jsonb, 'ponad_pulap', 0),
      ('bidon wydłuża limit', 10400, 10, 2925, 65.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":1,"poziom":10}'::jsonb, null, 7400),
      ('bidon nad limitem', 10400, 10, 2926, 65.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":1,"poziom":10}'::jsonb, 'ponad_pulap', 0),
      ('poziom 20 na limicie', 52200, 20, 2700, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":20}'::jsonb, null, 11421),
      ('poziom 20 nad limitem', 52200, 20, 2701, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":20}'::jsonb, 'ponad_pulap', 0),
      ('zaokrąglenie punktów', 10400, 10, 50, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":2}'::jsonb, null, 59),
      ('poziom ponad konto', 0, 1, 100, 60.0, '{"zlote":3,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":2}'::jsonb, 'poziom_ponad_konto', 0),
      ('podrobiony poziom nie daje punktów', 0, 1, 2000, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":20}'::jsonb, 'poziom_ponad_konto', 0),
      ('poziom o jeden ponad konto na 10', 10400, 10, 100, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":11}'::jsonb, 'poziom_ponad_konto', 0),
      ('poziom ułamkowy', 0, 1, 10, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":1.5}'::jsonb, 'zle_dane', 0),
      ('poziom tekstem', 0, 1, 10, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":"20"}'::jsonb, 'zle_dane', 0),
      ('poziom zero', 0, 1, 10, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":0}'::jsonb, 'zle_dane', 0),
      ('runda z niższego poziomu: jego mnożnik', 10400, 10, 100, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":5}'::jsonb, null, 168),
      ('stary front bez pola: poziom z konta', 10400, 10, 100, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}'::jsonb, null, 253),
      ('stary front nad limitem', 10400, 10, 2701, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'ponad_pulap', 0)
    ) v(opis, suma, poziom, cegly, czas, st, powod, punkty)
  loop
    execute 'reset role';
    delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
    insert into public.gra_konto (athlete_id) values (a1);
    if f.suma > 0 then
      insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '5 minutes') returning id into r1;
      insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', f.suma, f.suma, 60, 0, 0, 0, 0, 0);
    end if;
    select coalesce(sum(w.cegly), 0) into v_mur from public.gra_wyniki w;
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    j := public.gra_start_rundy();
    if (j->>'poziom')::int is distinct from f.poziom then raise exception 'FAIL 2a (%): poziom rundy %', f.opis, j; end if;
    r1 := (j->>'runda')::uuid;
    execute 'reset role';
    if (select r.poziom from public.gra_rundy r where r.id = r1) is distinct from f.poziom then raise exception 'FAIL 2b (%): poziom nie zapisany', f.opis; end if;
    update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
    execute 'set local role authenticated';
    j := public.gra_zapisz_wynik(r1, 'kasia', f.cegly, f.czas, f.st);
    execute 'reset role';
    if f.powod is null then
      if not (j->>'ok')::boolean then raise exception 'FAIL 2c (%): odrzucone %', f.opis, j; end if;
      if not exists (select 1 from public.gra_wyniki w where w.runda_id = r1 and w.cegly = f.cegly and w.punkty = f.punkty) then raise exception 'FAIL 2d (%): zły wynik %', f.opis, (select jsonb_agg(jsonb_build_array(w.cegly, w.punkty)) from public.gra_wyniki w where w.runda_id = r1); end if;
      if (j->>'punkty')::int <> f.punkty then raise exception 'FAIL 2j (%): punkty w odpowiedzi %', f.opis, j->'punkty'; end if;
      if (public.gra_ranking()->>'mur')::numeric <> v_mur + f.cegly then raise exception 'FAIL 2k (%): mur ma liczyć cegły, nie punkty', f.opis; end if;
      if (j->>'cegly_lacznie')::bigint <> f.suma + f.cegly then raise exception 'FAIL 2l (%): suma cegieł %', f.opis, j->'cegly_lacznie'; end if;
    else
      if (j->>'ok')::boolean then raise exception 'FAIL 2e (%): przyjęte', f.opis; end if;
      if not exists (select 1 from public.gra_podejrzane p where p.runda_id = r1 and p.powod = f.powod) then raise exception 'FAIL 2f (%): zły powód %', f.opis, (select jsonb_agg(p.powod) from public.gra_podejrzane p); end if;
      if exists (select 1 from public.gra_wyniki w where w.runda_id = r1) then raise exception 'FAIL 2g (%): odrzucona runda w wynikach', f.opis; end if;
      select k.saldo into v_saldo from public.gra_konto k where k.athlete_id = a1;
      if v_saldo <> 0 then raise exception 'FAIL 2h (%): odrzucona runda dała złote %', f.opis, v_saldo; end if;
      if (public.gra_ranking()->>'mur')::numeric <> v_mur then raise exception 'FAIL 2i (%): odrzucona runda w murze', f.opis; end if;
    end if;
    n := n + 1;
  end loop;

  -- 3. runda sprzed migracji: bez zapisanego poziomu liczy się poziom z konta
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy;
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '5 minutes') returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', 10400, 10400, 60, 0, 0, 0, 0, 0);
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '70 seconds') returning id into r1;
  if (select r.poziom from public.gra_rundy r where r.id = r1) is not null then raise exception 'FAIL 3a: domyślny poziom rundy'; end if;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  execute 'reset role';
  if (j->>'punkty')::int is distinct from 253 then raise exception 'FAIL 3b: runda sprzed migracji %', j; end if;
  n := n + 2;

  -- 4. weteran nie przegrywa z nowym: mniej cegieł na wysokim poziomie, więcej punktów. Ranking, miejsca i dołożone po punktach, mur po cegłach.
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  insert into public.gra_konto (athlete_id, pseudonim) values (a1, 'Weteran'), (a2, 'Nowy');
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '5 minutes') returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony, dzien) values (r1, a1, 'kasia', 52200, 0, 60, 0, 0, 0, 0, 0, date '2020-01-15');
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r1 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role';
  update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 133, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":20}');
  execute 'reset role';
  if (j->>'punkty')::int <> 563 then raise exception 'FAIL 4a: punkty weterana %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r1 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role';
  update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 431, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":1}');
  if (j->>'punkty')::int <> 431 then raise exception 'FAIL 4b: punkty nowego %', j; end if;
  if (j #>> '{miejsca,dzien,miejsce}')::int <> 2 or (j #>> '{miejsca,dzien,punkty}')::int <> 431 then raise exception 'FAIL 4c: miejsce nowego %', j->'miejsca'; end if;
  j := public.gra_ranking();
  execute 'reset role';
  if j #>> '{dzien,0,pseudonim}' <> 'Weteran' or (j #>> '{dzien,0,punkty}')::int <> 563 or (j #>> '{dzien,0,cegly}')::int <> 133 or j #>> '{dzien,1,pseudonim}' <> 'Nowy' then raise exception 'FAIL 4d: ranking dnia %', j->'dzien'; end if;
  if j #>> '{dolozyli_wszech,0,pseudonim}' <> 'Weteran' or (j #>> '{dolozyli_wszech,0,punkty}')::int <> 563 or (j #>> '{dolozyli_wszech,1,punkty}')::int <> 431 then raise exception 'FAIL 4e: dołożone po punktach %', j->'dolozyli_wszech'; end if;
  if (j->>'mur')::int <> 52764 then raise exception 'FAIL 4f: mur po cegłach, jest %', j->'mur'; end if;
  if public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 4g: koparka bez przełącznika'; end if;
  n := n + 7;
  update public.akcje set fabianek_postac_gra = true where slug = 'dla-fabianka';
  if public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 4h: mur niegotowy, koparka otwarta'; end if;
  update public.gra_wyniki set punkty = 1250000 where athlete_id = a1 and cegly = 133;
  if public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 4i: punkty otworzyły koparkę za mur'; end if;
  update public.gra_wyniki set cegly = 1250000 where athlete_id = a1 and cegly = 133;
  if not public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 4l: mur gotowy w cegłach, koparka zamknięta'; end if;
  update public.akcje set fabianek_postac_gra = false where slug = 'dla-fabianka';
  n := n + 3;
  -- Więcej cegieł, mniej punktów: nie wygrywa ani w najlepszej rundzie, ani w dołożonych.
  update public.gra_wyniki set cegly = 133, punkty = 563 where athlete_id = a1 and cegly = 1250000;
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '5 minutes') returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', 200, 200, 60, 0, 0, 0, 0, 0);
  insert into public.gra_rundy (athlete_id, start_at) values (a2, now() - interval '5 minutes') returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony, dzien) values (r1, a2, 'kasia', 90000, 0, 60, 0, 0, 0, 0, 0, date '2020-01-15');
  j := public.gra_ranking();
  if (j #>> '{dzien,0,punkty}')::int <> 563 or (j #>> '{dzien,0,cegly}')::int <> 133 then raise exception 'FAIL 4j: najlepsza runda nie po punktach %', j->'dzien'; end if;
  if j #>> '{dolozyli_wszech,0,pseudonim}' <> 'Weteran' or (j #>> '{dolozyli_wszech,0,miejsce}')::int <> 1 or (j #>> '{dolozyli_wszech,1,miejsce}')::int <> 2 then raise exception 'FAIL 4k: dołożone nie po punktach %', j->'dolozyli_wszech'; end if;
  j := public.gra_miejsca(a2);
  if (j #>> '{dolozyli_wszech,miejsce}')::int <> 2 or (j #>> '{dolozyli_wszech,punkty}')::int <> 431 or (j #>> '{dolozyli_wszech,cegly}')::int <> 90431 then raise exception 'FAIL 4l: moje dołożone %', j->'dolozyli_wszech'; end if;
  n := n + 3;

  -- 5. rozdział Meta tylko przy zgodzie i włączonej postaci; ranking dalej bez adresów
  for f in select * from (values (false, false, false), (true, false, false), (false, true, false), (true, true, true)) v(zgoda, postac, oczek) loop
    update public.akcje set wizerunek_url = null, wizerunek_zgoda = f.zgoda, fabianek_postac_gra = f.postac where slug = 'dla-fabianka';
    j := public.gra_ranking();
    if (j->>'rozdzial_meta')::boolean is distinct from f.oczek then raise exception 'FAIL 5a: zgoda % postać % daje %', f.zgoda, f.postac, j->'rozdzial_meta'; end if;
    n := n + 1;
  end loop;
  if j::text ~* 'storage/v1|koparka_url|arkusz' then raise exception 'FAIL 5b: adres w rankingu'; end if;
  n := n + 1;

  -- 6. nagrody za rozdziały: przy przyjętej rundzie, raz, bez dublowania kupionego i bez zmiany salda; odrzucona runda nic nie daje
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  insert into public.gra_konto (athlete_id, saldo, kupione) values (a1, 7, '["opaska", "okulary"]');
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '5 minutes') returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', 10400, 10400, 60, 0, 0, 0, 0, 0);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r1 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role';
  update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 9000, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":10}');
  execute 'reset role';
  if (j->>'powod') is distinct from 'podejrzany' then raise exception 'FAIL 6a: wynik ponad limit nie odrzucony %', j; end if;
  if (select k.kupione from public.gra_konto k where k.athlete_id = a1) <> '["opaska", "okulary"]'::jsonb then raise exception 'FAIL 6b: odrzucona runda dała nagrodę'; end if;
  update public.gra_rundy set start_at = start_at - interval '5 minutes';
  execute 'set local role authenticated';
  r1 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role';
  update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":10}');
  execute 'reset role';
  if j->'nagrody' <> '["spodenki-czerwone", "kamizelka"]'::jsonb then raise exception 'FAIL 6c: nagrody %', j->'nagrody'; end if;
  if (select k.saldo from public.gra_konto k where k.athlete_id = a1) <> 7 then raise exception 'FAIL 6d: nagroda zmieniła saldo'; end if;
  if (select k.kupione from public.gra_konto k where k.athlete_id = a1) <> '["opaska", "okulary", "spodenki-czerwone", "kamizelka"]'::jsonb or j->'kupione' <> (select k.kupione from public.gra_konto k where k.athlete_id = a1) then raise exception 'FAIL 6e: kupione %', j->'kupione'; end if;
  update public.gra_rundy set start_at = start_at - interval '5 minutes';
  execute 'set local role authenticated';
  r1 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role';
  update public.gra_rundy set start_at = now() - interval '70 seconds' where id = r1;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0,"poziom":10}');
  execute 'reset role';
  if j->'nagrody' <> '[]'::jsonb or jsonb_array_length(j->'kupione') <> 4 then raise exception 'FAIL 6f: nagroda drugi raz %', j; end if;
  for f in select * from (values (3, 0), (4, 1), (6, 1), (7, 2), (9, 2), (10, 3), (11, 4), (14, 4), (15, 5), (19, 5), (20, 7)) v(poziom, ile) loop
    if jsonb_array_length(public.gra_nagrody_do_poziomu(f.poziom)) <> f.ile then raise exception 'FAIL 6g: poziom % daje %', f.poziom, public.gra_nagrody_do_poziomu(f.poziom); end if;
  end loop;
  n := n + 7;

  -- 6b. premiera Szefa: tylko startujący, po starcie, przy zgodzie, raz, z limitem; cegły w murze, poza rankingiem i bez wpływu na poziom
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto; delete from public.gra_pierwsze_cegly;
  delete from public.akcja_startujacy where akcja_id = (select id from public.akcje where slug = 'dla-fabianka') and athlete_id = a2;
  insert into public.akcja_startujacy (akcja_id, athlete_id) select id, a1 from public.akcje where slug = 'dla-fabianka' and not exists (select 1 from public.akcja_startujacy s where s.akcja_id = public.akcje.id and s.athlete_id = a1);
  update public.akcje set wystartowala_at = null, push_start_at = now(), wizerunek_url = null, wizerunek_zgoda = true, koniec = null where slug = 'dla-fabianka';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.premiera_szefa_zapisz(300, 60);
  execute 'reset role';
  if j->>'powod' is distinct from 'przed_startem' then raise exception 'FAIL 6h: przed startem %', j; end if;
  update public.akcje set wystartowala_at = now() - interval '2 minutes', wizerunek_zgoda = false where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.premiera_szefa_zapisz(300, 60);
  execute 'reset role';
  if j->>'powod' is distinct from 'bez_zgody' then raise exception 'FAIL 6i: bez zgody %', j; end if;
  update public.akcje set wizerunek_zgoda = true where slug = 'dla-fabianka';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.premiera_szefa_zapisz(300, 60);
  execute 'reset role';
  if j->>'powod' is distinct from 'nie_startujacy' then raise exception 'FAIL 6j: obce konto %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  for f in select * from (values (2701, 60.0), (10, 30.0), (10, 200.0), (-1, 60.0)) v(cegly, czas) loop
    execute 'set local role authenticated';
    j := public.premiera_szefa_zapisz(f.cegly, f.czas);
    execute 'reset role';
    if j->>'powod' is distinct from 'zle_dane' then raise exception 'FAIL 6k: % cegieł w % s: %', f.cegly, f.czas, j; end if;
  end loop;
  update public.akcje set wystartowala_at = now() - interval '10 seconds' where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.premiera_szefa_zapisz(300, 60);
  execute 'reset role';
  if j->>'powod' is distinct from 'za_krotko' then raise exception 'FAIL 6l: runda dłuższa niż czas od guzika %', j; end if;
  if exists (select 1 from public.gra_pierwsze_cegly) then raise exception 'FAIL 6m: odmowa zapisała cegły'; end if;
  update public.akcje set wystartowala_at = now() - interval '2 minutes' where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.premiera_szefa_zapisz(300, 60);
  execute 'reset role';
  if not (j->>'ok')::boolean or (j->>'juz')::boolean or (j->>'cegly')::int <> 300 then raise exception 'FAIL 6n: zapis %', j; end if;
  execute 'set local role authenticated';
  j := public.premiera_szefa_zapisz(999, 60);
  execute 'reset role';
  if not (j->>'juz')::boolean or (j->>'cegly')::int <> 300 then raise exception 'FAIL 6o: drugi zapis %', j; end if;
  j := public.gra_ranking();
  if (j->>'mur')::int <> 300 or (j->>'pierwsze_cegly')::int <> 300 then raise exception 'FAIL 6p: mur %', j; end if;
  if jsonb_array_length(j->'dzien') <> 0 or jsonb_array_length(j->'dolozyli_wszech') <> 0 then raise exception 'FAIL 6q: premiera w rankingu %', j; end if;
  if exists (select 1 from public.gra_wyniki) or public.gra_suma_cegiel(a1) <> 0 then raise exception 'FAIL 6r: premiera podnosi poziom startującego'; end if;
  if j->>'magazyn_podpis' is not null then raise exception 'FAIL 6s: podpis firmy domyślnie %', j->'magazyn_podpis'; end if;
  update public.akcje set magazyn_podpis = 'Podpis Testowy' where slug = 'dla-fabianka';
  if public.gra_ranking()->>'magazyn_podpis' <> 'Podpis Testowy' then raise exception 'FAIL 6t: podpis nie wychodzi'; end if;
  begin update public.akcje set magazyn_podpis = '<b>x</b>' where slug = 'dla-fabianka'; raise exception 'FAIL 6u: znacznik w podpisie'; exception when check_violation then null; end;
  n := n + 14;
  -- Koparka dla wszystkich: mur z pierwszymi cegłami albo zamknięta akcja, zawsze za przełącznikiem.
  update public.akcje set fabianek_postac_gra = false, koniec = current_date, start = current_date - 1 where slug = 'dla-fabianka';
  if public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 6v: zamknięta akcja bez przełącznika'; end if;
  if (public.gra_ranking()->>'zamknieta')::boolean is not true then raise exception 'FAIL 6z: ranking nie wie o zamknięciu'; end if;
  update public.akcje set fabianek_postac_gra = true where slug = 'dla-fabianka';
  if not public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 6w: zamknięta akcja, koparka zamknięta'; end if;
  update public.akcje set koniec = null where slug = 'dla-fabianka';
  if public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 6x: akcja trwa, koparka otwarta'; end if;
  if (public.gra_ranking()->>'zamknieta')::boolean is not false then raise exception 'FAIL 6za: ranking mówi o zamknięciu w trakcie'; end if;
  update public.gra_pierwsze_cegly set cegly = 1250000;
  if not public.gra_postac_odblokowana('koparka', a2) then raise exception 'FAIL 6y: mur gotowy, koparka zamknięta'; end if;
  update public.akcje set fabianek_postac_gra = false where slug = 'dla-fabianka';
  delete from public.gra_pierwsze_cegly;
  n := n + 6;

  -- 6c. stroje osobno na postać: każda swój, tylko kupione, koparka bez dodatków, saldo i kupione nietknięte; czyta właściciel, nie inne konto
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  insert into public.gra_konto (athlete_id, saldo, kupione) values (a1, 7, '["koszulka-czerwona", "opaska", "kask-rowerowy"]');
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_zapisz_stroje('{"kasia":{"tulow":"koszulka-czerwona","glowa":"opaska"},"filip":{"tulow":"koszulka-zlota","glowa":"kask-rowerowy"},"koparka":{"glowa":"opaska"},"ktos":{"glowa":"opaska"},"rowerzysta":"smiec"}');
  execute 'reset role';
  if j->'stroje' <> '{"kasia":{"tulow":"koszulka-czerwona","glowa":"opaska"},"filip":{"glowa":"kask-rowerowy"}}'::jsonb then raise exception 'FAIL 6ca: stroje %', j; end if;
  if (select k.stroje from public.gra_konto k where k.athlete_id = a1) <> j->'stroje' then raise exception 'FAIL 6cb: nie zapisane'; end if;
  if (select k.saldo from public.gra_konto k where k.athlete_id = a1) <> 7 or (select jsonb_array_length(k.kupione) from public.gra_konto k where k.athlete_id = a1) <> 3 then raise exception 'FAIL 6cc: strój ruszył saldo lub kupione'; end if;
  execute 'set local role authenticated';
  j := public.gra_zapisz_stroje('{"kasia":{"tulow":"koszulka-czerwona"},"filip":{"glowa":"kask-rowerowy"}}');
  execute 'reset role';
  if j #>> '{stroje,kasia,glowa}' is not null or j #>> '{stroje,filip,glowa}' <> 'kask-rowerowy' then raise exception 'FAIL 6cd: zmiana stroju Kasi ruszyła Filipa %', j; end if;
  execute 'set local role authenticated';
  j := public.gra_zapisz_stroje('[]');
  execute 'reset role';
  if j->>'powod' is distinct from 'zle_dane' then raise exception 'FAIL 6ce: tablica %', j; end if;
  execute 'set local role authenticated';
  j := public.gra_zapisz_stroje(jsonb_build_object('kasia', jsonb_build_object('glowa', repeat('x', 2100))));
  execute 'reset role';
  if j->>'powod' is distinct from 'zle_dane' then raise exception 'FAIL 6cf: za długie %', j; end if;
  if (select k.stroje from public.gra_konto k where k.athlete_id = a1) #>> '{filip,glowa}' <> 'kask-rowerowy' then raise exception 'FAIL 6cg: odmowa zmieniła zapis'; end if;
  execute 'set local role authenticated';
  j := public.gra_ranking();
  execute 'reset role';
  if j::text ~ 'kask-rowerowy' then raise exception 'FAIL 6ch: strój w rankingu'; end if;
  n := n + 8;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.gra_konto k where k.athlete_id = a1) then raise exception 'FAIL 6ci: inne konto widzi strój'; end if;
  begin update public.gra_konto set stroje = '{}'::jsonb where athlete_id = a2; raise exception 'FAIL 6cj: klient zapisuje strój wprost'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.gra_zapisz_stroje('{}'); raise exception 'FAIL 6ck: anon zapisuje strój'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 7. klient: bez funkcji mnożnika i nagród, bez dostępu do rund, bez zapisu do wyników
  foreach rola in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', rola)::text, true);
    execute 'set local role ' || rola;
    begin perform public.gra_mnoznik_poziomu(1); raise exception 'FAIL 7a: % woła mnożnik', rola; exception when insufficient_privilege then null; end;
    begin perform public.gra_nagrody_do_poziomu(20); raise exception 'FAIL 7c: % woła nagrody', rola; exception when insufficient_privilege then null; end;
    begin perform public.gra_mur(); raise exception 'FAIL 7e: % woła mur', rola; exception when insufficient_privilege then null; end;
    begin perform 1 from public.gra_pierwsze_cegly; raise exception 'FAIL 7f: % czyta pierwsze cegły', rola; exception when insufficient_privilege then null; end;
    begin perform 1 from public.gra_rundy; raise exception 'FAIL 7b: % czyta rundy', rola; exception when insufficient_privilege then null; end;
    begin update public.gra_wyniki set punkty = 999999; raise exception 'FAIL 7d: % zmienia punkty', rola; exception when insufficient_privilege then null; end;
    execute 'reset role';
    n := n + 6;
  end loop;
  execute 'set local role anon';
  begin perform public.premiera_szefa_zapisz(1, 60); raise exception 'FAIL 7g: anon zapisuje premierę'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 1;

  raise exception 'TESTY POZIOMOW ZIELONE: % asercji', n;
end $T$;
