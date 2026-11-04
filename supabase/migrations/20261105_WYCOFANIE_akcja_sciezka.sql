-- Wycofanie 20261105_akcja_sciezka.sql. Prawdziwa akcja nietknięta, limit dobowy wraca do jednej wartości dla wszystkich.
begin;
drop function if exists public.akcja_proba_firmy(boolean);
drop function if exists public.akcja_proba_symuluj(numeric, integer);
drop function if exists public.akcja_proba_od_zera();
drop function if exists public.akcja_sciezka_stan();
do $$
declare
  v_def text := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  v_km text := pg_get_functiondef('public.akcja_km_okna(uuid, date, date, uuid[])'::regprocedure);
begin
  execute replace(v_def, 'v_suma := coalesce(case when a.testowa then a.proba_sym_km end, public.akcja_km_okna(a.id, a.start, v_dzis));', 'v_suma := public.akcja_km_okna(a.id, a.start, v_dzis);');
  execute replace(v_km, 'least(dz.km, case when dz.athlete_id = any(coalesce(a.wyprawa_athlete_ids, ''{}''::uuid[])) then a.cap_km_doba_wyprawa else a.cap_km_doba end)', 'least(dz.km, a.cap_km_doba)');
  if pg_get_functiondef('public.akcja_licznik(text)'::regprocedure) ~ 'proba_sym_km' or pg_get_functiondef('public.akcja_km_okna(uuid, date, date, uuid[])'::regprocedure) ~ 'cap_km_doba_wyprawa' then raise exception 'wycofanie akcja_sciezka: funkcje wciąż znają nowe kolumny'; end if;
end $$;
alter table public.akcje drop column if exists cap_km_doba_wyprawa;
alter table public.akcje drop column if exists proba_sym_km;
notify pgrst, 'reload schema';
commit;
