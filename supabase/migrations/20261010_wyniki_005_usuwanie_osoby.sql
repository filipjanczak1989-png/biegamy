-- NIEWYKONANA NA PROD, na teście wykonana 9.10
-- Źródło: paczka biegamy-results-pkg sql/005_erasure.sql (stan z 9.10, wersja nałożona na test).
-- Wycofanie (całość 001–005): 20261010_wyniki_WYCOFANIE.sql. Kontrola: tools/kontrola-wyszukiwarka-wynikow.sql.
-- 005: „usuń moje dane” – trwałe usunięcie osoby z bazy wyników + blokada ponownego zebrania.
-- erase_runner() wywołuje wyłącznie operator (service_role) po weryfikacji wniosku. Kasuje wszystkie wyniki grupy
-- (runner_key) i zapisuje identyfikatory na listę wykluczeń; trigger odrzuca później każdy wiersz pasujący do listy,
-- więc zbieracz nie przywróci danych. Blokada obejmuje person_ref ORAZ nazwisko+rocznik (privacy-first: może objąć
-- także imiennika z tym samym rocznikiem – świadomy kompromis).
begin;

create table if not exists public.erasure_list (
  id          bigint generated always as identity primary key,
  person_ref  text,
  name_key    text,
  yob         smallint,
  requested_at timestamptz not null default now(),
  note        text,                       -- np. numer zgłoszenia; bez danych osobowych
  constraint erasure_has_key check (person_ref is not null or (name_key is not null and yob is not null))
);
create unique index if not exists erasure_list_ref on public.erasure_list (person_ref) where person_ref is not null;
create unique index if not exists erasure_list_name on public.erasure_list (name_key, yob) where name_key is not null;
alter table public.erasure_list enable row level security;
revoke all on public.erasure_list from public, anon, authenticated;

create or replace function public.erase_runner(p_runner_key text, p_note text default null)
returns bigint
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare n bigint;
begin
  perform public.resolve_runners();   -- wyniki dodane po ostatnim przeliczeniu też mają dostać runner_key
  insert into public.erasure_list (person_ref, name_key, yob, note)
  select distinct r.person_ref, r.name_key, r.yob, p_note
  from public.race_results r
  where r.runner_key = p_runner_key and r.yob is not null
  on conflict do nothing;
  insert into public.erasure_list (person_ref, note)
  select distinct r.person_ref, p_note
  from public.race_results r
  where r.runner_key = p_runner_key and r.person_ref is not null
  on conflict do nothing;
  delete from public.race_results where runner_key = p_runner_key;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.erase_runner(text, text) from public, anon, authenticated;
grant execute on function public.erase_runner(text, text) to service_role;
grant select, insert, delete on public.erasure_list to service_role;

create or replace function public.race_results_erasure_guard()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.erasure_list l
             where (l.person_ref is not null and l.person_ref = new.person_ref)
                or (l.name_key is not null and l.name_key = new.name_key and l.yob = new.yob)) then
    return null;      -- wiersz pomijany po cichu
  end if;
  return new;
end $$;

drop trigger if exists race_results_zz_erasure_guard on public.race_results;
create trigger race_results_zz_erasure_guard      -- „zz”: odpala się po triggerze ustawiającym name_key
  before insert on public.race_results
  for each row execute function public.race_results_erasure_guard();

commit;
