-- 20261105_WYCOFANIE_okienko_kciuki.sql — cofa 20261105_okienko_kciuki.sql (oceny z kolumny `ocena` zostają — kolumna była wcześniej; znikają komentarze i skróty odpowiedzi).
begin;
drop function if exists public.okienko_ocena(bigint, smallint, text);
alter table public.okienko_v2_log drop column if exists komentarz, drop column if exists odpowiedz;
notify pgrst, 'reload schema';
commit;
