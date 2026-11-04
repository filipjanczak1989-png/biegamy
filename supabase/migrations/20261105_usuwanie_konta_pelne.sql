-- 20261105_usuwanie_konta_pelne.sql — delete_my_account obiecuje usunięcie danych, a konto w athletes tylko anonimizuje, więc kaskada ON DELETE się nie odpala.
--   Tabele z FK do athletes dodane po ostatniej zmianie funkcji zostawały na zawsze: kontuzje, pamięć i logi Okienka, deklaracje stawek, ślad wyprawy.
--   Dopisane do AKTUALNEJ definicji funkcji. Strażnik niżej: każda tabela z kaskadą do athletes ma mieć swój DELETE; nowa tabela bez niego zatrzyma migrację, która ją doda, jeśli powtórzy tę kontrolę.
-- Wycofanie: 20261105_WYCOFANIE_usuwanie_konta_pelne.sql. WDRAŻAĆ PRZED 20261105_gra_cegielki.sql.
begin;

do $$
declare
  v_def text := pg_get_functiondef('public.delete_my_account()'::regprocedure);
  v_wzor text := $r$(DELETE FROM public\.wyniki_zgloszone\s+WHERE athlete_id = v_athlete_id;[^\n]*\n)$r$;
  v_nowe text := $n$\1  DELETE FROM public.injuries             WHERE athlete_id = v_athlete_id;
  DELETE FROM public.generator_proby      WHERE athlete_id = v_athlete_id;
  DELETE FROM public.intervals_status     WHERE athlete_id = v_athlete_id;
  DELETE FROM public.okienko_log          WHERE athlete_id = v_athlete_id;
  DELETE FROM public.okienko_pamiec       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.okienko_znaleziska   WHERE athlete_id = v_athlete_id;
  DELETE FROM public.okienko_v2_konta     WHERE athlete_id = v_athlete_id;
  DELETE FROM public.okienko_v2_log       WHERE athlete_id = v_athlete_id;
  DELETE FROM public.okienko_v2_rozmowa   WHERE athlete_id = v_athlete_id;
  DELETE FROM public.akcja_sponsorzy      WHERE athlete_id = v_athlete_id;
  DELETE FROM public.akcja_startujacy     WHERE athlete_id = v_athlete_id;
  DELETE FROM public.akcja_wyprawa_slad   WHERE athlete_id = v_athlete_id;
$n$;
  t record; v_po text;
begin
  if position('public.okienko_pamiec' in v_def) > 0 then raise exception 'usuwanie_konta: funkcja już kasuje te tabele'; end if;
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'usuwanie_konta: definicja funkcji inna, niż ta, pod którą robiono tę zmianę'; end if;
  execute regexp_replace(v_def, v_wzor, v_nowe);
  v_po := pg_get_functiondef('public.delete_my_account()'::regprocedure);
  for t in select distinct c.conrelid::regclass::text n from pg_constraint c where c.contype = 'f' and c.confrelid = 'public.athletes'::regclass and c.confdeltype = 'c' loop
    if position('public.' || t.n || ' ' in v_po) = 0 then raise exception 'usuwanie_konta: tabela % ma kaskadę do athletes, a funkcja jej nie kasuje', t.n; end if;
  end loop;
  if has_function_privilege('anon', 'public.delete_my_account()', 'execute') then raise exception 'usuwanie_konta: anon ma EXECUTE'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
