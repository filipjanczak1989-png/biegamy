-- Testy 20261106_okienko_wiedza.sql PO SKUTKU (LEKCJE #19): role naprawdę przełączone przez set local role, JWT trenera i zwykłego konta, wszystko wycofane razem z transakcją.
do $T$
declare
  n int := 0; tr uuid; obcy uuid := '00000000-0000-4000-8000-00000000abcd'; id1 bigint; id2 bigint; c int; r record;
  kl text := 'test wiedza ' || txid_current();
begin
  select id into tr from public.coaches order by id limit 1;
  if tr is null then raise exception 'FAIL 0: brak trenera do testu'; end if;

  -- 1. kandydat: nowy wiersz, licznik 1, do przepisania
  select * into r from public.okienko_wiedza_kandydat(kl, 'jak zacząć biegać', 'Zacznij od 20 minut marszobiegu 3 razy w tygodniu.', '[{"tytul":"a","url":"https://a.pl/x"}]', 'porada', 'start', 'wieczna', null, false, current_date);
  id1 := r.wpis_id; if r.do_przepisania is not true then raise exception 'FAIL 1: nowy wpis do przepisania'; end if; n := n + 1;
  if (select zapytan from public.okienko_wiedza where id = id1) <> 1 or (select status from public.okienko_wiedza where id = id1) <> 'kandydat' then raise exception 'FAIL 2: licznik i status nowego'; end if; n := n + 1;

  -- 2. to samo pytanie: licznik +1, ten sam wiersz, bez duplikatu, bez ponownego przepisania; inne słowa: wariant raz
  select * into r from public.okienko_wiedza_kandydat(kl, 'od czego zacząć bieganie', 'Inna odpowiedź, która nie może nadpisać tamtej.', '[]', 'porada', 'start', 'wieczna', null, false, current_date);
  if r.wpis_id <> id1 or r.do_przepisania then raise exception 'FAIL 3: powtórka to ten sam wiersz bez przepisania'; end if; n := n + 1;
  perform public.okienko_wiedza_kandydat(kl, 'od czego zacząć bieganie', 'Inna odpowiedź, która nie może nadpisać tamtej.', '[]', 'porada', 'start', 'wieczna', null, false, current_date);
  select zapytan, cardinality(warianty) into c, id2 from public.okienko_wiedza where id = id1;
  if c <> 3 or id2 <> 1 then raise exception 'FAIL 4: licznik % i warianty %', c, id2; end if; n := n + 1;
  if (select odpowiedz from public.okienko_wiedza where id = id1) like 'Inna%' then raise exception 'FAIL 5: powtórka nadpisała odpowiedź'; end if; n := n + 1;

  -- 3. przepisanie: tylko raz i tylko kandydat
  perform public.okienko_wiedza_przepisana(id1, 'Tekst w głosie BiegaMy: 20 minut marszobiegu 3 razy w tygodniu.');
  if (select przepisana from public.okienko_wiedza where id = id1) is not true then raise exception 'FAIL 6: przepisanie'; end if; n := n + 1;
  perform public.okienko_wiedza_przepisana(id1, 'Drugie przepisanie nie może wejść, nawet jeśli jest wystarczająco długie.');
  if (select odpowiedz from public.okienko_wiedza where id = id1) like 'Drugie%' then raise exception 'FAIL 7: drugie przepisanie'; end if; n := n + 1;

  -- 4. CHECK: cena nie jest wieczna, źródło tylko https, data przy do_daty
  begin perform public.okienko_wiedza_kandydat(kl || 'c', 'ile kosztują buty', 'Buty kosztują około 500 zł w sklepie.', '[]', 'sprzet', 'buty', 'wieczna', null, true, current_date); raise exception 'FAIL 8: cena wieczna przeszła'; exception when check_violation then n := n + 1; end;
  begin perform public.okienko_wiedza_kandydat(kl || 'h', 'pytanie http', 'Odpowiedź ze źródłem bez szyfrowania.', '[{"tytul":"x","url":"http://a.pl"}]', 'porada', 't', 'wieczna', null, false, current_date); raise exception 'FAIL 9: źródło http przeszło'; exception when check_violation then n := n + 1; end;
  begin perform public.okienko_wiedza_kandydat(kl || 'j', 'pytanie js', 'Odpowiedź ze złym adresem źródła.', '[{"tytul":"x","url":"javascript:alert(1)"}]', 'porada', 't', 'wieczna', null, false, current_date); raise exception 'FAIL 10: źródło javascript przeszło'; exception when check_violation then n := n + 1; end;
  begin perform public.okienko_wiedza_kandydat(kl || 'd', 'pytanie bez daty', 'Odpowiedź do daty, ale daty brak.', '[]', 'porada', 't', 'do_daty', null, false, current_date); raise exception 'FAIL 11: do_daty bez daty'; exception when check_violation then n := n + 1; end;

  -- 5. RLS PO SKUTKU: zwykłe konto nie widzi nic i nic nie zmieni
  perform set_config('request.jwt.claims', json_build_object('sub', obcy, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.okienko_wiedza; if c <> 0 then raise exception 'FAIL 12: zwykłe konto widzi % wierszy', c; end if; n := n + 1;
  update public.okienko_wiedza set status = 'zatwierdzona' where id = id1; get diagnostics c = row_count; if c <> 0 then raise exception 'FAIL 13: zwykłe konto zatwierdziło'; end if; n := n + 1;
  begin insert into public.okienko_wiedza (klucz, pytanie, odpowiedz, intencja) values ('x', 'xxx', 'xxxxxxxxxxxxxxxxxxxxxxxxx', 'porada'); raise exception 'FAIL 14: INSERT authenticated'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.okienko_wiedza_kandydat('x', 'xxx', 'xxxxxxxxxxxxxxxxxxxxxxxxx', '[]', 'porada', 't', 'wieczna', null, false, current_date); raise exception 'FAIL 15: authenticated woła kandydata'; exception when insufficient_privilege then n := n + 1; end;
  execute 'reset role';

  -- 6. anon: odmowa na poziomie grantu
  execute 'set local role anon';
  begin select count(*) into c from public.okienko_wiedza; raise exception 'FAIL 16: anon czyta'; exception when insufficient_privilege then n := n + 1; end;
  execute 'reset role';

  -- 7. trener: widzi, poprawia tekst i ważność, zatwierdza; znacznik zatwierdzenia stawia baza; kolumn systemowych nie zmieni; nie kasuje
  perform set_config('request.jwt.claims', json_build_object('sub', tr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.okienko_wiedza where id = id1; if c <> 1 then raise exception 'FAIL 17: trener nie widzi'; end if; n := n + 1;
  update public.okienko_wiedza set odpowiedz = 'Tekst poprawiony przez trenera, 20 minut.', waznosc = 'do_daty', wazna_do = current_date + 10 where id = id1; get diagnostics c = row_count; if c <> 1 then raise exception 'FAIL 18: Popraw'; end if; n := n + 1;
  update public.okienko_wiedza set status = 'zatwierdzona' where id = id1; get diagnostics c = row_count; if c <> 1 then raise exception 'FAIL 19: Zatwierdź'; end if; n := n + 1;
  if (select zatwierdzil from public.okienko_wiedza where id = id1) is distinct from tr or (select zatwierdzono from public.okienko_wiedza where id = id1) is null then raise exception 'FAIL 20: znacznik zatwierdzenia'; end if; n := n + 1;
  begin update public.okienko_wiedza set zapytan = 999 where id = id1; raise exception 'FAIL 21: trener zmienił licznik'; exception when insufficient_privilege then n := n + 1; end;
  begin update public.okienko_wiedza set zrodla = '[]' where id = id1; raise exception 'FAIL 22: trener zmienił źródła'; exception when insufficient_privilege then n := n + 1; end;
  begin update public.okienko_wiedza set nietrwala = false where id = id1; raise exception 'FAIL 23: trener zdjął nietrwala'; exception when insufficient_privilege then n := n + 1; end;
  begin delete from public.okienko_wiedza where id = id1; raise exception 'FAIL 24: trener skasował'; exception when insufficient_privilege then n := n + 1; end;
  begin update public.okienko_wiedza set odpowiedz = 'krótko' where id = id1; raise exception 'FAIL 25: za krótki tekst przeszedł'; exception when check_violation then n := n + 1; end;
  execute 'reset role';

  -- 8. przeterminowany: wraca jako kandydat z nową odpowiedzią, do przepisania
  update public.okienko_wiedza set wazna_do = current_date - 1 where id = id1;
  select * into r from public.okienko_wiedza_kandydat(kl, 'jak zacząć biegać', 'Świeża odpowiedź z sieci, 25 minut marszobiegu.', '[]', 'porada', 'start', 'wieczna', null, false, current_date);
  if r.wpis_id <> id1 or not r.do_przepisania then raise exception 'FAIL 26: przeterminowany do przepisania'; end if; n := n + 1;
  if (select status from public.okienko_wiedza where id = id1) <> 'kandydat' or (select odpowiedz from public.okienko_wiedza where id = id1) not like 'Świeża%' or (select zatwierdzono from public.okienko_wiedza where id = id1) is not null then raise exception 'FAIL 27: przeterminowany nie wrócił'; end if; n := n + 1;

  -- 9. odrzucony: zostaje odrzucony, tylko licznik
  update public.okienko_wiedza set status = 'odrzucona' where id = id1;
  select zapytan into c from public.okienko_wiedza where id = id1;
  select * into r from public.okienko_wiedza_kandydat(kl, 'jak zacząć biegać', 'Kolejna odpowiedź nie może odkopać odrzuconego wpisu.', '[]', 'porada', 'start', 'wieczna', null, false, current_date);
  if r.do_przepisania or (select status from public.okienko_wiedza where id = id1) <> 'odrzucona' or (select zapytan from public.okienko_wiedza where id = id1) <> c + 1 or (select odpowiedz from public.okienko_wiedza where id = id1) like 'Kolejna%' then raise exception 'FAIL 28: odrzucony wrócił'; end if; n := n + 1;

  -- 10. licznik z pamięci i log w trybie wiedza
  perform public.okienko_wiedza_policz(null, kl);
  if (select zapytan from public.okienko_wiedza where id = id1) <> c + 2 then raise exception 'FAIL 29: policz po kluczu'; end if; n := n + 1;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'okienko_v2_log_tryb_check')) not like '%wiedza%' then raise exception 'FAIL 30: tryb'; end if; n := n + 1;

  raise exception 'TESTY WIEDZA ZIELONE %/30', n using errcode = 'P0001';
end $T$;
