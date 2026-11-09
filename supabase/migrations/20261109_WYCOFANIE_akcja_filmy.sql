-- WYCOFANIE 20261109_akcja_filmy.sql: funkcje, tabela widzianych filmów i kolumna filmów kamieni milowych znikają.
-- Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f "<ścieżka absolutna>".
-- Front po wycofaniu: film startu wraca do znacznika w telefonie (raz na urządzenie), filmów progów nie ma; licznik i kafel działają.
begin;

do $$
begin
  if to_regclass('public.akcja_filmy_obejrzane') is null then raise exception 'wycofanie akcja_filmy: migracji nie ma na bazie'; end if;
end $$;

drop function public.akcja_filmy_konta(text);
drop function public.akcja_film_obejrzany(text, text);
drop table public.akcja_filmy_obejrzane;
alter table public.akcje drop column filmy_progow;

notify pgrst, 'reload schema';
commit;
