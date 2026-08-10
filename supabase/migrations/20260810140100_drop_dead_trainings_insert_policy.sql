-- Zdjecie martwej polityki INSERT na public.trainings
--
-- "Athletes can insert own trainings" ma WITH CHECK (auth.uid() = athlete_id),
-- czyli model tozsamosci "athlete_id JEST uid-em". Reszta tabeli uzywa modelu
-- mapowanego przez athletes.user_id (trainings_athlete_insert).
--
-- Polityka jest martwa STRUKTURALNIE, nie tylko empirycznie:
--   trainings.athlete_id ma FK -> athletes(id) ON DELETE CASCADE
--   przeciecie athletes.id ∩ auth.users.id = 0 wierszy
--   wierszy w modelu auth.uid(): 0 ; w modelu mapowanym: 2082 z 2082
-- Wiersz spelniajacy ten WITH CHECK musialby zlamac FK.
--
-- Polityki permisywne lacza sie przez OR, wiec DROP niczego nie odbiera:
-- zapis zawodnika idzie przez trainings_athlete_insert.
--
-- BRAMKA: po DROP-ie zalogowany zawodnik nadal dodaje trening.

drop policy if exists "Athletes can insert own trainings" on public.trainings;
