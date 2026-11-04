-- Wycofanie 20261105_akcja_koparka_arkusz.sql. Plik w kubełku usuwa Filip w panelu.
begin;
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'koparka_arkusz_url', case when a\.wizerunek_zgoda and not a\.testowa and a\.koparka_postac is not null then a\.koparka_arkusz_url end, $r$;
begin
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'wycofanie akcja_koparka_arkusz: definicja licznika inna, niż oczekiwana'; end if;
  execute regexp_replace(v_def, v_wzor, '');
  if position('koparka_arkusz_url' in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) > 0 then raise exception 'wycofanie akcja_koparka_arkusz: licznik wciąż oddaje arkusz'; end if;
end $$;
alter table public.akcje drop column if exists koparka_arkusz_url;
notify pgrst, 'reload schema';
commit;
