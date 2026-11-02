-- WYCOFANIE 20261102_akcja_start_7_11.sql — wraca do 8.11 (start i okno guzika), zdejmuje konta wyprawy. Licznik ZOSTAJE
-- w nowej wersji (wyprawa od naciśnięcia; bez kont wyprawy i tak zwraca null). Tylko przed startem akcji.
begin;
update public.akcje set start = date '2026-11-08',
       okno_startu_od = timestamp '2026-11-08 06:00:00' at time zone 'Europe/Warsaw',
       okno_startu_do = timestamp '2026-11-08 23:59:59' at time zone 'Europe/Warsaw', wyprawa_athlete_ids = null
 where slug = 'dla-fabianka' and wystartowala_at is null;
update public.akcje set start = date '2026-11-02', wyprawa_athlete_ids = null where slug = 'proba' and wystartowala_at is null;
commit;
