-- Współrzędne miejsca treningu obok nazwy miasta.
--
-- DLACZEGO: dziś `athletes.city` to WOLNY TEKST, geokodowany przy KAŻDYM
-- zapytaniu o pogodę. Skutki zmierzone 22.08.2026 na 22 wypełnionych polach:
--   · ta sama miejscowość zapisana na trzy sposoby — „Środa Wielkopolska",
--     „środa wielkopolska", „Środa Wlkp." — to trzy różne klucze cache
--     w `get-weather` i trzy zapytania do Open-Meteo zamiast jednego
--   · „Kostrzyn" jest NIEJEDNOZNACZNY: geocoding oddaje Kostrzyn wielkopolski
--     ORAZ Kostrzyń mazowiecki, a my bierzemy pierwszy z brzegu
--   · literówka daje ciszę (`city_not_found`), nie błąd widoczny dla człowieka
--
-- ⚠️ NAZWA ZOSTAJE, i to nie jest nadmiarowość. `city` jest ETYKIETĄ pokazywaną
--    człowiekowi („Pogoda · Środa Wielkopolska") i to ona ma być czytelna;
--    lat/lon są tym, czym liczymy. Rozdzielenie etykiety od klucza jest tu
--    celem, nie efektem ubocznym.
--
-- ⚠️ BEZ BACKFILLU. Nie geokoduję istniejących 22 wierszy migracją, bo przy
--    „Kostrzyn" musiałbym ZGADNĄĆ, który z dwóch — a zgadywanie zapisane do bazy
--    wygląda potem na pomiar. Stare wiersze zostają z samą nazwą i działają jak
--    dotąd (geokodowanie w locie); współrzędne dostaną przy pierwszej edycji.
--
-- ⚠️ NULLABLE ŚWIADOMIE: brak współrzędnych ma znaczyć „nie wiadomo", nie 0,0
--    (punkt na Atlantyku u wybrzeży Afryki). Kod ma sprawdzać `is not null`.

alter table public.athletes
  add column if not exists lat numeric(9,6),
  add column if not exists lon numeric(9,6);

comment on column public.athletes.lat is
  'Szerokość geograficzna miejsca treningu, z geokodowania Open-Meteo przy wyborze '
  'miasta. NULL = nie wiadomo (stary wiersz sprzed 22.08.2026 albo nieustawione). '
  'NIE wnioskować lokalizacji z IP — aplikacja nie ma geolokalizacji i mieć nie ma.';
comment on column public.athletes.lon is
  'Długość geograficzna — patrz komentarz przy `lat`.';

-- ⚠️ GRANTY PO ADD COLUMN — SPRAWDZONE, I PUŁAPKA SIĘ POTWIERDZIŁA.
--    `athletes` UŻYWA grantów KOLUMNOWYCH: `authenticated` ma UPDATE na 61
--    kolumnach, ale SELECT tylko na 53. Nowe kolumny dostały UPDATE i NIE
--    dostały SELECT — czyli klient mógłby je ZAPISAĆ i NIGDY nie odczytać,
--    po cichu. Karta pogody zapisywałaby współrzędne i dalej ich nie widziała.
--    Zmierzone 22.08.2026 zaraz po ALTER TABLE, przed dodaniem GRANT-u niżej.
--
--    Bez SELECT zostają świadomie: strava_access_token, strava_refresh_token,
--    strava_token_expires_at (sekrety), tdee, profile_data, strongest_pb_dist.
--    lat/lon do nich NIE należą — są jawne i potrzebne klientowi.

grant select (lat, lon) on public.athletes to authenticated;

-- ══ PLAN WYCOFANIA ═════════════════════════════════════════════════════════
-- ⚠️ Bramka `bramka-commit` ZABLOKOWAŁA ten commit na linii GRANT — słusznie:
--    żaden workflow nie dotyka bazy, więc rollback KODU nie cofnie ani migracji,
--    ani uprawnień. Commit przeszedł świadomie, z tym planem:
--
--    Cofnięcie uprawnienia (bezpieczne, natychmiastowe):
--        revoke select (lat, lon) on public.athletes from authenticated;
--    Skutek: klient przestaje widzieć współrzędne; karta pogody wraca do
--    geokodowania po nazwie, czyli do zachowania sprzed tej zmiany. Nic nie ginie.
--
--    Cofnięcie kolumn (tylko gdyby były naprawdę niechciane):
--        alter table public.athletes drop column if exists lat, drop column if exists lon;
--    ⚠️ To KASUJE zapisane współrzędne. Przed wykonaniem zrzuć je:
--        select id, city, lat, lon from athletes where lat is not null;
--
--    Kolumny są NULLABLE i nikt ich nie wymaga, więc samo ich istnienie niczego
--    nie psuje — wycofywać trzeba tylko wtedy, gdy zmienimy zdanie co do modelu
--    danych, nie „na wszelki wypadek".
