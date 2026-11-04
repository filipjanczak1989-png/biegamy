-- Wycofanie 20261105_gra_cegielki.sql. KASUJE wyniki, salda i pseudonimy graczy: przed wykonaniem zrób zrzut, jeśli gra już działała.
-- Akcja, licznik i statystyki treningowe tego nie widzą: gra pisze tylko do tabel gra_*.
begin;
do $$
declare v_def text := pg_get_functiondef('public.delete_my_account()'::regprocedure);
begin
  execute regexp_replace(v_def, $r$  DELETE FROM public\.gra_(podejrzane|wyniki|rundy|konto) WHERE athlete_id = v_athlete_id;\n$r$, '', 'g');
end $$;
drop function if exists public.gra_ustaw_pseudonim(uuid, text);
drop function if exists public.gra_zapisz_wynik(uuid, text, integer, numeric, jsonb);
drop function if exists public.gra_miejsca(uuid);
drop function if exists public.gra_moje_dolozone(uuid);
drop function if exists public.gra_ranking();
drop function if exists public.gra_dolozyli(timestamptz, timestamptz);
drop function if exists public.gra_ranking_od(date);
drop function if exists public.gra_kup(text);
drop function if exists public.gra_token_ok(text);
drop function if exists public.gra_start_rundy(text);
drop function if exists public.gra_liczba(jsonb);
drop function if exists public.gra_moj_postep();
drop function if exists public.gra_postac_odblokowana(text, uuid);
drop function if exists public.gra_suma_cegiel(uuid);
drop function if exists public.gra_poziom(bigint);
drop table if exists public.gra_podejrzane;
drop table if exists public.gra_wyniki;
drop table if exists public.gra_rundy;
drop table if exists public.gra_konto;
alter table public.akcje drop column if exists gra_aktywna;
alter table public.akcje drop column if exists gra_token_hash;
alter table public.akcje drop column if exists fabianek_postac_gra;
notify pgrst, 'reload schema';
commit;
