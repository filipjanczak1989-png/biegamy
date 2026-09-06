-- Anon traci granty na szesciu relacjach, ktore nikt mu nie otworzyl.
--
-- CO TO ZA SZESC: `tools/polityki-bazy.js` (regula z 6.09.2026) wypisuje je
-- jako „grant jest, ale zadna polityka go nie dosiega". Anon nie wchodzil tam
-- nie dlatego, ze mu zabroniono, tylko dlatego, ze nikt mu jeszcze nie otworzyl
-- polityki. To jest ZALADOWANA BRON, nie cisza: jedna polityka z rola `public`
-- dodana kiedykolwiek pozniej otwiera je bez niczyjej decyzji. `injuries` byla
-- siodma i poszla osobno 6.09, bo dotyczyla danych o zdrowiu.
--
-- ⚠️ SPRAWDZONE PRZED COFNIECIEM, ta sama kontrola co 30.08 i przy injuries:
--    `authenticated` ma na KAZDEJ z szesciu WLASNY, pelny grant i nie dziedziczy
--    niczego po `anon`. Zmierzone, nie zalozone. Cofniecie nie dotyka aplikacji.
--
-- ⚠️ REVOKE, NIE GRANT — kierunek jest bezpieczny. Bramka-commit od 6.09.2026
--    traktuje go jako OSTRZEZENIE, nie blokade, wlasnie po to, zeby praca
--    zamykajaca dostep miala jak wejsc na zielono (LEKCJE #19).
--
-- STAN RELACJI W CHWILI COFNIECIA (wierszy):
--    radio_tracks 99 · radio_playlist_tracks 24 · recipes 15
--    radio_playlists 4 · community_stats 0 · recipe_favorites 0

revoke all on public.recipes               from anon;
revoke all on public.recipe_favorites      from anon;
revoke all on public.radio_playlists       from anon;
revoke all on public.radio_playlist_tracks from anon;
revoke all on public.radio_tracks          from anon;

-- ⚠️ community_stats — COFAMY GRANT, ALE TA TABELA JEST DO SKASOWANIA.
--    Zmierzone 6.09.2026: 0 wierszy, 0 funkcji, 0 widokow, 0 kluczy obcych,
--    0 triggerow, 0 POLITYK i 0 wywolan z aplikacji. RLS wlaczone przy zerze
--    polityk znaczy, ze i tak nikt jej nie dotknie poza service_role — wiec
--    grant dla anona byl tam podwojnie martwy.
--    Zaleglosc z 30.08 dala jej termin: „jesli do 30.09.2026 nic jej nie uzyje,
--    kasujemy". Warunek jest MIERZALNIE spelniony od 16 dni przed tamtym
--    pomiarem i nadal, ale termin jest ZOBOWIAZANIEM i nie wyprzedzam go sam.
--    Cofniecie grantu zdejmuje dzisiejsza ekspozycje i nie koliduje z kasacja —
--    DROP TABLE zabierze i tabele, i grant.
revoke all on public.community_stats       from anon;

-- ══ SAMOKONTROLA — WYKONANA 6.09.2026 ═════════════════════════════════════
--   anon        -> select z radio_tracks:
--                  ERROR 42501 "permission denied for table radio_tracks"
--                  ⚠️ TWARDA ODMOWA NA GRANCIE, nie pusty wynik.
--   zalogowany  -> radio_tracks 99 utworow, recipes 15 przepisow — bez zmian
--
--   tools/polityki-bazy.js PO tej migracji i po injuries:
--       relacji z grantem dla anon: 11 -> 4
--       „grant jest, ale zadna polityka go nie dosiega": 7 -> 0
--
-- ⚠️ TO JEST WLASCIWY STAN KONCOWY, nie tylko mniejsza liczba: po tej migracji
--    KAZDY grant dla anona jest grantem, ktorego anon FAKTYCZNIE uzywa
--    (4 z 4). Znikla roznica miedzy „ma uprawnienie" a „moze go uzyc" — czyli
--    znikla cala kategoria, w ktorej mieszkala ta usterka. Zostale cztery sa
--    zamierzone: trzy widoki publiczne + anonimowa telemetria gry.
