-- 20261105_WYCOFANIE_okienko_pamiec.sql — cofa 20261105_okienko_pamiec.sql. Pamięć długa znika (zawodnicy tracą zapamiętane fakty —
-- przed cofnięciem zrzut: select * from okienko_pamiec). Treść rozmów (kolumny) znika; intencje i sloty zostają.
begin;
drop trigger if exists okienko_pamiec_limit_trg on public.okienko_pamiec;
drop function if exists public.okienko_pamiec_limit();
drop table if exists public.okienko_pamiec;
alter table public.okienko_v2_rozmowa drop column if exists pytanie, drop column if exists odpowiedz;
notify pgrst, 'reload schema';
commit;
