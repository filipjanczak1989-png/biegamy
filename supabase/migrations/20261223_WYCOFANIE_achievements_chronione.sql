-- WYCOFANIE 20261223_achievements_chronione.sql: zdejmuje wyzwalacz i funkcję. Po nim przeglądarka znów może wstawić sobie każdą odznakę spoza okien
-- (stan sprzed O1). Odznaki w bazie bez zmian. Gdy weszła już migracja danych O3 (pierwsza z pierwszych / pionier), wycofaj najpierw ją.
begin;

do $wycofanie$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.achievements'::regclass and tgname = 'achievements_chronione') then
    raise exception 'Nie ma wyzwalacza achievements_chronione: migracja 20261223 nie weszła albo jest już wycofana'; end if;
end $wycofanie$;

drop trigger achievements_chronione on public.achievements;
drop function public.achievements_chronione();

commit;
