-- biegus_most: znacznik `ostatni_odbior` przesuwany WYŁĄCZNIE przez RPC security definer,
-- tylko DO PRZODU i nie dalej niż now(). Kolumnowy GRANT UPDATE/INSERT dla authenticated zdjęty.
--
-- PO CO (zwiad 6.10.2026, punkty Biegusia): wypłata piór za treningi (MOST, 5 🪶/km) jest
-- dedupowana po znaczniku czasu `ostatni_odbior`, a ten znacznik ma dziś
-- `grant update (ostatni_odbior) … to authenticated` (20260715000000_biegus_most.sql).
-- Każdy zalogowany może więc PATCH-em przez REST cofnąć własny znacznik o rok i odebrać
-- pióra ponownie. UI tego nie robi — ale liczy się GRANT, nie JavaScript (README rls,
-- ostrzeżenie o widokach: ta sama zasada). Po tej migracji klient dostaje JEDNO wywołanie
-- `biegus_most_odbierz()`, które liczy, przesuwa i oddaje logi do darów/pieczęci; sam
-- nic w znaczniku nie zmienia.
--
-- CO ZOSTAJE BEZ ZMIAN: `zapis`/`zapis_ts` (chmura gry) nadal z UPDATE dla authenticated —
-- saldo piór żyje w tym JSON-ie. DECYZJA FILIPA 7.10.2026 (opcja 1 z trzech): saldo ZOSTAJE
-- w JSON-ie, bez kolumny i bez ledgera. Powód: pióra kupują skórki w grze lokalnej, ranking
-- (`biegus_ranking`) czyta wyłącznie laczneKm/gwiazdki/ukonczone — edytowalne saldo nie wpływa
-- na nic, co widzą inni. Ta migracja domyka tylko znacznik (ŹRÓDŁO piór), nie ich stan.
--
-- SEMANTYKA 1:1 z dotychczasowym klientem (biegus.html MOST.odbierz):
--   · brak wiersza → wstaw ze znacznikiem now() − 7 dni („tydzień wstecz na dzień dobry");
--   · logi = training_logs zawodnika z logged_at > ostatni_odbior, bez '__badge__%';
--   · piora = floor(km × 5); gdy piora < 1 → znacznik NIE rusza (jak dziś `if(piora<1)return`),
--     logi i tak wracają, bo klient potrzebuje ich do darów (dziś też je czytał);
--   · gdy piora ≥ 1 → znacznik = greatest(stary, now()) — tylko do przodu, nigdy w przyszłość;
--   · zwraca jsonb {piora, km, logi:[{distance_km,training_type,logged_at}]}.
--   ⚠️ Jedna transakcja: policzenie i przesunięcie w tym samym wywołaniu — dwa równoległe
--     wywołania (dwie karty) nie wypłacą dwa razy, bo UPDATE blokuje wiersz; drugi liczy
--     po przesunięciu i dostaje 0.
--
-- GRANTY (migawka rls/biegus_most.txt 7.10 00:07: authenticated ma UPDATE i INSERT TABELOWO,
-- kolumnowych brak): zdejmujemy insert i update NA POZIOMIE TABELI, a potem nadajemy UPDATE
-- kolumnowo tylko na zapis, zapis_ts (chmura gry). select zostaje (gra czyta znacznik).
--
-- ⚠️ BŁĄD PIERWSZEJ WERSJI (wykryty na prod 7.10 przez Filipa, LEKCJE #23): stało tu
-- `revoke update (ostatni_odbior) … from authenticated`. Kolumnowy REVOKE zdejmuje TYLKO
-- kolumnowy grant — grant TABELOWY zostaje w całości, więc po migracji ostatni_odbior
-- i athlete_id NADAL miały UPDATE dla authenticated (information_schema.column_privileges
-- pokazuje kolumny z OBU źródeł). Kontrola po migracji musi patrzeć na WYNIK w
-- column_privileges, nie na treść revoke. Na prod poprawione ręcznie 7.10 (revoke tabelowy
-- + grant kolumnowy), ten plik opisuje stan, który tam JEST.
--
-- IDEMPOTENTNA. WYCOFANIE: 20261007_WYCOFANIE_biegus_most_odbior_przez_rpc.sql

begin;

create or replace function public.biegus_most_odbierz()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_aid uuid;
  v_od  timestamptz;
  v_km  numeric := 0;
  v_piora int := 0;
  v_logi jsonb := '[]'::jsonb;
begin
  select a.id into v_aid from public.athletes a where a.user_id = auth.uid() limit 1;
  if v_aid is null then
    raise exception 'brak wiersza athletes dla zalogowanego usera' using errcode = '42501';
  end if;

  -- wiersz znacznika: wstaw przy pierwszym odbiorze (tydzień wstecz), potem zablokuj do odczytu-zapisu
  insert into public.biegus_most (athlete_id, ostatni_odbior)
  values (v_aid, now() - interval '7 days')
  on conflict (athlete_id) do nothing;

  select m.ostatni_odbior into v_od
  from public.biegus_most m where m.athlete_id = v_aid
  for update;

  select coalesce(sum(coalesce(l.distance_km, 0)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'distance_km', l.distance_km,
           'training_type', l.training_type,
           'logged_at', l.logged_at) order by l.logged_at), '[]'::jsonb)
    into v_km, v_logi
  from public.training_logs l
  where l.athlete_id = v_aid
    and l.logged_at > v_od
    and (l.training_type is null or l.training_type not like '\_\_badge\_\_%');

  v_piora := floor(v_km * 5);

  if v_piora >= 1 then
    update public.biegus_most
       set ostatni_odbior = greatest(ostatni_odbior, now())
     where athlete_id = v_aid;
  end if;

  return jsonb_build_object('piora', v_piora, 'km', v_km, 'logi', v_logi, 'od', v_od);
end;
$fn$;

comment on function public.biegus_most_odbierz() is
  'MOST gry Bieguś: liczy pióra (5/km) z training_logs po biegus_most.ostatni_odbior i przesuwa '
  'znacznik TYLKO do przodu (greatest(stary, now())), w jednej transakcji z blokadą wiersza. '
  'Jedyna droga zmiany ostatni_odbior od 07.10.2026 — kolumna nie ma już UPDATE dla authenticated. '
  'Zwraca {piora, km, logi, od}. Przy piora < 1 znacznik nie rusza (jak dawny klient).';

revoke all on function public.biegus_most_odbierz() from public;
revoke all on function public.biegus_most_odbierz() from anon;
grant execute on function public.biegus_most_odbierz() to authenticated;

-- znacznik tylko przez RPC: klient traci INSERT i cały TABELOWY UPDATE; SELECT zostaje,
-- UPDATE wraca wyłącznie kolumnowo na zapis, zapis_ts
revoke insert on public.biegus_most from authenticated;
revoke update on public.biegus_most from authenticated;
grant update (zapis, zapis_ts) on public.biegus_most to authenticated;

notify pgrst, 'reload schema';

commit;

-- KONTROLA PO WYKONANIU (SQL Editor):
--   select column_name, privilege_type from information_schema.column_privileges
--    where table_name = 'biegus_most' and grantee = 'authenticated' order by 1,2;
--   -- oczekiwane: athlete_id SELECT; ostatni_odbior SELECT; zapis SELECT, UPDATE; zapis_ts SELECT, UPDATE
--   -- NIE MA: ostatni_odbior UPDATE, athlete_id UPDATE, żadnego INSERT
--   -- (column_privileges pokazuje kolumny Z OBU źródeł: tabelowego i kolumnowego — dlatego to
--   --  ta kontrola, a nie treść revoke, mówi czy dziura jest zamknięta; LEKCJE #23)
--   select grantee, privilege_type from information_schema.table_privileges
--    where table_name = 'biegus_most' and grantee = 'authenticated' order by 2;
--   -- oczekiwane: BEZ INSERT i BEZ UPDATE (SELECT, DELETE, REFERENCES, TRIGGER, TRUNCATE zastane)
--   select proname, prosecdef from pg_proc where proname = 'biegus_most_odbierz';   -- prosecdef = true
