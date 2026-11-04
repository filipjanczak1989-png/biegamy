-- 20261104_akcja_ulica_licznik.sql — pole „ulica” w akcja_licznik: cegiełki i elementy z progów na rysunku, tą samą drogą co reszta licznika (RPC dla zalogowanych, istniejąca EF akcja-licznik dla reszty).
--   WDRAŻAĆ PO 20261104_akcja_firmy.sql I 20261104_akcja_ulica.sql. Migracja firm ma blokadę odcisku licznika, więc przed nimi by ją zablokowała; tu blokada działa w drugą stronę: bez firm odmawia.
--   Jeden element dopisany do AKTUALNEJ definicji z bazy (zamiast kopii całej funkcji), więc nie cofa niczego, co na bazie jest nowsze. Reszta odpowiedzi musi wyjść bez zmian: sprawdza to blok niżej.
--   Gałąź „przed startem” zwraca wcześniej, więc przed startem pola nie ma. akcja_ulica_publiczna łapie własne błędy, więc awaria dodatków nie zabierze licznika.
--   Można odłożyć po starcie: bez tej migracji rysunek pokazuje drogę, maszyny i domki firm, a panel trenera działa.
-- Test: UL_Z_LICZNIKIEM=1 bash tools/akcja-ulica-test.sh. Wycofanie: 20261104_WYCOFANIE_akcja_ulica_licznik.sql (najpierw ono, potem wycofanie tabel).
begin;

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_wzor text := $r$'testowa',\s+a\.testowa\)$r$;
  j_przed jsonb; j_po jsonb; j_proba_przed jsonb; j_proba_po jsonb;
begin
  if to_regprocedure('public.akcja_ulica_publiczna(text)') is null then
    raise exception 'akcja_ulica_licznik: najpierw 20261104_akcja_ulica.sql';
  end if;
  if position('v_firmy' in v_def) = 0 then
    raise exception 'akcja_ulica_licznik: najpierw 20261104_akcja_firmy.sql (jej blokada odcisku odmówiłaby po tej zmianie)';
  end if;
  if position('akcja_ulica_publiczna' in v_def) > 0 then
    raise exception 'akcja_ulica_licznik: licznik już woła akcja_ulica_publiczna';
  end if;
  if (select count(*) from regexp_matches(v_def, v_wzor, 'g')) <> 1 then
    raise exception 'akcja_ulica_licznik: definicja licznika inna, niż ta, pod którą robiono tę zmianę: dopisz pole ulica ręcznie';
  end if;

  j_przed := public.akcja_licznik('dla-fabianka');
  j_proba_przed := public.akcja_licznik('proba');
  execute regexp_replace(v_def, '(' || v_wzor || ')', $r$'ulica', public.akcja_ulica_publiczna(a.slug), \1$r$);
  j_po := public.akcja_licznik('dla-fabianka');
  j_proba_po := public.akcja_licznik('proba');

  if (j_po - 'ulica') is distinct from j_przed or (j_proba_po - 'ulica') is distinct from j_proba_przed then
    raise exception 'akcja_ulica_licznik: odpowiedź licznika zmieniła się poza polem ulica';
  end if;
  if ((j_po->>'wystartowala')::boolean and jsonb_typeof(j_po->'ulica') <> 'object')
     or (not (j_po->>'wystartowala')::boolean and j_po ? 'ulica')
     or ((j_proba_po->>'wystartowala')::boolean and jsonb_typeof(j_proba_po->'ulica') <> 'object')
     or (not (j_proba_po->>'wystartowala')::boolean and j_proba_po ? 'ulica') then
    raise exception 'akcja_ulica_licznik: pole ulica ma być tylko po starcie';
  end if;
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'execute') then raise exception 'akcja_ulica_licznik: anon ma EXECUTE na liczniku'; end if;
  if not has_function_privilege('authenticated', 'public.akcja_licznik(text)', 'execute') then raise exception 'akcja_ulica_licznik: authenticated stracił licznik'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
