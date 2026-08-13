-- ── CAP 100 km/DOBA NA WEJSCIU DO LICZNIKA WYZWANIA ─────────────────────────
-- Cap dziala WYLACZNIE tutaj. training_logs, statystyki, odznaki i kilometry
-- widoczne w profilu POZOSTAJA NIETKNIETE — czlowiek widzi swoje prawdziwe
-- wyniki wszedzie indziej. Ograniczony jest tylko WPLYW na wspolna pule.
--
-- !! DZIALA NIEZALEZNIE OD `source`, wiec obejmuje takze 'intervals', ktore
--    jest ZWOLNIONE z triggera check_log_cooldown (ten przepuszcza je bez
--    limitu czestotliwosci) i moze wstawic wiele logow jednym batchem.
--
-- !! DOBA WARSZAWSKA W TRZECH MIEJSCACH, spojnie:
--      1. grupowanie dobowe przy sumowaniu
--      2. granice okna (inkluzywne z obu stron: >= 15.08 i <= 20.09)
--      3. uniewaznianie cache
--    Punkt 3 jest latwy do przeoczenia: wczesniej cache wygasal wg doby UTC
--    (date_trunc('day', now())), a suma liczyla dobe warszawska. Efekt bylby
--    widoczny 20 wrzesnia — miedzy 00:00 a 02:00 czasu polskiego licznik
--    pokazywalby WCZORAJSZA wartosc mimo nowych logow, bo doba UTC jeszcze
--    by sie nie skonczyla. To okno na zywo w trakcie biegu Kasi.
--    Testy capu tego NIE ZLAPIA — kazdy czysci cache recznie.
--
-- !! ZALOZENIE: 1 user_id = 1 wiersz w athletes. Zmierzone 14.08.2026:
--    48 wierszy, 48 unikalnych user_id, 0 duplikatow — i WYMUSZONE przez dwa
--    unikalne indeksy (athletes_user_id_key, athletes_user_id_idx).
--    Dzieki temu v_km moze grupowac po athlete_id, a v_wklad po samej dacie,
--    i obie liczby sa zgodne (zweryfikowane: 175 = 175).
--    PRZY ZMIANIE TEGO ZALOZENIA (np. jeden czlowiek u dwoch trenerow) cap
--    wymaga rewizji: v_km dalby podwojny limit (200 km/dobe na osobe),
--    a v_wklad scalilby konta i pokazal INNA liczbe niz licznik.
--
-- Koszt capu na dzisiejszych danych: 2 dni w calej historii, 2 zawodnikow,
-- 16 km uciete. Identyczny w UTC i Europe/Warsaw. Rekord biegowy to 109,72 km,
-- wiec cap przekracza go raz i o 10%.
--
-- Testy (begin/rollback, cache czyszczony WEWNATRZ transakcji, baza 14,01):
--   2 zawodnikow x 150 km ta sama doba  -> 214,01  (+200) lapie brak athlete_id
--   1 zawodnik x 150 km w dobie X i Y   -> 214,01  (+200) lapie brak daty
--   1 zawodnik x 3 wpisy po 60 km       -> 114,01  (+100) cap na SUMIE doby
--   wpis 23:30 PL 20.09 (21:30 UTC)     ->  44,01  (+30)  doba polska
--   wpis 00:30 PL 21.09 (22:30 UTC)     ->  14,01  bez zmian, poza oknem
--   wpisy 14.08 i 21.09                 ->  14,01  bez zmian, oba poza oknem
--   v_wklad z podstawiona tozsamoscia   -> 175 = udzial tego zawodnika w v_km

drop function if exists community_km();

create function community_km()
returns table (km numeric, wklad numeric, obliczone_at timestamptz)
language plpgsql security definer set search_path = public as $fn$
declare v_km numeric; v_at timestamptz; v_wklad numeric;
begin
  select cs.wartosc, cs.obliczone_at into v_km, v_at
    from community_stats cs where cs.klucz = 'km_od_2026_08_15';

  if v_at is null
     or (v_at at time zone 'Europe/Warsaw')::date < (now() at time zone 'Europe/Warsaw')::date then
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

    insert into community_stats(klucz, wartosc, obliczone_at)
      values ('km_od_2026_08_15', v_km, now())
      on conflict (klucz) do update
        set wartosc = excluded.wartosc, obliczone_at = excluded.obliczone_at;
    v_at := now();
  end if;

  -- WKLAD WLASNY: ten sam cap i ta sama strefa, ale NA ZYWO (bez cache) —
  -- czlowiek zapisuje 12 km i musi je zobaczyc od razu. Przy wspolnej sumie
  -- rozjazd kilku km wobec 10 000 nie ma znaczenia, przy wlasnym MA.
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

  return query select v_km, v_wklad, v_at;
end $fn$;

revoke all on function community_km() from public;
grant execute on function community_km() to anon, authenticated;
