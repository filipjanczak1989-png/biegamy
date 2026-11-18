-- Test po skutku 20261201 (e-mail przed biegiem: rezerwacja przed wysyłką, ponowienie tylko po odrzuceniu, bez podwójnej wysyłki). W transakcji z .sh, zawsze wycofanej.
-- Bieg próbny przy ulicy próbnej, dwa konta zawodników z adresem (bez trenerów); daty przesunięte daleko w przyszłość, żeby prawdziwe wysyłki z logu nie liczyły się do doby testu.
-- Komunikaty FAIL nigdy nie pokazują listy odbiorców (są w niej adresy).
do $T$
declare
  n int := 0; j jsonb; zw uuid; zw2 uuid; zwa uuid; zw2a uuid; b uuid; p int; ok boolean;
  D date := (now() at time zone 'Europe/Warsaw')::date; t1 timestamptz; t3 timestamptz; W constant text := '2026-11-v1';
  ile int;
begin
  -- 0. strażnik: prawdziwa ulica identyczna przed i po (obie drogi produkcji)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  if public.akcja_licznik('dla-fabianka') is distinct from (select t.j from _licznik_przed t) then raise exception 'FAIL 0: licznik prawdziwej ulicy zmienił się po migracji (service_role)'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', (select sub from _konto_straznika), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.akcja_licznik('dla-fabianka') is distinct from (select t.j from _licznik_przed_zal t) then raise exception 'FAIL 0b: licznik prawdziwej ulicy zmienił się po migracji (authenticated)'; end if;
  execute 'reset role';
  n := n + 2;

  -- 1. struktura i uprawnienia
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'akcja_bieg_maile' and column_name in ('stan', 'proby', 'zmieniono_at')) <> 3 then raise exception 'FAIL 1: brak kolumn stan/proby/zmieniono_at'; end if;
  if has_function_privilege('anon', 'public.akcja_bieg_mail_rezerwuj(uuid, uuid, timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_mail_rezerwuj(uuid, uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_mail_wynik(uuid, uuid, integer, text, text, timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_mail_wynik(uuid, uuid, integer, text, text, timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_do_przypomnienia(timestamptz, integer)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_do_przypomnienia(timestamptz, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_bieg_mail_zapisz(uuid, uuid, text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.akcja_bieg_mail_zapisz(uuid, uuid, text)', 'EXECUTE')
    then raise exception 'FAIL 1b: funkcje e-maila wykonywalne z przeglądarki'; end if;
  if not (has_function_privilege('service_role', 'public.akcja_bieg_mail_rezerwuj(uuid, uuid, timestamptz)', 'EXECUTE') and has_function_privilege('service_role', 'public.akcja_bieg_mail_wynik(uuid, uuid, integer, text, text, timestamptz)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.akcja_bieg_do_przypomnienia(timestamptz, integer)', 'EXECUTE')) then raise exception 'FAIL 1c: rola serwisowa (EF) bez prawa wykonania'; end if;
  if exists (select 1 from pg_proc where oid in ('public.akcja_bieg_mail_rezerwuj(uuid, uuid, timestamptz)'::regprocedure, 'public.akcja_bieg_mail_wynik(uuid, uuid, integer, text, text, timestamptz)'::regprocedure, 'public.akcja_bieg_do_przypomnienia(timestamptz, integer)'::regprocedure) and not prosecdef)
    then raise exception 'FAIL 1d: funkcja e-maila nie jest SECURITY DEFINER'; end if;
  if has_table_privilege('anon', 'public.akcja_bieg_maile', 'SELECT') or has_table_privilege('authenticated', 'public.akcja_bieg_maile', 'SELECT') then raise exception 'FAIL 1e: log e-maili czytelny z przeglądarki'; end if;
  n := n + 5;

  -- przygotowanie: zw zapisany ze zgodą na e-mail (wyzwalacz), zw2 z samym dzieckiem i zgodą włączoną osobno
  select a.user_id into zw from public.athletes a where a.user_id is not null and not exists (select 1 from public.coaches c where c.id = a.user_id)
    and exists (select 1 from auth.users u where u.id = a.user_id and u.email is not null) order by a.created_at limit 1;
  select a.user_id into zw2 from public.athletes a where a.user_id is not null and a.user_id <> zw and not exists (select 1 from public.coaches c where c.id = a.user_id)
    and exists (select 1 from auth.users u where u.id = a.user_id and u.email is not null) order by a.created_at desc limit 1;
  if zw is null or zw2 is null then raise exception 'FAIL 2: brak kont do testu'; end if;
  select a.id into zwa from public.athletes a where a.user_id = zw;
  select a.id into zw2a from public.athletes a where a.user_id = zw2;
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', D, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  update public.akcje set konta_testowe = coalesce(konta_testowe, '{}'::uuid[]) || array(select a.id from public.athletes a) where slug = 'proba';   -- 20261211: bieg akcji testowej przyjmuje tylko konta_testowe; konta testu dopisane w tej transakcji
  delete from public.akcja_biegi where akcja_slug = 'proba';
  insert into public.akcja_biegi (akcja_slug, slug, nazwa, dzien_od, dzien_do, wynik_do, dystanse_km, status, regulamin_wersja)
    values ('proba', 'proba-maile', 'Bieg próbny', D - 1, D, D + 2, '{5,10}', 'otwarty', W) returning id into b;
  perform set_config('request.jwt.claims', json_build_object('sub', zw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_zapisz('proba-maile', 5, true, true, W, 'Ola');
  execute 'reset role';
  if not (j->>'ok')::boolean then raise exception 'FAIL 2a: zapis zw: %', j->>'powod'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', zw2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.akcja_bieg_dopisz_dziecko('proba-maile', 'Kuba', false, true, W);
  if not (j->>'ok')::boolean then raise exception 'FAIL 2b: dziecko zw2: %', j->>'powod'; end if;
  j := public.akcja_bieg_zgoda_email('proba-maile', true);   -- rodzic z samymi dziećmi włącza zgodę sam
  execute 'reset role';
  if not (j->>'ok')::boolean then raise exception 'FAIL 2c: zgoda zw2: %', j->>'powod'; end if;
  update public.akcja_biegi set dzien_od = D + 400, dzien_do = D + 401, wynik_do = D + 403 where id = b;
  delete from public.akcja_bieg_maile where bieg_id = b;
  t1 := ((D + 398)::timestamp + interval '18 hours 5 minutes') at time zone 'Europe/Warsaw';   -- dwa dni przed startem, po 18:00
  t3 := ((D + 399)::timestamp + interval '8 hours 5 minutes') at time zone 'Europe/Warsaw';    -- dzień przed startem, po 8:00

  -- 3. obaj na liście (lista i pierwsza rezerwacja rolą serwisową jak EF; dalej funkcje wołane przez właściciela, wpisy testu prosto do tabel); rezerwacja daje próbę 1, druga rezerwacja tego samego konta nic (drugie wywołanie crona nie wyśle)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  j := public.akcja_bieg_do_przypomnienia(t1);
  p := public.akcja_bieg_mail_rezerwuj(b, zwa, t1);
  execute 'reset role';
  if (select count(*) from jsonb_array_elements(j) e where (e->>'bieg_id')::uuid = b and (e->>'konto_id')::uuid in (zwa, zw2a)) <> 2 then raise exception 'FAIL 3: przed wysyłką oba konta na liście'; end if;
  if p is distinct from 1 then raise exception 'FAIL 3a: pierwsza rezerwacja = próba 1, jest %', p; end if;
  p := public.akcja_bieg_mail_rezerwuj(b, zwa, t1 + interval '1 second');
  if p is not null then raise exception 'FAIL 3b: druga rezerwacja w trakcie wysyłki przeszła (%)', p; end if;
  n := n + 3;

  -- 4. „wysylam”: konta nie ma na liście, a rezerwacja zużywa limit doby
  j := public.akcja_bieg_do_przypomnienia(t1 + interval '1 minute');
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'konto_id')::uuid = zwa and (e->>'bieg_id')::uuid = b) then raise exception 'FAIL 4: konto w trakcie wysyłki wróciło na listę'; end if;
  j := public.akcja_bieg_do_przypomnienia(t1 + interval '1 minute', 1);
  if jsonb_array_length(j) <> 0 then raise exception 'FAIL 4a: limit 1 minus rezerwacja = 0, jest %', jsonb_array_length(j); end if;
  n := n + 2;

  -- 5. odrzucone (blad): wynik tylko dla tej próby; odrzucone nie zużywa limitu; ponowienie dopiero po 15 min
  ok := public.akcja_bieg_mail_wynik(b, zwa, 2, 'blad', 'resend 429 rate_limit_exceeded', t1 + interval '1 minute');
  if ok then raise exception 'FAIL 5: wynik dla innej próby zapisany'; end if;
  ok := public.akcja_bieg_mail_wynik(b, zwa, 1, 'blad', 'resend 429 rate_limit_exceeded', t1 + interval '1 minute');
  if not ok then raise exception 'FAIL 5a: wynik próby 1 nie zapisany'; end if;
  ok := public.akcja_bieg_mail_wynik(b, zwa, 1, 'wyslany', null, t1 + interval '2 minutes');
  if ok then raise exception 'FAIL 5b: drugi wynik tej samej próby nadpisał pierwszy'; end if;
  j := public.akcja_bieg_do_przypomnienia(t1 + interval '5 minutes', 1);
  if jsonb_array_length(j) <> 1 then raise exception 'FAIL 5c: odrzucony e-mail zużył limit doby (limit 1, lista %)', jsonb_array_length(j); end if;
  j := public.akcja_bieg_do_przypomnienia(t1 + interval '15 minutes');
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'konto_id')::uuid = zwa and (e->>'bieg_id')::uuid = b) then raise exception 'FAIL 5d: ponowienie przed upływem 15 min (lista)'; end if;
  if public.akcja_bieg_mail_rezerwuj(b, zwa, t1 + interval '15 minutes') is not null then raise exception 'FAIL 5e: ponowienie przed upływem 15 min (rezerwacja)'; end if;
  n := n + 6;

  -- 6. po 15 min: konto wraca, próba 2; po kolejnym odrzuceniu próba 3; po trzech odrzuceniach koniec
  j := public.akcja_bieg_do_przypomnienia(t1 + interval '17 minutes');
  if not exists (select 1 from jsonb_array_elements(j) e where (e->>'konto_id')::uuid = zwa and (e->>'bieg_id')::uuid = b) then raise exception 'FAIL 6: odrzucony e-mail nie wrócił na listę po 15 min'; end if;
  p := public.akcja_bieg_mail_rezerwuj(b, zwa, t1 + interval '17 minutes');
  if p is distinct from 2 then raise exception 'FAIL 6a: druga próba = 2, jest %', p; end if;
  perform public.akcja_bieg_mail_wynik(b, zwa, 2, 'blad', 'resend 503', t1 + interval '18 minutes');
  if public.akcja_bieg_mail_rezerwuj(b, zwa, t1 + interval '25 minutes') is not null then raise exception 'FAIL 6b: trzecia próba za wcześnie'; end if;
  p := public.akcja_bieg_mail_rezerwuj(b, zwa, t1 + interval '40 minutes');
  if p is distinct from 3 then raise exception 'FAIL 6c: trzecia próba = 3, jest %', p; end if;
  perform public.akcja_bieg_mail_wynik(b, zwa, 3, 'blad', 'resend 422', t1 + interval '41 minutes');
  j := public.akcja_bieg_do_przypomnienia(t3);
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'konto_id')::uuid = zwa and (e->>'bieg_id')::uuid = b) then raise exception 'FAIL 6d: po trzech odrzuceniach konto dalej na liście'; end if;
  if public.akcja_bieg_mail_rezerwuj(b, zwa, t3) is not null then raise exception 'FAIL 6e: czwarta próba'; end if;
  if (select blad from public.akcja_bieg_maile where bieg_id = b and konto_id = zwa) is distinct from 'resend 422' then raise exception 'FAIL 6f: ostatni błąd nie zapisany'; end if;
  n := n + 6;

  -- 7. niepewny (5xx, zerwane połączenie): bez ponowienia, następnego dnia też nie
  p := public.akcja_bieg_mail_rezerwuj(b, zw2a, t1 + interval '2 minutes');
  if p is distinct from 1 then raise exception 'FAIL 7: rezerwacja zw2 = 1, jest %', p; end if;
  perform public.akcja_bieg_mail_wynik(b, zw2a, 1, 'niepewny', 'siec: timeout', t1 + interval '3 minutes');
  j := public.akcja_bieg_do_przypomnienia(t3);
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'konto_id')::uuid = zw2a and (e->>'bieg_id')::uuid = b) then raise exception 'FAIL 7a: niepewny wrócił na listę'; end if;
  if public.akcja_bieg_mail_rezerwuj(b, zw2a, t3) is not null then raise exception 'FAIL 7b: niepewny zarezerwowany ponownie'; end if;
  n := n + 3;

  -- 8. wysłany: koniec, bez błędu; rezerwacja bez wyniku (EF przerwana) działa jak niepewny
  delete from public.akcja_bieg_maile where bieg_id = b;
  p := public.akcja_bieg_mail_rezerwuj(b, zwa, t3);
  ok := public.akcja_bieg_mail_wynik(b, zwa, p, 'wyslany', 'nie zapisuj', t3 + interval '1 second');
  if not ok or (select stan || coalesce(blad, '-') from public.akcja_bieg_maile where bieg_id = b and konto_id = zwa) <> 'wyslany-' then raise exception 'FAIL 8: wysłany zapisany z błędem albo nie zapisany'; end if;
  if public.akcja_bieg_mail_rezerwuj(b, zwa, t3 + interval '2 hours') is not null then raise exception 'FAIL 8a: wysłany zarezerwowany ponownie'; end if;
  p := public.akcja_bieg_mail_rezerwuj(b, zw2a, t3);
  j := public.akcja_bieg_do_przypomnienia(t3 + interval '2 hours');
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'bieg_id')::uuid = b) then raise exception 'FAIL 8b: wysłany albo przerwany wrócił na listę'; end if;
  if public.akcja_bieg_mail_rezerwuj(b, zw2a, t3 + interval '2 hours') is not null then raise exception 'FAIL 8c: przerwana wysyłka zarezerwowana ponownie'; end if;
  n := n + 4;

  -- 9. nieznany stan = wyjątek, nic nie zmienia
  begin
    perform public.akcja_bieg_mail_wynik(b, zw2a, p, 'wyslany_chyba');
    raise exception 'FAIL 9: nieznany stan przyjęty';
  exception when invalid_parameter_value then null;
  end;
  if (select stan from public.akcja_bieg_maile where bieg_id = b and konto_id = zw2a) <> 'wysylam' then raise exception 'FAIL 9a: nieznany stan coś zmienił'; end if;
  n := n + 2;

  -- 10. cofnięta zgoda: brak rezerwacji, także po odrzuceniu
  delete from public.akcja_bieg_maile where bieg_id = b;
  update public.akcja_bieg_zgody set zgoda_email = false where bieg_id = b and konto_id = zwa;
  if public.akcja_bieg_mail_rezerwuj(b, zwa, t3) is not null then raise exception 'FAIL 10: rezerwacja bez zgody'; end if;
  insert into public.akcja_bieg_maile (bieg_id, konto_id, stan, proby, wyslano_at, zmieniono_at, blad) values (b, zwa, 'blad', 1, t1, t1, 'resend 429');
  if public.akcja_bieg_mail_rezerwuj(b, zwa, t3) is not null then raise exception 'FAIL 10a: ponowienie po cofnięciu zgody'; end if;
  update public.akcja_bieg_zgody set zgoda_email = true where bieg_id = b and konto_id = zwa;
  n := n + 2;

  -- 11. stara droga (EF sprzed 14.11): sukces = wyslany, błąd = niepewny (bez ponowienia)
  delete from public.akcja_bieg_maile where bieg_id = b;
  perform public.akcja_bieg_mail_zapisz(b, zwa, null);
  perform public.akcja_bieg_mail_zapisz(b, zw2a, 'resend 500');
  if (select string_agg(stan, ',' order by stan) from public.akcja_bieg_maile where bieg_id = b) <> 'niepewny,wyslany' then raise exception 'FAIL 11: stara droga zapisu'; end if;
  if public.akcja_bieg_mail_rezerwuj(b, zw2a, t3 + interval '1 day') is not null then raise exception 'FAIL 11a: błąd ze starej drogi ponowiony'; end if;
  n := n + 2;

  raise exception 'TESTY E-MAILA BIEGU ZIELONE: % sprawdzeń', n;
end $T$;
