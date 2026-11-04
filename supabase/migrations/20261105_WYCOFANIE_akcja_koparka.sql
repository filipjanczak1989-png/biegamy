-- 20261105_WYCOFANIE_akcja_koparka.sql — zdejmuje pola koparki z akcja_licznik i kolumny z akcje. Reszta definicji licznika zostaje taka, jaka stoi na bazie.
-- Plik i kubełek akcja-wizerunek skasuj w panelu Storage: Supabase nie pozwala kasować plików z SQL. Adres podpisany przestaje działać dopiero po skasowaniu pliku.
-- Front przeżywa brak pól: guzik, ulica i gra pokazują zwykłą wersję.
begin;
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'koparka_postac', case when a\.wizerunek_zgoda and not a\.testowa and a\.koparka_url is not null then a\.koparka_postac end, 'koparka_url', case when a\.wizerunek_zgoda and not a\.testowa and a\.koparka_postac is not null then a\.koparka_url end, $r$;
begin
  if position('koparka_arkusz_url' in v_def) > 0 then raise exception 'wycofanie akcja_koparka: najpierw 20261105_WYCOFANIE_akcja_koparka_arkusz.sql, inaczej licznik padnie po starcie'; end if;
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'wycofanie akcja_koparka: nie ma tego wpisu w definicji licznika'; end if;
  execute regexp_replace(v_def, v_wzor, '');
  if position('koparka_url' in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) > 0 then raise exception 'wycofanie akcja_koparka: licznik wciąż oddaje koparka_url'; end if;
end $$;
alter table public.akcje drop column if exists koparka_url;
alter table public.akcje drop column if exists koparka_postac;
notify pgrst, 'reload schema';
commit;
