-- TEST D7b (public.trainings) — uruchamiać w SQL Editorze PO wykonaniu
-- 20261006_d7b_trainings_coach_relacja_i_coach_id_zawodnika.sql.
-- Cały skrypt w jednej transakcji zakończonej ROLLBACK — nic nie zostaje w danych.
--
-- ⚠️ LEKCJE #19b: cel każdego INSERT-u jest WYBRANY warunkiem relacji, nie `limit 1` po
--    dostępności. Trener jest też zawodnikiem — zawodnik Kasi jest wybierany z wykluczeniem
--    wiersza samego Filipa.
-- ⚠️ LEKCJE #19b: odmowa RLS przy INSERT to wyjątek 42501 (nie „0 wierszy"), więc test
--    łapie wyjątek i mówi wprost, co dostał. Brak wyjątku tam, gdzie oczekiwana odmowa = CZERWONE.
-- ⚠️ Bez `set local role authenticated` test świeci na zielono ZAWSZE (postgres ma BYPASSRLS).

begin;

-- 1. Podszycie się pod Filipa (trener bd9cbbac…) jako rola authenticated
select set_config('request.jwt.claim.sub',
                  (select id::text from public.coaches where id::text like 'bd9cbbac%'), true);
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id::text from public.coaches where id::text like 'bd9cbbac%'),
                                    'role', 'authenticated')::text, true);
set local role authenticated;

do $t$
declare
  filip     uuid := (select id from public.coaches where id::text like 'bd9cbbac%');
  kasia     uuid := (select id from public.coaches where id::text like '33dfd590%');
  zaw_kasi  uuid;   -- zawodnik Kasi, który NIE jest Filipem
  zaw_filip uuid;   -- zawodnik Filipa, który NIE jest Filipem
  n int;
begin
  if auth.uid() is distinct from filip then
    raise exception 'TEST ZEPSUTY: auth.uid()=% zamiast Filipa %', auth.uid(), filip;
  end if;

  select a.id into zaw_kasi  from public.athletes a
   where a.coach_id = kasia and a.user_id is distinct from filip order by a.id limit 1;
  select a.id into zaw_filip from public.athletes a
   where a.coach_id = filip and a.user_id is distinct from filip order by a.id limit 1;
  if zaw_kasi is null or zaw_filip is null then
    raise exception 'TEST ZEPSUTY: brak zawodnika Kasi (%) albo Filipa (%) do wyboru', zaw_kasi, zaw_filip;
  end if;

  -- 2. INSERT do zawodnika KASI z coach_id = Filip → MA ODMÓWIĆ (42501)
  begin
    insert into public.trainings (athlete_id, coach_id, date, type, description, status, plan_source)
    values (zaw_kasi, filip, current_date + 400, 'Spokojny', 'TEST D7b — nie powinien istnieć', 'planned', 'coach');
    raise exception 'CZERWONE: INSERT do zawodnika Kasi PRZESZEDŁ — dziura (a) otwarta';
  exception
    when insufficient_privilege then
      raise notice 'ZIELONE (a): INSERT do zawodnika Kasi odrzucony: %', sqlerrm;
  end;

  -- 3. INSERT do WŁASNEGO zawodnika z coach_id = Filip → MA PRZEJŚĆ
  insert into public.trainings (athlete_id, coach_id, date, type, description, status, plan_source)
  values (zaw_filip, filip, current_date + 400, 'Spokojny', 'TEST D7b — do rollbacku', 'planned', 'coach');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CZERWONE: INSERT do własnego zawodnika dał % wierszy', n; end if;
  raise notice 'ZIELONE (własny): INSERT do zawodnika Filipa przeszedł (1 wiersz)';

  -- 4. INSERT do własnego zawodnika z coach_id = KASIA → MA ODMÓWIĆ (coach_id ≠ auth.uid())
  begin
    insert into public.trainings (athlete_id, coach_id, date, type, description, status, plan_source)
    values (zaw_filip, kasia, current_date + 401, 'Spokojny', 'TEST D7b — cudzy coach_id', 'planned', 'coach');
    raise exception 'CZERWONE: INSERT z cudzym coach_id PRZESZEDŁ';
  exception
    when insufficient_privilege then
      raise notice 'ZIELONE (cudzy coach_id): odrzucony: %', sqlerrm;
  end;
end $t$;

-- 5. Podszycie się pod ZAWODNIKA Filipa (nie-trenera): próba INSERT-u z coach_id = Filip → ODMOWA (c)
--    i UPDATE własnego wiersza (coach_id NULL → Filip) → ODMOWA z triggera (c)
reset role;
select set_config('request.jwt.claim.sub',
   (select a.user_id::text from public.athletes a
     where a.coach_id::text like 'bd9cbbac%' and a.user_id::text not like 'bd9cbbac%'
       and a.user_id is not null order by a.id limit 1), true);
select set_config('request.jwt.claims',
   json_build_object('sub', current_setting('request.jwt.claim.sub', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $z$
declare
  ja       uuid := (select id from public.athletes where user_id = auth.uid() limit 1);
  filip    uuid := (select id from public.coaches where id::text like 'bd9cbbac%');
  wlasny   uuid;
begin
  if ja is null then raise exception 'TEST ZEPSUTY: brak wiersza athletes dla auth.uid()=%', auth.uid(); end if;

  begin
    insert into public.trainings (athlete_id, coach_id, date, type, description, status)
    values (ja, filip, current_date + 402, 'Spokojny', 'TEST D7b — zawodnik podszywa trenera', 'planned');
    raise exception 'CZERWONE: zawodnik wstawił wiersz z coach_id trenera — dziura (c) otwarta';
  exception
    when insufficient_privilege then
      raise notice 'ZIELONE (c, insert): odrzucony: %', sqlerrm;
  end;

  insert into public.trainings (athlete_id, coach_id, date, type, description, status)
  values (ja, null, current_date + 403, 'Spokojny', 'TEST D7b — własny, do rollbacku', 'planned')
  returning id into wlasny;
  raise notice 'ZIELONE (własny zawodnika): INSERT z coach_id NULL przeszedł';

  begin
    update public.trainings set coach_id = filip where id = wlasny;
    raise exception 'CZERWONE: zawodnik przepisał coach_id własnego wiersza na trenera — dziura (c, update) otwarta';
  exception
    when insufficient_privilege then
      raise notice 'ZIELONE (c, update): trigger odrzucił: %', sqlerrm;
  end;

  update public.trainings set status = 'done' where id = wlasny;
  raise notice 'ZIELONE (regresja): zawodnik nadal może oznaczyć własny wiersz jako done';
end $z$;

rollback;
-- Po ROLLBACK: żaden wiersz testowy nie istnieje. Kontrola:
--   select count(*) from public.trainings where description like 'TEST D7b%';   -- oczekiwane 0
