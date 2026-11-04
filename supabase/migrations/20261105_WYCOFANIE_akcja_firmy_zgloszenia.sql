-- Wycofanie 20261105_akcja_firmy_zgloszenia.sql. KASUJE zgłoszenia; firmy już zatwierdzone zostają w akcja_firmy. Kubełek zostaje (Storage blokuje bezpośrednie kasowanie): pliki usuń w panelu.
begin;
select cron.unschedule('akcja-firmy-sprzatanie') where exists (select 1 from cron.job where jobname = 'akcja-firmy-sprzatanie');
drop function if exists public.akcja_firmy_progi(integer, integer, boolean);
drop function if exists public.akcja_firmy_do_sprawdzenia();
drop function if exists public.akcja_firmy_sprzatanie();
drop function if exists public.akcja_firmy_odrzuc(uuid, text, uuid);
drop function if exists public.akcja_firmy_zatwierdz(uuid, text, uuid);
drop function if exists public.akcja_firmy_zgloszenia_lista();
drop function if exists public.akcja_firmy_zgloszenie_dodaj(uuid, text, text, text, text, text, text, text, integer, boolean);
drop function if exists public.akcja_firmy_wpusc(text, text);
drop table if exists public.akcja_firmy_proby;
drop table if exists public.akcja_firmy_zgloszenia;
notify pgrst, 'reload schema';
commit;
