-- BACKUP READ-ONLY przed fazą 2 kasacji gry Bieguś (SQL Editor, rola postgres) — 07.10.2026.
--
-- PO CO: WYCOFANIE fazy 2 (20261007_WYCOFANIE_kasacja_biegus_baza.sql) odtwarza TABELĘ, FUNKCJE
-- i GRANTY, ale nie dane — zapisy gry (biegus_most.zapis: imię, laczneKm, gwiazdki, ukonczone,
-- portfel piór) żyją tylko w tej tabeli. Zmierzone 7.10: 14 wierszy, 13 z zapisem, ostatni
-- zapis 28.09.2026. Bez tego pliku wycofanie daje pustą tabelę.
--
-- JAK: wykonać ZAPYTANIE 1, w SQL Editorze „Download" → JSON, zapisać poza repo (repo jest
-- publiczne; zapis zawiera imiona graczy). Zapytanie 2 daje ten sam zrzut jako JEDEN tekst
-- jsonb — do wklejenia w WYCOFANIE (json_populate_recordset). Zapytanie 3 = kontrola liczby.

-- 1. Wiersze do pobrania (oczekiwane 14)
select athlete_id, ostatni_odbior, zapis, zapis_ts
from public.biegus_most
order by athlete_id;

-- 2. Ten sam zrzut jako jeden jsonb (skopiować wartość komórki do pliku biegus_most-2026-10-07.json)
select jsonb_agg(to_jsonb(b) order by b.athlete_id) as biegus_most_backup
from public.biegus_most b;

-- 3. Kontrola biegus_most: liczby, które mają się zgadzać z plikiem
select count(*) as wierszy, count(zapis) as z_zapisem, max(zapis_ts) as ostatni_zapis,
       sum(coalesce((zapis->>'laczneKm')::numeric, 0)) as suma_km_w_grze
from public.biegus_most;

-- 4. game_events (telemetria gry; kasowana w tej samej migracji — decyzja 7.10): jeden jsonb do pliku
--    game_events-2026-10-07.json. Oczekiwane 220 wierszy (118 z athlete_id). Zawiera athlete_id/anon_id —
--    też POZA repo.
select jsonb_agg(to_jsonb(g) order by g.created_at) as game_events_backup
from public.game_events g;

select count(*) as wierszy, count(athlete_id) as z_athlete_id, min(created_at) as od, max(created_at) as do_
from public.game_events;
