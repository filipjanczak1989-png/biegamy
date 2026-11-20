-- ZAMEK NA athletes.coach_id (K2, krok M2 z trzech; front K2 na produkcji od 20.11.2026 19:24 UTC). Przeglądarka (role authenticated i anon) może
-- coach_id tylko zostawić bez zmian albo wyczyścić (NULL = „Bez trenera”); przy INSERT tylko NULL. Trenera ustawiają wyłącznie funkcje SECURITY DEFINER
-- (rozpatrz_prosbe, accept_intake_form — w nich current_user to właściciel funkcji) i service_role (Edge Functions): wyzwalacz ich nie zatrzymuje.
-- Funkcja wyzwalacza celowo BEZ security definer: sprawdza current_user, czyli rolę, która wykonuje zapis. Odrzucenie: 42501 z komunikatem po polsku.
-- Grant UPDATE(coach_id) dla authenticated zostaje — jest potrzebny do NULL. Bez danych: obecne przypisania bez zmian (wyzwalacz działa tylko przy zapisie).
-- Test po skutku: tools/coach-id-zamek-test.sh (przed wdrożeniem COACH_ID_ZAMEK_Z_MIGRACJA=1). Wycofanie: 20261222_WYCOFANIE_athletes_coach_id_zamek.sql.
begin;

do $straz$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.athletes'::regclass and tgname = 'athletes_coach_id_zamek') then
    raise exception 'zamek na athletes.coach_id już jest: migracja 20261222 weszła wcześniej'; end if;
  if to_regprocedure('public.rozpatrz_prosbe(uuid, boolean)') is null or to_regprocedure('public.popros_o_trenera(uuid)') is null then
    raise exception 'brak funkcji próśb o trenera: najpierw migracja 20261221'; end if;
end $straz$;

create function public.athletes_coach_id_zamek()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.coach_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.coach_id is not distinct from old.coach_id then return new; end if;
  raise exception 'Trenera nie ustawia się wprost — wyślij prośbę, trener ją potwierdzi' using errcode = '42501';
end $function$;
revoke all on function public.athletes_coach_id_zamek() from public, anon, authenticated;
comment on function public.athletes_coach_id_zamek() is 'Zamek coach_id (20261222, K2 M2): authenticated/anon tylko bez zmian albo NULL; definer (rozpatrz_prosbe, accept_intake_form) i service_role przechodzą.';

create trigger athletes_coach_id_zamek
  before insert or update of coach_id on public.athletes
  for each row execute function public.athletes_coach_id_zamek();

commit;
