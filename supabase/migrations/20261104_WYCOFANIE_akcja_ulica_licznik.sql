-- 20261104_WYCOFANIE_akcja_ulica_licznik.sql — zdejmuje pole „ulica” z akcja_licznik; reszta definicji zostaje taka, jaka stoi na bazie (także firmy). Tabele ulicy nietknięte.
-- Front przeżywa brak pola: rysunek pokazuje drogę, maszyny i domki firm.
begin;
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'ulica', public\.akcja_ulica_publiczna\(a\.slug\), $r$;
begin
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then
    raise exception 'wycofanie akcja_ulica_licznik: nie ma tego wpisu w definicji licznika';
  end if;
  execute regexp_replace(v_def, v_wzor, '');
  if position('akcja_ulica_publiczna' in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) > 0 then
    raise exception 'wycofanie akcja_ulica_licznik: licznik wciąż woła funkcję ulicy';
  end if;
  if public.akcja_licznik('dla-fabianka') ? 'ulica' then raise exception 'wycofanie akcja_ulica_licznik: pole zostało'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
