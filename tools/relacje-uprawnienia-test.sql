-- Testy 20261231_obserwacje_i_powiadomienia_relacje.sql (E1). Jedna transakcja, zawsze wycofana (runner: tools/relacje-uprawnienia-test.sh).
-- Konta (istniejące, nic nie zostaje po rollback): A i B bez trenera, D z trenerem, C = konto zawodnika trenera D.
-- Relacje między nimi są w transakcji czyszczone i stawiane na nowo, więc wynik nie zależy od prawdziwych danych.
-- Wstawienia do notifications odpalają wyzwalacz pushy (kolejka pg_net jest transakcyjna: po rollback nic nie wychodzi; send-push i tak nie znalazłby wiersza).
-- Sprawdza: obcy nie widzi cudzego grafu obserwacji (strony relacji widzą); licznik obserwujących tylko liczba i tylko dla publicznego / własnego / podopiecznego;
-- powiadomienie do obcej osoby odrzucone; każda dozwolona relacja przechodzi, ale tylko z pasującym rodzajem; bez podszywania się pod nadawcę;
-- trener → podopieczny bez cudzego nadawcy; odznaka dla siebie tak, dla kogoś nie; pomocnik nie mówi o cudzych relacjach; front: własne obserwacje,
-- obserwowanie i odobserwowanie, odczyt własnych powiadomień działają.
create or replace function pg_temp.jako(p_uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create or replace function pg_temp.powiadom(p_uid uuid, p_do uuid, p_od uuid, p_typ text) returns text language plpgsql as $f$
declare w text := 'ok';
begin
  perform pg_temp.jako(p_uid);
  begin
    insert into public.notifications (athlete_id, from_athlete_id, type, message, read) values (p_do, p_od, p_typ, 'test E1', false);
  exception when others then w := sqlstate;
  end;
  execute 'reset role';
  return w;
end $f$;
create or replace function pg_temp.obce_obserwacje(p_uid uuid, p_ja uuid) returns bigint language plpgsql as $f$
declare n bigint;
begin
  perform pg_temp.jako(p_uid);
  select count(*) into n from public.follows where follower_id <> p_ja and following_id <> p_ja;
  execute 'reset role';
  return n;
end $f$;
create or replace function pg_temp.widzi_obserwacje(p_uid uuid, p_od uuid, p_do uuid) returns bigint language plpgsql as $f$
declare n bigint;
begin
  perform pg_temp.jako(p_uid);
  select count(*) into n from public.follows where follower_id = p_od and following_id = p_do;
  execute 'reset role';
  return n;
end $f$;
create or replace function pg_temp.licznik(p_uid uuid, p_kto uuid) returns integer language plpgsql as $f$
declare n integer;
begin
  perform pg_temp.jako(p_uid);
  n := public.obserwujacy_liczba(p_kto);
  execute 'reset role';
  return n;
end $f$;
create or replace function pg_temp.relacja(p_uid uuid, p_od uuid, p_do uuid, p_typ text) returns boolean language plpgsql as $f$
declare r boolean;
begin
  perform pg_temp.jako(p_uid);
  r := public.powiadomienie_relacja(p_od, p_do, p_typ);
  execute 'reset role';
  return r;
end $f$;
create or replace function pg_temp.akcja(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare w text := 'ok';
begin
  perform pg_temp.jako(p_uid);
  begin execute p_sql; exception when others then w := sqlstate; end;
  execute 'reset role';
  return w;
end $f$;

do $T$
declare
  a uuid; b uuid; c uuid; d uuid; a_u uuid; b_u uuid; c_u uuid; d_u uuid; s uuid[]; ab uuid[]; abu uuid[];
  log_b uuid; w text; n bigint; prawdziwa bigint;
begin
  select d0.id, d0.user_id, c0.id, c0.user_id into d, d_u, c, c_u
    from public.athletes d0 join public.athletes c0 on c0.user_id = d0.coach_id
   where d0.user_id is not null and d0.id <> c0.id order by d0.created_at limit 1;
  if d is null then raise exception 'FAIL 0: brak zawodnika z trenerem, który ma konto zawodnika'; end if;
  select array_agg(id order by created_at), array_agg(user_id order by created_at) into ab, abu
    from (select id, user_id, created_at from public.athletes
           where user_id is not null and coach_id is null and id not in (c, d) and user_id not in (c_u, d_u) order by created_at limit 2) q;
  if coalesce(array_length(ab, 1), 0) < 2 then raise exception 'FAIL 0: za mało kont bez trenera'; end if;
  a := ab[1]; b := ab[2]; a_u := abu[1]; b_u := abu[2]; s := array[a, b, c, d];

  -- czysto między kontami testu (rollback przywróci)
  delete from public.follows where follower_id = any (s) and following_id = any (s);
  delete from public.friendships where requester_id = any (s) and addressee_id = any (s);
  delete from public.peer_messages where from_id = any (s) and to_id = any (s);
  delete from public.duels where challenger_id = any (s) and opponent_id = any (s);
  delete from public.log_comments where athlete_id = any (s) and log_id in (select id from public.training_logs where athlete_id = any (s));
  update public.athletes set is_public = true where id = c;
  update public.athletes set is_public = false where id in (b, d);
  insert into public.follows (follower_id, following_id) values (b, c);

  -- F1 i N1 najpierw: nie potrzebują funkcji E1, więc na bazie bez migracji pokazują dzisiejszy stan (próba negatywna)
  n := pg_temp.obce_obserwacje(a_u, a);
  if n <> 0 then raise exception 'FAIL F1: obcy widzi % cudzych obserwacji', n; end if;
  w := pg_temp.powiadom(a_u, b, a, 'follow');   if w = 'ok' then raise exception 'FAIL N1: powiadomienie do obcej osoby przeszło'; end if;
  if to_regprocedure('public.obserwujacy_liczba(uuid)') is null or to_regprocedure('public.powiadomienie_relacja(uuid, uuid, text)') is null then
    raise exception 'FAIL 0: brak funkcji E1 (bez wdrożenia: E1_Z_MIGRACJA=1)'; end if;
  -- F: graf obserwacji
  if pg_temp.widzi_obserwacje(b_u, b, c) <> 1 then raise exception 'FAIL F2: obserwujący nie widzi własnej obserwacji'; end if;
  if pg_temp.widzi_obserwacje(c_u, b, c) <> 1 then raise exception 'FAIL F3: obserwowany nie widzi, kto go obserwuje'; end if;
  select count(*) into prawdziwa from public.follows where following_id = c;
  if pg_temp.licznik(a_u, c) is distinct from prawdziwa::integer then raise exception 'FAIL F4: licznik profilu publicznego % (prawdziwy %)', pg_temp.licznik(a_u, c), prawdziwa; end if;
  if pg_temp.licznik(a_u, b) is not null then raise exception 'FAIL F5: licznik cudzego prywatnego profilu nie jest null'; end if;
  if pg_temp.licznik(b_u, b) is null then raise exception 'FAIL F6: licznik własnego prywatnego profilu jest null'; end if;
  if pg_temp.licznik(c_u, d) is null then raise exception 'FAIL F7: trener nie widzi licznika prywatnego podopiecznego'; end if;
  if pg_temp.relacja(a_u, b, c, 'follow') then raise exception 'FAIL F8: pomocnik zdradza cudzą relację'; end if;

  -- N: powiadomienia, obca osoba (N1 wyżej)
  w := pg_temp.powiadom(a_u, b, a, 'chat');     if w = 'ok' then raise exception 'FAIL N2: czat do obcej osoby przeszedł'; end if;
  w := pg_temp.powiadom(a_u, b, null, 'badge'); if w = 'ok' then raise exception 'FAIL N3: powiadomienie bez nadawcy dla kogoś innego przeszło'; end if;
  w := pg_temp.powiadom(a_u, b, b, 'follow');   if w = 'ok' then raise exception 'FAIL N4: podszycie się pod adresata jako nadawcę przeszło'; end if;
  w := pg_temp.powiadom(a_u, c, b, 'follow');   if w = 'ok' then raise exception 'FAIL N5: podszycie się pod kogoś, kto ma relację z adresatem, przeszło'; end if;
  -- dozwolone relacje (każda z pasującym rodzajem)
  w := pg_temp.powiadom(a_u, a, null, 'badge'); if w <> 'ok' then raise exception 'FAIL R1: odznaka dla siebie odrzucona (%)', w; end if;
  w := pg_temp.akcja(a_u, format('insert into public.follows (follower_id, following_id) values (%L, %L)', a, b)); if w <> 'ok' then raise exception 'FAIL R2a: obserwowanie nie działa (%)', w; end if;
  w := pg_temp.powiadom(a_u, b, a, 'follow');   if w <> 'ok' then raise exception 'FAIL R2: powiadomienie o obserwowaniu odrzucone (%)', w; end if;
  w := pg_temp.powiadom(a_u, b, a, 'chat');     if w = 'ok' then raise exception 'FAIL R3: rodzaj niepasujący do relacji (chat przy samej obserwacji) przeszedł'; end if;
  w := pg_temp.powiadom(a_u, b, a, 'like');     if w = 'ok' then raise exception 'FAIL R4: rodzaj bez relacji (like) przeszedł'; end if;
  insert into public.friendships (requester_id, addressee_id, status) values (a, b, 'pending');
  w := pg_temp.powiadom(a_u, b, a, 'friend_request');  if w <> 'ok' then raise exception 'FAIL R5: zaproszenie odrzucone (%)', w; end if;
  w := pg_temp.powiadom(b_u, a, b, 'friend_accepted'); if w <> 'ok' then raise exception 'FAIL R6: akceptacja odrzucona (%)', w; end if;
  insert into public.peer_messages (from_id, to_id, body, sent_at, read) values (a, b, 'test E1', now(), false);
  w := pg_temp.powiadom(a_u, b, a, 'chat');     if w <> 'ok' then raise exception 'FAIL R7: czat odrzucony (%)', w; end if;
  w := pg_temp.powiadom(b_u, a, b, 'chat');     if w = 'ok' then raise exception 'FAIL R8: czat w odwrotną stronę bez wiadomości przeszedł'; end if;
  insert into public.training_logs (athlete_id, distance_km, duration, training_type, logged_at, source) values (b, 5, '25:00', 'Spokojny', now() - interval '1 hour', 'manual') returning id into log_b;
  insert into public.log_comments (log_id, athlete_id, body) values (log_b, a, 'test E1');
  w := pg_temp.powiadom(a_u, b, a, 'comment');  if w <> 'ok' then raise exception 'FAIL R9: komentarz odrzucony (%)', w; end if;
  insert into public.duels (challenger_id, opponent_id, type, duration_days, status) values (a, b, 'km', 7, 'pending');
  w := pg_temp.powiadom(b_u, a, b, 'duel');     if w <> 'ok' then raise exception 'FAIL R10: pojedynek odrzucony (%)', w; end if;
  w := pg_temp.powiadom(d_u, c, d, 'athlete_message'); if w <> 'ok' then raise exception 'FAIL R11: wiadomość do własnego trenera odrzucona (%)', w; end if;
  w := pg_temp.powiadom(a_u, c, a, 'athlete_message'); if w = 'ok' then raise exception 'FAIL R12: wiadomość „do trenera” do cudzego trenera przeszła'; end if;
  w := pg_temp.powiadom(c_u, d, null, 'ai_report');    if w <> 'ok' then raise exception 'FAIL R13: trener → podopieczny odrzucone (%)', w; end if;
  w := pg_temp.powiadom(c_u, d, b, 'ai_report');       if w = 'ok' then raise exception 'FAIL R14: trener wstawił powiadomienie z cudzym nadawcą'; end if;
  w := pg_temp.powiadom(c_u, a, null, 'ai_report');    if w = 'ok' then raise exception 'FAIL R15: trener → nie swój zawodnik przeszło'; end if;

  -- front: własne obserwacje, odobserwowanie, własne powiadomienia
  if pg_temp.widzi_obserwacje(a_u, a, b) <> 1 then raise exception 'FAIL P1: nie widać własnej obserwacji (lista „Obserwujesz”)'; end if;
  w := pg_temp.akcja(a_u, format('delete from public.follows where follower_id = %L and following_id = %L', a, b)); if w <> 'ok' then raise exception 'FAIL P2: odobserwowanie (%)', w; end if;
  if (select count(*) from public.follows where follower_id = a and following_id = b) <> 0 then raise exception 'FAIL P3: odobserwowanie nie skasowało wiersza'; end if;
  w := pg_temp.akcja(b_u, 'select count(*) from public.notifications'); if w <> 'ok' then raise exception 'FAIL P4: odczyt własnych powiadomień (%)', w; end if;
end $T$;

select 'TESTY E1 ZIELONE: F1–F8, N1–N5, R1–R15, P1–P4' as wynik;
