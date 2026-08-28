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
  --
  -- !! ZALOZENIE: 1 user_id = 1 wiersz w athletes. Zmierzone 14.08.2026:
  --    48 wierszy, 48 nie-NULL, 48 unikalnych, 0 duplikatow, 0 NULL-i.
  --    UNIQUE na user_id wyklucza duplikaty WSROD WARTOSCI NIE-NULL; wielu
  --    NULL-i by nie zablokowal, wiec wniosek opiera sie na STANIE DANYCH,
  --    nie na samej definicji indeksu. Kont bez user_id dzis nie ma, bo
  --    "Dodaj zawodnika" w trener.html nigdy nie zadzialal (brak polityki
  --    INSERT dla trenera w RLS).
  --    PRZY POJAWIENIU SIE KONT BEZ user_id: v_km je policzy (grupuje po
  --    athlete_id), v_wklad nie (idzie przez user_id) — co jest spojne, bo
  --    taki czlowiek nie ma konta, zeby sie zalogowac i zobaczyc pasek.
  -- !! GORNA GRANICA "DO DZIS" MUSI BYC TU TAKZE. Gdyby stala tylko w v_km,
  --    czlowiek widzialby wlasny pasek wyzszy niz wspolny — a wspolny zawiera
  --    jego wklad. Rozjazd paskow byl juz raz powodem wyrzucenia cache.
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
end $function$
