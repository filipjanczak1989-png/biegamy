-- 20261105_WYCOFANIE_akcja_rowerzysta.sql — zdejmuje przełącznik i podpis. EF i mapa przeżywają brak kolumn: postaci nie ma. NAJPIERW wycofanie gry albo nowa definicja gra_ranking: ta funkcja czyta rowerzysta_wlaczony.
begin;
alter table public.akcje drop column if exists rowerzysta_opis;
alter table public.akcje drop column if exists rowerzysta_wlaczony;
notify pgrst, 'reload schema';
commit;
