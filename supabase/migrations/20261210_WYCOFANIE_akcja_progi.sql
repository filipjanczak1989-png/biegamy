-- WYCOFANIE 20261210_akcja_progi.sql: licznik bez pola prog (kotwica z powrotem), cron „akcja-progi” zdjęty, funkcje i tabela akcja_progi skasowane.
-- Tabela trzyma tylko kamienie z chwilą przekroczenia: ponowna migracja odtworzy przekroczone z training_logs (te z crona dostaną chwilę z historii).
-- Front bez pola prog nie pokazuje banera kamienia (js/akcja.mjs od 18.11), nic się nie psuje.
begin;

do $wycofanie$
declare v_def text; n integer;
  k_nowe  constant text := $k$'bieg', public.akcja_bieg_publiczny(a.slug), 'prog', public.akcja_prog_publiczny(a.id), 'firmy_zgloszenia', a.firmy_zgloszenia,$k$;
  k_stare constant text := $k$'bieg', public.akcja_bieg_publiczny(a.slug), 'firmy_zgloszenia', a.firmy_zgloszenia,$k$;
begin
  v_def := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  n := (length(v_def) - length(replace(v_def, k_nowe, ''))) / length(k_nowe);
  if n <> 1 then raise exception 'public.akcja_licznik(text): fragment z 20261210 wystąpił % razy (oczekiwano 1), nic nie zmieniam', n; end if;
  execute replace(v_def, k_nowe, k_stare);
end $wycofanie$;

select cron.unschedule('akcja-progi') where exists (select 1 from cron.job where jobname = 'akcja-progi');
drop function public.akcja_progi_zapisz();
drop function public.akcja_prog_publiczny(uuid);
drop function public.akcja_progi_lista(numeric, numeric);
drop table public.akcja_progi;

commit;
notify pgrst, 'reload schema';
