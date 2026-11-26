-- trainings.status: tylko 'planned', 'done', 'missed' (albo NULL).
--
-- DLACZEGO: kolumna jest zwykłym tekstem bez ograniczenia. Próba z 25.11.2026 pokazała, że baza przyjmuje dowolną
-- wartość, a kod w kilkunastu miejscach rozgałęzia się po dokładnym brzmieniu ('done', 'missed', „wszystko inne =
-- zaplanowany”). Literówka w jednym zapisie dałaby trening, który nie jest ani zrobiony, ani opuszczony, i nikt by
-- tego nie zobaczył. Stan z 26.11.2026: wszystkie wiersze mają jedną z trzech wartości, NULL-i nie ma.
--
-- LISTA = dokładnie to, co zapisuje kod (origin/main, 26.11.2026):
--   'planned'  kalendarz (trener i zawodnik), panel trenera, generator planu, approve-training-plan, cofnięcie „nie zrobiłem”
--   'done'     kalendarz, domykanie planu po logu (aplikacja i funkcje zegarka)
--   'missed'   kalendarz, „Wczoraj nie zrobiłem” na Dziś
--
-- NULL ZOSTAJE DOZWOLONY: kolumna ma domyślne 'planned' i kod czyta brak jako „zaplanowany” (t.status || 'planned').
-- Zakaz NULL to osobna decyzja; ta migracja niczego nie zaostrza poza listą wartości.
--
-- STANY:
--   ograniczenie już jest            → bez zmian, komunikat
--   w tabeli są wartości spoza listy → wyjątek, nic nie zmienione (najpierw trzeba zdecydować, co z tymi wierszami)
--   w pozostałych przypadkach        → ograniczenie dodane, komunikat z liczbą sprawdzonych wierszy
--
-- BLOKADA: dodanie ograniczenia blokuje tabelę na czas sprawdzenia wierszy (kilka tysięcy wierszy, ułamek sekundy).
-- lock_timeout 5 s: gdyby tabela była zajęta dłużej, migracja kończy się błędem zamiast wstrzymywać aplikację.
--
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261227_trainings_status_check.sql"
-- Wycofanie: 20261227_WYCOFANIE_trainings_status_check.sql

begin;
set local lock_timeout = '5s';

create temp table if not exists _status_check_komunikat (komunikat text) on commit drop;
truncate _status_check_komunikat;

do $$
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
end $$;

select komunikat from _status_check_komunikat;
commit;
