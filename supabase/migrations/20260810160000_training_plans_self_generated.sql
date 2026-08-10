-- G2: training_plans pod zapis przez zawodnika BEZ trenera (generator planow)
--
-- Kontekst produktowy: generator jest wylacznie dla zawodnikow bez trenera.
-- Gdy zawodnik znajdzie trenera, plan ZOSTAJE — nie migrujemy go i nie kasujemy.
-- Trener po prostu zaczyna go widziec i moze edytowac normalna sciezka.
--
-- MOST TOZSAMOSCI (te same nazwy, rozne cele — patrz migracja 20260810140000):
--   athletes.coach_id       -> coaches(id)
--   training_plans.coach_id -> auth.users(id)
--   coaches.id              -> auth.users(id)
--
-- GRANTY: training_plans ma grant TABELOWY (relacl: authenticated=arwdDxtm/postgres),
-- wiec nowa kolumna dziedziczy uprawnienia i osobny GRANT nie jest potrzebny.
-- Sprawdzone, nie zalozone — na athletes granty sa kolumnowe i tam trzeba inaczej.

begin;

-- ── 1. coach_id nullable ──────────────────────────────────────────────────────
--
-- Plan wygenerowany samodzielnie nie ma trenera i nie ma czego wpisac w coach_id.
--
-- Przy okazji znika sprzecznosc, ktora siedziala tu od poczatku:
-- training_plans_coach_id_fkey ma ON DELETE SET NULL na kolumnie NOT NULL.
-- Usuniecie uzytkownika-trenera probowaloby wpisac NULL w kolumne NOT NULL
-- i wywalilo sie bledem zamiast wyczyscic pole. Po tej zmianie akcja FK
-- jest wreszcie wykonalna.

alter table public.training_plans alter column coach_id drop not null;

-- ── 2. Zrodlo planu ───────────────────────────────────────────────────────────
--
-- generated_by_model opisuje MODEL ('claude-sonnet-4-6'), nie sciezke wejscia.
-- Trener przejmujacy plan musi wiedziec, skad ten plan sie wzial.
-- DEFAULT 'coach_ai' backfilluje 284 istniejace wiersze i sprawia, ze EF
-- generate-training-plan dziala bez zmiany kodu.

alter table public.training_plans
  add column source text not null default 'coach_ai';

alter table public.training_plans
  add constraint training_plans_source_check check (source in ('coach_ai','self'));

comment on column public.training_plans.source is
  'coach_ai = wygenerowany przez trenera (EF generate-training-plan); self = wygenerowany samodzielnie przez zawodnika bez trenera';

-- ── 3. SELECT: zawodnik widzi wlasny draft, trener widzi plany swoich zawodnikow ─
--
-- Stara regula dla zawodnika przepuszczala tylko status='approved'. Wlasnego
-- swiezego planu by nie zobaczyl.
--
-- UWAGA: nie zdejmujemy warunku 'approved' calkiem, bo to zepsuloby sciezke
-- trenerska — draft trenera ma pozostac niewidoczny dla zawodnika az do
-- zatwierdzenia. Zamiast tego: 'approved' LUB source='self'.
--
-- Trzeci czlon to zmiana, ktora swiadomie odlozylem przy G0: trener widzi plany
-- SWOICH zawodnikow niezaleznie od coach_id planu. Bez tego plan wygenerowany
-- przed znalezieniem trenera bylby dla niego niewidoczny.

alter policy "training_plans_select_coach_or_athlete" on public.training_plans
  using (
    coach_id = auth.uid()
    or athlete_id in (select id from public.athletes where coach_id = auth.uid())
    or (
      athlete_id in (select id from public.athletes where user_id = auth.uid())
      and (status = 'approved' or source = 'self')
    )
  );

-- ── 4. UPDATE trenera: takze plany swoich zawodnikow ──────────────────────────
--
-- Konsekwencja punktu 3 — trener ma plan nie tylko widziec, ale i edytowac
-- normalna sciezka. WITH CHECK poszerzony tak samo, inaczej edycja planu
-- z coach_id IS NULL odbijalaby sie przy zapisie.

alter policy "training_plans_update_coach" on public.training_plans
  using (
    coach_id = auth.uid()
    or athlete_id in (select id from public.athletes where coach_id = auth.uid())
  )
  with check (
    coach_id = auth.uid()
    or athlete_id in (select id from public.athletes where coach_id = auth.uid())
  );

-- training_plans_delete_coach zostaje na coach_id = auth.uid().
-- Kasowanie cudzego planu to nie jest "edycja normalna sciezka", a produktowo
-- ustalilismy, ze plan zostaje.

-- ── 5. Polityki zawodnika na training_plans ───────────────────────────────────
--
-- INSERT wymaga TRZECH rzeczy naraz:
--   source = 'self'          — plan samodzielny, nie podszywanie sie pod AI trenera
--   coach_id IS NULL         — plan bez trenera
--   athlete_id nalezy do auth.uid() ORAZ ten zawodnik nie ma trenera
-- Ostatni czlon realizuje warunek produktowy "generator wylacznie dla zawodnikow
-- bez trenera" W BAZIE, nie tylko ukryciem wejscia w UI.

create policy "training_plans_insert_self" on public.training_plans
  for insert to authenticated
  with check (
    source = 'self'
    and coach_id is null
    and athlete_id in (
      select id from public.athletes
      where user_id = auth.uid() and coach_id is null
    )
  );

-- UPDATE wlasnego planu samodzielnego. USING nie wymaga, zeby zawodnik nadal
-- byl bez trenera — poprawianie istniejacego planu to nie generowanie nowego.
-- WITH CHECK wymaga coach_id IS NULL, wiec w momencie gdy trener przejmie plan
-- (wpisze sie w coach_id), zawodnik przestaje moc go zmieniac. To celowe.

create policy "training_plans_update_self" on public.training_plans
  for update to authenticated
  using (
    source = 'self'
    and athlete_id in (select id from public.athletes where user_id = auth.uid())
  )
  with check (
    source = 'self'
    and coach_id is null
    and athlete_id in (select id from public.athletes where user_id = auth.uid())
  );

-- DELETE — POZA Twoja lista czterech punktow, dopisane swiadomie.
-- Bez tego zawodnik nie moze wygenerowac planu drugi raz: stare plany zostaja
-- na zawsze, a nie ma zadnej sciezki, ktora by je sprzatala. Ograniczone do
-- wlasnych planow samodzielnych, ktorych trener jeszcze nie przejal.
-- Jesli nie chcesz — wytnij ten jeden blok, reszta migracji jest niezalezna.

create policy "training_plans_delete_self" on public.training_plans
  for delete to authenticated
  using (
    source = 'self'
    and coach_id is null
    and athlete_id in (select id from public.athletes where user_id = auth.uid())
  );

-- ── 6. training_plan_workouts — lustro powyzszych regul ───────────────────────
--
-- Sam wiersz w training_plans to nie plan. Bez polityki INSERT na treningach
-- generator nie zapisze niczego uzytecznego, wiec to nie jest poszerzenie
-- zakresu tylko jego domkniecie.

alter policy "training_plan_workouts_select_via_plan" on public.training_plan_workouts
  using (
    exists (
      select 1 from public.training_plans tp
      where tp.id = training_plan_workouts.plan_id
        and (
          tp.coach_id = auth.uid()
          or tp.athlete_id in (select id from public.athletes where coach_id = auth.uid())
          or (
            tp.athlete_id in (select id from public.athletes where user_id = auth.uid())
            and (tp.status = 'approved' or tp.source = 'self')
          )
        )
    )
  );

alter policy "training_plan_workouts_update_coach" on public.training_plan_workouts
  using (
    exists (
      select 1 from public.training_plans tp
      where tp.id = training_plan_workouts.plan_id
        and (
          tp.coach_id = auth.uid()
          or tp.athlete_id in (select id from public.athletes where coach_id = auth.uid())
        )
    )
  );

create policy "training_plan_workouts_insert_self" on public.training_plan_workouts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.training_plans tp
      where tp.id = training_plan_workouts.plan_id
        and tp.source = 'self'
        and tp.coach_id is null
        and tp.athlete_id in (select id from public.athletes where user_id = auth.uid())
    )
  );

create policy "training_plan_workouts_update_self" on public.training_plan_workouts
  for update to authenticated
  using (
    exists (
      select 1 from public.training_plans tp
      where tp.id = training_plan_workouts.plan_id
        and tp.source = 'self'
        and tp.coach_id is null
        and tp.athlete_id in (select id from public.athletes where user_id = auth.uid())
    )
  );

create policy "training_plan_workouts_delete_self" on public.training_plan_workouts
  for delete to authenticated
  using (
    exists (
      select 1 from public.training_plans tp
      where tp.id = training_plan_workouts.plan_id
        and tp.source = 'self'
        and tp.coach_id is null
        and tp.athlete_id in (select id from public.athletes where user_id = auth.uid())
    )
  );

commit;
