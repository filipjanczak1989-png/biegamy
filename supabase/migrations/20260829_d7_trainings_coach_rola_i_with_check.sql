-- ⚠️ STATUS (dopisane 07.10.2026): NIEWYKONANA NA PROD. ZASTĄPIONA przez 20261006_d7b_trainings_coach_relacja_i_coach_id_zawodnika.sql
--    (jej nagłówek: „Zastępuje NIEWYKONANĄ 20260829_d7_…"), która jest na prod (zmierzone 7.10 00:07, journal).
--    Plik zostaje w repo jako HISTORIA projektu D7 — nie wykonywać.

-- D7 — public.trainings: polityka trenera schodzi z roli `public` na
-- `authenticated`, a `ALL` bez `WITH CHECK` rozpada sie na cztery polecenia
-- z JAWNYM warunkiem zapisu.
--
-- ⚠️ TO NIE JEST ZAMKNIECIE DZIURY. Nie raportowac tego jako „anon mogl pisac" —
-- to nieprawda i psuje wiarygodnosc reszty listy. Zmierzone 29.08.2026 na
-- produkcji, przed zmiana:
--   · `anon` NIE MA ZADNYCH grantow na public.trainings. SELECT jako anon konczy
--     sie `42501: permission denied for table trainings` — odbija sie o GRANT,
--     zanim RLS w ogole wchodzi w gre.
--   · `service_role` i `postgres` maja BYPASSRLS, wiec polityki ich nie dotycza.
--   Jedyna rola, dla ktorej ta polityka kiedykolwiek sie wylicza, jest
--   `authenticated`. Zejscie z `public` na `authenticated` jest wiec DOWODLIWIE
--   bez wplywu na zachowanie, a nie „prawdopodobnie bezpieczne".
--
-- Co zmienia sie realnie: przy `FOR ALL` bez `WITH CHECK` Postgres uzywa do
-- sprawdzenia zapisu wyrazenia z `USING`. Ochrona wiec dziala — ale przez zbieg
-- regul, nie przez projekt, i nigdzie nie widac, ze zapis w ogole byl przemyslany.
-- Cztery polityki mowia to wprost.
--
-- ⚠️ ZMIANA NAZWY: `coach_manage_trainings` znika, wchodza `trainings_coach_*`,
-- zgodnie z konwencja siostrzanych `trainings_athlete_*` w tej samej tabeli.
-- Stara nazwa wystepuje w notatkach — wycofanie w pliku WYCOFANIE_ obok.
--
-- POMIAR (ten sam zestaw przed i po; podszycie sie rola + JWT, zapisy w ROLLBACK):
--   trener1 widzi 1825 | trener2 467 (453 wlasne + 14 jako zawodnik) | obcy 0
--   trener1 wpisuje SWOJ coach_id → OK | trener1 wpisuje CUDZY → ODRZUCONE

begin;

drop policy if exists "coach_manage_trainings" on public.trainings;

create policy "trainings_coach_select" on public.trainings
  for select to authenticated
  using (coach_id = auth.uid());

create policy "trainings_coach_insert" on public.trainings
  for insert to authenticated
  with check (coach_id = auth.uid());

create policy "trainings_coach_update" on public.trainings
  for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy "trainings_coach_delete" on public.trainings
  for delete to authenticated
  using (coach_id = auth.uid());

commit;
