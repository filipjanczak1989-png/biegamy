-- 20261231_obserwacje_i_powiadomienia_relacje.sql — obserwacje i powiadomienia tylko w relacjach (E1, plan dzis\spolecznosc\plan-s2.md §4.2).
--
-- follows, ODCZYT: wiersz widzi tylko jego strona (obserwujący albo obserwowany). Licznik obserwujących cudzego profilu daje funkcja
--   obserwujacy_liczba(id): sama liczba, dla profilu publicznego, własnego albo podopiecznego trenera; inaczej null.
-- notifications, WSTAWIANIE z przeglądarki (Edge Functions i funkcje bazy z SECURITY DEFINER piszą jak dotąd, poza RLS):
--   1) trener → swój zawodnik (nadawca pusty albo własne konto zawodnika trenera);
--   2) powiadomienie dla siebie bez nadawcy (odznaki);
--   3) od siebie, gdy rodzaj pasuje do relacji, która już jest w bazie (powiadomienie_relacja):
--        follow → obserwuję adresata; friend_request, friend_accepted → wiersz znajomości między nami (dowolny stan);
--        chat → moja wiadomość do adresata; comment → mój komentarz pod jego treningiem; duel → pojedynek między nami;
--        athlete_message → adresat to mój trener (jego konto zawodnika). Inne rodzaje od siebie: nie.
--   powiadomienie_relacja odpowiada tylko o relacjach pytającego (nadawca = własne konto), o cudze zawsze false.
-- STANY: polityki i funkcje są zawsze stawiane od nowa (drop if exists + create, create or replace), więc ponowne uruchomienie niczego nie psuje;
--   komunikat w wyniku mówi, czy to pierwsze uruchomienie. Wyjątek (nic nie zmienione) tylko wtedy, gdy na follows albo notifications jest
--   INNA polityka odczytu/wstawiania, która by tę zawężała obchodziła (polityki permissive łączą się przez OR), albo asercje uprawnień nie przejdą.
-- Test po skutku (w transakcji, zawsze wycofanej): tools/relacje-uprawnienia-test.sh (przed wdrożeniem z E1_Z_MIGRACJA=1).
-- Kolejność wdrożenia: najpierw front (profil.html pyta o licznik funkcją; bez funkcji pokazuje „—”), potem ta migracja.
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261231_obserwacje_i_powiadomienia_relacje.sql"
-- Wycofanie: 20261231_WYCOFANIE_obserwacje_i_powiadomienia_relacje.sql.

begin;

create temp table if not exists _e1_komunikat (komunikat text) on commit drop;
truncate _e1_komunikat;
insert into _e1_komunikat
select case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'follows_select_relacja')
            then 'obserwacje i powiadomienia: polityki już były, postawione od nowa (bez zmiany zasad)'
            else 'obserwacje i powiadomienia: zawężone do relacji' end;

-- ── inne polityki, które obeszłyby zawężenie: wtedy nie wdrażamy ──
do $$
declare inne text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into inne from pg_policies
   where schemaname = 'public' and permissive = 'PERMISSIVE'
     and ((tablename = 'follows' and cmd in ('SELECT', 'ALL') and policyname not in ('select_follows', 'follows_select_relacja'))
       or (tablename = 'notifications' and cmd in ('INSERT', 'ALL') and policyname not in ('notifications_insert_authenticated', 'notifications_insert_relacja')));
  if inne is not null then raise exception 'E1: inne polityki odczytu/wstawiania (%): najpierw je przejrzeć, nic nie zmienione', inne; end if;
end $$;

-- ── relacja nadawca → adresat dla rodzaju powiadomienia (tylko o własnych relacjach) ──
create or replace function public.powiadomienie_relacja(p_od uuid, p_do uuid, p_typ text)
returns boolean
language sql stable security definer
set search_path = ''
as $fn$
  select coalesce(
    p_od is not null and p_do is not null and p_od <> p_do
    and exists (select 1 from public.athletes ja where ja.id = p_od and ja.user_id = (select auth.uid()))
    and case p_typ
      when 'follow' then exists (select 1 from public.follows f where f.follower_id = p_od and f.following_id = p_do)
      when 'friend_request' then exists (select 1 from public.friendships z where (z.requester_id = p_od and z.addressee_id = p_do) or (z.requester_id = p_do and z.addressee_id = p_od))
      when 'friend_accepted' then exists (select 1 from public.friendships z where (z.requester_id = p_od and z.addressee_id = p_do) or (z.requester_id = p_do and z.addressee_id = p_od))
      when 'chat' then exists (select 1 from public.peer_messages m where m.from_id = p_od and m.to_id = p_do)
      when 'comment' then exists (select 1 from public.log_comments c join public.training_logs l on l.id = c.log_id where c.athlete_id = p_od and l.athlete_id = p_do)
      when 'duel' then exists (select 1 from public.duels d where (d.challenger_id = p_od and d.opponent_id = p_do) or (d.challenger_id = p_do and d.opponent_id = p_od))
      when 'athlete_message' then exists (select 1 from public.athletes ja join public.athletes t on t.user_id = ja.coach_id where ja.id = p_od and t.id = p_do)
      else false
    end, false)
$fn$;
comment on function public.powiadomienie_relacja(uuid, uuid, text) is 'E1 (20261231): czy nadawca (własne konto pytającego) ma z adresatem relację pasującą do rodzaju powiadomienia. O cudze relacje zawsze false.';
revoke all on function public.powiadomienie_relacja(uuid, uuid, text) from public, anon;
grant execute on function public.powiadomienie_relacja(uuid, uuid, text) to authenticated;

-- ── licznik obserwujących (sama liczba) ──
create or replace function public.obserwujacy_liczba(p_athlete uuid)
returns integer
language sql stable security definer
set search_path = ''
as $fn$
  select case when exists (select 1 from public.athletes a
                            where a.id = p_athlete
                              and (a.is_public is true or a.user_id = (select auth.uid()) or a.coach_id = (select auth.uid())))
              then (select count(*)::integer from public.follows f where f.following_id = p_athlete) end
$fn$;
comment on function public.obserwujacy_liczba(uuid) is 'E1 (20261231): liczba obserwujących profilu publicznego, własnego albo podopiecznego trenera; inaczej null. Bez listy osób.';
revoke all on function public.obserwujacy_liczba(uuid) from public, anon;
grant execute on function public.obserwujacy_liczba(uuid) to authenticated;

-- ── follows: odczyt tylko dla stron relacji ──
drop policy if exists select_follows on public.follows;
drop policy if exists follows_select_relacja on public.follows;
create policy follows_select_relacja on public.follows for select to authenticated
  using (follower_id in (select a.id from public.athletes a where a.user_id = (select auth.uid()))
      or following_id in (select a.id from public.athletes a where a.user_id = (select auth.uid())));

-- ── notifications: wstawianie z przeglądarki tylko w relacjach ──
drop policy if exists notifications_insert_authenticated on public.notifications;
drop policy if exists notifications_insert_relacja on public.notifications;
create policy notifications_insert_relacja on public.notifications for insert to authenticated
  with check (
    (athlete_id in (select a.id from public.athletes a where a.coach_id = (select auth.uid()))
      and (from_athlete_id is null or from_athlete_id in (select a.id from public.athletes a where a.user_id = (select auth.uid()))))
    or (from_athlete_id is null and athlete_id in (select a.id from public.athletes a where a.user_id = (select auth.uid())))
    or public.powiadomienie_relacja(from_athlete_id, athlete_id, type)
  );

-- ── asercje: przy błędzie wyjątek i nic nie zmienione ──
do $$
declare f oid; g oid;
begin
  f := to_regprocedure('public.powiadomienie_relacja(uuid, uuid, text)'); g := to_regprocedure('public.obserwujacy_liczba(uuid)');
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('anon', g, 'EXECUTE') then raise exception 'E1: anon może wołać funkcje — nie wdrażamy'; end if;
  if exists (select 1 from pg_proc, aclexplode(proacl) x where pg_proc.oid in (f, g) and x.grantee = 0 and x.privilege_type = 'EXECUTE') then raise exception 'E1: PUBLIC ma EXECUTE — nie wdrażamy'; end if;
  if not (has_function_privilege('authenticated', f, 'EXECUTE') and has_function_privilege('authenticated', g, 'EXECUTE')) then raise exception 'E1: authenticated nie może wołać funkcji'; end if;
  if not coalesce((select bool_and(prosecdef and 'search_path=""' = any (proconfig)) from pg_proc where oid in (f, g)), false) then raise exception 'E1: funkcje bez SECURITY DEFINER albo stałego search_path'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'follows' and cmd in ('SELECT', 'ALL')) <> 1 then raise exception 'E1: follows ma inną liczbę polityk odczytu niż 1'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'notifications' and cmd in ('INSERT', 'ALL')) <> 1 then raise exception 'E1: notifications ma inną liczbę polityk wstawiania niż 1'; end if;
  if not exists (select 1 from pg_class where oid = 'public.follows'::regclass and relrowsecurity) or not exists (select 1 from pg_class where oid = 'public.notifications'::regclass and relrowsecurity) then
    raise exception 'E1: RLS wyłączone na follows albo notifications'; end if;
end $$;

notify pgrst, 'reload schema';

select komunikat from _e1_komunikat;
commit;
