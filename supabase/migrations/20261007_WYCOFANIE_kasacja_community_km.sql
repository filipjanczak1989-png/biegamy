-- WYCOFANIE 20261007_kasacja_community_km.sql — odtwarza funkcję 1:1 z migawki prod 7.10
-- (supabase/schema/funkcje/community_km.sql, suma b8dbf9dd18ca3f54 w SUMY.txt sprzed kasacji).
--
-- ⚠️ EXECUTE dla anon NIE JEST odtwarzany. Na prod funkcja miała anon=X, bo landing (wylogowany
--    człowiek z Facebooka) pokazywał licznik; front po fazie 1 tego nie robi. Grant dla anon to
--    decyzja o odsłonięciu agregatu niezalogowanym, nie rollback (bramka-commit: GRANT dla anon
--    = blokada twarda). Jeśli licznik kiedyś wróci na landing — osobna migracja z własnym zwiadem.
-- ⚠️ Default privileges: `create function` w public nadaje anon/authenticated/service_role EXECUTE
--    JAWNIE (LEKCJE #23) — stąd revoke z nazwy po definicji.

begin;

CREATE OR REPLACE FUNCTION public.community_km()
 RETURNS TABLE(km numeric, wklad numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_km numeric; v_wklad numeric;
begin
  -- SUMA WSPOLNA — liczona za kazdym razem, cap 100 km/doba warszawska.
  -- !! Cap dziala WYLACZNIE tutaj: training_logs, statystyki, odznaki
  --    i kilometry w profilu pozostaja nietkniete.
  -- !! Niezaleznie od `source`, wiec obejmuje takze 'intervals', ktore jest
  --    zwolnione z triggera check_log_cooldown.
  select coalesce(sum(least(dzien.km, 100)), 0) into v_km
    from (select l.athlete_id,
                 (l.logged_at at time zone 'Europe/Warsaw')::date as d,
                 sum(l.distance_km) as km
            from training_logs l
           where l.distance_km is not null
             and (l.logged_at at time zone 'Europe/Warsaw')::date >= '2026-08-15'
             and (l.logged_at at time zone 'Europe/Warsaw')::date <= '2026-09-20'
             and (l.logged_at at time zone 'Europe/Warsaw')::date
                 <= (now() at time zone 'Europe/Warsaw')::date
             and lower(trim(l.training_type)) in
               ('spokojny','bieg spokojny','wybieganie','długi','tempo',
                'progresja','interwały','start','wyścig','regeneracja')
           group by 1, 2) dzien;

  -- WKLAD WLASNY — ten sam cap, ta sama strefa, ta sama swiezosc co suma.
  -- !! WYLACZNIE po auth.uid(): funkcja jest wywolywalna przez anon, wiec nie
  --    moze przyjmowac athlete_id jako parametru — inaczej kazdy pytalby
  --    o cudzy wklad. Dla anon auth.uid() jest NULL -> wklad = 0.
  select coalesce(sum(least(dzien.km, 100)), 0) into v_wklad
    from (select (l.logged_at at time zone 'Europe/Warsaw')::date as d,
                 sum(l.distance_km) as km
            from training_logs l
            join athletes a on a.id = l.athlete_id
           where a.user_id = auth.uid()
             and l.distance_km is not null
             and (l.logged_at at time zone 'Europe/Warsaw')::date >= '2026-08-15'
             and (l.logged_at at time zone 'Europe/Warsaw')::date <= '2026-09-20'
             and (l.logged_at at time zone 'Europe/Warsaw')::date
                 <= (now() at time zone 'Europe/Warsaw')::date
             and lower(trim(l.training_type)) in
               ('spokojny','bieg spokojny','wybieganie','długi','tempo',
                'progresja','interwały','start','wyścig','regeneracja')
           group by 1) dzien;

  return query select v_km, v_wklad;
end $function$;

revoke all on function public.community_km() from public;
revoke all on function public.community_km() from anon;
grant execute on function public.community_km() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- KONTROLA: select proacl from pg_proc where proname = 'community_km';  -- bez anon=X
