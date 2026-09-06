-- WYCOFANIE 20260906_zawezenie_polityk_trenera.sql
--
-- ⚠️ CO WRACA: trener znowu będzie mógł KASOWAĆ logi swoich zawodników (3191
--    wierszy) i znowu KAŻDY trener zobaczy WSZYSTKIE zapisy na zawody.
--    Trzy polityki `nutrition_meals` wrócą jako MARTWE — złączenie po `a.id`
--    nie może być prawdziwe, bo kolumna trzyma `user_id`. Odtwarzamy je
--    w postaci sprzed migracji, nie „naprawionej": rollback ma przywracać stan,
--    nie wprowadzać nowy.

create policy "athletes_delete_own_logs" on public.training_logs
  for delete to public
  using ((athlete_id in (select athletes.id from athletes where athletes.user_id = auth.uid()))
      or (athlete_id in (select athletes.id from athletes where athletes.coach_id = auth.uid())));

create policy "athletes_update_own_logs" on public.training_logs
  for update to public
  using ((athlete_id in (select athletes.id from athletes where athletes.user_id = auth.uid()))
      or (athlete_id in (select athletes.id from athletes where athletes.coach_id = auth.uid())));

create policy "coach_inserts_athletes_meals" on public.nutrition_meals
  for insert to public
  with check (exists (select 1 from athletes a
                      where a.id = nutrition_meals.athlete_id and a.coach_id = auth.uid()));
create policy "coach_updates_athletes_meals" on public.nutrition_meals
  for update to public
  using (exists (select 1 from athletes a
                 where a.id = nutrition_meals.athlete_id and a.coach_id = auth.uid()));
create policy "coach_deletes_athletes_meals" on public.nutrition_meals
  for delete to public
  using (exists (select 1 from athletes a
                 where a.id = nutrition_meals.athlete_id and a.coach_id = auth.uid()));

alter policy "signups_coach_read" on public.race_signups
  using (exists (select 1 from coaches where coaches.id = auth.uid()));
