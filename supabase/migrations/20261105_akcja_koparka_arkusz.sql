-- 20261105_akcja_koparka_arkusz.sql — arkusz animacji grywalnej koparki (Filip 4.11). Tajny do startu jak rysunek: plik w prywatnym kubełku akcja-wizerunek, adres podpisany w bazie, w repo tylko liczby.
--   akcje.koparka_arkusz_url — ten sam wzór adresu i te same warunki co koparka_url: TYLKO po starcie, TYLKO przy wizerunek_zgoda, NIGDY dla akcji testowej, tylko przy ustawionym koparka_postac.
--   Dopisane do AKTUALNEJ definicji licznika. WDRAŻAĆ PO 20261105_akcja_koparka.sql.
-- Test: blok niżej i tools/akcja-koparka-test.sh. Wycofanie: 20261105_WYCOFANIE_akcja_koparka_arkusz.sql.
begin;

alter table public.akcje add column koparka_arkusz_url text check (koparka_arkusz_url is null or koparka_arkusz_url ~ '^https://afqojgkaveykxbltxzwm\.supabase\.co/storage/v1/object/sign/akcja-wizerunek/[A-Za-z0-9._-]+\.webp\?token=[A-Za-z0-9._-]+$');
comment on column public.akcje.koparka_arkusz_url is 'Adres podpisany arkusza animacji z prywatnego kubełka akcja-wizerunek. Tajny do startu: bez dostępu klienta, publicznie tylko przez akcja_licznik po starcie i przy zgodzie.';

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'testowa',\s+a\.testowa\)$r$;
  j_przed jsonb; j_po jsonb; j_proba_przed jsonb; j_proba_po jsonb;
begin
  if position('koparka_url' in v_def) = 0 then raise exception 'akcja_koparka_arkusz: najpierw 20261105_akcja_koparka.sql'; end if;
  if position('koparka_arkusz_url' in v_def) > 0 then raise exception 'akcja_koparka_arkusz: licznik już oddaje arkusz'; end if;
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then raise exception 'akcja_koparka_arkusz: definicja licznika inna, niż ta, pod którą robiono tę zmianę'; end if;

  j_przed := public.akcja_licznik('dla-fabianka');
  j_proba_przed := public.akcja_licznik('proba');
  execute regexp_replace(v_def, '(' || v_wzor || ')',
    $r$'koparka_arkusz_url', case when a.wizerunek_zgoda and not a.testowa and a.koparka_postac is not null then a.koparka_arkusz_url end, \1$r$);
  j_po := public.akcja_licznik('dla-fabianka');
  j_proba_po := public.akcja_licznik('proba');

  if (j_po - 'koparka_arkusz_url') is distinct from j_przed or (j_proba_po - 'koparka_arkusz_url') is distinct from j_proba_przed then
    raise exception 'akcja_koparka_arkusz: odpowiedź licznika zmieniła się poza nowym polem';
  end if;
  if (not (j_po->>'wystartowala')::boolean and j_po ? 'koparka_arkusz_url') or (not (j_proba_po->>'wystartowala')::boolean and j_proba_po ? 'koparka_arkusz_url') then
    raise exception 'akcja_koparka_arkusz: przed startem licznik nie może znać arkusza';
  end if;
  if has_column_privilege('anon', 'public.akcje', 'koparka_arkusz_url', 'SELECT') or has_column_privilege('authenticated', 'public.akcje', 'koparka_arkusz_url', 'SELECT')
     or has_column_privilege('authenticated', 'public.akcje', 'koparka_arkusz_url', 'UPDATE') then
    raise exception 'akcja_koparka_arkusz: klient ma dostęp do kolumny';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
