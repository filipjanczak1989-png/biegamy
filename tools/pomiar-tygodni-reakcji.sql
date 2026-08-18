-- Seria tygodni planowych: stosunek wykonania (przebiegnięte / zaplanowane).
-- Wsad do tools/pomiar-tygodni-reakcji.js. Tylko ODCZYT.
--
-- ⚠️ PLAN CZYTAMY Z `training_plan_workouts.target_distance_km`, NIE
--    z `trainings.distance_km` — tę drugą NADPISUJE zalogowanie treningu,
--    więc stosunek wychodziłby zawsze 1,00. Wskaźnik, który z definicji nie
--    może pokazać odchylenia, nie jest wskaźnikiem.
--
-- ⚠️ `having ... + 6 < current_date` ODCINA TYGODNIE NIEZAMKNIĘTE. Tydzień
--    w trakcie ma z natury mniej przebiegnięte niż zaplanowane; bez tego
--    warunku serie sięgały w PRZYSZŁOŚĆ (zaplanowane tygodnie ze stosunkiem 0)
--    i zaniżały wszystko.
--
-- ⚠️ Lista typów to kopia RUN_TYPES z sb.js. Nowy pill biegowy → dopisać też
--    tutaj, inaczej jego kilometry znikną z wykonania i pomiar zacznie
--    pokazywać niedowykonanie, którego nie ma.

with tyg as (
  select p.athlete_id,
         date_trunc('week', w.date)::date as tydz,
         sum(w.target_distance_km) as plan_km
    from public.training_plan_workouts w
    join public.training_plans p on p.id = w.plan_id
   where w.target_distance_km > 0
   group by 1, 2
  having date_trunc('week', w.date)::date + 6 < current_date
),
zrob as (
  select l.athlete_id,
         date_trunc('week', l.logged_at)::date as tydz,
         sum(l.distance_km) as km
    from public.training_logs l
   where lower(trim(l.training_type)) in
         ('spokojny','bieg spokojny','wybieganie','długi','tempo',
          'progresja','interwały','start','wyścig','regeneracja')
     and l.distance_km > 0
   group by 1, 2
)
select t.athlete_id::text as a,
       t.tydz::text       as w,
       round((coalesce(z.km, 0) / t.plan_km)::numeric, 4) as st
  from tyg t
  left join zrob z on z.athlete_id = t.athlete_id and z.tydz = t.tydz
 order by 1, 2;
