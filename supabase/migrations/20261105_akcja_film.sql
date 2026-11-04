-- 20261105_akcja_film.sql — film akcji w banerze Dziś (Filip 4.11). Tajny do startu, bo na końcu jest plakat z rysunkiem: plik w prywatnym kubełku akcja-wizerunek, adres podpisany w bazie, w repo ani w biegamy-assets go nie ma.
--   akcje.film_akcji_url — adres podpisany pliku .mp4. Licznik oddaje go TYLKO po starcie, TYLKO przy wizerunek_zgoda i NIGDY dla akcji testowej.
--   storage.buckets      — kubełek przyjmował tylko WebP do 2 MB, a film to mp4 ok. 2 MB: dopuszczamy video/mp4 i 5 MB. Kubełek zostaje prywatny, bez polityk.
--   Dopisane do AKTUALNEJ definicji licznika. WDRAŻAĆ PO 20261105_akcja_koparka.sql.
-- Test: blok niżej i tools/akcja-film-test.sh. Wycofanie: 20261105_WYCOFANIE_akcja_film.sql.
begin;

alter table public.akcje add column film_akcji_url text check (film_akcji_url is null or film_akcji_url ~ '^https://afqojgkaveykxbltxzwm\.supabase\.co/storage/v1/object/sign/akcja-wizerunek/[A-Za-z0-9._-]+\.mp4\?token=[A-Za-z0-9._-]+$');
comment on column public.akcje.film_akcji_url is 'Adres podpisany filmu akcji z prywatnego kubełka akcja-wizerunek. Tajny do startu: bez dostępu klienta, publicznie tylko przez akcja_licznik po starcie i przy zgodzie.';

update storage.buckets set allowed_mime_types = array['image/webp', 'video/mp4'], file_size_limit = 5242880 where id = 'akcja-wizerunek';

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'testowa',\s+a\.testowa\)$r$;
  j_przed jsonb; j_po jsonb; j_proba_przed jsonb; j_proba_po jsonb;
begin
  if position('koparka_url' in v_def) = 0 then raise exception 'akcja_film: najpierw 20261105_akcja_koparka.sql'; end if;
  if position('film_akcji_url' in v_def) > 0 then raise exception 'akcja_film: licznik już oddaje film'; end if;
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'akcja_film: definicja licznika inna, niż ta, pod którą robiono tę zmianę'; end if;

  j_przed := public.akcja_licznik('dla-fabianka');
  j_proba_przed := public.akcja_licznik('proba');
  execute regexp_replace(v_def, '(' || v_wzor || ')',
    $r$'film_akcji_url', case when a.wizerunek_zgoda and not a.testowa then a.film_akcji_url end, \1$r$);
  j_po := public.akcja_licznik('dla-fabianka');
  j_proba_po := public.akcja_licznik('proba');

  if (j_po - 'film_akcji_url') is distinct from j_przed or (j_proba_po - 'film_akcji_url') is distinct from j_proba_przed then
    raise exception 'akcja_film: odpowiedź licznika zmieniła się poza nowym polem';
  end if;
  if (not (j_po->>'wystartowala')::boolean and j_po ? 'film_akcji_url') or (not (j_proba_po->>'wystartowala')::boolean and j_proba_po ? 'film_akcji_url') then
    raise exception 'akcja_film: przed startem licznik nie może znać filmu';
  end if;
  if (select public from storage.buckets where id = 'akcja-wizerunek') is distinct from false then raise exception 'akcja_film: kubełek ma być prywatny'; end if;
  if has_column_privilege('anon', 'public.akcje', 'film_akcji_url', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'film_akcji_url', 'SELECT')
     or has_column_privilege('authenticated', 'public.akcje', 'film_akcji_url', 'UPDATE') then
    raise exception 'akcja_film: klient ma dostęp do kolumny';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
