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

Odpowiedź: zdania z sieci (jeśli są, z etykietą i źródłami) → karta osoby → karta wyników; nic →
„Nie znalazłem tej osoby w aplikacji ani w wynikach."; 429 z F6 → „Maszyna wyników jest teraz zajęta — spróbuj za
chwilę." (reszta zostaje). Pamięć F6 wspólna (dane publiczne): RPC + argumenty, 10 min, ≤ 500 wpisów, w izolacie.
Odpowiedź osobowa nie trafia do `okienko_siec_cache` ani do znalezisk; log `okienko_log` tryb `osoba`
(`ok=false` gdy F6 zawiodło, powód w `powod_odrzucenia`). Testy: blizna-67.

⚠️ Niesprawdzone przed wdrożeniem: F6 z adresów funkcji Edge (limit 60/min na IP po stronie Caddy — wszyscy
użytkownicy okienka dzielą jeden adres). Token przyjmowany — sprawdzone lokalnie 1.11 (200, 0,9 s).
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
kalendarza startów w races.html (K4/K5). Testy: blizna-72.

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
