# Przegląd „świeże oko" B — kalendarz startów, projekt „jednej listy" (2.11.2026)

> Recenzja projektu `docs/kalendarz-jedna-lista-projekt.md` wobec kodu w repo na `main` (`03bcb0a`). Tylko odczyt.
> Kolektor (loader 014, K-API 017, 018) żyje w osobnym repo `biegamy-collector` — tu są wyłącznie jego odwołania
> (`docs/okienko-spec.md:118-123, 297-303`, komentarze w `sb.js`, `js/wyniki-api.js`, `impreza-zglos/zglos.mjs`).
> Wszystko, co dotyczy wnętrza maszyny (liczby wierszy, klucz dedupu po stronie SQL, limit serwera, obsługa odwołanych),
> oznaczam „nie do ustalenia z repo". Liczby „263 / 216 / 2 z 7" w projekcie pochodzą z `Downloads\kalendarz-mapa.csv`
> i bazy — też poza repo.

## Co jest dziś

1. **Dwa źródła, dwie listy, jedna strona.** `races.html` pokazuje tabelę `races` (nasze zawody: `loadRaces`, :712 —
   `date >= dziś`, zawodnik tylko `approved`, trener wszystko) jako `.race-card` z okładką 21:9, podziałką miesięcy i
   zapisem „Wezmę udział". Pod nią sekcja `#imprezy-sekcja` „W Polsce" (:424, K4 z 1.11): same wiersze tekstowe
   `.imprezy-wiersz` (:644-654), własne przyciski okresu 30/90/365 i własna szukajka (350 ms).
2. **Źródło maszyny = `window.IMPREZY` w `sb.js:403-508`**: lista okresu → RPC `upcoming_races {p_from,p_to,lim:300}`,
   szukanie ≥ 3 znaki → `events_search {p_q,p_from,p_to,p_limit:20}` (K-API 017). Pamięć 1 h w `sessionStorage`
   (klucz `imprezy:<okres>|<q>`), błędy nie wchodzą do pamięci. `mapuj` (:421-430) normalizuje wiersz do
   `{nazwa, data, dokladnosc, miejscowosc, dystanse[], url, status, klucz}`; `klucz` tylko gdy pasuje do
   `^(kalendarz|biegamy|wyniki|zgloszenie):…` (:420).
3. **`js/wyniki-api.js`** to jedyny klient `https://api.biegamy.run` (F6): biała lista 11 RPC (`upcoming_races`,
   `events_search`, `event_hide`, `search_runners`, `runner_results`, `erasure_*`…; `event_propose` świadomie poza listą),
   token tylko w nagłówku, `cache:'no-store'`, timeout 15 s, tylko środowisko prod, 401 → jeden refresh. Flaga
   `WYNIKI_API_WLACZONE = true` od 1.11 (pilnuje blizna-53).
4. **Tabela `races`** (z kodu i `supabase/schema/rls/races.txt`): `name, date, city, voivodeship|region, distance_km`
   (JEDEN dystans na wiersz), `url_regulamin, url_organizer, description, status` (pending/approved/rejected), `added_by,
   signup_count, created_at, cover_url, cover_9x16_url`. Brak: daty końcowej, typu/nawierzchni, statusu „odwołane",
   powiązania z kluczem maszyny. RLS: wszyscy zalogowani czytają `approved`, własne pending, trener wszystko.
5. **Dedup istnieje w trzech kopiach**: `sb.js:468` (data ±1 + `tylkoLitery(nazwa)`), `sb.js:433 toSamo` (to samo,
   `bezCyfr` jest tu martwym opakowaniem — `tylkoLitery` i tak wycina cyfry), okienko `impreza.mjs:50` (dodatkowo wycina
   liczebniki rzymskie jako słowa), a po stronie F6 `event_propose` „data ±1 + nazwa bez cyfr" (spec, nie repo).
6. **Okładki naszych zawodów**: EF `race-image` (Gemini `gemini-nano-banana-2.1`, Interactions API) woła trener przy
   zatwierdzeniu/insercie fire-and-forget i przyciskiem „Nowa okładka" (`force`). Bramki w kolejności: sesja → `coaches`
   → `race_id` → `approved` → idempotencja per wariant → klucz Gemini. Wynik skalowany do ≤ 1200 px, JPEG q80 (~200 KB),
   bucket publiczny `race-covers`, zapis tylko `service_role`, `cover_url` zawsze z `?v=` (SW cache-first po pełnym URL).
7. **K5 (1.11, na main `7a34956`)**: cel startowy w `zawodnik.html` podpowiada ≤ 5 imprez z `events_search`, wiąże
   `race_goals[].impreza_klucz`, brakującą zgłasza przez EF `impreza-zglos` → `event_propose` (5/dobę, biała lista 3 pól).
   Zgłoszenie widać OD RAZU ze statusem `zgloszona` i etykietą; trener ukrywa (`event_hide`, tylko `zgloszenie:<uuid>`).
8. **Okienko** używa tego samego kalendarza przez adapter `okienko/kalendarz.mjs` (`RPC_KALENDARZA = "events_search"`,
   gałąź `upcoming_races` jako droga wycofania) i własny klient `f6.mjs` (8 s, pamięć 10 min w izolacie).
9. **Testy**: blizna-77 (K4: wywołania, pamięć, dedup, awaria, linki), blizna-87 (K5), blizna-53 (lista RPC),
   blizna-74/89 (okienko). CI `testy.yml` uruchamia `node --test tests/*.test.js` (116 plików).
10. **Już po projekcie wszedł kod**: `tools/kalendarz/generuj-zaslepki.mjs` (`96945f7`, 2.11 16:19) — 5 typów
    (ulica, ulica-noc, trail, ultra, przelaj), prompt BEZ nazwy i miasta. Zdanie „ZERO kodu" w nagłówku projektu jest
    więc nieaktualne; katalog `assets/kalendarz/` jeszcze nie istnieje (w repo `assets/` ma tylko `modele, odznaki, ui`).
11. **Potwierdzony błąd z projektu**: `races.html:702-704` — `imprezyStart()` (który od razu woła `imprezyLaduj`) rusza
    PRZED `await loadRaces()`, więc przy pierwszym wejściu `_allRaces` jest puste i dedup nic nie usuwa. Nic nie
    przerysowuje sekcji po `loadRaces`.
12. **Pamięć projektu vs repo**: K-API 017 = `events_search`, 018 = `event_propose/event_hide` (zgodne). Hero w dniu
    startu to wariant **9:16** (decyzja 31.10, `okladki-zawodow-spec.md`, EF `a65b275`), nie „4:5" jak w notatce.
    „54 100 wpisów" — nie do ustalenia z repo. Lista domen `_shared/zrodla-wynikow.mjs` NIE zawiera `superczas.pl`,
    choć notatka z 31.10 mówi o gotowym kolektorze superczas (drobiazg poza tematem, do spisu zaległości).

## Co projekt zmienia

- Jedna chronologiczna lista obu źródeł w `#races-list`, wspólny model w nowym `js/kalendarz-lista.mjs` (bez
  import/export, jak `akcja.mjs` — żeby EF i testy mogły go czytać), ładowanie równoległe (naprawa wyścigu), jedna reguła
  dedupu zamiast trzech, „nasza wygrywa" i dziedziczy `klucz`.
- Sortowanie po dacie, nasze pierwsze przy remisie, imprezy z dokładnością miesiąca na końcu miesiąca.
- Ta sama `.race-card` dla obu (etykieta „kalendarz biegów w Polsce"), filtry główne działają na obu, znikają
  30/90/365 i osobna szukajka maszyny; dystans chowa 97% imprez maszyny z linią „N bez dystansu".
- Grafiki: 5 zaślepek wg typu (Gemini, lokalnie — już jest narzędzie) + okładki per impreza generowane z kolejki
  (`imprezy_okladki`, `imprezy_okladki_kolejka`, RPC zgłoszenia z klienta, cron raz na dobę → EF `imprezy-okladki`,
  30/dobę, tylko 21:9), klucz bez roku `bezZnakow(nazwa)|normalizuj(miasto)`, ≈ $7,3 jednorazowo + $1,7/rok.
- Decyzje Filipa: OK na L1–L4 po 8.11, nordic pokazujemy, mapa miasto→województwo, tylko 21:9, limit 30/dobę.

## Luki

1. **Kolejka okładek = prompt od zawodnika.** Projekt mówi „klient po renderze zgłasza klucze bez okładki" i „nie
   potrzeba poświadczeń do maszyny po stronie serwera". Ale EF musi mieć NAZWĘ, miasto, datę i typ, żeby zbudować prompt
   — bez konta serwisowego do F6 może je dostać tylko OD KLIENTA, w wierszu kolejki. To odwraca zasadę z `race-image`
   („Wejście NIE niesie niczego do promptu", index.ts:13): każdy zalogowany mógłby wstawić dowolny tekst do promptu
   Gemini, a obraz trafi do publicznego bucketu. Limit 30/dobę ogranicza koszt (≈ $1/dobę), nie treść. Trzeba wybrać:
   (a) EF czyta dane imprezy sam (konto serwisowe F6 albo własna kopia listy), (b) kolejkę zasila tylko trener,
   (c) generowanie lokalne narzędziem Filipa (patrz „Co uprościć").
2. **Zgłoszenia `zgloszona` dostaną kartę i okładkę.** Zgłoszenie zawodnika jest widoczne od razu (decyzja K5).
   W jednej liście stanie się pełnoprawną kartą (z zaślepką, a w L4 z okładką z Gemini z nazwy, którą ktoś właśnie
   wpisał), odróżnialną tylko małą etykietą. Projekt nie mówi, czy `zgloszona` wchodzi do kolejki okładek. Proponuję:
   do kolejki tylko `status` null/`potwierdzona`; na karcie `zgloszona` wyłącznie zaślepka.
3. **Kilka dystansów jednej imprezy.** `races.distance_km` to jedna liczba; maszyna ma `dystanse[]` (≤ 6). „Nasza
   wygrywa" przy scaleniu gubi pozostałe dystanse maszyny (nasz „5 km" zamiast „5, 10, 21"). Model wspólny ma
   `dystanse[]` — scalenie powinno robić sumę zbiorów, nie wybór.
4. **Imprezy wielodniowe / festiwale.** Nigdzie nie ma daty końcowej. Dedup ±1 dzień scali DWA dni tego samego
   festiwalu (sobota 10 km, niedziela maraton) w jedną kartę, gdy nazwy są równe. Czy kolektor daje je jako jeden
   wiersz czy dwa — nie do ustalenia z repo. Przed L1 policzyć w CSV pary „ta sama nazwa, daty sąsiednie".
5. **Odwołane i przeniesione.** `races.status` nie zna „odwołane"; po stronie maszyny notatka mówi „odwołane
   pomijane" (nie do ustalenia z repo). Przeniesienie terminu: `klucz` maszyny jest stały, ale nasz dedup idzie po dacie
   → po zmianie daty u organizatora impreza pokaże się DWA razy (nasza stara data + maszyna nowa). Lekarstwo trwałe:
   kolumna `races.impreza_klucz` (jak `race_goals[].impreza_klucz` w K5) — dedup po kluczu, heurystyka tylko dla biegów
   sprzed wdrożenia.
6. **Dzień „dziś" liczony dwojako.** `loadRaces` filtruje `date >= new Date().toISOString().slice(0,10)` (dzień UTC,
   :715; to samo `f-date.min` :1623), a `IMPREZY.dzien()` używa dnia lokalnego (sb.js:407). Między 00:00 a 01:00/02:00
   czasu polskiego nasze wczorajsze zawody są jeszcze „nadchodzące", maszyny już nie. W jednej liście to będzie widać:
   ujednolicić na `dzien()` z lokalną strefą (daty są bez godziny, innego problemu stref nie ma).
7. **Zagraniczne.** Maszyna z definicji „w Polsce"; nasze `races` mogą być za granicą (miasto wolny tekst, województwo
   puste) — każdy filtr województwa je chowa (dziś też). Etykieta „kalendarz biegów w Polsce" na kartach maszyny jest OK;
   dla naszych zagranicznych nic nie trzeba, ale warto to zapisać jako świadome.
8. **Bez daty.** `races` wymaga daty w formularzu; `mapuj` odrzuca wiersze bez `data` (sb.js:463). Takie imprezy nie
   istnieją dla listy i nikt tego nie liczy — do zapisania jako reguła, nie luka.
9. **Dokładność miesiąca ginie w szukaniu.** `events_search` zwraca `dokladnosc_daty` = null (spec :123), a `mapuj`
   domyślnie daje `'dzien'` (sb.js:427). Ta sama impreza w liście okresu ma „listopad 2026", a po wpisaniu 3 znaków —
   „1 lis 2026" (fałszywa precyzja) i sortuje się na początek miesiąca. Projekt sortuje `miesiac` na koniec, ale nie
   zauważa, że po szukaniu tej informacji nie ma. Najprościej: szukać po stronie klienta w już pobranej liście (niżej).
10. **Co się dzieje po tapnięciu karty maszyny.** Dziś wiersz nie reaguje; `openRace(id)` szuka w `_allRaces`
    (:1166). Projekt opisuje kartę, ale nie akcję. Najcenniejsza brakująca akcja: **„Ustaw jako cel"** — K5 już umie
    powiązać cel kluczem (`goalPickImpreza`), więc to jedyna rzecz, która łączy kalendarz z treningiem. Dla trenera:
    „Dodaj do naszych" z wypełnionym formularzem — to zarazem zamyka lukę 5 (klucz trafia do `races`).
11. **Licznik w hero** (`races-hero-najblizsze`, :384-404) liczy wyłącznie `_allRaces` — przy 40 kartach w 30 dni
    pokaże „3 starty w 30 dni". Zdecydować: liczyć scaloną listę czy podpisać „nasze".
12. **Zaślepki pod `assets/kalendarz/*.webp` nie zadziałają jak zaplanowano.** `safeUrlAttr` (sb.js:1243) przepuszcza
    tylko hosty z `_isSafeMediaUrl` (:1147): Supabase, `filipjanczak1989-png.github.io`, tenor, giphy — własnego originu
    nie ma. Regex zasobów statycznych SW (sw.js:257) nie zna `.webp`, więc offline by ich nie było. Rozwiązanie zgodne
    z resztą grafik (banery, kadry, ikony): pliki w `biegamy-assets`, adres przez `assetUrl()`, cache SW `isAssetsImage`.
13. **Trener nie zobaczy kolizji z maszyną.** `renderTegoDnia` (:1295) sprawdza propozycje tylko wobec `_allRaces`.
    Tania wygrana: dołożyć imprezy maszyny tego dnia („jest już w kalendarzu w Polsce").

## Duplikaty

- **Klucze dziś**: `tylkoLitery` = małe litery, bez diakrytyków, tylko `a–z` (cyfry, kropki, spacje wycięte). Dwie
  pary z siedmiu to wynik tej reguły (poza repo). Okienko dodatkowo wycina liczebniki rzymskie jako słowa
  (`impreza.mjs:50`); `sb.js` NIE — „VI Nocny Bieg Nyski" ≠ „Nocny Bieg Nyski". To realna różnica: polskie imprezy
  numerują edycje rzymsko równie często jak arabsko.
- **Projekt osłabia normalizację, nie wzmacnia.** Pkt 2.3 i 3.1 mówią `BM_TEKST.bezZnakow(nazwa)`, a `bezZnakow`
  ZOSTAWIA cyfry, kropki i spacje → „12. poznanski bieg" ≠ „13. poznanski bieg" ≠ „poznanski bieg". Wtedy klucz bez
  roku NIE scali kolejnych edycji, a „81% imprez ma poprzednią edycję" (liczone „nazwa bez numerów") nie przełoży się na
  ponowne użycie grafik. Potrzebna jedna funkcja `kluczNazwy` = `tylkoLitery` + wycięcie liczebników rzymskich na
  początku/końcu, użyta w dedupie, w kluczu bez roku i (po stronie EF, przez import `../../../js/`) w okładkach.
- **„Zawieranie ≥ 10 liter" — odradzam w v1.** Zysk niezmierzony (dziś równość daje 2/7), a ryzyko konkretne:
  11.11 i ±1 dzień to dziesiątki „Biegów Niepodległości" w różnych miastach, `biegniepodleglosci` zawiera się w każdym.
  Zabezpieczeniem ma być miasto — i tu druga pułapka: porównanie miast wymaga tej samej normalizacji i tolerancji
  dzielnic („Warszawa" vs „Warszawa-Bemowo", „Gdańsk Oliwa"). Zacząć od równości kluczy + miasto `startsWith`
  w obie strony; zawieranie dołożyć dopiero po pomiarze fałszywych scaleń na pełnym oknie.
- **Trzy kopie reguły → jedna**: projekt słusznie przenosi ją do modułu; trzeba też przepiąć `toSamo` (używane przez
  modale celu w `zawodnik.html:3722`, `profil.html`, `kalendarz.html`) i okienko, inaczej zostaną dwie kopie z różnym
  traktowaniem rzymskich. Reguła po stronie F6 (`event_propose`) pozostanie czwartą — osobny runtime, jak
  `klucz_szukania` pilnowany przez blizna-79; wart analogicznego testu „5 przykładów przepisanych z bazy".
- **Docelowo bez heurystyki**: `races.impreza_klucz` ustawiany przy „Dodaj do naszych" i przy zatwierdzaniu propozycji
  (trener widzi podpowiedź z maszyny) — wtedy dedup to równość klucza, a heurystyka obsługuje tylko stare wiersze.

## Sortowanie

- Dziś nasze: `order('date')` bez drugiego klucza (:716) — przy tej samej dacie kolejność z Postgresa jest
  nieokreślona i może się zmieniać między wejściami. Maszyna: kolejność z API, bez scalania.
- Projekt: data rosnąco, nasze pierwsze przy remisie, `miesiac` na koniec miesiąca z podpisem. Brakuje: (a) trzeciego
  klucza (nazwa po `kluczNazwy`) dla stabilności, (b) wartości `data` przy dokładności miesiąca — jeśli maszyna daje
  `YYYY-MM-01` (nie do ustalenia z repo), moduł musi to wiedzieć, żeby „koniec miesiąca" nie zależał od przypadku,
  (c) zachowania po szukaniu (luka 9).
- Przeszłe: lista zaczyna się od dziś w obu źródłach (`p_from = dzień`), dzisiejsze zawody są widoczne — OK.
  Pending trenera na górze — bez zmian, OK.

## Filtry

- **Jest (nasze)**: województwo (podciąg w `voivodeship+region+city`, :997-1000), miesiąc (12 naprzód), zakres dat,
  dystans (jeden chip, ±0,2 km, ultra > 42,195, „Inne"), szukajka po nazwie+mieście bez diakrytyków. **Jest (maszyna)**:
  okres 30/90/365, szukajka przez `events_search` (rdzenie po stronie bazy, max 20 wyników).
- **Nie przeżywają odświeżenia** — potwierdzone: w `races.html` brak `URLSearchParams`, `location.hash`,
  `history.*State`, a `localStorage` trzyma tylko motyw i `bm_races_friends_seen`. Po wdrożeniu jednej listy (300
  kart) to zacznie boleć: człowiek ustawi „małopolskie + półmaraton", wejdzie w link organizatora, wróci — i ma
  wszystko od nowa. Tanio: stan filtrów w `sessionStorage` albo w `#hash`.
- **Dystans przy `dystanse[]`**: dopasowanie „którykolwiek z listy"; „Inne" = żaden ze standardowych; linia „N bez
  dystansu" z projektu jest dobra. Uwaga: chip jest dziś pojedynczy mimo komentarza „multi-select" (:335).
- **Dwie semantyki szukania w jednej liście**: nasze — podciąg po nazwie+mieście w pamięci; maszyna — rdzenie po
  stronie bazy, 20 wyników, bez `dokladnosc`. Skoro lista okresu i tak ma wszystkie wiersze okna (do 300), szukajka
  może działać po stronie klienta na scalonej tablicy: jedna semantyka, zero dodatkowych wywołań, bez limitu 20,
  bez luki 9. `events_search` zostaje dla podpowiedzi w modalach celu (tam zakres jest „od dziś, bez końca").
- **Limit 300 z 12-miesięcznym oknem domyślnym**: dziś 263 (dolna granica, endpoint dokłada dwa źródła) — w sezonie
  wiosennym 12 miesięcy prawie na pewno przekroczy 300 i lista zostanie ucięta na „pierwszych 300" (których? kolejność
  serwera — nie do ustalenia z repo). Domyślne okno 90 dni mieści się z zapasem; „rok" na żądanie, albo prosić kolektor
  o stronicowanie (notatka mówi o „50/strona, filtry od/do/q/strona" — kontrakt nie do ustalenia z repo, kod używa
  `lim: 300`, blizna-77 to asertuje).
- **Województwo dla maszyny**: decyzja „mapa miasto→województwo". Najmniejsza wersja: linia „N imprez z kalendarza bez
  województwa" (ten sam wzorzec co dystans) i mapa dla ~200 największych miast + `races.voivodeship`; pełny TERYT/SIMC
  to dziesiątki tysięcy miejscowości i nie powinien jechać do przeglądarki. Jedno miejsce prawdy to kolektor (SQL,
  statyczne dane) — jeśli F6 może oddać `wojewodztwo` w `upcoming_races`, to lepsze niż mapa w JS.
- **Czego brakuje i nie ma skąd wziąć**: typ nawierzchni / typ biegu (żadna tabela nie ma kolumny; reguła po nazwie
  z projektu służy tylko grafikom), odległość od domu (`athletes.lat_lon` istnieje po migracji 20260822, ale maszyna ma
  tylko nazwy miast — bez geokodowania nie ma czego liczyć).

## Koszty

- **Zapytania na wejście (dziś, zawodnik)**: `getSession`, `athletes`, `coaches`, `races`, `friendships`,
  `race_signups` (własne), `races` (pending) = 6 REST + 1 wywołanie F6 (`upcoming_races`, w pamięci sesji 1 h).
  Trener: + `athletes` (zgłaszający), `race_signups` (in), `athletes` (in) = do 9 REST. Projekt nie zmienia tej liczby;
  L3 dokłada odczyt `imprezy_okladki` i ewentualny insert kolejki.
- **Odczyt okładek dla 263 kluczy**: `in('klucz_bez_roku', [...263])` to ~16 KB w URL-u (klucz ≈ 60 znaków) — ryzyko
  414 na bramce. Tabela będzie mieć kilkaset wierszy: czytać całą (jeden SELECT bez filtra) albo RPC z tablicą (POST).
- **Rozmiar odpowiedzi**: 300 wierszy `upcoming_races` to rząd 100 KB JSON (szacunek, nie pomiar). 300 kart HTML
  — niegroźne. **Groźne są obrazy**: nasze okładki ważą 180–245 KB (zmierzone, spec), przy 263 kartach z własną okładką
  to ~50 MB na przewinięcie rocznej listy, a cache `${CACHE_VERSION}-storage` jest „świadomie bez limitu" przy
  założeniu ~6 biegów (spec: ~1,4 MB). Z 5 zaślepkami: ~1 MB raz. To najmocniejszy argument, żeby okładki per impreza
  były krokiem osobnym i mierzonym, a jeśli wejdą — w mniejszym wymiarze dla kart (np. 800 px, ~80 KB).
- **Gemini**: 216 × $0,034 = $7,34 jednorazowo, ~51/rok × $0,034 = $1,73, zaślepki $0,17 — arytmetyka się zgadza.
  Regeneracje trenera po $0,034. Odpowiedź Gemini ma ~5,3 MB (3,7 MB podpis myślenia) — 30 sztuk w jednym wywołaniu
  EF to ~160 MB przez pamięć funkcji i 30 × 20–30 s = 10–15 min czasu ściennego. Limit czasu wykonania EF Supabase
  to rząd pojedynczych minut (wartości nie ma w repo) — pojedyncze wywołanie cron „30 po kolei" prawie na pewno się
  utnie. Trzeba dzielić: cron co godzinę po 2–3, albo osobne wywołanie na klucz.
- **Odmowa / brak obrazu**: `race-image` zwraca 502 i nic nie zapisuje; przy kolejce klucz bez licznika prób wróci
  jutro i pojutrze — koszt i szum bez końca. Wiersz kolejki potrzebuje `proby` i stanu „poddane" (zaślepka na stałe).

## Grafiki Gemini

- **Jak**: `race-image/index.ts` — prompt v2 z `zbudujPrompt` (forma, dystans, miasto ≤ 60, nazwa ≤ 80, pora roku,
  sceneria trail/park/miasto z reguły po nazwie i dystansie, noc z `/nocn|night/`, kadr 1–2 biegaczy od tyłu, zakaz
  tłumu, tekstu, twarzy, logotypów). Model `gemini-nano-banana-2.1` po A/B (3-pro dawał „znaczki przypominające logo").
  Synchronicznie, 19–30 s, na żądanie (approve/insert/„Nowa okładka"), nie hurtem; backfill 31.10 = 6 obrazów.
- **Gdzie**: bucket publiczny `race-covers` (5 MB, mime png/jpeg/webp, zero polityk zapisu — tylko `service_role`),
  obiekt `race-<id>` bez rozszerzenia, `upsert`, `cacheControl` rok, URL w `races.cover_url` z `?v=`.
- **Fallback**: nasze bez okładki = brak obrazka (bez placeholdera, decyzja spec). Projekt dla maszyny daje zaślepkę
  wg typu — i słusznie; warto tę samą zaślepkę dać także naszym biegom bez okładki (dziś 69 przeszłych ich nie ma, ale
  nowe przed wygenerowaniem też), inaczej jedna lista będzie miała karty z obrazem i bez.
- **Niestosowne / cudze logo**: prompt zakazuje, ale nikt nie sprawdza wyniku — przegląd ludzki jest tylko dla 5
  zaślepek (podgląd do Downloads). Nazwa imprezy w prompcie to realny kanał: nazwy sponsorskie („PKO…", „Orlen…",
  „… Nike") zapraszają markę do kadru; nazwy wpisane przez ludzi (`zgloszona`, luka 2) i nazwy z kolejki od klienta
  (luka 1) to kanał sterowany. Dla imprez maszyny prompt powinien wyglądać jak w `generuj-zaslepki.mjs` — typ + miasto +
  pora roku, BEZ nazwy (projekt mówi „nazwa tylko jako inspiracja", ale to wciąż wejście do modelu). Mechanizm naprawy
  po fakcie: „Nowa okładka" trenera (projekt L4) — trzeba jeszcze zdecydować, czy zawodnik może zgłosić złą okładkę.
- **Reguła typu w dwóch kopiach**: `race-image` zna 3 scenerie + noc, `generuj-zaslepki` ma 5 typów, projekt dokłada
  „regułę z listą wyjątków" (CITY TRAIL ≠ góry). To trzecia kopia tej samej decyzji w repo, które ma bramki właśnie na
  rozjazdy kopii. Jedna funkcja `typImprezy(nazwa, dystanse)` w `js/kalendarz-lista.mjs`, importowana przez EF (wzorzec
  `okienko → js/tekst.mjs`), używana przez zaślepki, okładki i kartę.
- **Koszt na imprezę**: $0,034 (1K 21:9); 2K niezmierzone i niepotrzebne (tylko 21:9). Klucz z Free Tier dawał 429
  — billing włączony 31.10 (spec). `jpeg.wasm` z deno.land przy każdym cold starcie to znana zaległość (awaria
  deno.land = EF nie wstaje) — kolejka dzienna zwiększa liczbę cold startów.

## Co uprościć

1. **Wyścig ładowania** to jedna linia: `imprezyLaduj()` na końcu `loadRaces()` (także po `submitRace`), bo pamięć
   sesji trzyma listę PRZED dedupem (sb.js:463-464) — ponowny render nie kosztuje zapytania. `Promise.all` z projektu
   nie jest potrzebne; `loadRaces` i tak jest łańcuchem 4 oczekiwań (races → znajomi → awatary → render).
2. **Szukanie po stronie klienta** na scalonej tablicy; `events_search` tylko dla podpowiedzi celu. Mniej wywołań,
   jedna semantyka, bez limitu 20 i bez luki z dokładnością miesiąca.
3. **Dedup: równość + miasto**, bez „zawierania ≥ 10 liter" do czasu pomiaru.
4. **Województwo: linia „N bez województwa"** w v1, mapa (albo kolumna z kolektora) w v2.
5. **L3 + L4 (tabela + kolejka + RPC + cron + EF + przycisk) za $7 obrazów to pięć ruchomych części** i jeden nowy
   kanał promptu od klienta. Prostsza droga tej samej wartości: narzędzie lokalne `tools/kalendarz/generuj-okladki.mjs`
   na wzór `generuj-zaslepki.mjs` — Filip raz w miesiącu: pobiera okno (własnym tokenem, jak dziś CSV), generuje dla
   nowych kluczy (tylko potwierdzone), wgrywa do `race-covers`, zapisuje manifest `imprezy-okladki.json` do
   `biegamy-assets`; klient czyta jeden plik (cache SW jak obrazy). Zero nowych tabel, RPC i cronów, zero promptów od
   użytkowników, przegląd wizualny przed wgraniem. Automatyzację robić dopiero, gdy ręczny krok zacznie przeszkadzać.
6. **Najpierw same zaślepki.** Karta z zaślepką wygląda tak samo jak z okładką (projekt pkt 3.3). Tydzień–dwa z 5
   plikami pokaże, czy ktokolwiek przewija poza nasze 7 kart — zanim wyda się $7 i 50 MB transferu na użytkownika.
7. **Jedna reguła typu** (pkt wyżej) zamiast trzech.
8. **Karta maszyny z akcją**: „Ustaw jako cel" (K5 już to umie) i dla trenera „Dodaj do naszych" — to tańsze niż
   okładki i daje więcej.

## Kolejność po 8.11

| krok | co | ryzyko | zmierzyć PRZED |
|---|---|---|---|
| **1. Moduł + naprawa wyścigu** (1 dzień, bez bazy, bez zmiany wyglądu) | `js/kalendarz-lista.mjs`: model, `kluczNazwy` (z rzymskimi), dedup równość+miasto, sort z trzema kluczami, `typImprezy`; przepięcie `toSamo`, `szukaj`, okienka; `imprezyLaduj()` po `loadRaces`; dzień lokalny w `loadRaces`; testy (nowa blizna) | regres dedupu w modalach celu (blizna-87/89 muszą zostać zielone); zmiana klucza może rozpiąć porównania w okienku (blizna-74) | na CSV okna: pary dubli regułą obecną vs z rzymskimi; pary „ta sama nazwa, daty sąsiednie" (festiwale); czy `data` przy `miesiac` to zawsze 1. dzień |
| **2. Jedna lista + zaślepki** (2–3 dni, bez bazy) | 5 zaślepek w `biegamy-assets` przez `assetUrl()`; jedna `.race-card` z etykietą źródła i tapnięciem → arkusz z linkami, dystansami, „Ustaw jako cel"; filtry na obu, linie „N bez dystansu/województwa"; szukanie klienckie; usunięcie 30/90/365; stan filtrów w `sessionStorage`; licznik hero rozstrzygnięty | ucięcie 300 w sezonie (domyślnie 90 dni, „rok" na żądanie); render 300 kart na słabym Androidzie; `onclick` z kluczem — użyć `data-*` | ile wierszy daje `upcoming_races` dla 12 mies. (z maszyny); czas renderu 300 kart i rozmiar odpowiedzi; wygląd zaślepek po przeglądzie Filipa |
| **3. Województwo + trener** (1 dzień) | mapa miasto→woj. (największe miasta + `races.voivodeship`) albo kolumna z F6; „Dodaj do naszych" z `races.impreza_klucz` (migracja: jedna kolumna tekstowa, bez grantów); `renderTegoDnia` widzi maszynę | mapa niepełna → imprezy „znikają" z województwa; migracja = bramka-commit | liczba unikalnych miast w oknie i pokrycie mapy (CSV); czy F6 może oddać województwo |
| **4. Okładki per impreza, hurtem lokalnie** (po 1–2 tyg. obserwacji) | `generuj-okladki.mjs`: tylko potwierdzone, prompt bez nazwy, 800 px dla kart, manifest JSON w `biegamy-assets`, licznik prób; przegląd próbki | 50 MB transferu przy przewijaniu; cache storage bez limitu; obrazy nieprzejrzane | odsetek odmów Gemini na 20 próbach; wielkość pliku po skalowaniu; czy ludzie przewijają poza nasze karty (dziś brak pomiaru wejść na `races.html` — nie do ustalenia z repo; wystarczy prosty licznik w `okienko_log`-podobnej tabeli albo pytanie Maćka/Kasi) |
| **5. Automatyzacja** (tylko jeśli 4 się przyjmie) | tabela + cron co godzinę po 2–3 + EF, 30/dobę, dane imprezy pobierane przez EF (konto serwisowe F6 albo kopia listy), nigdy z klienta | limit czasu EF; cold start z deno.land; koszt bez sufitu przy błędzie pętli | limit czasu EF na prod (jedno wywołanie z 3 obrazami); czas i pamięć przy 5 MB odpowiedzi |

## Sprawdziłem i jest OK

- Błąd wyścigu opisany w projekcie jest prawdziwy (`races.html:702-704`), a pamięć sesji trzyma listę przed dedupem,
  więc naprawa jest tania.
- `js/wyniki-api.js`: biała lista RPC zgodna z blizna-53, `event_propose` poza listą, token tylko w nagłówku,
  `credentials:'omit'`, `cache:'no-store'`, 15 s, tylko prod; SW nie przechwytuje `api.biegamy.run` (żadna gałąź
  `fetch` w sw.js:200-250 nie pasuje → sieć).
- `race-image`: trener sprawdzany PRZED odczytem biegu i przed Gemini; idempotencja per wariant; `?v=` na URL;
  bucket bez polityk zapisu (asercja w migracji `20261101_race_cover.sql`); `verify_jwt = true` w `config.toml`.
  Wzorzec EF z crona istnieje (`miesiac-cron`, `verify_jwt=false` + `x-push-secret` z Vault) — L4/5 ma z czego kopiować.
- `generuj-zaslepki.mjs`: ten sam model i parametry co EF, prompt bez nazwy i miasta (brak kanału sterowania),
  wynik lokalnie do przeglądu — dobry wzór dla kroku 4.
- Linki zewnętrzne z maszyny i z propozycji: `safeExternalHref {tylkoHttps}` + `rel="noopener noreferrer"`, tekst przez
  `escapeHtml`, „Ukryj" przez `data-klucz` z wzorcem `zgloszenie:<uuid>` (blizna-77, blizna-87).
- `mapuj` odrzuca klucze spoza `RE_KLUCZ_IMPREZY` i statusy spoza `zgloszona|potwierdzona`; `impreza-zglos` wysyła do
  F6 wyłącznie 3 pola z białej listy (blizna-87, asercja na kształt ciała).
- Wzorzec „plik w `js/` bez import/export czytany przez EF" działa (okienko importuje `js/tekst.mjs`) — plan modułu
  `kalendarz-lista.mjs` ma precedens, w tym test równości z SQL maszyny (blizna-79) do powtórzenia dla `kluczNazwy`.
- Arytmetyka kosztów w projekcie (216 × $0,034 ≈ $7,3; 30/dobę → ~8 dni; 5 zaślepek ≈ $0,17) się zgadza ze stawką
  w `okladki-zawodow-spec.md`.
- Notatki pamięci zgodne z repo: K-API 017 = `events_search`, 018 = `event_propose/event_hide`, K5 na main
  (`7a34956`), okładki na main (`73ebfe7`), decyzje Filipa 2.11 w projekcie; rozbieżność tylko w „hero 4:5" (repo: 9:16).
