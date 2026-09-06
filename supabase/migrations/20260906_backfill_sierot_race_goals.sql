-- Jednorazowy backfill: 12 zapisów na zawody bez odpowiadającego celu.
--
-- SKĄD SIĘ WZIĘŁY: `doSignup()` w races.html robi DWA zapisy do DWÓCH tabel —
-- `race_signups` (upsert) i `athletes.race_goals` (update) — a PostgREST nie da
-- transakcji między tabelami z klienta. Do 6.09.2026 drugi zapis szedł BEZ
-- sprawdzania błędu (`addToGoals` nie patrzyła na `error` w ogóle), więc gdy
-- padał, zostawał zapis bez celu, a człowiek czytał „Zapisano! Cel dodany
-- do Twojego profilu ✓".
--
-- ZMIERZONE 6.09.2026: 12 ze 126 zapisów (9,5%), u 6 osób, z datami od
-- 29.04 do 30.08 — czyli TRWAJĄCY dryf, nie ślad po wdrożeniu funkcji.
-- Mechanizm domknięty w tym samym commicie (cofnięcie zapisu przy padzie celu
-- + tests/blizna-30-zapis-na-bieg-i-cel-razem.test.js). Ta migracja sprząta
-- to, co dryf zdążył zostawić.
--
-- ⚠️ BACKFILLUJEMY WSZYSTKIE 12, TAKŻE BIEGI, KTÓRE JUŻ SIĘ ODBYŁY (9 z 12).
--    Rozważane i odrzucone: „tylko przyszłe". Powód: `renderGoals` w profil.html
--    i tak filtruje cele po dacie (`g.date >= dziś`), więc przeszłe NIE POKAŻĄ
--    SIĘ nikomu — a niezałatane zostawiłyby złamany niezmiennik „każdy zapis ma
--    cel", który każdy przyszły audyt znajdzie ponownie i będzie musiał
--    rozstrzygać od zera.
--
-- ⚠️ `race_goals` TO `text` Z JSON-em, NIE `jsonb`. Dlatego rzutujemy w obie
--    strony i porównujemy po `race_id` wewnątrz tablicy — bez tego duplikat
--    wszedłby przy każdym ponownym uruchomieniu.
-- ⚠️ IDEMPOTENTNE: `where not exists (…)` na `race_id`, więc powtórzenie nic
--    nie zmienia. Sprawdzone przed wykonaniem na kopii zapytania SELECT-em.
--
-- ⚠️ NIE RUSZAMY `goal` ANI `target_date`. Trzymają „pierwszy cel" i są
--    ustawiane przez klienta przy dodawaniu celu; przepisanie ich tutaj
--    mogłoby podmienić komuś główny cel na bieg sprzed pięciu miesięcy.
--    Backfill dopełnia LISTĘ, nie zmienia wyboru.

with sieroty as (
  select s.athlete_id,
         jsonb_agg(jsonb_build_object('name', r.name, 'date', r.date::text,
                                      'race_id', r.id::text)) as dodac
  from race_signups s
  join races r    on r.id = s.race_id
  join athletes a on a.id = s.athlete_id
  where not exists (
    select 1 from jsonb_array_elements(coalesce(nullif(a.race_goals,'')::jsonb, '[]'::jsonb)) g
    where g->>'race_id' = r.id::text
  )
  group by s.athlete_id
)
update athletes a
   set race_goals = (
         coalesce(nullif(a.race_goals,'')::jsonb, '[]'::jsonb) || s.dodac
       )::text
  from sieroty s
 where a.id = s.athlete_id;

-- ══ KONTROLA PO MIGRACJI ═══════════════════════════════════════════════════
-- Oczekiwane: 0 w kolumnie `sierot`.
-- select count(*) as sierot
--   from race_signups s join athletes a on a.id = s.athlete_id
--  where not exists (
--    select 1 from jsonb_array_elements(coalesce(nullif(a.race_goals,'')::jsonb,'[]'::jsonb)) g
--    where g->>'race_id' = s.race_id::text);
--
-- Oczekiwane: każdy wiersz ma poprawny JSON (rzut nie rzuca błędu).
-- select count(*) from athletes where race_goals is not null
--   and jsonb_typeof(nullif(race_goals,'')::jsonb) = 'array';
