# KALENDARZ — trzy rzeczy (komenda Filipa 3.11 02:31), wdrażane etapami z bliznami

## Etap 1 — karta imprezy z maszyny = jak nasza (3.11, blizna-119)

- Tap w kartę/zdjęcie imprezy z kalendarza maszyny → **ten sam arkusz** `#race-modal` co dla naszych: data (także „listopad 2026” przy
  dokładności do miesiąca), miasto · województwo, dystanse, link „Strona imprezy / zapisy” (tylko https), „Zapisanych: 0 os.” (przed zapisem
  to jeszcze nie nasz start), okładka z `imprezy_okladki` po kluczu bez roku albo zaślepka wg typu. W przyszłości: link do `wyniki.html#/impreza`.
- **„Wezmę udział”** (zawodnik): RPC `impreza_do_races` → wiersz w `races` (status `approved` — impreza zweryfikowana przez maszynę,
  `impreza_klucz`, link https, **okładka przejęta** z `imprezy_okladki`, więc `race-image` nie generuje drugiej) → `loadRaces` → zwykły zapis
  `doSignup` (race_signups + cel startowy, ten sam kod co dla naszych) → arkusz naszego startu („Zapisany”). Karta „przechodzi w naszą”
  przez `BM_KALENDARZ.scal` (nasza wygrywa). **Trener**: „Dodaj do naszych startów” — RPC bez zapisu.
- **Bez duplikatów** (w RPC, nie w kliencie): ten sam `impreza_klucz` ALBO ta sama nazwa (`klucz_nazwy_imprezy` ≡ `BM_KALENDARZ.kluczNazwy`,
  asercja w migracji na 5 przykładach z blizny-108) + data ±1 + miasto zgodne (dzielnica = to samo miasto). Drugie kliknięcie = ten sam wiersz
  (`istniala: true`), uzupełnia brakujący klucz/link/okładkę. Dokładność „miesiąc” = przycisk „Termin niepotwierdzony” (bez zapisu).
- Migracja `20261105_impreza_do_races.sql` (**do wykonania przez Filipa**): `races.impreza_klucz` (CHECK), `klucz_nazwy_imprezy(text)`,
  `impreza_do_races(...)` SECURITY DEFINER (zalogowany z profilem albo trener; walidacje: nazwa 3–200, data od wczoraj do +2 lata, miasto ≤ 80,
  dystans 0,5–400, klucz wg wzorca, link tylko https, okładka tylko z `race-covers`), anon nic. Test po skutku `tools/impreza-do-races-test.sh`
  (14 asercji: anon/bez profilu 42501, approved + okładka, dedup po kluczu i po nazwie+data±1+dzielnicy, 3 dni / inne miasto = inny bieg,
  zapis na bieg po RPC → trigger licznika, trener). WYCOFANIE zostawia dodane wiersze (to normalne starty).
- Przy okazji: `zNaszego` w `js/kalendarz-lista.mjs` czytał `r.organizer_url` (martwe pole; kolumna to `url_organizer`) — naprawione, więc
  nasze starty mają teraz link na karcie scalonej.
- Podglądy (atrapy backendu, po migracji na żywo zachowanie identyczne): `Downloads\biegamy-podglady\kalendarz-e1-arkusz-imprezy.png`,
  `kalendarz-e1-po-zapisie.png`.

## Etap 2 — okładki z automatu (EF `okladki-imprez` + pg_cron co noc 30 okładek) — czeka na „konto F6 gotowe”

Konto serwisowe F6 (zatwierdzone: tylko serwer): sekrety `F6_KONTO_EMAIL`, `F6_KONTO_HASLO`. EF loguje się kluczem publicznym
(`signInWithPassword`), bierze JWT, woła `upcoming_races` (najbliższe terminy najpierw), dla imprez bez okładki generuje Gemini (prompt
wyłącznie z danych serwera: typ/miejsce/pora roku), zapis do `imprezy_okladki`, raport kosztu w `okladki_log`. Sekret `x-push-secret`
jak `akcja-push`, `verify_jwt = false`.

## Etap 3 — „Zmień zdjęcie” dla trenera przy KAŻDEJ karcie (nasze i z maszyny)

Nowa wersja Gemini (limit dzienny z `okladki_log`) albo własne zdjęcie (upload przez EF — bucket `race-covers` nie ma polityk zapisu
z przeglądarki; walidacja typu/rozmiaru). Dla kart z maszyny zapis do `imprezy_okladki` (nadpisuje automat), dla naszych `races.cover_url`.
