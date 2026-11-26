-- PRÓBA migracji 20261227_trainings_status_check i jej wycofania NA PRAWDZIWEJ BAZIE W WYCOFANEJ TRANSAKCJI.
-- Uruchom PRZED migracją; wynik to tabela krok / wynik / szczegóły, w bazie nic nie zostaje:
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/tools/trainings-status-check-test.sql"
-- Dobrze = 24 wiersze i żadnego wyniku pisanego wielkimi literami (ODRZUCONA, WYJĄTEK, PRZYJĘTA, BRAK, INNY BŁĄD, NIE).
-- Bloki DO są skopiowane z plików migracji co do znaku; pilnuje tego tests/blizna-395.
begin;
set local lock_timeout = '5s';
create temp table _proba (nr serial, krok text, wynik text, szczegoly text) on commit drop;
create temp table if not exists _status_check_komunikat (komunikat text) on commit drop;

do $proba$
declare
  kom text; v text; ile bigint; przed bigint; pid public.trainings.id%type;
  -- kopia jednego istniejącego treningu z nowym id i podanym statusem (INSERT nie ma wyzwalaczy na tej tabeli)
  wstaw text := 'insert into public.trainings select (jsonb_populate_record(null::public.trainings, to_jsonb(t) || jsonb_build_object(''id'', gen_random_uuid(), ''status'', $1::text))).* from (select * from public.trainings order by created_at limit 1) t';
begin
  select count(*) into przed from public.trainings;

  -- A. STAN WYJŚCIOWY: baza przyjmuje dowolny tekst
  begin
    execute wstaw using 'cokolwiek-przed-migracja';
    insert into _proba (krok, wynik, szczegoly) values ('A. przed migracją: zła wartość', 'przyjęta', 'potwierdza brak ograniczenia');
    delete from public.trainings where status = 'cokolwiek-przed-migracja';
  exception when others then
    insert into _proba (krok, wynik, szczegoly) values ('A. przed migracją: zła wartość', 'ODRZUCONA', sqlstate || ' ' || sqlerrm);
  end;

  -- B. MIGRACJA przy wartości spoza listy w tabeli: ma rzucić wyjątek i niczego nie dodać
  begin
    execute wstaw using 'spoza-listy';
    truncate _status_check_komunikat;
    execute $m$do $$
declare
  spoza bigint;
begin
  if exists (select 1 from pg_constraint
              where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass) then
    insert into _status_check_komunikat values ('bez zmian: ograniczenie trainings_status_check już istnieje');
    return;
  end if;

  select count(*) into spoza
    from public.trainings
   where status is not null and status not in ('planned', 'done', 'missed');
  if spoza > 0 then
    raise exception 'trainings.status: % wierszy ma wartość spoza listy (planned, done, missed); nic nie zmieniono', spoza;
  end if;

  alter table public.trainings
    add constraint trainings_status_check
    check (status is null or status in ('planned', 'done', 'missed'));

  insert into _status_check_komunikat
  select 'dodano trainings_status_check; sprawdzonych wierszy: ' || count(*) from public.trainings;
end $$;$m$;
    insert into _proba (krok, wynik, szczegoly) values ('B. migracja przy złym wierszu w tabeli', 'PRZESZŁA (źle)', (select string_agg(komunikat, '; ') from _status_check_komunikat));
  exception when others then
    insert into _proba (krok, wynik, szczegoly) values ('B. migracja przy złym wierszu w tabeli', 'wyjątek (dobrze)', sqlerrm);
  end;
  select count(*) into ile from pg_constraint where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass;
  insert into _proba (krok, wynik, szczegoly) values ('B. po wyjątku ograniczenia nie ma, złego wiersza też', case when ile = 0 and not exists (select 1 from public.trainings where status = 'spoza-listy') then 'tak' else 'NIE' end, 'ograniczeń: ' || ile);

  -- C. MIGRACJA NA OBECNYCH DANYCH
  truncate _status_check_komunikat;
  begin
    execute $m$do $$
declare
  spoza bigint;
begin
  if exists (select 1 from pg_constraint
              where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass) then
    insert into _status_check_komunikat values ('bez zmian: ograniczenie trainings_status_check już istnieje');
    return;
  end if;

  select count(*) into spoza
    from public.trainings
   where status is not null and status not in ('planned', 'done', 'missed');
  if spoza > 0 then
    raise exception 'trainings.status: % wierszy ma wartość spoza listy (planned, done, missed); nic nie zmieniono', spoza;
  end if;

  alter table public.trainings
    add constraint trainings_status_check
    check (status is null or status in ('planned', 'done', 'missed'));

  insert into _status_check_komunikat
  select 'dodano trainings_status_check; sprawdzonych wierszy: ' || count(*) from public.trainings;
end $$;$m$;
    insert into _proba (krok, wynik, szczegoly) values ('C. migracja na obecnych danych', 'przeszła', (select string_agg(komunikat, '; ') from _status_check_komunikat));
  exception when others then
    insert into _proba (krok, wynik, szczegoly) values ('C. migracja na obecnych danych', 'WYJĄTEK', sqlstate || ' ' || sqlerrm);
  end;
  insert into _proba (krok, wynik, szczegoly)
  select 'C. ograniczenie w katalogu', case when count(*) = 1 and bool_and(convalidated) then 'jest, sprawdzone' else 'BRAK' end, coalesce(max(pg_get_constraintdef(oid)), '') from pg_constraint where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass;

  -- D. DRUGIE URUCHOMIENIE: bez zmian
  truncate _status_check_komunikat;
  begin
    execute $m$do $$
declare
  spoza bigint;
begin
  if exists (select 1 from pg_constraint
              where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass) then
    insert into _status_check_komunikat values ('bez zmian: ograniczenie trainings_status_check już istnieje');
    return;
  end if;

  select count(*) into spoza
    from public.trainings
   where status is not null and status not in ('planned', 'done', 'missed');
  if spoza > 0 then
    raise exception 'trainings.status: % wierszy ma wartość spoza listy (planned, done, missed); nic nie zmieniono', spoza;
  end if;

  alter table public.trainings
    add constraint trainings_status_check
    check (status is null or status in ('planned', 'done', 'missed'));

  insert into _status_check_komunikat
  select 'dodano trainings_status_check; sprawdzonych wierszy: ' || count(*) from public.trainings;
end $$;$m$;
    insert into _proba (krok, wynik, szczegoly) values ('D. migracja drugi raz', 'przeszła', (select string_agg(komunikat, '; ') from _status_check_komunikat));
  exception when others then
    insert into _proba (krok, wynik, szczegoly) values ('D. migracja drugi raz', 'WYJĄTEK', sqlstate || ' ' || sqlerrm);
  end;

  -- E. KAŻDA DOZWOLONA WARTOŚĆ PRZECHODZI (zapis nowego wiersza i zmiana istniejącego próbnego)
  foreach v in array array['planned', 'done', 'missed'] loop
    begin
      execute wstaw using v;
      insert into _proba (krok, wynik, szczegoly) values ('E. dozwolona „' || v || '”: nowy wiersz', 'przyjęta', '');
    exception when others then
      insert into _proba (krok, wynik, szczegoly) values ('E. dozwolona „' || v || '”: nowy wiersz', 'ODRZUCONA', sqlstate || ' ' || sqlerrm);
    end;
  end loop;
  begin
    execute wstaw using null::text;
    insert into _proba (krok, wynik, szczegoly) values ('E. NULL wpisany wprost', 'przyjęty', 'zgodnie z projektem: NULL dozwolony');
  exception when others then
    insert into _proba (krok, wynik, szczegoly) values ('E. NULL wpisany wprost', 'ODRZUCONY', sqlstate || ' ' || sqlerrm);
  end;

  -- F. KAŻDA ZŁA WARTOŚĆ JEST BLOKOWANA
  foreach v in array array['Done', 'PLANNED', 'planned ', ' done', 'skipped', 'approved', 'zrobione', ''] loop
    begin
      execute wstaw using v;
      insert into _proba (krok, wynik, szczegoly) values ('F. zła „' || v || '”', 'PRZYJĘTA (źle)', '');
    exception
      when check_violation then insert into _proba (krok, wynik, szczegoly) values ('F. zła „' || v || '”', 'zablokowana', sqlstate || ' ' || left(sqlerrm, 90));
      when others then insert into _proba (krok, wynik, szczegoly) values ('F. zła „' || v || '”', 'INNY BŁĄD', sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  -- G. ZMIANA ISTNIEJĄCEGO WIERSZA (tak pisze aplikacja): dozwolona przechodzi, zła nie. Wiersz próbny z kroku E.
  execute wstaw || ' returning id' into pid using 'done';
  begin
    update public.trainings set status = 'missed' where id = pid;
    get diagnostics ile = row_count;
    insert into _proba (krok, wynik, szczegoly) values ('G. zmiana done → missed (wiersz próbny)', case when ile = 1 then 'przyjęta' else 'NIE ZMIENIONO' end, 'wierszy: ' || ile);
  exception when others then
    insert into _proba (krok, wynik, szczegoly) values ('G. zmiana done → missed (wiersz próbny)', 'ODRZUCONA', sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.trainings set status = 'Missed' where id = pid;
    insert into _proba (krok, wynik, szczegoly) values ('G. zmiana na „Missed”', 'PRZYJĘTA (źle)', '');
  exception
    when check_violation then insert into _proba (krok, wynik, szczegoly) values ('G. zmiana na „Missed”', 'zablokowana', sqlstate);
    when others then insert into _proba (krok, wynik, szczegoly) values ('G. zmiana na „Missed”', 'INNY BŁĄD', sqlstate || ' ' || sqlerrm);
  end;

  -- H. WYCOFANIE: zdejmuje ograniczenie, drugi raz bez zmian, zła wartość znów przechodzi
  truncate _status_check_komunikat;
  execute $m$do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass) then
    insert into _status_check_komunikat values ('bez zmian: ograniczenia trainings_status_check nie ma');
    return;
  end if;

  alter table public.trainings drop constraint trainings_status_check;

  insert into _status_check_komunikat values ('zdjęto trainings_status_check');
end $$;$m$;
  insert into _proba (krok, wynik, szczegoly) values ('H. wycofanie', 'przeszło', (select string_agg(komunikat, '; ') from _status_check_komunikat));
  truncate _status_check_komunikat;
  execute $m$do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass) then
    insert into _status_check_komunikat values ('bez zmian: ograniczenia trainings_status_check nie ma');
    return;
  end if;

  alter table public.trainings drop constraint trainings_status_check;

  insert into _status_check_komunikat values ('zdjęto trainings_status_check');
end $$;$m$;
  insert into _proba (krok, wynik, szczegoly) values ('H. wycofanie drugi raz', 'przeszło', (select string_agg(komunikat, '; ') from _status_check_komunikat));
  begin
    execute wstaw using 'po-wycofaniu';
    insert into _proba (krok, wynik, szczegoly) values ('H. po wycofaniu: zła wartość', 'przyjęta', 'stan jak przed migracją');
  exception when others then
    insert into _proba (krok, wynik, szczegoly) values ('H. po wycofaniu: zła wartość', 'ODRZUCONA', sqlstate || ' ' || sqlerrm);
  end;

  select count(*) into ile from public.trainings;
  insert into _proba (krok, wynik, szczegoly) values ('Z. wiersze w transakcji', 'przed ' || przed || ', teraz ' || ile, 'różnica to wiersze próbne; po ROLLBACK wraca ' || przed);
end $proba$;

select nr, krok, wynik, szczegoly from _proba order by nr;
rollback;
