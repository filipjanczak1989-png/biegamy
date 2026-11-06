-- 20261107_akcja_muzyka.sql — muzyka akcji w prywatnym kubełku (Filip 6.11). Tajna do startu, bo teksty mają imię dziecka: plik w kubełku akcja-wizerunek, adres podpisany w bazie, w repo ani w biegamy-assets jej nie ma.
--   storage.buckets — kubełek odrzucał MP3: dopisane audio/mpeg. Limit rozmiaru bez zmian. Kubełek zostaje prywatny, bez polityk.
--   akcje.muzyka    — pozycja → adres podpisany pliku .mp3. Bez dostępu klienta. Licznik oddaje ją TYLKO po starcie, TYLKO przy wizerunek_zgoda i NIGDY dla akcji testowej. Pozycja rower dopiero przy włączonym rowerzyście.
--   Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f (ścieżka absolutna), nigdy db push. Uprawnień nie ruszamy: create or replace je zachowuje, sprawdza to blok niżej.
-- Test: tools/akcja-muzyka-test.sh. Wycofanie: 20261107_WYCOFANIE_akcja_muzyka.sql.
begin;

do $$
declare b storage.buckets;
begin
  select * into b from storage.buckets where id = 'akcja-wizerunek';
  if not found then raise exception 'akcja_muzyka: brak kubełka akcja-wizerunek'; end if;
  if b.allowed_mime_types is distinct from array['image/webp', 'video/mp4'] then raise exception 'akcja_muzyka: lista typów inna, niż ta, którą przywraca wycofanie: %', b.allowed_mime_types; end if;
  if b.public is distinct from false then raise exception 'akcja_muzyka: kubełek ma być prywatny'; end if;
end $$;

alter table public.akcje add column muzyka jsonb check (muzyka is null or (
  jsonb_typeof(muzyka) = 'object'
  and (muzyka - array['premiera', 'menu1', 'menu2', 'rower', 'noc', 'mur', 'final', 'magazyn']) = '{}'::jsonb
  and not jsonb_path_exists(muzyka, '$.* ? (@.type() != "string")')
  and not jsonb_path_exists(muzyka, '$.* ? (!(@ like_regex "^https://afqojgkaveykxbltxzwm\\.supabase\\.co/storage/v1/object/sign/akcja-wizerunek/[A-Za-z0-9._-]+\\.mp3\\?token=[A-Za-z0-9._-]+$"))')
));
comment on column public.akcje.muzyka is 'Pozycja → adres podpisany pliku .mp3 z prywatnego kubełka akcja-wizerunek. Tajna do startu: bez dostępu klienta, publicznie tylko przez akcja_licznik po starcie i przy zgodzie.';

update storage.buckets set allowed_mime_types = array['image/webp', 'video/mp4', 'audio/mpeg'] where id = 'akcja-wizerunek';

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_po constant text := $s$'film_akcji_url', case when a.wizerunek_zgoda and not a.testowa then a.film_akcji_url end, $s$;
  v_nowe constant text := $s$'muzyka', case when a.wizerunek_zgoda and not a.testowa then a.muzyka - (case when a.rowerzysta_wlaczony then array[]::text[] else array['rower'] end) end, $s$;
  j_przed jsonb; j_po jsonb; j_proba_przed jsonb; j_proba_po jsonb;
begin
  if position($s$'muzyka'$s$ in v_def) > 0 then raise exception 'akcja_muzyka: licznik już oddaje muzykę'; end if;
  if (length(v_def) - length(replace(v_def, v_po, ''))) <> length(v_po) then raise exception 'akcja_muzyka: definicja licznika inna, niż ta, pod którą robiono tę zmianę'; end if;

  j_przed := public.akcja_licznik('dla-fabianka');
  j_proba_przed := public.akcja_licznik('proba');
  execute replace(v_def, v_po, v_po || v_nowe);
  j_po := public.akcja_licznik('dla-fabianka');
  j_proba_po := public.akcja_licznik('proba');

  if (j_po - 'muzyka') is distinct from j_przed or (j_proba_po - 'muzyka') is distinct from j_proba_przed then
    raise exception 'akcja_muzyka: odpowiedź licznika zmieniła się poza nowym polem';
  end if;
  if (not (j_po->>'wystartowala')::boolean and j_po ? 'muzyka') or (not (j_proba_po->>'wystartowala')::boolean and j_proba_po ? 'muzyka') then
    raise exception 'akcja_muzyka: przed startem licznik nie może znać muzyki';
  end if;
  if j_proba_po->>'muzyka' is not null then raise exception 'akcja_muzyka: próba oddaje muzykę z licznika'; end if;
  if has_column_privilege('anon', 'public.akcje', 'muzyka', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'muzyka', 'SELECT')
     or has_column_privilege('anon', 'public.akcje', 'muzyka', 'UPDATE') or has_column_privilege('authenticated', 'public.akcje', 'muzyka', 'UPDATE') then
    raise exception 'akcja_muzyka: klient ma dostęp do kolumny';
  end if;
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'akcja_muzyka: anon woła licznik'; end if;
  if not has_function_privilege('authenticated', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'akcja_muzyka: authenticated bez licznika'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
