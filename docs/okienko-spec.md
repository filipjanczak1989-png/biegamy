# Okienko „Zapytaj" — spec

Stan na 1.11.2026. Pełny kontrakt (EF, narzędzia, router, strażniki, limity, koszty z logu po pierwszym dniu) dopisujemy
razem z kosztami z logu. Od 1.11.2026 13:33 pole „Zapytaj" widzi każdy zalogowany (podgląd zdjęty). Ten plik zaczyna od kolejki, żeby ustalenia z testów nie ginęły.

## Poprawki z testu Filipa 1.11 („jakie szanse na rekordy", konto testowe) — ZROBIONE

1. **Karta odznaki pokazywała slug** (`pierwszy_start`). `odznaki_moje` zwraca teraz `nazwa` z katalogu `BADGES`
   w `odznaki.html` (to samo źródło co ekran Odznaki); slug zostaje tylko w `id`. Kopia dla Deno:
   `supabase/functions/_shared/odznaki-nazwy.mjs`, pilnowana przez blizna-64 (równość z katalogiem + brak `_`
   w nazwach kart). Id spoza katalogu → „Odznaka", nigdy slug.
2. **Zdanie zastępcze zależne od narzędzi.** Gdy po strażniku nie zostało żadne zdanie, a są karty: jedno narzędzie →
   „Oto Twój plan." / „Oto Twoje treningi." / „Oto Twoje starty." / „Oto Twoje wyzwania." / „Oto Twoje odznaki.";
   kilka → „Oto, co znalazłem."; bez kart → „Nie mam tego w Twoich danych.".
3. **Powód w logu.** Odpowiedź ze zdaniem zastępczym ma `ok=false` i `powod_odrzucenia`: odrzucone zdania modelu
   („liczba X: zdanie") albo „model: brak zdań" / „model: brak JSON-u". Wpis z 1.11 04:43 („jakie szanse na rekordy",
   `ok=true`, powód pusty) to właśnie ten przypadek — dotąd niewidoczny.

## Kolejka: M2e — rekordy

**Narzędzie `moje_rekordy`** (read-only, filtr na wołającego jak pozostałe):
PB na 5 / 10 / 21,1 / 42,2 km.

⚠️ **Źródło danych — sprostowanie do polecenia „z logiki prs.html, z datą i biegiem":** `prs.html` nie ma logiki
rekordów — to ekran gratulacji z parametrami URL (`dist`, `pace`, `time`); silnik `window.PRS` w `sb.js` też jest tylko
nakładką-animacją. Rekordy, które widzi zawodnik, siedzą w `athletes.pb_5k`, `pb_10k`, `pb_half`, `pb_marathon`
+ `pb_*_year`. Baza zna **rok, nie datę**, i **nie zna nazwy biegu** (por. pamięć: 94% par PB niedatowalnych;
`race_results` nie istnieje). Do decyzji przed kodem:
- (a) narzędzie zwraca to, co jest: czas + rok, bez biegu — karta „5 km · 22:41 · 2025";
- (b) dobieramy datę i bieg z `training_logs` (bieg o dystansie ±2% z czasem równym PB) — tylko gdy jedno trafienie,
  inaczej pole puste („nie wiem ≠ nic"); wymaga pomiaru, ilu osobom to coś da.
Rekomendacja: (a) teraz, (b) dopiero po pomiarze.

Czas parsowany przez `window._parseTimeToSecs` (SSOT w `sb.js`) — w EF potrzebna kopia z testem równoważności
(wzorzec `_shared/wyzwania.mjs`).

**Router:** `rekord|pb|życiówk|zyciowk|najlepszy czas` → `moje_rekordy`.

**Karta rekordu:** typ `rekord` — dystans, czas, rok (data i bieg tylko gdy są); brak pola = brak elementu.
Strażnik cyfr bez zmian: czasy i lata z wyniku narzędzia są dozwolone.

**„Szanse na rekordy"** = `moje_rekordy` + `moje_starty` (najbliższy start), **bez prognoz czasu**. Prompt:
zakaz liczenia i podawania przewidywanego wyniku; strażnik i tak wytnie liczbę spoza wyników. Router:
`szans\w* .*rekord` → oba narzędzia, zdanie z szablonu, np. „Najbliższy start: X za N dni. Twój rekord na tym
dystansie: 1:45:10 (2024)." — rekord tylko gdy dystans startu pasuje do jednego z czterech.

Testy: blizna-64 (narzędzie: filtr na wołającego, brak pól spoza listy; router: 5 fraz; „szanse" bez liczby spoza
wyników), blizna-65 (karta rekordu bez `undefined`).

## M2b — tryb „osoba": trzy fronty (1.11.2026) — WDROŻONE w v7

Pytanie o człowieka (`osobaZPytania`: samo imię i nazwisko, „kim jest X", „X w sieci", „google X", „wyniki X",
„jak pobiegł X"; słowa typu „mój trener", „koleżanka" nie są imieniem) idzie do `osoba.mjs`, bez modelu z narzędziami.
Równolegle:
- **(a) profile w aplikacji** — tylko `athletes.is_public = true`, bez własnego, do 3, klient z JWT (RLS); karta
  „Zobacz profil" / „Dodaj do znajomych" / „Napisz" — akcje po tapnięciu istniejącymi funkcjami zawodnik.html
  (`openAthleteProfile`, `sendFriendFromSearch`, `openChatThread('peer')`), status znajomości z `friendships`;
- **(b) wyniki F6** (`api.biegamy.run`, token użytkownika w `Authorization`) — `search_runners` do 3, dla najlepszego
  `runner_results`: N startów, ostatni start, najlepszy czas na dystansie ostatniego startu, 5 ostatnich; „Otwórz wyniki"
  → races.html (wyszukiwarka, `WYNIKI_API_WLACZONE = true` dla wszystkich od 1.11.2026);
- **(c) sieć** tylko gdy osoba publiczna sportowo: ≥ 30 startów, start w Mistrzostwach Polski albo podium OPEN
  (1–3 w generalnej; podium w kategorii za szerokie — 9/12 startów jednej zawodniczki), albo pytanie wprost.
  Wtedy `zapytajSiec` ze źródłami, licznik jak tryb `siec` (20/dobę, `uzyteSiecDzis` liczy też `osoba` z
  `zapytania_sieci ≥ 1`). Inaczej nazwisko nie wychodzi do Google i braku sieci nie komunikujemy.

Odpowiedź: zdania z sieci (jeśli są, z etykietą i źródłami) → karta osoby → karta wyników; nic → (do M3-0)
„Nie znalazłem tej osoby w aplikacji ani w wynikach." — od M3-0 osoba bez trafień idzie dalej ścieżką ogólną (bez
sieci), a gdy i tam pusto: „Nie znalazłem tego w aplikacji, w wynikach ani w kalendarzu."; 429 z F6 → „Maszyna wyników jest teraz zajęta — spróbuj za
chwilę." (reszta zostaje). Pamięć F6 wspólna (dane publiczne): RPC + argumenty, 10 min, ≤ 500 wpisów, w izolacie.
Odpowiedź osobowa nie trafia do `okienko_siec_cache` ani do znalezisk; log `okienko_log` tryb `osoba`
(`ok=false` gdy F6 zawiodło, powód w `powod_odrzucenia`). Testy: blizna-67.

F6 z adresów funkcji Edge POTWIERDZONE: pierwszy wpis `osoba` 1.11 12:47:15 UTC, `ok=true`, 2 zapytania sieci.
Limit Caddy zmieniony 1.11 (decyzja B2): 300/min na IP + 60/min na nagłówek Authorization — wspólny adres EF ma zapas.
Odłożone: `biegi_nadchodzace` (upcoming_races) jako narzędzie modelu.

## M3a — `biegi_nadchodzace` (1.11.2026) — wdrożone w v9

Kalendarz imprez z maszyny wyników F6 (`upcoming_races`, token użytkownika, wspólna pamięć F6 10 min — `f6.mjs`,
wydzielony z `osoba.mjs`). Router (0 tokenów): słowo o biegu (`bieg`, `zawody`, `maraton`, `półmaraton`, `dycha`,
`piątka`, `impreza`, `pobiec`, `starty`) + miejsce po przyimku (w/we/na/pod/koło/obok/„w okolicach") albo miesiąc
(przyszły — miniony miesiąc = przyszły rok) albo dystans (5/10/21/42) albo „jakie biegi"/„gdzie pobiec". Wykluczone:
kto/wygrał/wynik/trasa/zapis/rekord/moje/mam/ile/jak — „Kto wygrał maraton w Berlinie?" to wynik, nie termin.
Narzędzie dostępne też dla modelu (deklaracja, walidacja: zakres ≤ 366 dni, dystans z listy, miejsce tylko litery).
Miasto filtruje EF po RDZENIU słowa bez polskich znaków (≥ 4 litery, bez 3 ostatnich: „Poznaniu" → „pozna",
„Środą" → „srod") względem początków słów nazwy i miasta — F6 `p_q` szuka podciągu i nie trafiłby w odmianę.
Gdy F6 odda pełne 300 wierszy (ucięte), EF pyta drugi raz z `p_q` = rdzeń. Domyślnie dziś … +90 dni.
Zdanie: „W listopadzie w Poznaniu maszyna wyników zna 4 biegi." (liczba ze zliczenia EF); pusto: „Maszyna wyników
nie ma biegów w tym zakresie."; 429 → „Maszyna wyników jest teraz zajęta — spróbuj za chwilę.". Karty `impreza`
(≤ 10): nazwa, data, miasto, dystanse, domena źródła jako TEKST — bez linków zewnętrznych; bez „Otwórz ›" do czasu
kalendarza startów w races.html (K4/K5). Testy: blizna-73 (do M3 v2 plik nazywał się blizna-72).

## M3 v2 / M3-0 — osoba ze słownikiem imion, bez ślepej uliczki (1.11.2026) — wdrożone w v10

Projekt: M3-okienko-wszystko-projekt-v2.md (Downloads, 14:10) — zastępuje v1; M3a z v1 (`biegi_nadchodzace`, router
`upcoming_races`) zostaje jako część M3a v2 („kiedy / gdzie / jakie biegi w X"), testy przemianowane na blizna-73.
Diagnoza „bieg ultrakotlina → nic" z v2 NIE potwierdzona w logu: wpis 13:56:20 (Warszawa) to tryb `flash`, model
wywołał `moje_starty` + `wyzwania_postep` — to nie był tryb osoby; „ultrakotlina" naprawia dopiero tryb „impreza" (M3a v2).

- Słownik `_shared/imiona.mjs` (generowany, nie ręczny): dane.gov.pl zbiór 1501, PESEL imię pierwsze, 20.01.2026,
  ≥ 1000 nosicieli → 1064 formy + 36 zdrobnień (rejestr nie zna „kasia", „gosia", „tomek"); wykluczone słowa zwykłe
  obecne w rejestrze („kim" 353, „wiosna", „park", …). Formy bez polskich znaków.
- Tryb osoby (`wygladaNaOsobeSlownik`): 2–3 słowa, pierwsze jest imieniem ze słownika ALBO wszystkie wielką literą.
- Osoba bez trafień (`odpowiedzOsoba` → `nic: true`) idzie ścieżką ogólną: bez pamięci sieci, bez sieci (strażnik);
  wpis `okienko_log` tryb `osoba` z `ok=false`, powód „osoba: brak trafień → ścieżka ogólna". Gdy i tam pusto →
  „Nie znalazłem tego w aplikacji, w wynikach ani w kalendarzu."
- Strażnik sieci w ścieżce ogólnej: stary, szeroki `wygladaNaOsobe` (także dwa małe słowa) blokuje Google
  (wyjątek dla nazwy imprezy — wejdzie z detektorem imprezy w M3a v2). Testy: blizna-72.

## M3a v2 — tryb „impreza" (v11) i przepięcie kalendarza na `events_search` (v12, 1.11.2026)

Tryb „impreza" (`impreza.mjs`): router → osoba → **impreza** → pamięć → model. Trzy fronty: kalendarz maszyny przez
JEDEN adapter `kalendarz.mjs` · nasze starty (`races` approved, dedup data ±1 + nazwa bez cyfr) · sieć (dozwolona
dla nazwy biegu, nie dla imienia i nazwiska bez trafienia; pamięć 24 h; limit 20/dobę wspólny z osobą; źródła →
`okienko_znaleziska` ze statusem `kalendarz`). Migracja `20261101_okienko_impreza.sql` (CHECK tryb += impreza,
status += kalendarz). Testy: blizna-74.

K-API 017 na maszynie3 (repo kolektora `ops/vps/sql/017_events_search.sql`, 017b bramka, wdrożone 13:51–13:52 UTC):
`events_search(p_q, p_from?, p_to?, p_limit ≤ 20)` — kalendarz_imprezy + calendar_races + race_events, przeszłe
edycje, rdzenie i klucz bez diakrytyków po stronie bazy, `Cache-Control: private, max-age=3600`. Adapter:
`RPC_KALENDARZA = "events_search"` (wycofanie: `"upcoming_races"` — argumenty mapuje ta sama funkcja). Tryb imprezy
pyta bez zakresu dat → wraca też ostatnia edycja (karta „była 9.10.2026"). Lista „jakie biegi w X" (`biegi.mjs`)
zostaje na `upcoming_races`. `dokladnosc_daty` i `status` z maszyny: null (brak kolumn w źródłach).

## M3b — plan pusty → generator / „Napisz do trenera" (1.11.2026) — wdrożone w v13

Reguła w JEDNYM pliku `js/plan-pusty.mjs` (`stanPlanu`, `pokazGenerator`): null (nie wiadomo) / plan / trener /
wolne / generator. Woła ją CTA „Ułóż plan" na Dziś (`_odswiezCtaGeneratora`, dynamiczny `import()`; do załadowania
CTA ukryte; plik w precache SW) i EF okienko (`moj_plan`, import `../../../js/plan-pusty.mjs` — `supabase/` nie
jest publikowane na Pages, więc wspólny plik leży w `js/`). Dziś CTA dostaje dodatkowo `_maPlanGeneratora`
(trening z `plan_source='generator'` od dziś, tylko u osób bez trenera): **zmiana zachowania** — u 2 osób z planem
z generatora dzień wolny nie pokazuje już „Ułóż plan".
Okienko, pusty zakres planu: generator → „Nie masz jeszcze planu na {zakres}. Mogę go ułożyć — trzy pytania." +
„Ułóż plan" (`openGenModal`); trener → „Trener nie ułożył jeszcze planu na {zakres}." + „Napisz do trenera"
(`openChatThread('coach')`); wolne → „Na {zakres} plan przewiduje wolne."; nie wiadomo → „Nie mam tego w Twoich
danych.". Testy: blizna-75 (CTA i EF dają ten sam wynik dla 3 profili).

## M3c — katalog treści aplikacji (1.11.2026) — wdrożone w v14

Kolejność w EF: router → osoba → impreza → **katalog** → pamięć → model. `katalog.mjs`: radio (`radio_tracks`, 90),
przepisy (`recipes`, 16), ćwiczenia/programy/oddech, ekrany, wyzwania, odznaki. Mocne trafienie (odsetek słów
zapytania trafionych w tytule ≥ 0,6 i choć jedno słowo ≥ 4 znaki) → „Znalazłem w aplikacji:" + ≤ 5 kart, 0 tokenów,
log `router` z narzędziem `katalog` (bez migracji); słabe → null. Remis: radio przed resztą. Z bazy tylko
`radio_tracks` i `recipes` (JWT, RLS), nic osobistego.
Wspólne pliki (bez drugich kopii; bez import/export — działają jako `<script src>` i jako moduł przez globalThis):
`js/przepisy-szukaj.mjs` (to samo wyszukiwanie w okienku i w nowym polu „Szukaj przepisu" nad biblioteką
w Jedzeniu; pusto → „Brak przepisu z tym słowem.") i `js/cwiczenia-nazwy.mjs` (nazwy EXERCISES/PROGRAMS/
BREATH_TECHNIQUES + Wim Hof; zawodnik.html czyta z pliku). Karty: utwór → `radio.html?utwor=<uuid>` (przewiń,
podświetl, spróbuj grać; odtwarzacz zostaje w radio.html), przepis → `nutrition.html?przepis=<uuid>` (otwórz
bibliotekę, rozwiń, podświetl), ćwiczenie → `?tab=cwiczenia&prog=/&breath=/&cw=wzmacnianie`, ekran/wyzwanie/odznaka →
EKRANY. Produkty z Jedzenia poza katalogiem (osobna decyzja). Testy: blizna-76.
ZWIAD 1.11: Jedzenie nie miało wyszukiwarki przepisów („Szukaj" = produkty); nazwy ćwiczeń były wpisane w
zawodnik.html; odtwarzacz radia żyje tylko w radio.html (`window.RADIO` w sb.js to same adresy plików).

## M3d — moje_rekordy + moje_wyniki („Który to Ty?") (1.11.2026) — wdrożone w v15

`moje.mjs`. **moje_rekordy**: `athletes.pb_*` + rok (wariant (a) z M2e — baza nie zna daty ani nazwy biegu);
„szanse na rekordy" = rekordy + najbliższy start (`moje_starty`, teraz z `dystans_km` z race_goals) i rekord na tym
dystansie (±3 %), BEZ prognozy czasu; pusto → „uzupełnisz je w Profilu". **moje_wyniki**: F6 — zapamiętany
`athletes.f6_runner_key` (wtedy tylko `runner_results`) albo `search_runners` po imieniu i nazwisku z profilu,
zawężone rocznikiem z `date_of_birth`; jeden → karta wyników (ta sama `podsumujWyniki` co tryb osoby); kilku →
karta „Który to Ty?" (≤ 5, „To ja" → RPC `ustaw_f6_runner_key` w przeglądarce, potem to samo pytanie); bez imienia
i nazwiska → Profil; „jak mi poszło w Dębnie" → filtr po rdzeniu miejsca/nazwy biegu. Router: rekord/pb/życiówk/
najlepszy czas, szans… rekord, moje wyniki/jak mi poszło (przed kalendarzem); „kto …" nie.
Migracja `20261101_f6_runner_key.sql` (+ WYCOFANIE), przetestowana PRZED prod w transakcji z rollbackiem (10/10:
INSERT z null przechodzi, INSERT/UPDATE klucza wprost → 42501, UPDATE innych kolumn przechodzi, RPC zapisuje własny
wiersz i nie rusza cudzego, zły klucz → 22023, cudzy wiersz wprost → 0 wierszy, anon → 42501 i bez EXECUTE).
Wyzwalacz zamiast REVOKE kolumny: tabelowy UPDATE authenticated na athletes wygrywa z kolumnowym. Testy: blizna-78.

## Przegląd dnia 1.11.2026 — do sprzątnięcia (bez zmian w kodzie, decyzja przed ruszeniem)

Martwe / nieużywane:
- `ODP_OSOBA` (pamiec.mjs) i `ODP_BRAK` (osoba.mjs) — po M2b/M3-0 nieużywane w EF ani testach poza komentarzem.
- `NIE_ZNAJDE` (odpowiedz.mjs) — 0 użyć. `TEKSTY.niePasuje` + gałąź `json.dopasowanie === false` w js/okienko.js — EF nigdy
  nie wysyła `dopasowanie`, więc gałąź nie zadziała.
- Gałąź `upcoming_races` w kalendarz.mjs — NIE martwa: droga wycofania K-API (opisana w nagłówku pliku).

Podwójne implementacje tego samego (kandydaci do jednego pliku w js/, jak plan-pusty/przepisy-szukaj):
- normalizacja „bez polskich znaków" + rdzeń słowa: `biegi.mjs` (rdzen, bezZnakow), `kalendarz.mjs` (bezZnakow, obetnij),
  `moje.mjs` (bezZnakow, rdzen), `impreza.mjs` (bezZnakow — inna: bez cyfr i rzymskich), `js/przepisy-szukaj.mjs`
  (BM_SZUKAJ.bezZnakow/rdzen), `router.normalizuj`, `sb.js IMPREZY._klucz`, SQL `klucz_szukania`/`rdzenie_zapytania`
  (maszyna3). Reguła rdzenia ta sama (≤ 4 znaki bez zmian, inaczej −3, min 4), ale w 5 kopiach JS.
- nazwy miesięcy: `odpowiedz.mjs` (MIES_MIEJSC), `router.mjs` (MIESIACE rdzenie), `js/okienko.js` (MIESIACE_MIAN),
  `races.html` (IMPREZY_MIES), `_shared/miesiace.mjs` (share-card), `js/generator-planu.js` (MIESIACE_DOPELNIACZ).
- odmiana „start/starty/startów": `js/okienko.js` startyTxt, `odpowiedz.mjs` odmiana, `races.html` startow (hero).
- `EKRANY` i `NAZWY_EKRANOW` w EF i w UI — dwie kopie pilnowane testem równości (blizna-65/76), świadomie.

Specy/LEKCJE dopisane w tym przeglądzie: nieaktualne zdania M2b (osoba bez trafień, F6 z EF potwierdzone, limit B2),
M3a (blizna-73); nagłówki index.ts/impreza.mjs/kalendarz.mjs; LEKCJE #28–#30.

## Porządek 1.11.2026 (po przeglądzie dnia) — wdrożone w v16, zero zmian zachowania

- `js/tekst.mjs` (bez import/export, `globalThis.BM_TEKST`): `bezZnakow`, `tylkoLitery`, `normalizuj` (dawny
  router.normalizuj), `rdzen`, `odmiana`/`startow`, miesiące w mianowniku, dopełniaczu i miejscowniku. Czytają go:
  biegi, kalendarz, moje, router, odpowiedz (impreza przez router.normalizuj), js/przepisy-szukaj.mjs, js/okienko.js,
  sb.js (`IMPREZY._klucz`), races.html (miesiące, odmiana w hero), `_shared/miesiace.mjs` (share-card — wersaliki
  z mianownika). Strony ładują go przed sb.js (zawodnik, races, nutrition); SW precache.
- SQL na maszynie3 (`klucz_szukania`, `rdzenie_zapytania`, K-API 017) zostaje osobno (inny runtime) i MUSI dawać to
  samo co `tekst.mjs`: blizna-79 porównuje 5 przykładów z wynikami z bazy (1.11 — zgodne).
- Usunięte: `ODP_OSOBA`, `ODP_BRAK`, `NIE_ZNAJDE`, gałąź `dopasowanie`/`TEKSTY.niePasuje` w js/okienko.js (EF nigdy
  nie wysyłał `dopasowanie` — asercja w blizna-65).
- Zostają poza tekst.mjs (świadomie, osobna decyzja): rdzenie miesięcy do dopasowań w router.mjs (`stycz`, `lut`…),
  `MIESIACE_DOPELNIACZ` w js/generator-planu.js (silnik generatora z własnym self-testem), `EKRANY`/`NAZWY_EKRANOW`
  (dwie kopie pod testem równości).

## M3-0b — „puste znaczy coś": osoba bez trafień (1.11.2026) — wdrożone w v17

Diagnoza wpisu 16:04:34 (bez danych osoby): brak konta w BiegaMy (nie `is_public=false`), F6 0 dla imienia i nazwiska
(samo nazwisko: 1 osoba o innym imieniu), więc pytanie szło do modelu (flash) i kończyło się niczym.
- Profile w okienku = zbiór jak w Społeczności: bez filtra `is_public`, decyduje RLS z JWT (`athletes_read_public`
  + `athletes_read_by_coach` → zawodnik widzi publicznych, trener także swoich prywatnych); prywatny ze znacznikiem
  „profil prywatny", karta tylko imię i nazwisko + „Dodaj do znajomych" / „Zobacz profil" / „Napisz".
- Brak trafień → odpowiedź informacyjna (0 tokenów, bez modelu i sieci), każde zdanie tylko gdy dotyczy: „W BiegaMy nie
  ma nikogo o tym imieniu i nazwisku." (odczyt profili się udał), „Maszyna wyników nie zna startów pod tym nazwiskiem —
  sprawdź pisownię." (F6 odpowiedziało), zajęta maszyna (429); nic → ODP_NIC. Log tryb `osoba`, powód „brak trafień:
  odpowiedź informacyjna". Ścieżka M3-0 „osoba bez trafień → model" usunięta; strażnik sieci dla pytań wyglądających
  na osobę spoza detektora zostaje.
- Bez przycisku „Zaproś do BiegaMy": zwiad 1.11 — aplikacja nie ma mechanizmu zaproszeń do konta (`navigator.share`
  służy tylko kartom, „zaproszenia" to zaproszenia do znajomych). Testy: blizna-80.

## M3-1 (1) PRYWATNOŚĆ — imię i nazwisko wewnątrz zdania (1.11.2026) — wdrożone w v18

Ławka 1.11: „jak pobiegl Jan Kowalski w Poznaniu", „czy Anna Kowalska jest w aplikacji" mijały detektor osoby i strażnik
sieci (oba widziały tylko 2–3 słowa) → model → Google z nazwiskiem. `osobaWZdaniu` (osoba.mjs): para sąsiednich słów —
(A) pierwsze jest imieniem ze słownika (dowolna wielkość liter) ALBO (B) oba wielką literą, pierwsze nie na początku
zdania i nie po przyimku miejsca (w/we/na/pod/koło/obok/przy/za — „w Warszawie Mokotów" to miejsce; „u Basi Kowalczyk"
przechodzi). Odpadają: słowa pytające, NIE_IMIE, przyimki, słowa imprez/aplikacji (maraton, bieg, start, trasa, zapisy,
wyniki, rekord, plan, trening, odznaki, sieć, google…), PEŁNE formy miesięcy i czasu („Marcin" ≠ marzec), czasowniki.
Kontekst: „w/na <Miejsce>" → `gdzie` → filtr runner_results po rdzeniu (brak trafienia → zdanie „Maszyna wyników nie zna
startu tej osoby: X." i pełna karta); „kim jest / w sieci / google" → wprost. Reguła publiczności bez zmian — zdanie
z wykrytą osobą idzie do Google tylko dla osoby publicznej sportowo albo wprost. Strażnik ścieżki ogólnej zna też
`osobaWZdaniu` (pas bezpieczeństwa). Testy: blizna-81 (15 zdań → 0 wyjść do sieci poza wprost).

## M3-1 (2) kolejność i detektory (1.11.2026) — wdrożone w v19

Luki z ławki: (1) „maraton/bieg + nazwa" („maraton warszawski", „bieg niepodległości") → IMPREZA, nie lista; lista
zostaje dla „jakie biegi/maratony w <miesiąc|miasto>" (`BIEG_NAZWANY` + `NIE_NAZWA_PO_BIEGU` w router.mjs); (2) lista
wyklucza co jeść / jak / czy / ile kosztuje / cena / wpisowe; (3) pusta lista podaje zakres: „Maszyna wyników nie ma biegów
od 1.11 do 30.01 w Krakowie na półmaratonie."; (4) „weekend" = najbliższe sb–nd (sb/nd dziś → ten weekend); (5) router
rekordów wyklucza świata/polski/europy/olimpijski/trasy/kraju/mistrz; (6) „co to jest / co znaczy / za co odznaka X" omija
router odznak → katalog (karta odznaki — bez opisu, tylko nazwa); (7) katalog pomija słowa kategorii (cwiczenia, program,
trening, oddech, utwor, piosenka, odznaka, wyzwanie, jest, czym…) i liczy cyfry jako słowa („oddech 4-7-8" → technika;
to samo w przepisy-szukaj.mjs — Jedzenie); (8) F6: imię i nazwisko najpierw jak wpisane, przy 0 trafień drugie wywołanie
rdzeniami („katarz chojnack" — search_runners dopasowuje po tokenach; na prod 4 trafienia), maks. 2 wywołania.
Testy: blizna-82; blizna-73/76 dostosowane.

## M3-1 (3) tanie narzędzia (1.11.2026) — wdrożone w v20

- `moj_trener` (router „kto jest moim trenerem / mój trener / mam trenera", 0 tokenów; także dla modelu): coach_id →
  `coaches.full_name` (SELECT publiczny), karta trenera z „Napisz" (data-plan=trener → czat); bez trenera → „Trenujesz
  bez trenera w BiegaMy.".
- Pogoda PO STRONIE KLIENTA (js/okienko.js `pogodaLokalnie`): to samo źródło co kafel Dziś (`sessionStorage weather:<miasto>`,
  EF get-weather, 30 min), dziś / jutro / pojutrze, opis z weather_code, temp_max, opady; inne miasto w pytaniu → dopisek,
  jakie miasto mamy; brak kafla → do Profilu. 0 tokenów, bez EF → BEZ wpisu w okienko_log (świadomie).
- Powitanie („dzień dobry", „cześć", „hej"… ≤ 3 słowa) → jedno zdanie z routera (`POWITANIE`), log router/powitanie.
- „moje rekordy" przy pustych `pb_*` → najlepsze czasy Z WYNIKÓW ZAWODÓW przez `moje_wyniki` (F6) na 5/10/21,1/42,2 km
  (±3 %), zdanie „Twoje najlepsze czasy z wyników zawodów: …", karty z etykietą „z wyników zawodów: <bieg>" — nigdy
  z treningów; imiennicy → „Który to Ty?"; 429 → zajęta. Testy: blizna-83; blizna-64 o 9 narzędziach.
Ławka po (3): docs/lawka-pytan-2026-11-01-3.md. Cele „≥ 40 dobra, koszt < $0,15" NIE osiągnięte w tym zakresie —
reszta to M3e (forma, znajomi), pojęcia (TSB), kalkulator tempa, słowa-klucze ekranów (hasło), porady ogólne (sieć).

## M3-2 — luki ławki z danych i tekstów już obecnych w aplikacji (1.11.2026) — wdrożone w v21

Jeden commit; zasada: 0 tokenów, liczby z danych, zdania ze słowników, które aplikacja już pokazuje.
- (a) `moja_forma`: training_logs 120 dni → `formaSeria` (90 dni, _shared/reguly-treningow.mjs — te same progi, które pilnuje
  bramka-reguly) → „Forma: TSB +7 (optimum), CTL 45, ATL 38." + jedno zdanie ze słownika stanów `js/forma-stany.mjs`
  (= teksty tarczy formy w sb.js i `formaZoneLabel`; blizna-84 porównuje po zdjęciu polskich znaków). Żadnych porad poza
  słownikiem. `znajomi_tydzien`: friendships accepted → profile przez RLS, treningi WYŁĄCZNIE z `public_training_logs`
  (widok filtruje is_public) od poniedziałku; prywatne logi nigdy w sumie; „0 znajomych" / „znajomi mają prywatne
  profile" / „nikt nie zapisał" jako osobne zdania. `osoby_z_miasta`: `athletes.city` z profilu → publiczni z tym samym
  miastem (ilike, bez mnie), licznik + ≤ 5 kart osoby jak Społeczność; bez miasta → Profil.
- (b) katalog „pojęcia": `_shared/pojecia.mjs` = KOPIA `window.METRIC_TOOLTIPS` z sb.js (tytuł + „Co to jest" bez HTML),
  generator `tools/kopie-okienka.js`, równość pilnuje blizna-84. Trafienie po słowie-kluczu (tsb, ctl, atl, trimp,
  heatmap / mapa cieplna, kilometraż, odliczanie) → karta pojęcia + „Otwórz Forma". Zwiad: strefy, interwały, rozbieganie
  NIE MAJĄ opisu w aplikacji → brak hasła (nie piszemy własnych). Fakt o aplikacji (`O_APLIKACJI`): hasło — do v21 okienko
  mówiło „w aplikacji nie ma zmiany hasła" (prawda do 1.11 wieczór); od v22 (commit `eaac0c6`, blizna-85) „Hasło zmienisz
  w Profilu: Ustawienia → Hasło" + synonim haslo → Profil; blizna-84 pilnuje, że `profil.html` ma `auth.updateUser`.
- (c) `SYNONIMY_EKRANOW` (narzedzia.mjs): tylko rzeczy, które NA TYM EKRANIE SĄ (zegarek/intervals, zdjęcie/awatar, miasto,
  prywatność, rocznik → Profil; zapisz trening → log; muzyka → Radio; znajomi → Społeczność…). Katalog bierze najlepsze
  z nazwy i synonimów; router „otwórz ustawienia / pokaż zegarek" → Profil.
- (d) kalkulator w routerze (`kalkulator()`): tempo ↔ km/h ↔ czas na dystans, liczby WYŁĄCZNIE z pytania (m:ss przy
  „tempo"/„na km" albo < 10:00 = tempo; „w / za / poniżej" + dystans ≥ 15 km i krótkie „1:45" = godziny; półmaraton/maraton/
  dycha/piątka = dystans). Bez liczb odpowiada tylko na jawne „przelicz … na prędkość/tempo"; „jakie tempo na półmaraton"
  (porada) i „moje tempo" → nie kalkulator. Log: tryb router, narzędzia [kalkulator].
- (e) `BIEG_SLOWO` + „za granicą / zagraniczne / poza Polską" → „Maszyna wyników zna tylko biegi w Polsce." (log
  biegi_zagranica). Karty odznak (katalog i moje) z opisem z odznaki.html (`OPISY_ODZNAK`, kopia pilnowana).
- Porady ogólne (co jeść, buty, katar, ile biegać) zostają w sieci — decyzja 1.11.
- Testy: blizna-84; blizna-64 (12 narzędzi), blizna-83 (wpis logu zdań routera `[traf.log]`). Ławka etap 4:
  docs/lawka-pytan-2026-11-01-4.md — dobra 41/50, zła 0, pusta 1 (półmaraton w Krakowie poza 90 dniami), za droga 8
  (porady i produkty — poza zakresem), 0 wyjść nazwisk do sieci; koszt symulacji $0,28 (cel $0,15 wymaga decyzji o poradach).


## K5 — cel startowy ↔ kalendarz imprez (1.11.2026) — wdrożone (F6 018/018b, EF impreza-zglos, okienko v23)

Decyzja Filipa: zgłoszenie widoczne OD RAZU (status `zgloszona`, etykieta „zgłoszona przez biegacza"), trener ukrywa
(`ukryta`), kolektor potwierdza (`potwierdzona` — etykieta znika).
- Maszyna3 (repo biegamy-collector, `ops/vps/sql/018_event_propose.sql`, `018b_bramka_event_propose.sql`, wycofania
  `018_rollback.sql` ze STANU BAZY, `018b_rollback.sql` = 017b): tabela `imprezy_zgloszenia` (nazwa, data, miejscowość,
  status, hash zgłaszającego `prywatne.konto()`), `event_propose` (5/dobę/konto; dedup data ±1 + nazwa bez cyfr względem
  kalendarza, calendar_races, race_events i zgłoszeń — przed limitem, więc nie zużywa limitu), `event_hide` (tylko konto
  z `prywatne.trenerzy`), `events_search` i `upcoming_races` z kolumnami `klucz` i `status` (upcoming_races też
  `dokladnosc_daty`, null). Caddy: dwie ścieżki w `@dozwolone`, strefa `na_zapis` 10/min na token, no-store. Testy S-
  `tools/test-018/` 12/12 (próba w transakcji przed wdrożeniem i po).
- Trener w F6 — ZWIAD: JWT ma trenera tylko w `user_metadata.role` (użytkownik zmienia sam → nie dowód; S10), app_metadata
  pusty, hooka brak → lista hashy `prywatne.trenerzy` po stronie F6 (2 wpisy), opis w `ops/vps/F6-K5-TRENERZY.md`.
- BiegaMy: modal celu (zawodnik.html) podpowiada nasze starty + ≤ 5 imprez z `events_search` (od 3 znaków, bez dubli
  z naszymi startami — `IMPREZY.toSamo`); wybór wiąże cel kluczem `race_goals[].impreza_klucz` (bez zgłoszenia); brak
  w kalendarzu → `window.zglosImpreze` → EF `impreza-zglos` (biała lista: nazwa, data, miejscowość; token użytkownika)
  → `event_propose`, PRZED zapisem celu, klucz od razu w celu; 429/sieć/błąd → cel zapisany bez klucza. Nowe pole
  „Miejscowość (opcjonalnie)" w modalu. Podpowiedzi przez `data-*` + delegowany klik z białą listą funkcji (stary
  `onclick="goalPickRace('…')"` z `escAttrJS` usunięty — zakazany wzorzec z CLAUDE.md).
- `race_goals` to kolumna TEKSTOWA z JSON-em (bez CHECK i triggera kształtu) — `impreza_klucz` jest polem obiektu celu,
  migracja DDL w BiegaMy nie była potrzebna (świadomie bez pustej migracji).
- Etykieta „zgłoszona przez biegacza": races.html „W Polsce" (+ „Ukryj" dla trenera → `event_hide`, start sekcji po
  rozpoznaniu trenera) i karty imprez okienka. `event_hide` w `RPC_DOZWOLONE` js/wyniki-api.js; `event_propose` świadomie
  POZA listą (tylko przez EF). Testy: blizna-87; blizna-53 (11 RPC).
- Poza zakresem: modal celu w profil.html i kalendarz.html (trener ustawia cel zawodnikowi) — bez podpowiedzi z maszyny
  i bez zgłoszeń; do decyzji, czy dołożyć.
