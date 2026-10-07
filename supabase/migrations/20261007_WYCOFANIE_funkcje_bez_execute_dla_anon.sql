-- WYCOFANIE 20261007_funkcje_bez_execute_dla_anon.sql — odtwarza TYLKO are_friends (z migawki prod 7.10).
--
-- EXECUTE dla PUBLIC i anon na 11 funkcjach triggerowych NIE jest przywracany, a ALTER DEFAULT PRIVILEGES
-- NIE jest cofany: na prod były skutkiem default privileges Supabase, nie decyzją (LEKCJE #23); przywrócenie
-- to nadanie uprawnienia niezalogowanemu w pliku (bramka-commit: blokada twarda) i osobna decyzja.
-- authenticated i service_role mają jawne granty, których migracja nie ruszała — nie ma czego odtwarzać.
-- Nowe funkcje nadają granty jawnie (tak robimy od 7.10).

begin;

-- are_friends: odtworzona z migawki prod 7.10 (nigdzie nieużywana), EXECUTE bez anon/PUBLIC
CREATE OR REPLACE FUNCTION public.are_friends(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM friendships WHERE status = 'accepted'
      AND ((requester_id = a AND addressee_id = b) OR (requester_id = b AND addressee_id = a))
  );
$function$;
revoke all on function public.are_friends(a uuid, b uuid) from public;
revoke all on function public.are_friends(a uuid, b uuid) from anon;
grant execute on function public.are_friends(a uuid, b uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
