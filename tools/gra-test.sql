-- Testy GRY (20261105_gra_cegielki.sql) PO SKUTKU, z `set local role` i request.jwt.claims (postgres omija RLS, więc bez tego test byłby zielony zawsze):
-- anon nic, klient bez zapisu do tabel, walidacja wyniku (zegar serwera, długość rundy, pułap, spójność, śmieci w JSON), jeden wynik na rundę, limit rund, obca runda,
-- RLS tylko własne, ranking bez identyfikatorów i bez graczy bez pseudonimu, trzy okresy, miejsca, pseudonim tylko przez service_role, kaskada kont, zero dotykania akcji i treningów.
-- Jedna transakcja, zawsze wycofana (tools/gra-test.sh); wynikiem jest treść wyjątku na końcu. now() stoi w transakcji, więc upływ czasu = przesunięcie start_at.
do $T$
declare
  n int := 0; c int; j jsonb; t text; u1 uuid; u2 uuid; u3 uuid; a1 uuid; a2 uuid; a3 uuid; r1 uuid; r2 uuid; saldo1 int; v_licz numeric; f record;
  ST constant jsonb := '{"zlote":3,"salta":4,"seria":9,"upadki":1,"bidony":0}';
begin
  -- Trzy zwykłe konta bez śladu po wcześniejszej grze; na bazie po wdrożeniu mogą już grać, więc czyścimy je w tej transakcji.
  select a.user_id, a.id into u1, a1 from public.athletes a where a.user_id is not null order by a.created_at limit 1;
  select a.user_id, a.id into u2, a2 from public.athletes a where a.user_id is not null and a.user_id <> u1 order by a.created_at limit 1;
  select a.user_id, a.id into u3, a3 from public.athletes a where a.user_id is not null and a.user_id not in (u1, u2) order by a.created_at limit 1;
  if u3 is null then raise exception 'FAIL 0: za mało kont do testu'; end if;
  delete from public.gra_podejrzane; delete from public.gra_wyniki; delete from public.gra_rundy; delete from public.gra_konto;
  update public.akcje set gra_aktywna = true where slug = 'dla-fabianka';
  if not found then raise exception 'FAIL 0b: brak wiersza akcji'; end if;
  n := n + 1;

  -- 1. anon: ani tabel, ani funkcji
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform 1 from public.gra_wyniki; raise exception 'FAIL 1a: anon czyta wyniki'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.gra_konto; raise exception 'FAIL 1b: anon czyta konta'; exception when insufficient_privilege then null; end;
  begin perform public.gra_ranking(); raise exception 'FAIL 1c: anon woła ranking'; exception when insufficient_privilege then null; end;
  begin perform public.gra_start_rundy(); raise exception 'FAIL 1d: anon startuje rundę'; exception when insufficient_privilege then null; end;
  begin perform public.gra_start_rundy('kask'); raise exception 'FAIL 1g: anon kupuje ulepszenie'; exception when insufficient_privilege then null; end;
  begin perform public.gra_zapisz_wynik(gen_random_uuid(), 'kasia', 1, 60, ST); raise exception 'FAIL 1e: anon zapisuje'; exception when insufficient_privilege then null; end;
  begin perform public.gra_ustaw_pseudonim(u1, 'Anon'); raise exception 'FAIL 1f: anon ustawia pseudonim'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 6;

  -- 2. zalogowany: start tworzy konto i rundę; do tabel pisać nie może
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_start_rundy(); r1 := (j->>'runda')::uuid;
  if not (j->>'ok')::boolean or r1 is null then raise exception 'FAIL 2a: start %', j; end if;
  select count(*) into c from public.gra_konto; if c <> 1 then raise exception 'FAIL 2b: konto %', c; end if;
  begin insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', 999, 999, 60, 0, 0, 0, 0, 0); raise exception 'FAIL 2c: insert do wyników'; exception when insufficient_privilege then null; end;
  begin update public.gra_konto set saldo = 999999; raise exception 'FAIL 2d: dopisanie salda'; exception when insufficient_privilege then null; end;
  begin update public.gra_konto set pseudonim = 'Obejscie'; raise exception 'FAIL 2e: pseudonim bez moderacji'; exception when insufficient_privilege then null; end;
  begin insert into public.gra_konto (athlete_id, saldo) values (a2, 5); raise exception 'FAIL 2f: cudze konto'; exception when insufficient_privilege then null; end;
  begin delete from public.gra_wyniki; raise exception 'FAIL 2g: kasowanie wyników'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.gra_rundy; raise exception 'FAIL 2h: klient czyta rundy'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.gra_podejrzane; raise exception 'FAIL 2i: klient czyta podejrzane'; exception when insufficient_privilege then null; end;
  begin perform public.gra_ustaw_pseudonim(u1, 'Obejscie'); raise exception 'FAIL 2j: klient woła zapis pseudonimu'; exception when insufficient_privilege then null; end;
  begin perform public.gra_ranking_od(date '2000-01-01'); raise exception 'FAIL 2k: klient woła funkcję wewnętrzną'; exception when insufficient_privilege then null; end;
  begin perform public.gra_miejsca(a2); raise exception 'FAIL 2l: klient podgląda miejsce innego'; exception when insufficient_privilege then null; end;
  n := n + 12;

  -- 3. zegar serwera: runda po zero sekundach odpada, wiersz w przeglądzie, saldo bez zmian, drugi zapis tej rundy nie przechodzi
  j := public.gra_zapisz_wynik(r1, 'kasia', 500, 60, ST);
  if (j->>'ok')::boolean or j->>'powod' <> 'podejrzany' then raise exception 'FAIL 3a: za krótko przyjęte %', j; end if;
  select count(*) into c from public.gra_wyniki; if c <> 0 then raise exception 'FAIL 3b: wynik zapisany'; end if;
  select saldo into saldo1 from public.gra_konto; if saldo1 <> 0 then raise exception 'FAIL 3c: saldo %', saldo1; end if;
  j := public.gra_zapisz_wynik(r1, 'kasia', 500, 60, ST);
  if (j->>'ok')::boolean then raise exception 'FAIL 3d: odrzucona runda przeszła za drugim razem'; end if;
  execute 'reset role';
  select count(*) into c from public.gra_podejrzane where runda_id = r1 and powod = 'za_krotko' and athlete_id = a1 and (dane->>'cegly')::int = 500; if c <> 1 then raise exception 'FAIL 3e: brak wpisu do przeglądu (%)', c; end if;
  update public.gra_rundy set start_at = start_at - interval '5 minutes' where id = r1;
  n := n + 5;

  -- 4. dobra runda: przyjęta, na saldo idą tylko złote (ST ma 3); ponowienie nie liczy drugi raz
  execute 'set local role authenticated';
  j := public.gra_start_rundy(); r1 := (j->>'runda')::uuid;
  execute 'reset role'; update public.gra_rundy set start_at = now() - interval '61 seconds' where id = r1; execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r1, 'kasia', 500, 60.02, ST);
  if not (j->>'ok')::boolean then raise exception 'FAIL 4a: dobra runda odrzucona %', j; end if;
  if (j#>>'{miejsca,dzien,miejsce}')::int <> 1 or (j#>>'{miejsca,dzien,cegly}')::int <> 500 then raise exception 'FAIL 4b: miejsca %', j; end if;
  select saldo into saldo1 from public.gra_konto; if saldo1 <> 3 then raise exception 'FAIL 4c: na saldo tylko złote, jest %', saldo1; end if;
  select count(*) into c from public.gra_wyniki where cegly = 500 and athlete_id = a1 and postac = 'kasia'; if c <> 1 then raise exception 'FAIL 4d: wynik %', c; end if;
  j := public.gra_zapisz_wynik(r1, 'kasia', 2000, 60, ST);
  if not (j->>'ok')::boolean then raise exception 'FAIL 4e: ponowienie %', j; end if;
  select saldo into saldo1 from public.gra_konto; if saldo1 <> 3 then raise exception 'FAIL 4f: ponowienie dopisało saldo %', saldo1; end if;
  select count(*) into c from public.gra_wyniki; if c <> 1 or exists (select 1 from public.gra_wyniki where cegly = 2000) then raise exception 'FAIL 4g: drugi wynik na rundę'; end if;
  n := n + 7;

  -- 5. odrzucone: każdy przypadek na nowej rundzie, ze wskazanym powodem
  for f in select * from (values
      ('ponad pułap', 'kasia', 6000, 60.0, ST, 'ponad_pulap'),
      ('dużo poniżej rundy', 'kasia', 10, 30.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'dlugosc_rundy'),
      ('runda dłuższa niż bidony', 'kasia', 10, 70.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'dlugosc_rundy'),
      ('bidony z kosmosu', 'kasia', 10, 560.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":100}'::jsonb, 'dlugosc_rundy'),
      ('złote ponad pułap', 'kasia', 10, 60.0, '{"zlote":31,"salta":0,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'ponad_pulap_zlotych'),
      ('salta z kosmosu', 'kasia', 100, 60.0, '{"zlote":0,"salta":500,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'sprzeczne_liczby'),
      ('tekst zamiast liczby', 'kasia', 10, 60.0, '{"zlote":"<script>","salta":0,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'zle_dane'),
      ('brak pola', 'kasia', 10, 60.0, '{"zlote":0}'::jsonb, 'zle_dane'),
      ('tablica zamiast obiektu', 'kasia', 10, 60.0, '[1,2]'::jsonb, 'zle_dane'),
      ('ujemne', 'kasia', 10, 60.0, '{"zlote":0,"salta":-1,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'zle_dane'),
      ('ułamek', 'kasia', 10, 60.0, '{"zlote":0,"salta":1.5,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'zle_dane'),
      ('ujemny wynik', 'kasia', -5, 60.0, ST, 'zle_dane'),
      ('obca postać', 'janusz', 10, 60.0, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}'::jsonb, 'zle_dane')
    ) v(opis, postac, cegly, czas, st, powod)
  loop
    execute 'reset role'; update public.gra_rundy set start_at = start_at - interval '5 minutes' where koniec_at is not null; execute 'set local role authenticated';
    r2 := (public.gra_start_rundy()->>'runda')::uuid;
    execute 'reset role'; update public.gra_rundy set start_at = now() - interval '300 seconds' where id = r2; execute 'set local role authenticated';
    j := public.gra_zapisz_wynik(r2, f.postac, f.cegly, f.czas, f.st);
    if (j->>'ok')::boolean then raise exception 'FAIL 5 (%): przyjęte', f.opis; end if;
    execute 'reset role';
    select count(*) into c from public.gra_podejrzane where runda_id = r2 and powod = f.powod; if c <> 1 then raise exception 'FAIL 5 (%): powód inny niż % (%)', f.opis, f.powod, (select string_agg(powod, ',') from public.gra_podejrzane where runda_id = r2); end if;
    if exists (select 1 from public.gra_podejrzane where runda_id = r2 and dane::text like '%<script>%') then raise exception 'FAIL 5 (%): surowy tekst od klienta w przeglądzie', f.opis; end if;
    execute 'set local role authenticated';
    n := n + 2;
  end loop;
  select count(*) into c from public.gra_wyniki; if c <> 1 then raise exception 'FAIL 5z: odrzucone trafiły do wyników (%)', c; end if;
  select saldo into saldo1 from public.gra_konto; if saldo1 <> 3 then raise exception 'FAIL 5y: odrzucone zmieniły saldo %', saldo1; end if;
  n := n + 2;

  -- 5b. bidony: 2 bidony = runda 70 s, pułap liczony od 70 s; dokładnie na pułapie przechodzi
  r2 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role'; update public.gra_rundy set start_at = now() - interval '71 seconds' where id = r2; execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'filip', 2800, 70, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":2}');
  if not (j->>'ok')::boolean then raise exception 'FAIL 5b: wynik na pułapie %', j; end if;
  n := n + 1;

  -- 5c. pauza dozwolona, ale runda sprzed 31 minut wygasła
  execute 'reset role'; update public.gra_rundy set start_at = start_at - interval '5 minutes'; execute 'set local role authenticated';
  r2 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role'; update public.gra_rundy set start_at = now() - interval '20 minutes' where id = r2; execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'filip', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if not (j->>'ok')::boolean then raise exception 'FAIL 5c: pauza 20 min odrzucona %', j; end if;
  r2 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role'; update public.gra_rundy set start_at = now() - interval '31 minutes' where id = r2; execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'filip', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if (j->>'ok')::boolean then raise exception 'FAIL 5d: wygasła przyjęta'; end if;
  n := n + 2;

  -- 5e. zwykłe i złote osobno: dużo złotych przy kilku zwykłych przechodzi, bo złota cegła nie daje punktów; dokładnie na pułapie złotych przechodzi; saldo rośnie o złote
  execute 'reset role'; update public.gra_rundy set start_at = start_at - interval '5 minutes'; execute 'set local role authenticated';
  r2 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role'; update public.gra_rundy set start_at = now() - interval '61 seconds' where id = r2; execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'filip', 2, 60, '{"zlote":30,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if not (j->>'ok')::boolean or (j->>'saldo')::int <> 33 then raise exception 'FAIL 5e: złote na pułapie %', j; end if;
  n := n + 1;

  -- 6. obca runda: drugi gracz nie zapisze wyniku na numer pierwszego i jej nie zamknie
  execute 'reset role'; update public.gra_rundy set start_at = start_at - interval '5 minutes'; execute 'set local role authenticated';
  r2 := (public.gra_start_rundy()->>'runda')::uuid;
  execute 'reset role'; update public.gra_rundy set start_at = now() - interval '61 seconds' where id = r2;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'kasia', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if (j->>'ok')::boolean then raise exception 'FAIL 6a: obca runda przyjęta'; end if;
  execute 'reset role';
  select count(*) into c from public.gra_rundy where id = r2 and koniec_at is null; if c <> 1 then raise exception 'FAIL 6b: obcy zamknął rundę'; end if;
  select count(*) into c from public.gra_podejrzane where powod = 'obca_runda' and athlete_id = a2; if c <> 1 then raise exception 'FAIL 6c: brak śladu'; end if;
  n := n + 3;

  -- 7. RLS: drugi gracz widzi tylko swoje
  execute 'set local role authenticated';
  select count(*) into c from public.gra_wyniki; if c <> 0 then raise exception 'FAIL 7a: widzi cudze wyniki (%)', c; end if;
  select count(*) into c from public.gra_konto; if c <> 0 then raise exception 'FAIL 7b: widzi cudze konto (%)', c; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select count(*) into c from public.gra_wyniki where athlete_id = a1; if c < 1 then raise exception 'FAIL 7c: właściciel nie widzi'; end if;
  select count(*) into c from public.gra_wyniki where athlete_id <> a1; if c <> 0 then raise exception 'FAIL 7d'; end if;
  n := n + 4;

  -- 8. limit rund: trzy w minucie przechodzą, czwarta nie; drugi wpis do przeglądu w tej samej minucie nie powstaje
  execute 'reset role'; update public.gra_rundy set start_at = start_at - interval '5 minutes'; delete from public.gra_podejrzane where powod = 'za_czesto'; execute 'set local role authenticated';
  for c in 1..3 loop if not (public.gra_start_rundy()->>'ok')::boolean then raise exception 'FAIL 8a: runda % w minucie', c; end if; end loop;
  j := public.gra_start_rundy();
  if (j->>'ok')::boolean or j->>'powod' <> 'za_czesto' then raise exception 'FAIL 8b: czwarta runda %', j; end if;
  perform public.gra_start_rundy();
  execute 'reset role';
  select count(*) into c from public.gra_podejrzane where powod = 'za_czesto' and athlete_id = a1; if c <> 1 then raise exception 'FAIL 8c: wpisy limitu %', c; end if;
  n := n + 3;

  -- 9. ranking: bez pseudonimu nikogo nie ma, pseudonim tylko przez service_role, zero identyfikatorów, jeden wiersz na gracza, najlepszy wynik
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_ranking();
  if jsonb_array_length(j->'wszech') <> 0 then raise exception 'FAIL 9a: gracz bez pseudonimu w rankingu %', j; end if;
  execute 'reset role';
  execute 'set local role service_role';
  j := public.gra_ustaw_pseudonim(u1, 'Pierwszy'); if not (j->>'ok')::boolean then raise exception 'FAIL 9b: %', j; end if;
  j := public.gra_ustaw_pseudonim(u2, 'pierwszy'); if (j->>'ok')::boolean or j->>'powod' <> 'zajety' then raise exception 'FAIL 9c: dwa takie same pseudonimy %', j; end if;
  j := public.gra_ustaw_pseudonim(u2, '<b>x</b>'); if (j->>'ok')::boolean or j->>'powod' <> 'zly_format' then raise exception 'FAIL 9d: znaczniki w pseudonimie %', j; end if;
  j := public.gra_ustaw_pseudonim(u2, 'Drugi'); if not (j->>'ok')::boolean then raise exception 'FAIL 9e: %', j; end if;
  execute 'reset role';
  -- Drugi: 1000 dziś i 4000 sprzed roku; Pierwszy: 2800 (runda z bidonami) dziś
  r2 := gen_random_uuid(); insert into public.gra_rundy (id, athlete_id, koniec_at) values (r2, a2, now());
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r2, a2, 'kasia', 1000, 1000, 60, 0, 0, 0, 0, 0);
  r2 := gen_random_uuid(); insert into public.gra_rundy (id, athlete_id, koniec_at) values (r2, a2, now());
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony, dzien, kiedy) values (r2, a2, 'filip', 4000, 4000, 60, 0, 0, 0, 0, 0, current_date - 365, now() - interval '365 days');
  -- trzeci gracz z wynikiem, bez pseudonimu: nie ma go na liście ani w miejscach innych
  insert into public.gra_konto (athlete_id) values (a3);
  r2 := gen_random_uuid(); insert into public.gra_rundy (id, athlete_id, koniec_at) values (r2, a3, now());
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r2, a3, 'kasia', 9000, 9000, 60, 0, 0, 0, 0, 0);
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_ranking();
  if j #>> '{dzien,0,pseudonim}' <> 'Pierwszy' or (j #>> '{dzien,0,miejsce}')::int <> 1 or j #>> '{dzien,1,pseudonim}' <> 'Drugi' or (j #>> '{dzien,1,cegly}')::int <> 1000 then raise exception 'FAIL 9f: dzień %', j->'dzien'; end if;
  if jsonb_array_length(j->'dzien') <> 2 then raise exception 'FAIL 9g: gracz bez pseudonimu albo duplikat %', j->'dzien'; end if;
  if j #>> '{wszech,0,pseudonim}' <> 'Drugi' or (j #>> '{wszech,0,cegly}')::int <> 4000 or jsonb_array_length(j->'wszech') <> 2 then raise exception 'FAIL 9h: wszech czasów %', j->'wszech'; end if;
  if (j #>> '{tydzien,0,cegly}')::int <> 2800 or jsonb_array_length(j->'tydzien') <> 2 then raise exception 'FAIL 9i: tydzień %', j->'tydzien'; end if;
  t := j::text;
  if t ~* 'athlete|user_id|runda' or position(a1::text in t) > 0 or position(a2::text in t) > 0 or position(u1::text in t) > 0 then raise exception 'FAIL 9j: identyfikator w rankingu'; end if;
  n := n + 10;

  -- 10. miejsca: ci sami gracze co na liście, trzeci bez pseudonimu nie zabiera miejsca, ale sam widzi, gdzie by stał
  execute 'reset role';
  j := public.gra_miejsca(a2);
  if (j #>> '{dzien,miejsce}')::int <> 2 or (j #>> '{wszech,miejsce}')::int <> 1 then raise exception 'FAIL 10a: %', j; end if;
  j := public.gra_miejsca(a3);
  if (j #>> '{dzien,miejsce}')::int <> 1 or (j #>> '{dzien,cegly}')::int <> 9000 then raise exception 'FAIL 10b: %', j; end if;
  n := n + 2;

  -- 10b. sklepik: za mało, zakup, ponowny zakup, nieznany przedmiot, cena z serwera, klient nie dopisze sobie przedmiotu
  update public.gra_konto set saldo = 12, kupione = '[]' where athlete_id = a2;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.gra_ranking_od(date '2000-01-01'); raise exception 'FAIL 13z'; exception when insufficient_privilege then null; end;
  j := public.gra_kup('koszulka-zlota');
  if (j->>'ok')::boolean or j->>'powod' <> 'za_malo' or (j->>'saldo')::int <> 12 then raise exception 'FAIL 13a: za mało %', j; end if;
  j := public.gra_kup('nie-ma-takiego');
  if (j->>'ok')::boolean or j->>'powod' <> 'nie_ma' then raise exception 'FAIL 13b: nieznany %', j; end if;
  j := public.gra_kup(null);
  if (j->>'ok')::boolean then raise exception 'FAIL 13c: pusty przedmiot %', j; end if;
  j := public.gra_kup('koszulka-czerwona');
  if not (j->>'ok')::boolean or (j->>'saldo')::int <> 2 or not (j->'kupione') @> '["koszulka-czerwona"]' then raise exception 'FAIL 13d: zakup %', j; end if;
  j := public.gra_kup('koszulka-czerwona');
  if (j->>'ok')::boolean or j->>'powod' <> 'juz_masz' or (j->>'saldo')::int <> 2 then raise exception 'FAIL 13e: drugi zakup %', j; end if;
  select saldo, kupione::text into c, t from public.gra_konto;
  if c <> 2 or t <> '["koszulka-czerwona"]' then raise exception 'FAIL 13f: stan % %', c, t; end if;
  begin update public.gra_konto set kupione = '["kask-rowerowy"]'; raise exception 'FAIL 13g: klient dopisał przedmiot'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.gra_kup('kamizelka'); raise exception 'FAIL 13h: anon kupuje'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 9;

  -- 10c. ulepszenie na start: płatne, zapisane przy rundzie; za mało = runda bez ulepszenia i bez opłaty; nieznane = za darmo nic; limit rund nic nie pobiera
  update public.gra_rundy set start_at = start_at - interval '5 minutes';
  update public.gra_konto set saldo = 7 where athlete_id = a2;
  execute 'set local role authenticated';
  j := public.gra_start_rundy('kask');
  if not (j->>'ok')::boolean or j->>'ulepszenie' <> 'kask' or (j->>'saldo')::int <> 2 then raise exception 'FAIL 14a: start z kaskiem %', j; end if;
  r2 := (j->>'runda')::uuid;
  j := public.gra_start_rundy('kask');
  if not (j->>'ok')::boolean or j->'ulepszenie' <> 'null'::jsonb or (j->>'saldo')::int <> 2 then raise exception 'FAIL 14b: za mało na kask %', j; end if;
  j := public.gra_start_rundy('zloty-pociag');
  if not (j->>'ok')::boolean or j->'ulepszenie' <> 'null'::jsonb or (j->>'saldo')::int <> 2 then raise exception 'FAIL 14c: nieznane ulepszenie %', j; end if;
  execute 'reset role';
  select count(*) into c from public.gra_rundy where id = r2 and ulepszenie = 'kask'; if c <> 1 then raise exception 'FAIL 14d: runda bez śladu ulepszenia'; end if;
  update public.gra_konto set saldo = 500 where athlete_id = a2;
  execute 'set local role authenticated';
  j := public.gra_start_rundy('bidon');
  if (j->>'ok')::boolean or j->>'powod' <> 'za_czesto' then raise exception 'FAIL 14e: czwarta runda %', j; end if;
  select saldo into c from public.gra_konto; if c <> 500 then raise exception 'FAIL 14f: limit pobrał opłatę, saldo %', c; end if;
  execute 'reset role';
  n := n + 6;

  -- 10d. wspólny mur: suma zwykłych cegieł z przyjętych rund (odrzucone nie mają wiersza), złote się nie liczą, cel 1 250 000; skasowany wynik schodzi z muru
  execute 'set local role authenticated';
  j := public.gra_ranking();
  execute 'reset role';
  select coalesce(sum(cegly), 0) into v_licz from public.gra_wyniki;
  if v_licz = 0 or (j->>'mur')::numeric <> v_licz then raise exception 'FAIL 15a: mur % zamiast %', j->'mur', v_licz; end if;
  if (j->>'mur_cel')::bigint <> 1250000 then raise exception 'FAIL 15b: cel %', j->'mur_cel'; end if;
  n := n + 2;

  -- 10h. kto najwięcej dołożył: wszech czasów i w czasie akcji, tylko gracze z pseudonimem, bez identyfikatorów
  update public.akcje set wystartowala_at = null, koniec = null where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.gra_ranking();
  if jsonb_array_length(j->'dolozyli_akcja') <> 0 then raise exception 'FAIL 18a: przed startem coś dołożono %', j->'dolozyli_akcja'; end if;
  if j #>> '{dolozyli_wszech,0,pseudonim}' <> 'Drugi' or (j #>> '{dolozyli_wszech,0,cegly}')::int <> 5000 then raise exception 'FAIL 18b: %', j->'dolozyli_wszech'; end if;
  if j #>> '{dolozyli_wszech,1,pseudonim}' <> 'Pierwszy' or jsonb_array_length(j->'dolozyli_wszech') <> 2 then raise exception 'FAIL 18c: gracz bez pseudonimu albo brak gracza %', j->'dolozyli_wszech'; end if;
  t := (j->'dolozyli_wszech')::text;
  if t ~* 'athlete|user_id' or position(a1::text in t) > 0 or position(a2::text in t) > 0 then raise exception 'FAIL 18d: identyfikator'; end if;
  execute 'reset role';
  select coalesce(sum(cegly), 0) into v_licz from public.gra_wyniki where athlete_id = a1;
  update public.akcje set wystartowala_at = now() - interval '2 days', push_start_at = now() where slug = 'dla-fabianka';   -- push_start_at: trigger akcje_push_start nie ma czego wysyłać
  j := public.gra_ranking();
  if j #>> '{dolozyli_akcja,0,pseudonim}' <> 'Pierwszy' or (j #>> '{dolozyli_akcja,0,cegly}')::numeric <> v_licz then raise exception 'FAIL 18e: wynik sprzed startu w akcji %', j->'dolozyli_akcja'; end if;
  if j #>> '{dolozyli_akcja,1,pseudonim}' <> 'Drugi' or (j #>> '{dolozyli_akcja,1,cegly}')::int <> 1000 then raise exception 'FAIL 18f: %', j->'dolozyli_akcja'; end if;
  j := public.gra_miejsca(a2);
  if (j #>> '{dolozyli_wszech,miejsce}')::int <> 1 or (j #>> '{dolozyli_wszech,cegly}')::int <> 5000 or (j #>> '{dolozyli_akcja,miejsce}')::int <> 2 or (j #>> '{dolozyli_akcja,cegly}')::int <> 1000 then raise exception 'FAIL 18g: miejsca %', j; end if;
  j := public.gra_miejsca(a3);
  if (j #>> '{dolozyli_wszech,cegly}')::int <> 9000 or (j #>> '{dolozyli_wszech,miejsce}')::int <> 1 then raise exception 'FAIL 18h: gracz bez pseudonimu widzi swoje miejsce %', j; end if;
  update public.akcje set start = (now() at time zone 'Europe/Warsaw')::date - 2, koniec = (now() at time zone 'Europe/Warsaw')::date - 1 where slug = 'dla-fabianka';   -- start przed końcem: CHECK akcje_koniec_po_starcie
  j := public.gra_ranking();
  if jsonb_array_length(j->'dolozyli_akcja') <> 0 then raise exception 'FAIL 18i: wynik po końcu akcji %', j->'dolozyli_akcja'; end if;
  update public.akcje set koniec = null where slug = 'dla-fabianka';
  n := n + 9;

  -- 10e. przełącznik: wyłączony = bez numeru rundy, bez opłaty, bez konta; ranking mówi, że zamknięte
  update public.gra_rundy set start_at = start_at - interval '5 minutes';
  update public.akcje set gra_aktywna = false where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.gra_start_rundy('kask');
  if (j->>'ok')::boolean or j->>'powod' <> 'wylaczona' then raise exception 'FAIL 16a: runda przy wyłączonej grze %', j; end if;
  select saldo into c from public.gra_konto; if c <> 500 then raise exception 'FAIL 16b: wyłączona gra pobrała opłatę %', c; end if;
  if (public.gra_ranking()->>'aktywna')::boolean then raise exception 'FAIL 16c: ranking mówi aktywna'; end if;
  execute 'reset role';
  update public.akcje set gra_aktywna = true where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  if not (public.gra_ranking()->>'aktywna')::boolean then raise exception 'FAIL 16d: ranking mówi nieaktywna'; end if;
  -- 10f. prywatny link: tylko service_role, po skrócie, skrót niedostępny dla klienta
  begin perform public.gra_token_ok('x'); raise exception 'FAIL 16e: klient sprawdza token'; exception when insufficient_privilege then null; end;
  begin perform gra_token_hash from public.akcje; raise exception 'FAIL 16f: klient czyta skrót'; exception when insufficient_privilege then null; end;
  begin update public.akcje set gra_aktywna = true; raise exception 'FAIL 16g: klient zmienia przełącznik'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.gra_token_ok('x'); raise exception 'FAIL 16h: anon sprawdza token'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.akcje set gra_token_hash = null where slug = 'dla-fabianka';
  execute 'set local role service_role';
  if public.gra_token_ok('tajny-token-testowy-12345') or public.gra_token_ok('') or public.gra_token_ok(null) then raise exception 'FAIL 16i: token bez skrótu w bazie pasuje'; end if;
  execute 'reset role';
  update public.akcje set gra_token_hash = encode(sha256(convert_to('tajny-token-testowy-12345', 'UTF8')), 'hex') where slug = 'dla-fabianka';
  execute 'set local role service_role';
  if not public.gra_token_ok('tajny-token-testowy-12345') then raise exception 'FAIL 16j: dobry token nie pasuje'; end if;
  if public.gra_token_ok('inny-token-testowy-12345') or public.gra_token_ok(null) then raise exception 'FAIL 16k: zły token pasuje'; end if;
  execute 'reset role';
  n := n + 11;

  -- 10g. rowerzysta: przełącznik widać w rankingu, bez wpływu na Mur i wyniki
  update public.akcje set rowerzysta_wlaczony = false where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.gra_ranking();
  if (j->>'rowerzysta')::boolean is not false then raise exception 'FAIL 17a: rowerzysta włączony %', j->'rowerzysta'; end if;
  execute 'reset role';
  update public.akcje set rowerzysta_wlaczony = true where slug = 'dla-fabianka';
  execute 'set local role authenticated';
  j := public.gra_ranking();
  if (j->>'rowerzysta')::boolean is not true then raise exception 'FAIL 17b: przełącznik nie działa'; end if;
  begin perform rowerzysta_opis from public.akcje; raise exception 'FAIL 17c: klient czyta podpis'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 3;

  -- 11. kasowanie konta: delete_my_account anonimizuje athletes, kaskada się nie odpala, więc funkcja kasuje tabele gry sama. Pseudonim nie może zostać w publicznym rankingu.
  t := pg_get_functiondef('public.delete_my_account()'::regprocedure);
  if position('public.gra_konto' in t) = 0 or position('public.gra_wyniki' in t) = 0 or position('public.gra_rundy' in t) = 0 or position('public.gra_podejrzane' in t) = 0 then raise exception 'FAIL 11c: usunięcie konta zostawia dane gry'; end if;
  n := n + 1;
  select count(*) into c from pg_constraint where contype = 'f' and confrelid = 'public.athletes'::regclass and confdeltype = 'c'
    and conrelid in ('public.gra_konto'::regclass, 'public.gra_rundy'::regclass, 'public.gra_wyniki'::regclass, 'public.gra_podejrzane'::regclass);
  if c <> 4 then raise exception 'FAIL 11: kaskada na % tabelach', c; end if;
  n := n + 1;

  -- 12. gra nie dotyka akcji ani treningów: żadna funkcja gry nie zna tych tabel, żaden trigger nie wisi na tabelach gry
  for f in select p.proname, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'gra\_%' loop
    if regexp_replace(f.d, '--[^\n]*', '', 'g') ~* 'training_logs|akcja_|(update|insert into|delete from) public\.akcje|achievements|athlete_stats|community' then raise exception 'FAIL 12a: % dotyka tabel spoza gry', f.proname; end if;
    n := n + 1;
  end loop;
  select count(*) into c from pg_trigger where not tgisinternal and tgrelid in ('public.gra_konto'::regclass, 'public.gra_rundy'::regclass, 'public.gra_wyniki'::regclass, 'public.gra_podejrzane'::regclass);
  if c <> 0 then raise exception 'FAIL 12b: triggery na tabelach gry (%)', c; end if;
  n := n + 1;

  -- 18. poziomy: te same progi co w grze
  if public.gra_poziom(0) <> 1 or public.gra_poziom(null) <> 1 or public.gra_poziom(99) <> 1 or public.gra_poziom(100) <> 2 or public.gra_poziom(10399) <> 9 or public.gra_poziom(10400) <> 10
     or public.gra_poziom(52199) <> 19 or public.gra_poziom(52200) <> 20 or public.gra_poziom(99000000) <> 20 then raise exception 'FAIL 18a: progi poziomów'; end if;
  n := n + 9;
  -- 19. korona nie jest na sprzedaż, nowe dodatki są
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_kup('korona');
  if j->>'powod' is distinct from 'nie_ma' then raise exception 'FAIL 19a: korona do kupienia %', j; end if;
  begin perform public.gra_postac_odblokowana('koparka', a1); raise exception 'FAIL 19b: klient pyta o odblokowanie'; exception when insufficient_privilege then null; end;
  begin perform public.gra_poziom(1::bigint); raise exception 'FAIL 19c: klient woła gra_poziom'; exception when insufficient_privilege then null; end;
  begin perform public.gra_suma_cegiel(a2); raise exception 'FAIL 19d: klient czyta sumę innego gracza'; exception when insufficient_privilege then null; end;
  begin perform fabianek_postac_gra from public.akcje; raise exception 'FAIL 19e: klient czyta przełącznik'; exception when insufficient_privilege then null; end;
  begin update public.akcje set fabianek_postac_gra = true; raise exception 'FAIL 19f: klient włącza koparkę'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.gra_moj_postep(); raise exception 'FAIL 19g: anon czyta postęp'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  n := n + 7;

  -- 20. rowerzysta: przełącznik i poziom 10, na serwerze
  delete from public.gra_wyniki where athlete_id = a3;
  delete from public.gra_rundy where athlete_id = a3;
  insert into public.gra_konto (athlete_id) values (a3) on conflict (athlete_id) do nothing;
  update public.akcje set rowerzysta_wlaczony = false, rowerzysta_opis = 'Podpis Testowy', fabianek_postac_gra = false where slug = 'dla-fabianka';
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_moj_postep();
  if (j->>'cegly')::bigint <> 0 or (j->>'poziom')::int <> 1 then raise exception 'FAIL 20a: postęp na starcie %', j; end if;
  j := public.gra_ranking();
  if j->>'rowerzysta_opis' is not null then raise exception 'FAIL 20b: podpis wychodzi przy wyłączonym przełączniku'; end if;
  if (j->>'postac_koparki')::boolean is not false then raise exception 'FAIL 20c: koparka włączona domyślnie'; end if;
  execute 'reset role';
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'rowerzysta', 100, 60, '{"zlote":1,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'postac_zablokowana' then raise exception 'FAIL 20d: rower przy wyłączonym przełączniku %', j; end if;
  execute 'reset role';
  select count(*) into c from public.gra_wyniki where athlete_id = a3; if c <> 0 then raise exception 'FAIL 20e: odrzucony rower w wynikach'; end if;
  select saldo into saldo1 from public.gra_konto where athlete_id = a3; if saldo1 <> 0 then raise exception 'FAIL 20f: odrzucony rower dał złote'; end if;
  update public.akcje set rowerzysta_wlaczony = true where slug = 'dla-fabianka';
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'rowerzysta', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'postac_zablokowana' then raise exception 'FAIL 20g: rower na poziomie 1 %', j; end if;
  j := public.gra_ranking();
  if j->>'rowerzysta_opis' <> 'Podpis Testowy' then raise exception 'FAIL 20h: podpis przy włączonym'; end if;
  execute 'reset role';
  insert into public.gra_rundy (athlete_id) values (a3) returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a3, 'kasia', 10399, 10399, 60, 0, 0, 0, 0, 0);
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'rowerzysta', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'postac_zablokowana' then raise exception 'FAIL 20i: rower na poziomie 9 %', j; end if;
  execute 'reset role';
  insert into public.gra_rundy (athlete_id) values (a3) returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a3, 'kasia', 1, 1, 60, 0, 0, 0, 0, 0);
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'rowerzysta', 500, 60, '{"zlote":2,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 20j: rower na poziomie 10 odrzucony %', j; end if;
  if (j->>'cegly_lacznie')::bigint <> 10900 then raise exception 'FAIL 20k: suma po rundzie %', j; end if;
  j := public.gra_moj_postep();
  if (j->>'cegly')::bigint <> 10900 or (j->>'poziom')::int <> 10 then raise exception 'FAIL 20l: postęp %', j; end if;
  execute 'reset role';
  select postac into t from public.gra_wyniki where runda_id = r2; if t <> 'rowerzysta' then raise exception 'FAIL 20m: postać w wyniku %', t; end if;
  -- poziom jest, przełącznika nie ma: przełącznik wygrywa
  update public.akcje set rowerzysta_wlaczony = false where slug = 'dla-fabianka';
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'rowerzysta', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'postac_zablokowana' then raise exception 'FAIL 20n: poziom 10 przy wyłączonym przełączniku %', j; end if;
  execute 'reset role';
  update public.akcje set rowerzysta_wlaczony = true where slug = 'dla-fabianka';
  n := n + 14;

  -- 21. koparka: przełącznik, potem poziom 20 albo ukończony mur dla wszystkich
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'koparka', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'postac_zablokowana' then raise exception 'FAIL 21a: koparka przy wyłączonym przełączniku %', j; end if;
  execute 'reset role';
  update public.akcje set fabianek_postac_gra = true where slug = 'dla-fabianka';
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_ranking();
  if (j->>'postac_koparki')::boolean is not true then raise exception 'FAIL 21b: przełącznik koparki nie działa'; end if;
  j := public.gra_zapisz_wynik(r2, 'koparka', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'postac_zablokowana' then raise exception 'FAIL 21c: koparka poniżej poziomu 20 i bez muru %', j; end if;
  execute 'reset role';
  -- poziom 20 bez ukończonego muru: wystarcza sam poziom
  delete from public.gra_wyniki where athlete_id = a2;
  insert into public.gra_rundy (athlete_id) values (a2) returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a2, 'kasia', 52200, 52200, 60, 0, 0, 0, 0, 0);
  insert into public.gra_konto (athlete_id) values (a2) on conflict (athlete_id) do nothing;
  select coalesce(sum(cegly), 0) into v_licz from public.gra_wyniki; if v_licz >= 1250000 then raise exception 'FAIL 21h: mur już gotowy w teście (%)', v_licz; end if;
  insert into public.gra_rundy (athlete_id, start_at) values (a2, now() - interval '70 seconds') returning id into r2;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'koparka', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 21i: poziom 20 bez muru odrzucony %', j; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  insert into public.gra_rundy (athlete_id) values (a1) returning id into r1;
  insert into public.gra_wyniki (runda_id, athlete_id, postac, cegly, punkty, czas_s, zlote, salta, seria, upadki, bidony) values (r1, a1, 'kasia', 13000000, 13000000, 60, 0, 0, 0, 0, 0);
  insert into public.gra_rundy (athlete_id, start_at) values (a3, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'koparka', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 21d: mur gotowy, a koparka zamknięta %', j; end if;
  execute 'reset role';
  update public.akcje set fabianek_postac_gra = false where slug = 'dla-fabianka';
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '70 seconds') returning id into r2;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'koparka', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'postac_zablokowana' then raise exception 'FAIL 21e: poziom 20 przy wyłączonym przełączniku %', j; end if;
  execute 'reset role';
  update public.akcje set fabianek_postac_gra = true where slug = 'dla-fabianka';
  insert into public.gra_rundy (athlete_id, start_at) values (a1, now() - interval '70 seconds') returning id into r2;
  execute 'set local role authenticated';
  j := public.gra_zapisz_wynik(r2, 'koparka', 100, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if (j->>'ok')::boolean is not true then raise exception 'FAIL 21f: poziom 20 odrzucony %', j; end if;
  j := public.gra_zapisz_wynik(gen_random_uuid(), 'nieznana', 1, 60, '{"zlote":0,"salta":0,"seria":0,"upadki":0,"bidony":0}');
  if j->>'powod' is distinct from 'podejrzany' then raise exception 'FAIL 21g: obca runda %', j; end if;
  execute 'reset role';
  n := n + 10;

  raise exception 'TESTY GRY ZIELONE: % asercji', n;
end $T$;
