-- WYCOFANIE 20261222_athletes_coach_id_zamek.sql: zdejmuje wyzwalacz i jego funkcję. Po nim przeglądarka znów może zapisać coach_id wprost
-- (stan sprzed M2: zawodnik sam wybiera trenera). Prośby (20261221) i front zostają; dane bez zmian.
begin;

do $wycofanie$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.athletes'::regclass and tgname = 'athletes_coach_id_zamek') then
    raise exception 'Nie ma zamka athletes_coach_id_zamek: migracja 20261222 nie weszła albo jest już wycofana'; end if;
end $wycofanie$;

drop trigger athletes_coach_id_zamek on public.athletes;
drop function public.athletes_coach_id_zamek();

commit;
