-- Wycofanie 20261101_f6_runner_key.sql. KOLEJNOŚĆ: najpierw EF okienko bez narzędzia moje_wyniki (zapamiętany klucz)
-- i js/okienko.js bez karty „Który to Ty?", potem ten plik. Zapamiętane wybory giną (kolumna znika).
begin;
drop trigger if exists athletes_f6_klucz_tylko_rpc on public.athletes;
drop function if exists public.athletes_f6_klucz_tylko_rpc();
drop function if exists public.ustaw_f6_runner_key(text);
revoke select (f6_runner_key) on public.athletes from authenticated;
alter table public.athletes drop column if exists f6_runner_key;
commit;
