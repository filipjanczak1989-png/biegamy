-- Wycofanie 20261105_akcja_film.sql. Plik w kubełku usuwa Filip w panelu; limit kubełka wraca do WebP 2 MB, więc plik .mp4 usunąć przed wycofaniem.
begin;
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'film_akcji_url', case when a\.wizerunek_zgoda and not a\.testowa then a\.film_akcji_url end, $r$;
begin
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'wycofanie akcja_film: definicja licznika inna, niż oczekiwana'; end if;
  execute regexp_replace(v_def, v_wzor, '');
  if position('film_akcji_url' in pg_get_functiondef('public.akcja_licznik(text)'::regprocedure)) > 0 then raise exception 'wycofanie akcja_film: licznik wciąż oddaje film'; end if;
end $$;
update storage.buckets set allowed_mime_types = array['image/webp'], file_size_limit = 2097152 where id = 'akcja-wizerunek';
alter table public.akcje drop column if exists film_akcji_url;
notify pgrst, 'reload schema';
commit;
