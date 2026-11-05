-- Wycofanie 20261107_akcja_proba_licznik.sql: licznik próby znów stoi na symulacji. Dane bez zmian. Prawdziwa akcja bez zmian.
begin;

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_nowe constant text := 'v_suma := coalesce(case when a.testowa then a.proba_sym_km end, 0) + public.akcja_km_okna(a.id, a.start, v_dzis);';
  j_przed jsonb; j_po jsonb;
begin
  if (select count(*) from regexp_matches(v_def, 'v_suma := coalesce\(case when a\.testowa then a\.proba_sym_km end, 0\) \+ public\.akcja_km_okna\(a\.id, a\.start, v_dzis\);', 'g')) <> 1 then
    raise exception 'WYCOFANIE akcja_proba_licznik: licznik inny, niż oczekiwany';
  end if;
  j_przed := public.akcja_licznik('dla-fabianka');
  execute replace(v_def, v_nowe, 'v_suma := coalesce(case when a.testowa then a.proba_sym_km end, public.akcja_km_okna(a.id, a.start, v_dzis));');
  j_po := public.akcja_licznik('dla-fabianka');
  if j_po is distinct from j_przed then raise exception 'WYCOFANIE akcja_proba_licznik: odpowiedź licznika prawdziwej akcji się zmieniła'; end if;
end $$;

commit;
