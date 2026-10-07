-- ⚠️ STATUS (dopisane 07.10.2026): WYKONANA NA PROD. Zmierzone 7.10 wieczór (information_schema.table_privileges przez CLI):
--    anon NIE MA grantu tabelowego na ŻADNEJ z 71 tabel public (w tym na tych siedmiu); pamięć 6.09: „anon: 11 relacji
--    z grantem → 4". Historia.

-- Cofniecie grantow dla roli `anon` na SIEDMIU tabelach schematu `public`.
--
-- KSZTALT PROBLEMU jest ten sam co przy `radio_comments_view`: uprawnienie
-- istnieje, dzis nic przez nie nie przechodzi, a jedyne, co je zatrzymuje,
-- jest brak pasujacej polityki. To nie jest ochrona — to zbieg okolicznosci,
-- ktory konczy sie przy pierwszej permisywnej polityce dolozonej obok.
--
-- ⚠️ NAJOSTRZEJSZY PRZYPADEK: `injuries` to DANE ZDROWOTNE (2 wiersze), a `anon`
-- ma tam DELETE, INSERT, SELECT i UPDATE. Dla porzadku: `authenticated` NIE MA
-- tam DELETE. Czyli niezalogowany mial na tabeli kontuzji uprawnienie, ktorego
-- nie ma zalogowany wlasciciel danych.
--
-- ── CO ZMIERZONO PRZED ZMIANA (30.08.2026) ──────────────────────────────────
--
-- 1. CZY GRANT JEST UZYWANY — nie, w zadnym z siedmiu przypadkow:
--      community_stats        ZERO wywolan w repo; 0 wierszy; nie czyta jej
--                             ZADNA funkcja ani widok w bazie. Tabela martwa.
--                             ⚠️ Licznik na landingu NIE idzie przez nia:
--                             `index.html:858` wola RPC `community_km()`, ktore
--                             jest SECURITY DEFINER i ma wlasny EXECUTE dla
--                             `anon` — grant na tabeli nie ma z tym zwiazku.
--      injuries               tylko `sb.js` (aktywna/zglos/zamknij) i
--                             `trener.html` — obie sciezki spod zalogowania.
--      radio_tracks           tylko `radio.html`, ktore bez sesji przenosi
--      radio_playlists        na `index.html` (`radioInit`). Z landingu nie ma
--      radio_playlist_tracks  wejscia do radia — zero wzmianek w `index.html`.
--      recipes                tylko `nutrition.html`, ktore bez sesji przenosi
--      recipe_favorites       na `index.html` (`nutrition.html:4633`).
--
--    ⚠️ Sprawdzone osobno, bo mialy najmocniejsze alibi: `recipes` (15 wierszy)
--    i `radio_tracks` (99) wygladaly na „tresc publiczna". NIE SA — zadne
--    z nich nie pojawia sie na landingu ani na zadnej stronie bez sesji.
--
-- 2. CO SIE STANIE PO COFNIECIU — nic sie nie urwie:
--      · `authenticated` ma na kazdej z siedmiu WLASNE granty, nie pozyczone;
--      · role sa rozlaczne: `authenticated` NIE JEST czlonkiem `anon`
--        (czlonkiem obu jest `authenticator`, ktory sie w nie przelacza),
--        wiec REVOKE od `anon` nie moze zabrac niczego zalogowanemu;
--      · zadna z siedmiu nie ma grantow KOLUMNOWYCH dla `anon`, wiec nie ma
--        czego przeoczyc poza poziomem tabeli.
--
-- 3. CZY KTORAS POLITYKA STALABY SIE CZYNNA — nie:
--      wszystkie 20 polityk na tych siedmiu tabelach jest `TO authenticated`.
--      ZERO polityk z rola `public` lub `anon`. Dwie z warunkiem trywialnie
--      prawdziwym (`radio_tracks_select`, `recipes_select_authenticated`) tez
--      sa `TO authenticated` — potwierdzone dla calej siodemki, nie tylko dla
--      tych dwoch.
--    Zweryfikowane na zywo podszyciem sie rola: `anon` widzi DZIS 0 wierszy
--    w `injuries`, `recipes`, `radio_tracks` i `community_stats` — czyli grant
--    jest skuteczny na poziomie uprawnien, a zatrzymuje go dopiero RLS.
--
-- ── ZAKRES ──────────────────────────────────────────────────────────────────
-- Cofamy WYLACZNIE granty dla `anon`. Nie ruszamy polityk, nie ruszamy
-- `authenticated`, nie kasujemy tabel.
-- ⚠️ `community_stats` jest kandydatem do usuniecia (0 wierszy, 0 uzyc, 0 polityk),
-- ale to osobna decyzja — tu tylko zdejmujemy jej uprawnienia dla `anon`.
--
-- Sprawdzenie po wykonaniu:
--   anon → kazda z siedmiu   ma dac `42501: permission denied`
--   (dzis daje 0 wierszy, czyli przechodzi grant, a blokuje RLS)
--   zalogowany → kontuzje, radio i przepisy maja dzialac bez zmian

begin;

-- DANE ZDROWOTNE. Priorytet tej migracji.
revoke delete, insert, references, select, trigger, truncate, update
  on public.injuries from anon;

-- Tabela martwa: 0 wierszy, 0 uzyc w repo i w bazie.
revoke delete, insert, references, select, trigger, truncate, update
  on public.community_stats from anon;

-- Radio: wylacznie spod zalogowania (radio.html przenosi bez sesji).
revoke delete, insert, references, select, trigger, truncate, update
  on public.radio_tracks from anon;
revoke delete, insert, references, select, trigger, truncate, update
  on public.radio_playlists from anon;
revoke delete, insert, references, select, trigger, truncate, update
  on public.radio_playlist_tracks from anon;

-- Przepisy: wylacznie z nutrition.html, ktore przenosi bez sesji.
revoke delete, insert, references, select, trigger, truncate, update
  on public.recipes from anon;
revoke delete, insert, references, select, trigger, truncate, update
  on public.recipe_favorites from anon;

commit;
