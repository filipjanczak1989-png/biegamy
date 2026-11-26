-- WYCOFANIE 20261227_trainings_status_check.sql: zdejmuje ograniczenie listy wartości z trainings.status.
-- Danych nie zmienia. Po wycofaniu baza znów przyjmuje dowolny tekst w tej kolumnie.
--
-- STANY:
--   ograniczenia nie ma → bez zmian, komunikat
--   ograniczenie jest   → zdjęte, komunikat
--
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261227_WYCOFANIE_trainings_status_check.sql"

begin;
set local lock_timeout = '5s';

create temp table if not exists _status_check_komunikat (komunikat text) on commit drop;
truncate _status_check_komunikat;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'trainings_status_check' and conrelid = 'public.trainings'::regclass) then
    insert into _status_check_komunikat values ('bez zmian: ograniczenia trainings_status_check nie ma');
    return;
  end if;

  alter table public.trainings drop constraint trainings_status_check;

  insert into _status_check_komunikat values ('zdjęto trainings_status_check');
end $$;

select komunikat from _status_check_komunikat;
commit;
