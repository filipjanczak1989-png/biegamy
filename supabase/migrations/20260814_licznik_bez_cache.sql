-- ── LICZNIK BEZ CACHE ───────────────────────────────────────────────────────
-- Cache dobowy USUNIETY. Powod nie jest estetyczny — zamrazal licznik na cala
-- dobe, a 15 sierpnia oznaczaloby to pasek na ZERZE przez caly dzien otwarcia
-- wyzwania: pierwsze wywolanie po polnocy policzyloby sume, gdy nikt jeszcze
-- nic nie wpisal, zapisaloby 0 i zwracalo je do 16.08. To samo 20 wrzesnia,
-- w dniu biegu Kasi, czyli przy najwiekszym ruchu.
--
-- Do tego pasek WLASNY liczyl sie na zywo, a WSPOLNY z cache — wiec jeden
-- drgal, a drugi nie. Dla czlowieka wyglada to jak zepsuta aplikacja, nie jak
-- optymalizacja.
--
-- POMIAR, ktory przesadzil (EXPLAIN ANALYZE, 2014 wierszy, okno 15.08-20.09):
--   na zimno    12,5 ms  (w tym 2,8 ms planowanie)
--   rozgrzane    1,73 / 1,69 / 1,65 ms
--   plan: Seq Scan -> Sort 25 kB -> GroupAggregate, Buffers: shared hit=72,
--         zero odczytow z dysku
--   skala: 2 014 wierszy dzis, ~95 logow/tydzien -> ~2 580 na koniec wrzesnia
--
-- Round-trip do Supabase to ~220 ms, wiec zapytanie stanowi 0,8% czasu
-- zadania. Przy ~900 wywolaniach na dobe daje to ~1,7 s pracy bazy LACZNIE.
-- Cache oszczedzal 1,7 ms i kosztowal cztery klasy bledow, wszystkie
-- zaobserwowane w praktyce:
--   1. klucz noszacy date okna — po zmianie okna cicho oddawal stara wartosc
--   2. uniewaznianie w dobie UTC przy sumie w dobie warszawskiej
--   3. testy "przechodzily" bez policzenia czegokolwiek, dopoki nie zaczelismy
--      czyscic cache WEWNATRZ transakcji
--   4. zamrozenie na 0 w dniu otwarcia (ta migracja)
--
-- Skutek uboczny, ktory jest zaleta: skasowanie zlego wpisu widac przy
-- NASTEPNYM wejsciu kogokolwiek, a nie po polnocy. Dzieki temu RPC coach-only
-- do wymuszania przeliczenia jest zbedne — nie ma czego czyscic.
--
-- !! TABELA community_stats ZOSTAJE, czyszczone sa tylko wiersze. Trzymala dwa
--    klucze: km_od_2026_08_15 (14,01) i km_od_2026_09_01 (0, osad po starym
--    oknie). Zaden inny kod w repo jej nie dotyka — sprawdzone grepem po calym
--    repozytorium. Tabela jest teraz nieuzywana i mozna ja usunac osobno,
--    swiadoma decyzja, a nie przy okazji.

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
  select coalesce(sum(least(dzien.km, 100)), 0) into v_wklad
    from (select (l.logged_at at time zone 'Europe/Warsaw')::date as d,
                 sum(l.distance_km) as km
            from training_logs l
            join athletes a on a.id = l.athlete_id
           where a.user_id = auth.uid()
             and l.distance_km is not null
             and (l.logged_at at time zone 'Europe/Warsaw')::date >= '2026-08-15'
             and (l.logged_at at time zone 'Europe/Warsaw')::date <= '2026-09-20'
             and lower(trim(l.training_type)) in
               ('spokojny','bieg spokojny','wybieganie','długi','tempo',
                'progresja','interwały','start','wyścig','regeneracja')
           group by 1) dzien;

  return query select v_km, v_wklad;
end $fn$;

revoke all on function community_km() from public;
grant execute on function community_km() to anon, authenticated;

delete from community_stats where klucz in ('km_od_2026_08_15', 'km_od_2026_09_01');
