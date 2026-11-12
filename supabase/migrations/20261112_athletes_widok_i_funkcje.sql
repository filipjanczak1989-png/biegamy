-- B, część DODAJĄCA (krok 3, 12.11.2026): tylko CREATE. Nic nie DROPujemy; polityki athletes bez zmian do kroku 4
-- (20261114_athletes_polityka_i_log_comments.sql). Front przełączony na widok działa z obiema wersjami bazy.
--
-- DLACZEGO: polityka athletes_read_public + grant kolumnowy SELECT dla authenticated na 60 kolumnach pozwalały każdemu
-- zalogowanemu czytać e-mail, datę urodzenia, współrzędne i identyfikatory zewnętrzne publicznych zawodników. Front
-- u CUDZYCH potrzebuje tylko: id, full_name, avatar_url, goal, target_date, race_goals, pb_*, city (decyzja 11.11:
-- miasto tak; lat/lon, data urodzenia, płeć: nie), hr_public (flaga widoczności tętna, nie dana osobowa).
-- Zdjęcie grantu kolumn nie wchodzi w grę: grant jest na rolę, odciąłby właściciela i trenera.
--
-- CO ROBI: (1) widok public_athletes dostaje kolumny NIEOSOBOWE dopisane NA KOŃCU (CREATE OR REPLACE VIEW nie zmienia
-- kolejności); granty widoku bez zmian (ACL zostaje: anon i authenticated SELECT); (2) trzy funkcje dla miejsc, którym
-- widok nie wystarczy: id wiersza mojego trenera (wątek wiadomości), zawodnik po e-mailu tylko dla trenera (przypisanie),
-- nowe konta tylko dla trenera (panel powiadomień, kolumny minimalne).
--
-- WYKONANIE: krok 3 planu z 12.11; sprawdzenie przez REST (nie SQL, cache PostgREST): rpc znajdz_zawodnika_po_emailu
-- jako trener → wiersz, jako zawodnik → 0 wierszy.
-- WYCOFANIE (gdyby trzeba): patrz blok na końcu pliku (same DROP FUNCTION; widok z dodatkowymi kolumnami może zostać,
-- nie niesie nic osobowego).

begin;

create or replace view public.public_athletes
with (security_invoker = off) as
  select id,
         full_name,
         avatar_url,
         goal,
         race_goals,
         pb_marathon,
         pb_half,
         pb_10k,
         pb_5k,
         target_date,
         pb_marathon_year,
         pb_half_year,
         pb_10k_year,
         pb_5k_year,
         created_at,
         city,
         hr_public
    from public.athletes
   where is_public = true;

comment on view public.public_athletes is
  'Publiczny profil zawodnika (is_public). Jedyna droga do CUDZYCH profili z frontu; bez kolumn osobowych poza miastem (decyzja 11.11). security_invoker=off świadomie: anon nie ma SELECT na athletes.';

-- Granty widoku (poprawka Filipa 12.11): CREATE OR REPLACE VIEW zachowuje ACL, więc anon dostałby 8 nowych kolumn 67 profili.
-- Anon ma widzieć DOKŁADNIE to, co dziś: grant kolumnowy na 9 starych kolumn; authenticated zostaje z SELECT na całym widoku.
-- Jedyny odczyt widoku bez sesji to profil.html (initPublicView) i wymienia te 9 kolumn po imieniu; żaden odczyt nie bierze „*” (zwiad 12.11).
revoke select on public.public_athletes from anon;
grant select (id, full_name, avatar_url, goal, race_goals, pb_marathon, pb_half, pb_10k, pb_5k) on public.public_athletes to anon;

-- id wiersza athletes mojego trenera (zawodnik.html: wątek wiadomości do trenera szukał go po user_id w tabeli)
create or replace function public.moj_trener_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select t.id
    from public.athletes a
    join public.athletes t on t.user_id = a.coach_id
   where a.user_id = auth.uid()
   limit 1;
$$;
comment on function public.moj_trener_id() is 'Id wiersza athletes trenera zalogowanego zawodnika (do wątku wiadomości). Tylko relacja zawodnik→trener, nic więcej.';
revoke all on function public.moj_trener_id() from public, anon;
grant execute on function public.moj_trener_id() to authenticated;

-- wyszukanie zawodnika po e-mailu: tylko dla trenera (przypisanie podopiecznego), dokładne dopasowanie, jeden wiersz
create or replace function public.znajdz_zawodnika_po_emailu(p_email text)
returns table (id uuid, full_name text, coach_id uuid, user_id uuid)
language sql
security definer
set search_path = ''
stable
as $$
  select a.id, a.full_name, a.coach_id, a.user_id
    from public.athletes a
   where public.auth_is_coach()
     and lower(a.email) = lower(trim(coalesce(p_email, '')))
   limit 1;
$$;
comment on function public.znajdz_zawodnika_po_emailu(text) is 'Dla trenera: jeden zawodnik po dokładnym e-mailu (przypisanie podopiecznego). Bez roli trenera 0 wierszy.';
revoke all on function public.znajdz_zawodnika_po_emailu(text) from public, anon;
grant execute on function public.znajdz_zawodnika_po_emailu(text) to authenticated;

-- nowe konta dla panelu powiadomień trenera: tylko rola trenera, kolumny minimalne, 10 ostatnich
create or replace function public.nowe_konta_trenera()
returns table (id uuid, full_name text, created_at timestamptz, goal text)
language sql
security definer
set search_path = ''
stable
as $$
  select a.id, a.full_name, a.created_at, a.goal
    from public.athletes a
   where public.auth_is_coach()
   order by a.created_at desc
   limit 10;
$$;
comment on function public.nowe_konta_trenera() is 'Dla trenera: 10 ostatnio założonych kont (id, imię, data, cel) do panelu powiadomień. Bez roli trenera 0 wierszy.';
revoke all on function public.nowe_konta_trenera() from public, anon;
grant execute on function public.nowe_konta_trenera() to authenticated;

do $$
declare t text;
begin
  if has_table_privilege('anon', 'public.public_athletes', 'SELECT') then raise exception 'athletes_widok: anon ma SELECT na całym widoku'; end if;
  foreach t in array array['id','full_name','avatar_url','goal','race_goals','pb_marathon','pb_half','pb_10k','pb_5k'] loop
    if not has_column_privilege('anon', 'public.public_athletes', t, 'SELECT') then raise exception 'athletes_widok: anon stracił kolumnę %', t; end if;
  end loop;
  foreach t in array array['target_date','pb_marathon_year','pb_half_year','pb_10k_year','pb_5k_year','created_at','city','hr_public'] loop
    if has_column_privilege('anon', 'public.public_athletes', t, 'SELECT') then raise exception 'athletes_widok: anon widzi nową kolumnę %', t; end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.public_athletes', 'SELECT') then raise exception 'athletes_widok: authenticated bez SELECT na widoku'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'public_athletes') <> 17 then raise exception 'athletes_widok: widok ma inną liczbę kolumn niż 17'; end if;
end $$;

-- PostgREST trzyma schemat w pamięci: bez odświeżenia nowe kolumny widoku i nowe funkcje (RPC) nie są widoczne z przeglądarki
notify pgrst, 'reload schema';
commit;

-- WYCOFANIE kroku 3 (ręcznie, osobno; nie wykonuje się z tym plikiem):
--   begin;
--   drop function if exists public.nowe_konta_trenera();
--   drop function if exists public.znajdz_zawodnika_po_emailu(text);
--   drop function if exists public.moj_trener_id();
--   (przywrócić anonowi SELECT na całym widoku, czyli ACL sprzed 12.11, i kolumny widoku wrócić do 9 plikiem z 31.07)
--   commit;
-- (CREATE OR REPLACE VIEW z pierwotną listą dziewięciu kolumn jest w 20260731120000_public_athletes_view.sql)
