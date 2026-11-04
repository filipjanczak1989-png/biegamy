-- Wycofanie 20261105_usuwanie_konta_pelne.sql. Wraca stan, w którym te tabele zostają po usunięciu konta.
begin;
do $$
declare v_def text := pg_get_functiondef('public.delete_my_account()'::regprocedure);
begin
  execute regexp_replace(v_def, $r$  DELETE FROM public\.(injuries|generator_proby|intervals_status|okienko_log|okienko_pamiec|okienko_znaleziska|okienko_v2_konta|okienko_v2_log|okienko_v2_rozmowa|akcja_sponsorzy|akcja_startujacy|akcja_wyprawa_slad)\s+WHERE athlete_id = v_athlete_id;\n$r$, '', 'g');
  if position('public.okienko_pamiec' in pg_get_functiondef('public.delete_my_account()'::regprocedure)) > 0 then raise exception 'wycofanie usuwanie_konta: funkcja wciąż kasuje te tabele'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
