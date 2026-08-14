-- ── LICZNIK BEZ PRZYSZLOSCI ─────────────────────────────────────────────────
-- Licznik nie pokazuje kilometrow, ktore sie jeszcze nie wydarzyly.
--
-- Okno wyzwania (15.08-20.09) to granice STALE. Dopoki gornej granicy nie
-- porownamy z DZISIAJ, kazdy log z data w przod wpada do sumy w chwili zapisu,
-- a nie w dniu, ktorego dotyczy. Pasek rosnie zanim ktokolwiek zawiazal buty.
--
-- CAP 100 KM/DOBA TEGO NIE LAPIE. Cap dziala per dzien kalendarzowy
-- (group by athlete_id, dzien), wiec kazdy przyszly dzien dostaje WLASNY
-- kubelek 100 km. Jedna osoba wpisujaca 100 km na kazdy dzien okna dolozylaby
-- 100 x 37 = 3700 km i ani jeden wiersz nie przekroczylby capa.
--
-- ZMIERZONE 14.08.2026, przed ta migracja:
--   1 log z data 15.08 (Natalia, 14,01 km, OCR z kalendarza)
--   = 100% owczesnej wartosci licznika wspolnego
-- Okno nie bylo jeszcze otwarte, wiec pasek pokazywal wylacznie bieg,
-- ktory mial sie dopiero odbyc.
--
-- !! GRANICA DOLNA ZOSTAJE STALA, GORNA JEST RUCHOMA. To celowa asymetria:
--    dol to poczatek wyzwania (fakt kalendarzowy), gora to "co juz sie stalo"
--    (fakt biezacy). Po 20.09 stala '2026-09-20' znowu bedzie ciasniejsza
--    niz now() i to ona zamknie okno — wiec obie sa potrzebne, zadna nie jest
--    nadmiarowa.
--
-- !! DZIEN WARSZAWSKI PO OBU STRONACH POROWNANIA. logged_at jest timestamptz,
--    a suma liczy sie w dobie warszawskiej — gdyby gorna granica poszla przez
--    now()::date (UTC), miedzy polnoca a 02:00 czasu polskiego dzisiejsze logi
--    wypadalyby z licznika.
--
-- !! TO NIE ZAMYKA ZAPISU. Formularz nadal przyjmuje date z przodu (trzy
--    sciezki bez guardu: zawodnik.html openModalForDate + przycisk na karcie
--    planu, kalendarz.html _logDate2). Ta migracja zamyka WYLACZNIE ekspozycje
--    w liczniku. Guard w formularzu i ewentualny CHECK na training_logs to
--    osobne kroki.

drop function if exists community_km();

create function community_km()
returns table (km numeric, wklad numeric)
language plpgsql security definer set search_path = public as $fn$
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
end $fn$;

revoke all on function community_km() from public;
grant execute on function community_km() to anon, authenticated;
