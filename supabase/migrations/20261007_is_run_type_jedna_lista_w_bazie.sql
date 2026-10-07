-- public.is_run_type(text) — JEDNA lista typów biegowych po stronie bazy.
--
-- Stan przed (zwiad 7.10.2026, tools/sprawdz-run-types.py): lista 10 typów w 12 niezależnych
-- kopiach + 1 pochodnej buildu. Po stronie SQL: suma_biegowa (LIVE: share-card, miesiac-cron),
-- community_km (5 wersji w migracjach; funkcja na prod, ale po 20.09 nikt jej nie woła) i dwa
-- pomiary w tools/. Każda kopia ma własną normalizację (`lower(btrim(coalesce(x,'')))` vs
-- `lower(trim(x))`). Warunek powrotu z LEKCJE #14 („po 20.09.2026") minął.
--
-- Ta migracja: funkcja IMMUTABLE STRICT (bez wiersza = NULL → false w WHERE), a suma_biegowa
-- przepisana na nią. community_km ŚWIADOMIE NIETKNIĘTA — jest po sezonie, z grantem EXECUTE
-- dla anon na SECURITY DEFINER; właściwa decyzja to kasacja, nie poprawa listy (osobno).
--
-- ⚠️ BRAMKA sprawdz-run-types.py: wywołań `is_run_type(...)` nie widzi (wzorzec IN/ANY), więc
-- w TYM SAMYM commicie dostaje drugi wzorzec na CIAŁO tej funkcji (ARRAY[...] w is_run_type).
-- MIN_ZRODEL zostaje 10: ubywa pomiar-tygodni-reakcji.sql (przechodzi na funkcję), przybywa
-- ten plik. Stare migracje community_km (nadpisane) nadal są liczone — bramka czyta repo
-- po treści, nie stan prod; to świadomy szum, nie dziura.
--
-- IMMUTABLE jest bezpieczne: żaden indeks, CHECK ani kolumna generowana nie odwołuje się do
-- training_type (grep migracji i migawek 7.10), więc zmiana listy w przyszłości nie unieważni
-- niczego zmaterializowanego; a planer może zwinąć wywołanie przy stałej.
--
-- Normalizacja = ta sama co w JS (`toLowerCase().trim()`): lower(btrim(x)).
-- IDEMPOTENTNA (create or replace). WYCOFANIE: 20261007_WYCOFANIE_is_run_type_jedna_lista_w_bazie.sql

begin;

create or replace function public.is_run_type(p_typ text)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select lower(btrim(p_typ)) = ANY (ARRAY[
    'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
    'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'
  ]);
$$;

comment on function public.is_run_type(text) is
  'Czy training_type liczy się do objętości BIEGOWEJ. Jedyna lista po stronie bazy (od 07.10.2026); '
  'lustro window.RUN_TYPES w sb.js i RUN_TYPES w _shared/reguly-treningow.mjs. Rozjazd wykrywa '
  'tools/sprawdz-run-types.py (ciało tej funkcji) i tools/bramka-reguly.js (sb.js vs mjs). '
  'STRICT: NULL → NULL (w WHERE = false). Nowy typ biegowy = zmiana w trzech miejscach naraz.';

-- EXECUTE bez anon: jedyny dziś konsument z anonem to community_km (SECURITY DEFINER, po sezonie),
-- a jej ŚWIADOMIE nie przepisujemy. Gdyby kiedyś anon miał wołać funkcję z is_run_type w środku,
-- SECURITY DEFINER i tak wykona ją uprawnieniami właściciela — grant dla anon nie jest potrzebny.
--
-- ⚠️ BŁĄD PIERWSZEJ WERSJI (zmierzony REST-em 7.10 po wykonaniu: anon → 200 true; LEKCJE #23):
-- stało tu samo `revoke all … from public`. W Supabase `create function` w schemacie public
-- dostaje z ALTER DEFAULT PRIVILEGES JAWNY grant EXECUTE dla anon, authenticated i service_role
-- (osobno, nie przez PUBLIC) — revoke od PUBLIC nie dotyka grantu anona. Ten sam kształt co
-- kolumnowy revoke w migracji MOST: revoke na jednym poziomie/adresacie nie zdejmuje grantu
-- z drugiego. Kontrola = proacl / REST, nie treść revoke. Na prod wykonane osobno 7.10.
revoke all on function public.is_run_type(text) from public;
revoke all on function public.is_run_type(text) from anon;
grant execute on function public.is_run_type(text) to authenticated, service_role;

-- suma_biegowa: identyczna semantyka, lista przez is_run_type.
-- Dawny warunek `lower(btrim(coalesce(t.training_type,''))) = ANY(ARRAY[...])` dawał false dla
-- NULL (pusty napis nie jest na liście); is_run_type(NULL) = NULL → też false w WHERE.
create or replace function public.suma_biegowa(
  p_athlete_id uuid,
  p_od         timestamptz,
  p_do         timestamptz
)
returns table (suma numeric, ile integer, najdluzszy numeric, sekundy bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(sum(t.distance_km), 0)::numeric                       as suma,
    count(*)::integer                                              as ile,
    coalesce(max(t.distance_km), 0)::numeric                       as najdluzszy,
    coalesce(sum(
      case when t.duration ~ '^[0-9]+:[0-9]{2}(:[0-9]{2})?$' then
        case when length(t.duration) - length(replace(t.duration, ':', '')) = 2
             then split_part(t.duration, ':', 1)::bigint * 3600
                + split_part(t.duration, ':', 2)::bigint * 60
                + split_part(t.duration, ':', 3)::bigint
             else split_part(t.duration, ':', 1)::bigint * 60
                + split_part(t.duration, ':', 2)::bigint
        end
      else 0 end
    ), 0)::bigint                                                  as sekundy
  from public.training_logs t
  where t.athlete_id = p_athlete_id
    and t.logged_at >= p_od
    and t.logged_at <  p_do
    and t.distance_km > 0
    and coalesce(t.training_type, '') not like '\_\_badge\_\_%'
    and public.is_run_type(t.training_type);
$$;

revoke all on function public.suma_biegowa(uuid, timestamptz, timestamptz) from public;
revoke all on function public.suma_biegowa(uuid, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.suma_biegowa(uuid, timestamptz, timestamptz) to service_role;

commit;

-- KONTROLA PO WYKONANIU (READ-ONLY):
--   select public.is_run_type('Interwały'), public.is_run_type(' tempo '), public.is_run_type('Rower'),
--          public.is_run_type(NULL);                    -- t, t, f, NULL
--   select provolatile, proisstrict from pg_proc where proname = 'is_run_type';   -- 'i', true
--   select proacl from pg_proc where proname = 'is_run_type';   -- BEZ wpisu anon=X/…
--   -- REST anon: POST /rest/v1/rpc/is_run_type {"p_typ":"Tempo"} → 42501 (nie 200 true)
--   -- równość wyniku przed/po dla jednego zawodnika (porównaj z wartością sprzed migracji):
--   select * from public.suma_biegowa('<athlete_id>', '2026-09-01', '2026-10-01');
