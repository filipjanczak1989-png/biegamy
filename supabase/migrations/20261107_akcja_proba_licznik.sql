-- Licznik próby liczy treningi (Filip 5.11: na koncie testowym dokładnie to, co zawodnik w sobotę). Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f (ścieżka absolutna), nigdy db push.
--   Dotąd po „od zera” proba_sym_km = 0 wygrywało w coalesce i licznik próby stał na zerze mimo logów. Teraz suma = symulacja z suwaka + prawdziwe km kont testowych.
--   Prawdziwa akcja nie ma symulacji (CHECK): 0 + te same km, więc liczy to samo co dotąd.
--   Uprawnień nie ruszamy: create or replace je zachowuje, sprawdza to blok na końcu.
begin;

do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_stare constant text := 'v_suma := coalesce(case when a.testowa then a.proba_sym_km end, public.akcja_km_okna(a.id, a.start, v_dzis));';
  j_przed jsonb; j_po jsonb;
begin
  if (select count(*) from regexp_matches(v_def, 'v_suma := coalesce\(case when a\.testowa then a\.proba_sym_km end, public\.akcja_km_okna\(a\.id, a\.start, v_dzis\)\);', 'g')) <> 1 then
    raise exception 'akcja_proba_licznik: licznik inny, niż oczekiwany';
  end if;
  j_przed := public.akcja_licznik('dla-fabianka');
  execute replace(v_def, v_stare, 'v_suma := coalesce(case when a.testowa then a.proba_sym_km end, 0) + public.akcja_km_okna(a.id, a.start, v_dzis);');
  j_po := public.akcja_licznik('dla-fabianka');
  if j_po is distinct from j_przed then raise exception 'akcja_proba_licznik: odpowiedź licznika prawdziwej akcji się zmieniła'; end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'akcja_proba_licznik: anon woła licznik'; end if;
  if not has_function_privilege('authenticated', 'public.akcja_licznik(text)', 'EXECUTE') then raise exception 'akcja_proba_licznik: authenticated bez licznika'; end if;
end $$;

commit;
