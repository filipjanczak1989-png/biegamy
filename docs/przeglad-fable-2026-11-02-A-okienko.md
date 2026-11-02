# Przegląd „świeże oko” A — okienko „Zapytaj” (2.11.2026)

Recenzent: Claude Fable 5.1, tylko odczyt kodu produkcyjnego. Zakres: `supabase/functions/okienko/*`, `js/okienko.js`,
`js/akcja-cytaty.mjs`, `js/akcja.mjs`, `docs/okienko-spec.md`, testy blizna-64…104 dotyczące okienka, ławka
`tests/_lawka-pytan.js`. Bez połączenia z bazą i bez żywego Gemini — wszystko, co „na prod” w tym raporcie, pochodzi
z kodu, specu i atrap ławki; gdzie repo nie wystarcza, piszę „nie do ustalenia z repo”.

Zmiany w drzewie zrobione przez ten przegląd: (1) 20 pytań dopisanych do `tests/_lawka-pytan.js` (sekcja „przegląd
„świeże oko” 2.11.2026”), (2) raport ławki `docs/lawka-pytan-2026-11-02-fable-A.md` (wynik `--etap fable-A`),
(3) ten plik. Pliki `sb.js` i `tests/blizna-88-film-w-banerze.test.js` były już zmodyfikowane w drzewie, zanim
zacząłem — nie ruszałem ich.

## Jak płynie pytanie

1. Klient (`js/okienko.js`): tekst ≤ 300 znaków; pytanie o pogodę kończy się w przeglądarce (kafel Dziś, 0 tokenów, bez
   wpisu w logu). Reszta → POST `/functions/v1/okienko` z JWT sesji + `historia` (3 ostatnie pary pytanie/odpowiedź).
2. EF `index.ts`: `wymagajUsera` (getUser w GoTrue) → 401; klient Supabase z JWT użytkownika (RLS) do danych, klient
   `service_role` WYŁĄCZNIE do `okienko_log` / `okienko_siec_cache` / `okienko_znaleziska`; `athlete_id` z sesji.
3. Stan akcji: tylko dla pytań-kandydatów (`zagadkaKandydat`) jedno RPC `akcja_licznik` z JWT pytającego; potem
   `ustawStan` → `dopasuj` synchronicznie (bez `await` pomiędzy — to jedyna rzecz, która chroni stan modułu w izolacie).
4. Router (`router.mjs`, 0 tokenów, nie liczy się do limitów): PIERWSZA reguła = zagadka akcji (`fabian*`, 12 500,
   7.11/8.11, „co to za akcja”…; po starcie zdanie `PO_STARCIE` + karta akcji z `kartaOkienka`), potem „jak dołączyć”,
   plan/jutro/tydzień, starty, powitanie, mój trener, ból/kontuzja, forma/znajomi/miasto, kalkulator tempa, biegi za
   granicą, rekordy/moje wyniki, lista biegów (`dopasujBiegi`), kilometry za okres, wyzwania, odznaki, nawigacja.
   Narzędzie wykonuje EF (`narzedzia.mjs`, tylko odczyt), zdania układa `odpowiedz.mjs` z szablonów.
5. Osoba (`osoba.mjs`): detektor 2–3 słów ze słownikiem imion (`_shared/imiona.mjs`) albo `osobaWZdaniu` (≥ 4 słowa).
   Równolegle: profile (RLS) + F6 `search_runners`/`runner_results` (token użytkownika, pamięć 10 min w izolacie).
   Sieć tylko gdy osoba publiczna sportowo (≥ 30 startów / MP / podium OPEN) ALBO pytanie „wprost” (kim jest, google…).
6. Impreza (`impreza.mjs`): słowo z listy + nazwa → `events_search` (K-API 017) + nasze `races`; sieć dozwolona dla
   nazwy biegu, zabroniona tylko gdy `q` „wygląda na osobę” (2–3 słowa bez słowa biegowego) i nic nie trafiło.
7. Katalog (`katalog.mjs`): radio, przepisy, ćwiczenia, ekrany + synonimy, pojęcia (kopia METRIC_TOOLTIPS), wyzwania,
   odznaki, fakty o aplikacji (hasło, rejestracja). Mocne trafienie (≥ 0,6 słów) = 0 tokenów.
8. Pamięć sieci (`okienko_siec_cache`, klucz = znormalizowane pytanie, 24 h) → trafienie = 0 zł, tryb `siec-cache`.
9. Model (`model.mjs`, gemini-3.5-flash-lite): najpierw `sprawdzLimity` (60/dobę trybu flash+blad, budżet miesięczny
   z `OKIENKO_BUDZET_USD`), potem 1 + do 3 rund `generateContent` z 12 deklaracjami narzędzi; wynik JSON ze schematem;
   strażnik cyfr (`straznik.mjs`) wycina zdania z liczbą spoza wyników narzędzi; brak zdań → zdanie zastępcze + powód w logu.
10. Sieć (`siec.mjs`): gdy model dał `poza_danymi` albo nie użył narzędzia i pytanie nie jest „o mnie” — osobne
    wywołanie z `googleSearch`, do którego idzie WYŁĄCZNIE tekst pytania + data; strażnik `blokadaSieci`
    (`wygladaNaOsobe || osobaWZdaniu`); limit 20/dobę (tryb `siec` + osoba/impreza z ≥ 1 zapytaniem); bez
    `groundingChunks` JEDNA ponowna próba (koszt ×2); zdania z cyfrą tylko pokryte `groundingSupports`; źródła https ≤ 5.
11. Log `okienko_log` (service_role): tekst ≤ 300, tryb, narzędzia, tokeny, zapytania sieci, `ok`, `powod_odrzucenia`;
    retencja 30 dni (pg_cron). Kto decyduje: router (regex) > detektory > katalog > model; model nigdy nie decyduje
    o sieci sam i nie wybiera adresów (nawigacja ze słownika `EKRANY`, w UI biała lista).

## Ławka pytań — wynik

Uruchomienie: `node tests/_lawka-pytan.js --etap <nazwa>` — lokalnie, na atrapach (`tests/_okienko-atrapy.js`),
bez bazy i bez kluczy; model i sieć SYMULOWANE (koszt ze średnich logu z 1.11). Ławka liczy stan PRZED startem akcji.

**Przed dopisaniem (53 pytania):** dobra 47, za droga 6, zła 0, pusta 0; koszt symulacji $0,24. Nietrafione = 6 „za
drogich” porad spoza aplikacji (co jeść, buty, katar, ile biegać, kalorie ×2) — znane z etapów 4–5.

**Po dopisaniu 20 (73 pytania):** dobra 58, za droga 9, zła 6; koszt symulacji $0,39 (plik
`docs/lawka-pytan-2026-11-02-fable-A.md`). Nowe pytania i wynik (oczekiwanie → fakt):

| # | pytanie | oczekiwane | faktyczne (ławka / próba) | ocena |
|---|---|---|---|---|
| 54 | ile km przebieglem w akcji dla fabianka | zagadka; po starcie karta | zagadka; po starcie `PO_STARCIE` + karta z SUMĄ wszystkich, bez „Twój wkład” | dobra (luka PO) |
| 55 | co to za akcja z tymi kilometrami | zagadka | zagadka | dobra |
| 56 | ile km zebralismy razem | zagadka | zagadka | dobra |
| 57 | wygoogluj Fabianka | zagadka, nic do sieci | zagadka w obu stanach | dobra |
| 58 | plan na 7.11 | mój plan na 7.11 | ZAGADKA (data 7.11 w `ZAGADKA_ZAWSZE`, bez bramki `ZAGADKA_NIE`); to samo „co mam 8.11”, „trening 8.11” | ZŁA |
| 59 | kim jest Kipchoge | sieć (publiczny) | ścieżka ogólna → sieć „kim jest Kipchoge” (1 słowo omija tryb osoby, bez F6) | dobra |
| 60 | kim jest Marek Nowak z naszego klubu | bez Google (prywatny) | tryb osoby, `wprost=true` → „Kim jest Marek Nowak?” DO GOOGLE (zgodne ze spec „pytanie wprost”) | ZŁA — decyzja |
| 61 | Anna Nowak maraton | tryb osoby | router → LISTA maratonów (dystans 42), nazwisko ginie; brak wycieku. Ale „Jan Kowalski ultrakotlina / parkrun / trail”, „kasia nowak ultra”, „Kowalski parkrun” → tryb imprezy → NAZWISKO DO GOOGLE | ZŁA |
| 62 | jak pobiegl Kowalski w Debnie | tryb osoby / bez sieci | model → „jak pobiegl Kowalski w Debnie” DO GOOGLE (samo nazwisko mija oba detektory) | ZŁA |
| 63 | znajdz w sieci mojego trenera | nic do sieci | router `moj_trener`, 0 tokenów | dobra |
| 64 | wyniki Nowaka | tryb osoby / bez sieci | model → „wyniki Nowaka” DO GOOGLE | ZŁA |
| 65 | gdzie zmienic zegarek | Profil | katalog → karta Profil | dobra |
| 66 | jak podlaczyc garmina | Profil | katalog → karta Profil (rdzeń „garm” → synonim „garmin”) | dobra |
| 67 | jaki czas na polmaraton w tempie 5:30 | przeliczenie | „Półmaraton w tempie 5:30/km to 1:56:02 (10,9 km/h).” | dobra |
| 68 | maraton w poznaniu kiedy | lista / impreza | lista 365 dni (miejsce + dystans); „maraton poznanski kiedy” → tryb imprezy | dobra |
| 69 | polmaraton warszawski ile kosztuje | karta z linkiem | atrapa bez karty → sieć „… bieg — termin, dystanse, miejsce” (intencja wpisowego ginie); na prod zapewne karta z url (0 zł) | za droga |
| 70 | boli mnie kolano czy moge biegac | stałe zdanie | stałe zdanie, 0 tokenów | dobra |
| 71 | mam katar czy moge biegac | sieć (decyzja 1.11) | model → (przy `poza_danymi`) sieć; prompt sieci zakazuje porad medycznych → możliwe 2 próby i „Tego nie znalazłem” | za droga |
| 72 | 🏃‍♂️ | nic / podpowiedź | model + sieć „🏃‍♂️” (~$0,02 za nic); tak samo „12”, „???” | za droga |
| 73 | ile juz km | km za okres; po starcie karta | PRZED startem: wypada z routera (brak okresu) → model → sieć „ile juz km”; po starcie zagadka/karta | ZŁA |

Dodatkowe sondy (tylko próba, nie w ławce — skrypt w scratchpadzie recenzenta): „kiedy rusza akcja”, „jaki jest cel
akcji”, „ile km ma akcja”, „na co zbieramy”, „dla kogo biegamy” → model → Google (przed i po starcie), „kiedy start
akcji” → `moje_starty`, „link do zbiorki” → `NIE_MAM` (po starcie też) — słowo „akcja/zbiórka” bez dokładnego wzorca nie
trafia w zagadkę. „co sie dzieje z aplikacja” → zagadka. „jak dolaczyc” przed startem → rejestracja, po starcie → karta
akcji (OK). „Fabian Kowalski wyniki”, „kim jest Fabian Nowak” → zagadka w obu stanach (OK). Pusty tekst → EF 400 (klient
nie wysyła pustego).

## Lista problemów

PRZED = przed 7.11 (wyciek nazwiska / treści akcji albo błąd w czasie akcji). PO = po 8.11.

| # | problem | przykład pytania | propozycja | ryzyko | kiedy |
|---|---|---|---|---|---|
| 1 | Imię i nazwisko + słowo biegowe spoza `OGOLNE` (ultra*, trail*, parkrun*, cross*, sztafet*, nazwa biegu) idzie do Google przez tryb imprezy: `wolnoSiec` sprawdza `wygladaNaOsobe(q)`, a ten zwraca `false`, gdy w `q` jest słowo „biegowe” | „Jan Kowalski ultrakotlina”, „Anna Nowak trail”, „kasia nowak ultra”, „Kowalski parkrun” | `impreza.mjs`: przy braku trafień w kalendarzu/startach nie wysyłać `q`, jeśli `q` bez słów z `SLOWA_IMPREZY` wygląda na osobę (`wygladaNaOsobe`) albo którekolwiek słowo `czyImie()`; test w blizna-74/81 | „Bieg Jana Pawła II” nieobecny w kalendarzu dostanie „Nie znalazłem…” zamiast sieci — akceptowalne | PRZED |
| 2 | Samo nazwisko w szablonach „wyniki X”, „jak pobiegł X”, „kim jest X” (1 słowo) mija `wygladaNaOsobeSlownik` (2–3 słowa) i `osobaWZdaniu` (para słów) → ścieżka ogólna → Google | „wyniki Nowaka”, „jak pobiegl Kowalski w Debnie”, „kim jest Kowalski” | `index.ts` `blokadaSieci` += pytanie zaczynające się od `wyniki|jak pobieg\w*|jak biega\w*|kim jest|kto to` z ≤ 2 słowami po szablonie i bez słowa imprezy → nie do sieci (ODP_NIC) ALBO tryb osoby z `q` = to słowo (F6 `search_runners` dopasowuje po tokenach — samo nazwisko da wiele trafień; czy to użyteczne: nie do ustalenia z repo) | „kim jest Kipchoge” też zostanie zatrzymane — tryb osoby z regułą publiczności (≥ 30 startów) odblokuje tylko tych w F6 | PRZED |
| 3 | „Pytanie wprost” (kim jest / kto to / google / w sieci + imię i nazwisko) wysyła PRYWATNE nazwisko do Google — zgodnie ze spec, niezgodnie z regułą „imiona prywatnych NIGDY do Google” | „kim jest Marek Nowak z naszego klubu”, „szukaj w google Anny Nowak”, „kto to jest Jan Kowalski” | Decyzja Filipa: (a) zostaje — dopisać wprost do `privacy.html`/specu jako świadome życzenie użytkownika; (b) `osoba.mjs`: `doSieci = wyniki && wyniki.publiczna` (wprost bez wpływu) | (b): pytanie o znanego biegacza spoza F6 kończy się „nie ma w BiegaMy / w wynikach” | PRZED (decyzja) |
| 4 | Data 7.11 / 8.11 albo „7 listopada” w pytaniu o własne dane → zagadka zamiast planu; wzorzec daty siedzi w grupie „zawsze”, bez bramki `ZAGADKA_NIE` | „plan na 7.11”, „co mam 8.11”, „trening 8.11” | `router.mjs czyZagadka`: datę i `[78] listopad` przenieść pod bramkę `ZAGADKA_NIE` (jak `ZAGADKA_OGOLNA`); blizna-93 nadal zielony („co sie dzieje 7 listopada” łapie OGOLNA, „co bedzie 7.11” — ZAWSZE) | prawie żadne | PRZED |
| 5 | Słowo „akcja / zbiórka / zbieramy / dla kogo biegamy” bez dokładnego wzorca → model → Google (przed startem — treści nie zdradza, ale okienko nie trzyma linii), po starcie brak karty | „kiedy rusza akcja”, „jaki jest cel akcji”, „ile km ma akcja”, „na co zbieramy”, „link do zbiorki”, „kiedy start akcji” (→ `moje_starty`) | `ZAGADKA_ZAWSZE` += `\bakcj[aeęią]\w*\b|zbiork\w*|zbieramy|dla kogo (biegamy|biegniemy)` z bramką `ZAGADKA_NIE`; „kiedy start akcji” przed regułą startów | w aplikacji nie ma innych „akcji”; ryzyko fałszywych trafień małe | PRZED |
| 6 | Po zamknięciu akcji (`koniec`) zagadka nadal mówi „Akcja trwa…” (`odpowiedzZagadki` czyta tylko `ruszyla`, ignoruje `zamknieta`), karta ma „· zrobione” | „ile km w akcji” po dobiciu celu | `odpowiedzZagadki`: `STAN.zamknieta` → `PO_ZAMKNIECIU` („Daliśmy radę…”) + karta | brak | PO |
| 7 | Po starcie „ile km przebiegłem w akcji” daje sumę wszystkich; brak „Twój wkład” (`akcja_moj_wklad` jest na karcie Dziś, nie w `kartaOkienka`) | „ile km przebieglem w akcji dla fabianka”, „ile juz km” | `index.ts` przy zagadce po starcie: RPC `akcja_moj_wklad` z JWT → `dane.moj_km`; `js/okienko.js` karta `akcja`: „Ty: X km” | jedno RPC więcej na pytanie o akcję | PO |
| 8 | Tryb imprezy łapie PORADY ze słowem biegowym i wysyła do Google zapytanie o „termin, dystanse, miejsce” — odpowiedź nie na temat albo „Nie znalazłem tego biegu” | „co jesc przed polmaratonem”, „ile biegac przed maratonem” | `NIE_IMPREZA` += `co jesc|jak sie przygotowac|przed (maratonem|polmaratonem|biegiem)|po (maratonie|polmaratonie)` → ścieżka ogólna (sieć z oryginalnym tekstem) | brak | PO |
| 9 | „ile km” bez okresu wypada z routera (`km` wymaga tydzień/miesiąc/rok) → model, przy `poza_danymi` → Google „ile juz km” | „ile juz km”, „ile przebieglem” | domyślny zakres = ten tydzień albo zdanie „Podaj okres: tydzień, miesiąc, rok” (0 tokenów) | brak | PO |
| 10 | Pytanie bez liter (emoji, liczby, „???”) → model (+ narzędzia) + sieć | „🏃‍♂️”, „12”, „???” | `index.ts`: gdy `normalizuj(tekst)` ma < 3 litery → `POWITANIE`, log `router/powitanie` | brak | PO |
| 11 | Cena/zapisy bez karty z kalendarza: zapytanie do sieci pomija intencję („termin, dystanse, miejsce”) | „polmaraton warszawski ile kosztuje” (gdy brak w kalendarzu) | `impreza.mjs`: przy `deps.cena` → `${nazwa} bieg — wpisowe, zapisy, termin` | brak | PO |
| 12 | `ODP_IMPREZA_PUSTO` „…ani w sieci” także gdy sieci nie pytano (limit 20, brak klucza, strażnik osoby, tryb ceny) | „Anna Nowak-Kowalska bieg” → „Nie znalazłem tego biegu w kalendarzu ani w sieci.” (sieć celowo pominięta) | dwa zdania zależnie od `wolnoSiec && sieciDozwolona` | brak | PO |
| 13 | Tryb osoby: F6 padło (auth/siec/http ≠ limit) → użytkownik widzi tylko „W BiegaMy nie ma nikogo…”, nie dowiaduje się, że maszyna wyników nie odpowiedziała (powód tylko w logu) | dowolne nazwisko przy awarii F6 | zdanie „Maszyna wyników nie odpowiedziała — spróbuj za chwilę.” dla `f6Stan ∉ {ok, limit}` | brak | PO |
| 14 | Limity: `sprawdzLimity` (60/dobę + budżet miesięczny) tylko na ścieżce modelu; sieć w trybach osoba/impreza omija budżet (tylko 20/dobę); tryb `siec` nie wlicza się do 60 (realnie 60 + 20 wywołań modelu/dobę) | 20 pytań „kim jest X” dziennie × osób = koszt poza budżetem | `sieciDozwolona` → także `sprawdzLimity(adm, …, BUDZET)`; `uzyteDzis` += tryb `siec` | brak | PO |
| 15 | Stan akcji w module (`BM_AKCJA_CYTATY.STAN`) współdzielony przez wszystkie żądania izolatu — dziś bezpieczne (ustawStan → dopasuj bez `await`, kandydat niezależny od stanu), ale jedna przyszła linia z `await` między nimi to podmiana stanu między równoległymi żądaniami | — | `dopasuj(tekst, dzis, { ruszyla })` i `odpowiedzZagadki(los, ruszyla)` — stan jawny per żądanie; asercja tekstowa w blizna-93, że między `ustawStan(` a `dopasuj(` nie ma `await` | brak | PO |
| 16 | `ZAGADKA_OGOLNA` łapie „co się dzieje z aplikacją” | „co sie dzieje z aplikacja” | `ZAGADKA_NIE` += `aplikacj\w*` | brak | PO |
| 17 | Brak timeoutu na `fetch` do Gemini (`model.mjs`, `siec.mjs`; F6 ma 8 s). Klient przerywa po 20 s, EF liczy dalej, płaci i loguje | wolny Gemini | `AbortController` 15 s jak `F6_TIMEOUT_MS` | brak | PO |
| 18 | Pamięć sieci (`okienko_siec_cache`, klucz = znormalizowane pytanie, 24 h) utrwala dla WSZYSTKICH odpowiedź na pytanie, które prześlizgnęło się przez strażnika (pkt 1–2) | „wyniki Nowaka” → zdania z sieci widoczne 24 h dla każdego, kto zada to samo | zamknięcie pkt 1–2 zamyka i to; dodatkowo `doPamieci` pomijać, gdy pytanie zaczyna się od szablonu osoby | brak | PO |
| 19 | Zalogowany, przed startem: „jak dołączyć” → „Dołączasz, zakładając konto w BiegaMy” (ma konto) — decyzja Filipa 2.11, odnotowuję tylko | „jak dolaczyc” 2–6.11 | brak | — | — |

## Prywatność — ścieżki

Co idzie do Google (wywołanie z `googleSearch` w `siec.mjs`): WYŁĄCZNIE tekst zapytania (≤ 300 znaków) + data; nigdy
wyniki narzędzi, historia, `athlete_id`, token. Trzy miejsca, w których ten tekst powstaje — przeszedłem każde:

1. **Ścieżka ogólna** (`index.ts`): `zapytajSiec({ tekst })` = surowy tekst użytkownika. Strażnik `blokadaSieci =
   wygladaNaOsobe(tekst) || osobaWZdaniu(tekst)`:
   - `wygladaNaOsobe` (pamiec.mjs): 2–3 słowa, bez słów pytających/biegowych/cyfr, wszystkie wielką literą albo wszystkie
     małe → blokada. SZCZELNE dla „Jan Kowalski”, „kasia nowak”, „link do zbiorki”. NIESZCZELNE dla 1 słowa i dla ≥ 4 słów.
   - `osobaWZdaniu` (osoba.mjs): para sąsiednich słów (imię ze słownika PESEL ≥ 1000 + 36 zdrobnień, albo dwa z wielkiej
     litery nie po przyimku miejsca), ≥ 4 słowa. SZCZELNE dla „jak pobiegl Jan Kowalski w Poznaniu”, „czy Anna Kowalska
     jest w aplikacji” (blizna-81). NIESZCZELNE: samo nazwisko („wyniki Nowaka”, „jak pobiegl Kowalski w Debnie”,
     „kim jest Kowalski”), imię spoza słownika pisane małą literą w zdaniu ≥ 4 słów, para „Imię Nazwisko” tuż po
     przyimku miejsca (w/we/na/pod/koło/obok/przy/za — traktowana jako miejsce, świadomie: „w Warszawie Mokotów”).
   - `czyDoSieci`: `poza_danymi` modelu WYGRYWA z „o mnie” — więc „jak pobiegła Ania z klubu w Dębnie” (oMnie przez
     `pobieg*`) pójdzie do sieci, jeśli model uzna pytanie za spoza danych.
2. **Tryb osoby** (`osoba.mjs`): do sieci idzie `Kim jest ${q}?` — `q` to wykryte imię i nazwisko. Warunek: osoba
   publiczna sportowo (≥ 30 startów w F6, start w Mistrzostwach Polski, podium OPEN 1–3) ALBO `wprost`. „Wprost” to
   świadoma furtka na prywatne nazwisko (pkt 3 listy). Reguła publiczności liczona z WSZYSTKICH startów, nie z filtra
   „gdzie” — dobrze.
3. **Tryb imprezy** (`impreza.mjs`): do sieci idzie `${nazwa} bieg — termin, dystanse, miejsce`, gdzie `nazwa` = nasz
   start → nazwa z kalendarza → `q`. Gdy kalendarz coś znalazł, do sieci idzie NAZWA Z KALENDARZA (bezpieczne). Gdy nic:
   `q` chroni tylko `wygladaNaOsobe(q)`, który WYŁĄCZA SIĘ przy słowie biegowym w `q` — stąd dziura pkt 1 listy
   („Jan Kowalski ultrakotlina”). `OGOLNE` wycina z `q` tylko bieg/biegi/biegu/zawody/zawodach; maraton*, ultra*, trail*,
   parkrun*, cross*, sztafet* zostają w `q` i jednocześnie unieważniają strażnika.
4. **`fabian*`**: pierwsza reguła routera, przed każdym detektorem — sprawdziłem „Kim jest Fabianek”, „wygoogluj
   Fabianka”, „Fabian Kowalski wyniki”, „kim jest Fabian Nowak”, „szukaj Fabianka w sieci” w obu stanach: zawsze zagadka
   / `PO_STARCIE`, nigdy osoba, impreza ani sieć. „fabian” jest też w słowniku imion, ale tryb osoby nigdy nie dostaje
   tych pytań (router kończy wcześniej; blizna-93 pilnuje kolejności w `index.ts`).
5. **Treść akcji przed startem**: zagadki (6) nie zawierają imienia, liczby 12 500 ani celu — tylko datę 7.11.
   `akcja_licznik` przed startem zwraca `wystartowala=false` bez nazwy/imienia/linku/sumy (migracja `20261102_akcje.sql`,
   bramka `akcje_dane_zbiorki` to wymusza); `kartaOkienka` zwraca `null` bez `wystartowala`. „jak dołączyć” przed startem —
   karta rejestracji bez słowa o akcji (blizna-104). Konto testowe czyta akcję `proba` — jego start próbny nie zmienia
   odpowiedzi innym.
6. **Stan izolatu** (pytanie z briefu): `odswiezStan` → `ustawStan` → `dopasuj` — między `ustawStan` a `dopasuj` nie ma
   `await`, a `zagadkaKandydat` jest niezależny od stanu (wzorce „po starcie” są ORowane). Równoległe żądania nie mogą
   sobie podmienić wyniku DZIŚ; kruchość opisana w pkt 15.
7. **Poza Google Search**: do Gemini API (bez wyszukiwania) idą pytanie, 3 pary historii i wyniki narzędzi — w tym
   imiona znajomych (`znajomi_tydzien`), nazwa trenera, nazwy startów. To przetwarzanie u Google, nie wyszukiwanie;
   `privacy.html` — czy o tym mówi: nie do ustalenia z tego przeglądu (poza zakresem).
8. **Zapisy pochodne**: `okienko_log.tekst` (300 znaków, 30 dni, service_role) zawiera każde pytanie, także z nazwiskami;
   `okienko_siec_cache` klucz = pytanie znormalizowane; `okienko_znaleziska` tylko nazwa biegu + rok (`nazwaIRok`), bez
   tekstu pytania; pytania „wyglądające na osobę” nie trafiają do znalezisk.

Szczelne: tryb osoby dla osób nieprywatnych z wykrytym imieniem i nazwiskiem; `fabian*`; dane narzędzi nigdy do sieci;
treść akcji przed startem. Nieszczelne: pkt 1 (nazwisko + słowo biegowe → impreza), pkt 2 (samo nazwisko), pkt 3
(wprost — furtka ze spec).

## Koszty i limity

- Ceny w kodzie: gemini-3.5-flash-lite 0,30 / 2,50 USD za 1 M tokenów (we/wy), zapytanie wyszukiwania 0,014 USD.
  Średnie z logu 1.11 (w ławce): model 2143/63 tok ≈ $0,0008; sieć +1842/157 tok + 1,44 zapytania ≈ $0,021 łącznie.
- **Najgorszy przypadek jednego pytania** (z kodu, bez żywego API): model 1 + do 3 rund (`MAX_NARZEDZI`), każda runda
  z rosnącą rozmową (system ~0,3 k + 12 deklaracji ~0,7 k + historia ≤ 1,8 k znaków + wyniki narzędzi do 20 pozycji) —
  szacunkowo 4 × 4–6 k we, ≤ 256 wy/runda → ~$0,006–0,01; sieć: 2 próby (retry bez `groundingChunks`) × (~2 k we + ≤ 300 wy)
  + zapytania wyszukiwania 2 × N × $0,014 — N na próbę nie do ustalenia z repo (zależy od Gemini; średnia 1,44). Rząd:
  typowo $0,02, pesymistycznie ~$0,1 (przy 3–4 zapytaniach na próbę). Tryby osoba/impreza z siecią: ~$0,02 (bez modelu).
- Limity w kodzie: 60/dobę/osobę trybu `flash`+`blad` (router, osoba, impreza, katalog, pamięć nie liczą się);
  20/dobę/osobę sieci (tryb `siec` + osoba/impreza z `zapytania_sieci ≥ 1`); budżet miesięczny `OKIENKO_BUDZET_USD`
  (suma tokenów × cena + zapytania × 0,014 ze wszystkich wpisów logu; 0 = brak limitu; ≥ 80 % → jeden wpis `budzet80`).
  Czy zmienna jest ustawiona na prod: nie do ustalenia z repo. Luki: pkt 14 listy (osoba/impreza omijają budżet;
  `siec` nie wlicza się do 60). Retencja logu 30 dni zaniża budżet o ≤ 1 dobę w miesiącu 31-dniowym (świadome, w nagłówku).
- F6: Caddy 300/min na IP + 60/min na token (spec); 429 → „Maszyna wyników jest teraz zajęta”; timeout 8 s; pamięć
  10 min / 500 wpisów w izolacie (znika przy zimnym starcie).
- Brak klucza Gemini (`GEMINI_API_KEY` puste): router, osoba, impreza, katalog, pamięć sieci działają; `sieciDozwolona`
  = false (osoba/impreza bez sieci, bez komunikatu); ścieżka modelu → 502 „model niedostępny” → klient „Nie dam rady
  teraz odpowiedzieć. Spróbuj za chwilę.” — bez wpisu w logu (502 przed `zapiszLog`), więc awaria klucza jest
  niewidoczna w `okienko_log`.
- Limit 429 w kliencie: osobne teksty dzień / miesiąc / sieć + chipy ekranów. Offline: tylko ekrany. Timeout klienta 20 s.

## Sprawdziłem i jest OK

- Kolejność warstw w `index.ts` = spec (router → osoba → impreza → katalog → pamięć → limity → model → sieć); router
  pierwszy, zagadka pierwszą regułą routera; blizna-93 pilnuje tej kolejności tekstowo.
- `fabian*` i wszystkie wzorce akcji przed detektorem osoby i siecią — 11 wariantów w próbie, w obu stanach, 0 wyjść.
- 6 zagadek nie zdradzają treści akcji (sprawdzone słowo po słowie; „12 500” i „Fabianek” tylko w tekstach po starcie).
- `akcja_licznik` przed startem bez nazwy/imienia/linku/sumy; `kartaOkienka(null|przed startem)` = `null`.
- Stan akcji: `ustawStan` → `dopasuj` synchronicznie; `zagadkaKandydat` niezależny od stanu; RPC tylko dla kandydatów.
- Do `googleSearch` idzie wyłącznie tekst pytania + data (`jednoWyszukanie`), bez danych aplikacji; źródła tylko https,
  ≤ 5; zdanie z cyfrą tylko pokryte `groundingSupports` (zakres bajtów UTF-8); bez źródeł → „Tego nie znalazłem w sieci”.
- Strażnik cyfr modelu: liczby tylko z JSON wyników narzędzi; pusto → zdanie zastępcze zależne od narzędzia + powód
  w `powod_odrzucenia`; model nie wybiera adresów (nawigacja z `EKRANY`).
- Narzędzia tylko odczyt, JWT użytkownika (RLS), `athlete_id` z sesji; `znajomi_tydzien` liczy km WYŁĄCZNIE z
  `public_training_logs`; `osoby_z_miasta` tylko `is_public = true`; profile w trybie osoby przez RLS, karta prywatnego
  profilu = imię i nazwisko + znacznik.
- Klient: cały tekst przez `escapeHtml`; linki zewnętrzne przez `safeExternalHref {tylkoHttps}`; nawigacja tylko z białej
  listy `EKRANY` + `index.html#dolacz`; id przez `data-*` + `RE_UUID`/`RE_KLUCZ_F6`; brak JS-in-attribute; karta akcji
  bierze `url_zbiorki` przez `safeExternalHref`.
- Zapisy: `okienko_log` / `okienko_siec_cache` / `okienko_znaleziska` tylko `service_role`; jedyny zapis użytkownika
  (`ustaw_f6_runner_key`) w przeglądarce przez RPC; log ≤ 300 znaków, retencja 30 dni (pg_cron `okienko-log-30d`).
- `config.toml`: `[functions.okienko] verify_jwt = true`; `wymagajUsera` przez `getUser()` (podpis sprawdza GoTrue).
- Testy okienka po dopisaniu 20 pytań: blizna-64 (model), 66, 69, 72, 74, 81, 82, 93, 104 — 51/51 zielone;
  blizna-93 nadal znajduje 3 pytania akcji w ławce. Wynik pierwszych 53 pytań ławki bez zmian.
- Katalog i kalkulator: „gdzie zmienić zegarek”, „jak podłączyć garmina”, „jaki czas na półmaraton w tempie 5:30”
  odpowiadają za 0 tokenów i bez wyjścia poza Supabase.
