# Karty BiegaMy — system rodzajów

> **Status na 2026-08-06.** Dokument opisuje stan faktyczny, nie pierwotny pomysł:
> gdzie decyzja zmieniła się w trakcie budowy, jest tu wersja obowiązująca.
>
> ## ⚠️ Liczby NIEZWERYFIKOWANE — do kalibracji
> Po sweepie 22 teł × 2 układy (2026-08-06) została **jedna** taka pozycja:
> 1. **próg ruchliwości `RUCH_PROG = 10`** — skalibrowany na bibliotece i na dwóch
>    już przyciemnionych zdjęciach użytkownika; surowych kadrów wciąż brak.
>    Kadrownik loguje pomiar do konsoli — wrócić do tej liczby po kilku zdjęciach.
>
> Stopy scrimu portretowego, progi jasności w portrecie i próg odmowy 38 są już
> **zmierzone** — patrz sekcja o układzie portretowym.
>
> Liczby zweryfikowane pomiarem są w tym dokumencie oznaczone „(zmierzone)".

## Zasada nadrzędna

Pięć rodzajów kart to **nie pięć generatorów**. Jeden szkielet, pięć wypełnień.

Wspólne i nietykalne: płótno 1080×1350, logo, blok tożsamości, tło (biblioteka m/k/n + własne zdjęcie), scrim, stopka, dobór po płci i porze roku, cache po kluczu, autoryzacja, whitelist hosta.

Różni się **wyłącznie trójka**: bohater, podpis, statystyki.

Jeśli kolejny rodzaj wymaga zmiany czegoś poza tą trójką — to znak, że projekt jest zły, nie że potrzebny wyjątek.

## Rodzaje

| rodzaj | bohater | podpis | kiedy | bramka trenera | status |
|---|---|---|---|---|---|
| `trening` | dystans biegu | typ treningu | zawsze, na żądanie | nie dotyczy | **LIVE** |
| `kamien` | suma narastająca | nazwa progu | Silnik wykrył próg | tak | **LIVE** |
| `pb` | nowy czas | dystans | Silnik wykrył `pb` | tak | **LIVE** |
| `miesiac` | suma miesiąca | miesiąc i rok | 1. dnia miesiąca, cron | **nie** | TODO (K4) |
| `tydzien` | suma tygodnia | „rekordowy tydzień" | Silnik wykrył `wolumen` | tak | TODO (K4, **zablokowany**) |

**Tygodniowa karta powstaje TYLKO przy rekordzie.** Pięćdziesiąt dwie karty rocznie to tapeta. Rzadkość jest funkcją, nie efektem ubocznym.

### Statystyki per rodzaj

**`trening`** — do 4 kolumn, siatka warunkowa:
```
CZAS 40:28 (4:02 /km) · ŚR. TĘTNO 148 · PRZEWYŻ. 87 m · KALORIE 712
```

**`kamien`** — kontekst drogi, nie momentu:
```
OD 12 mar 2025 · AKTYWNOŚCI 87 · W RUCHU 94 h
```
Etykieta brzmi **AKTYWNOŚCI**, nie „TRENINGÓW", i liczy **wszystkie** aktywności: przy progu liczonym z samych biegów para „1000 KM / 87 TRENINGÓW" dawałaby 11,5 km na trening, czyli liczbę, która się nie zgadza, gdy część to rower.

**`pb`** — porównanie ze starym wynikiem:
```
POPRZEDNI 1:32:18 · ZYSK 2:14 (szybciej) · TEMPO 4:15 /km
```
Kolumna nazywa się **ZYSK**, nie „POPRAWA", i nie ma minusa — karta jest o osiągnięciu. Poniżej minuty wartość to `42 SEK`, od minuty `2:14`; jednostka brzmi `szybciej` w obu wariantach. Tempo liczone z dystansu **kanonicznego**, bo podpis mówi „PÓŁMARATON".

**`miesiac`** — 4 kolumny:
```
TRENINGÓW 18 · NAJDŁUŻSZY 32,1 km · W RUCHU 21 h · vs LIPIEC +18%
```

**`tydzien`** — rekord potrzebuje punktu odniesienia:
```
TRENINGÓW 6 · NAJDŁUŻSZY 24,0 km · POPRZEDNI REKORD 78 km
```

### Progi kamieni

Oś wspólna z odznakami — **jedna drabina, nie dwie**:

| kategoria | progi |
|---|---|
| kilometry | 500 · 1 000 · 2 000 · 5 000 |
| godziny | 100 · 250 · 500 · 1 000 |
| pierwszy raz | półmaraton · maraton |

Nie ma: 10 km (93% ludzi już ma), przewyższenia (czeka na audyt `elevation_gain` — 46% wypełnienia, jeden zawodnik z 64 m/km), serii 100 dni (rekord bazy to 30).

Progi liczone **wyłącznie z biegów** (`isRunType`), od pierwszego logu w BiegaMy.

**Próg to PRZEJŚCIE, nie stan:** `sumaPrzed < próg <= sumaTotal`. Nikt nie dostaje lawiny za progi minięte dawno; kto ma dziś 1121 km, nigdy nie dostanie „pierwszego tysiąca". Zaległych progów świadomie nie nadrabiamy — odznaki są kolekcją, karta jest wydarzeniem, a wydarzenia się nie odgrzewa.

**„Pierwszy raz" to PRZEDZIAŁ, nie próg od dołu (zmierzone na self-teście):** półmaraton `[21,0975; 23,1)`, maraton `[42,195; 44,2)`. Bieg na 30 km pokonuje dystans półmaratonu, ale nim nie jest — bez górnej granicy karta mówiłaby „PIERWSZY PÓŁMARATON" nad bohaterem „30,0 KM". Dół ścisły, bo GPS na certyfikowanej trasie mierzy raczej za dużo.

**Bramka świeżości** dotyczy wyłącznie „pierwszego razu": log starszy niż 30 dni nie odpala (paczka z zegarka potrafi kończyć się maratonem sprzed lat). Liczona względem `snap.dzis` — **nie** `snap.today`, które w EF jest zawsze datą samego newLoga.

### Kontrakt `evidence` (klucz dedupu — kształt zamrożony)

```
kamien   { kategoria: 'km'|'godziny'|'pierwszy', prog: string }
kamien   { kategoria: 'pierwszy', prog: 'half'|'marathon', dystans_km: number }  // dystans RZECZYWISTY
pb       { dystans, nowy_czas, stary_czas, delta }
```
`prog` zawsze string, `dystans_km` zaokrąglony do 2 miejsc. **Zmiana kształtu = ponowne odpalenie wszystkich kamieni.** Wartości żywe (sumy, liczniki) idą do `payload`, nigdy do `evidence`.

## API i klucze cache

```
POST { log_id }     → karta treningu
POST { moment_id }  → karta momentu (kamien | pb | tydzien | miesiac)
```

Klient podaje **sam identyfikator**. Przy kształcie `{typ, prog}` dowolny zawodnik wyprodukowałby sobie kartę „5000 KM" z naszym logo.

⚠️ EF chodzi po `service_role`, czyli **omija RLS** — stąd jawny warunek: właściciel dostaje wyłącznie momenty `approved`, trener każdy status (jego podgląd). Bez tego zawodnik obszedłby bramkę trenera.

```
share-cards/{log_id}.png                              trening, tło z biblioteki
share-cards/{log_id}-{hash8}.png                      trening, własne tło = ZAWSZE PORTRET
share-cards/kamien-{athlete_id}-{kategoria}-{prog}.png
share-cards/pb-{athlete_id}-{dystans}-{czas_sekundy}.png
share-cards/miesiac-{athlete_id}-{rrrr-mm}.png        (TODO)
share-cards/tydzien-{athlete_id}-{rrrr-Www}.png       (TODO)
```

**Wszystkie niezmienne z definicji — to decyzja, nie przeoczenie.** Tysiąc kilometrów osiąga się raz, sierpień 2026 też. Log dodany wstecz nie przerysuje wydanej karty: karta to zdjęcie momentu, nie żywy raport.

Własne tło dla kart innych niż `trening`: **nie w tej rundzie.** Kamień milowy dotyczy setek treningów, nie jednego — nie ma naturalnego zdjęcia do podpięcia.

## Dostarczenie

Wszystko poza `trening` i `miesiac` idzie normalną ścieżką `delivered_moments` z bramką trenera. Żelazna zasada Silnika zostaje — rozwidlenie dla jednego typu to dwie ścieżki do utrzymania.

`miesiac` bez bramki: to podsumowanie własnych danych, nie osiągnięcie do zatwierdzenia. Trafia do `delivered_moments` od razu jako `approved`, żeby reużyć istniejącej pętli (baner, `shown_at`, dedup), a nie budować drugiego kanału.

**Karta jest zawsze propozycją.** Powiadomienie mówi „zobacz kartę", zawodnik decyduje, czy ją udostępni.

⚠️ **`kamien` NIE trafia do `_MOMENT_ANIMOWANE`** — nie ma renderera animacji, a wpisanie go tam dałoby baner, który po kliknięciu nic nie robi. Idzie osobną gałęzią „baner → karta"; `shown_at` przy **zamknięciu** podglądu, nie przy otwarciu.

⚠️ **Guard banera pyta „czy nakładka się otworzyła", nie „czy znam typ".** `_silnikPokazAnimacje` poddaje się także przy ZNANYM typie z niekompletnym payloadem (`top5` bez `ranking`, `wolumen` bez `slupki`) — bez overlaya `onClose` nigdy nie leci, `shown_at` zostaje null i baner wraca w kółko. Obie awarie łapie jeden warunek.

## Kadrownik — siatka bezpieczna (**LIVE**)

Problem realny: człowiek kadruje na oko, twarz albo medal ląduje dokładnie pod liczbami.

**Ramka wokół zdjęcia to zła odpowiedź.** Zdjęcie zmniejsza się o połowę, karta przestaje wyglądać jak moment, a zaczyna jak certyfikat. Pełnoekranowe tło jest tym, co odróżnia dobrą kartę od arkusza danych.

**Właściwa odpowiedź: pokazać człowiekowi, gdzie stanie tekst.** Nakładka na płótnie kadrownika: ramka `rgba(232,86,30,0.5)`, wypełnienie `rgba(0,0,0,0.25)`, podpis „trzymaj twarze poza polami".

Strefy (współrzędne płótna 1080×1350, skalowane do podglądu):

| strefa | x | y | szer. | wys. | mierzona |
|---|---|---|---|---|---|
| logo | 60 | 100 | 360 | 130 | tak |
| tożsamość | 60 | 340 | 580 | 130 | tak |
| bohater | 60 | 490 | 640 | 310 | tak |
| statystyki | 60 | 890 | 960 | 200 | **nie** |
| stopka | 0 | 1145 | 1080 | 205 | **nie** |

„Mierzona" = wchodzi do pomiaru jasności i eskalacji przyciemnienia. Statystyki i stopka są **pokazywane, ale nie mierzone** — poszerzenie pomiaru zmieniłoby dobór przyciemnienia dla całej biblioteki teł.

⚠️ **Siatka rysowana wyłącznie na płótnie kadrownika, nigdy w pliku.** Obraz do wgrania powstaje osobną ścieżką, która o siatce nie wie. To ta sama zasada, którą złamał kiedyś podwójny scrim: **co służy do patrzenia, nie może trafić do renderu.**

### Podpowiedź o szczegółach (**LIVE**)

Sama jasność nie wystarcza — ciemna twarz przechodzi próg 38, a i tak ginie pod liczbami. Dodatkowo mierzymy **ruchliwość obrazu**: średni moduł gradientu (różnica sąsiednich pikseli, poziomo i pionowo) na luminancji BT.709.

- ruchliwość > **18** ⚠️*(niezweryfikowane)* w strefie bohatera albo tożsamości
  → podpowiedź: „W polu liczb jest dużo szczegółu. Przesuń zdjęcie, żeby twarz trafiła w wolne miejsce."
- to **podpowiedź, nie blokada** — człowiek może zignorować.

Mierzona na **pełnej rozdzielczości** (próg opisuje piksele karty, nie podglądu) i na **surowym kadrze**, przed przyciemnieniem: przyciemnienie tłumi gradienty, ale nie usuwa twarzy. Liczona po geście, z debounce 150 ms.

**Odmowa nadal wyłącznie po jasności** (próg 38 w strefie tożsamości, zmierzone). Blokujemy nieczytelność, nie kompozycję.

## Układ portretowy — drugi wariant (**LIVE**)

Dla zdjęć, które są o człowieku, nie o krajobrazie. Zdjęcie **nadal pełnoekranowe** — zmienia się tylko rozmieszczenie treści.

**Układu się NIE wybiera — wynika ze źródła tła** (decyzja Filipa 6/8):

| tło | układ |
|---|---|
| `card_bg_url` niepuste (własne zdjęcie) | **portret** |
| biblioteka m/k/n | **standard** |
| karty momentów (`kamien`, `pb`, …) | **standard** — nie mają własnego tła |

Uzasadnienie: własne zdjęcie jest z założenia o człowieku, a biblioteka to kadry dobrane pod układ standardowy. Dzięki temu **klucz cache nie potrzebuje sufiksu**: `{log_id}-{hash8}.png` JEST portretem z definicji, a `{log_id}.png` standardem. Kadrownik obsługuje wyłącznie własne zdjęcia, więc mierzy ZAWSZE strefy portretowe — w `sb.js` nie ma drugiego zestawu, bo byłby martwym kodem przy strefach pomiarowych.

### Geometria (**poprawiona względem pierwotnego specu**)

Wersja pierwotna była **wewnętrznie sprzeczna**: bohater na `y=880` przy 150 px zajmuje 880..1030, a podpis stał na `y=925`, czyli w środku bohatera; statystyki 980..1130 nachodziły na to samo. Układu nie dało się wyrenderować. Poniżej wersja obowiązująca.

| element | standardowy | portretowy |
|---|---|---|
| logo | y=105 | bez zmian |
| **czysta strefa** | — | **y=250..790** |
| imię | y=348 | y=700 |
| meta | y=402 | y=745 |
| miasto | y=440 | y=780 |
| bohater | y=500, 210 px | **y=805, 150 px** |
| podpis | y=770 | **y=975** |
| statystyki | y=890..1090 | **y=1040..1160** |
| stopka | y=1145, h=205 | **y=1180, h=170** |

Statystyki w portretowym: etykieta 20 px, wartość 52 px, jednostka 22 px. **Zawsze 3 kolumny** — przy wartości 52 px czwarta kolumna zostawia na etykietę 190 px, a „PRZEWYŻSZENIE" ma w 20 px 174 px, czyli mieściłoby się o 16 px. To granica błędu, nie zapas.

Czysta strefa urosła przy okazji z 250..660 do **250..790** — portret jest przez to bardziej portretowy niż w pierwotnym zamyśle.

⚠️ **Szerokość kolumny to 294 px, nie 312** (zmierzone). Skok między kolumnami wynosi 312, ale granicą jest divider, 294 px za początkiem tekstu.

### Scrim portretowy (**zmierzone**)

```
y=0     rgba(7,7,10,0.30)
y=300   rgba(7,7,10,0.10)
y=600   rgba(7,7,10,0.14)
y=780   rgba(7,7,10,0.72)
y=1350  rgba(7,7,10,0.82)
```

Sweep 22 teł × 2 układy potwierdził stopy bez zmian — **22/22 poniżej progu 38**:

| strefa | standard (mediana / max) | portret (mediana / max) |
|---|---|---|
| logo | 9,3 / 15,6 | **12,5 / 28,2** |
| tożsamość | 20,3 / 30,2 | 14,4 / 23,5 |
| bohater | 18,7 / 36,1 | 13,0 / 17,5 |
| statystyki | 13,7 / 21,0 | 8,6 / 11,4 |

Góra kadru celowo jaśnieje (0,76 → 0,30), bo o to w tym układzie chodzi — zdjęcie ma być widoczne tam, gdzie stoi człowiek. Kosztem jest **zapas logo, który spada z 22 do 10 punktów**. Dla biblioteki bezpieczne; przy jasnym zdjęciu użytkownika broni pomiar per układ, bo `logo` jest strefą **mierzoną** w obu układach i eskalacja sama je dociśnie. Obserwacja, nie usterka.

Gradient od lewej bez zmian (adaptacyjny, obsługuje logo w rogu).

### Strefy zależne od układu — najważniejszy wniosek ze sweepu

**Nie próg był zły, tylko miejsce pomiaru.** Na tym samym zdjęciu:

```
strefa tożsamości STANDARDOWA (y 340..470)  →  65,3
strefa tożsamości PORTRETOWA  (y 690..820)  →  44,4
```

Dwadzieścia jeden punktów różnicy przy progu 38. Kadrownik mierzący stale po strefach standardowych przepuściłby kadr nieczytelny na karcie portretowej — albo odmówił poprawnego.

Stąd **`UKLADY` w `sb.js`: jeden zestaw stref na układ, zasilający POMIAR jasności, ESKALACJĘ przyciemnienia, ODMOWĘ i SIATKĘ w kadrowniku.** Gdyby siatka pokazywała inne pola niż te, po których mierzymy, wracamy do tego samego problemu innymi drzwiami.

Próg odmowy zostaje **38** (zmierzone) — w portrecie tożsamość jest średnio **ciemniejsza** niż w standardzie.

### Próg podpowiedzi o szczegółach (**skalibrowany**)

`RUCH_PROG = 10`, wcześniej 18. Osiemnastka nie odpaliłaby nigdy:

| co zmierzone | wartość |
|---|---|
| strefy tekstu w 22 tłach | 0,65 – **8,26** |
| najbardziej szczegółowy fragment 640×310 gdziekolwiek w kadrze | max **15,18** |
| realne zdjęcia użytkownika (`card-bg`) | 0,93 – **6,38** |

Dziesiątka leży między biblioteką a maksimum. ⚠️ Zdjęcia użytkownika mierzone w `card-bg` są **już przyciemnione**, a przyciemnienie tłumi gradienty — surowe kadry dadzą więcej. Kadrownik loguje wyliczoną wartość do konsoli (`[kadr] ruchliwość …`); po kilku prawdziwych zdjęciach wrócić do tej liczby z danymi.

### Podgląd rysuje scrim

Kadrownik pokazuje **scrim aktywnego układu**, nie samo zdjęcie. Bez tego przełącznik układu przesuwałby tylko ramki, a wybór byłby w ciemno. Kadrowanie robi się przez to trudniejsze — świadomy koszt: **uczciwość podglądu bije wygodę kadrowania**. Gdyby okazało się nie do pracy, rozważyć przełącznik „pokaż bez przyciemnienia" jako świadome odstępstwo, nie jako domyślną ścieżkę.

⚠️ Scrim i siatka żyją **wyłącznie na płótnie podglądu**. Plik do wgrania powstaje osobną ścieżką, która o obu nie wie. Rozjazd pomiaru z renderem ugryzł nas raz (podwójny scrim: klient wypalał w pliku to, co EF dokładał ponownie).

### Znany przypadek brzegowy: tło przyciemnione pod inny układ

Własne zdjęcie jest przyciemniane **pod układ aktywny w chwili kadrowania** — eskalacja mierzy strefy tego układu i wypala gradient bazowy w pliku. Jeśli ktoś skadruje w portrecie, a następnie wygeneruje kartę standardową, przyciemnienie będzie dobrane pod niewłaściwe strefy i karta może wyjść za jasna w pasie tożsamości.

Naturalny przepływ (kadruję → generuję w tej samej sesji) tego nie dotyka, bo wybór jedzie z kadrownika do renderu w `_stan.uklad`. **Akceptowane świadomie.** Domknięcie wymagałoby utrwalenia układu przy logu (kolumna `card_layout` + kolumnowy GRANT) — wrócić przy K4 albo przy pierwszej skardze.

## Awatar w stopce (**LIVE**)

Kółko z awatarem (albo inicjałem) **nie stoi już przy imieniu** — siedzi w stopce, w wolnej przestrzeni między logotypem a `#biegamyrazem`. Blok tożsamości przez to zaczyna się od lewego marginesu (x=74 zamiast x=214) i jest szerszy oraz czystszy.

Pomiary stopki (**zmierzone**, DM Sans na realnym foncie):

| co | wartość |
|---|---|
| blok lewy (logo 200 px, hasło 325 px) kończy się na | x = 399 |
| blok prawy (`#biegamyrazem` 248 px) zaczyna się na | x = 760 |
| **wolna przestrzeń** | **361 px** |
| awatar 100 px, standard (pas 205 px) | y 1198..1298, margines 52 px |
| awatar 100 px, portret (pas 170 px) | y 1215..1315, margines 35 px |

Awatar 100 px na `x=530` ma po ~130 px z każdej strony i **nie ściska tagline'u**.

⚠️ **Bez `avatar_url` nie rysujemy nic** — stopka wraca wówczas do układu bez awatara. Przy imieniu kółko z inicjałem miało sens, bo tłumaczyło się sąsiedztwem; samotne w stopce czyta się jak placeholder. Decyzja po oglądzie obu wariantów, nie z założenia.

⚠️ Awatar dorysowywany jest **jako ostatni, po pasie stopki** — pas jest półprzezroczysty (`rgba(232,86,30,0.12)`), więc narysowany po awatarze przebarwiłby go na pomarańczowo.

## Podgląd karty — przyciski (**LIVE**)

```
[Zamknij]  [Zapisz]  [Zmień tło]
[      Udostępnij ↗ (pełna szerokość)      ]
```

**Dwa rzędy, nie cztery przyciski w jednym.** Zmierzone (DM Mono 10 px, `letter-spacing:0.14em`, padding 2×16): ZAMKNIJ 84 + ZAPISZ 76 + ZMIEŃ TŁO 99 + UDOSTĘPNIJ 121 plus odstępy ≈ **410 px**, a na iPhonie zostaje 350 (390 minus padding nakładki), na SE 335. Poleganie na `flex-wrap` dałoby układ 3+1 zależny od szerokości ekranu; drugi rząd jest jawny, a akcja główna dostaje pełną szerokość pod kciukiem.

⚠️ **`btn-sm` nie istnieje w CSS żadnej ze stron** — przyciski renderują się w pełnym rozmiarze `.btn`, mimo że kod od początku prosi o mały wariant. Zaległość kosmetyczna; pomiary wyżej zakładają stan faktyczny, czyli pełny rozmiar.

**Zapis pobiera BLOB, nie adres w Storage.** Atrybut `download` jest ignorowany przy zasobie z innego origin — przeglądarka otwiera plik zamiast go zapisać. Blob jest same-origin, więc nazwa pliku i zapis działają wszędzie tam, gdzie w ogóle działają. Ten sam kod obsługuje przycisk „Zapisz" i awaryjną ścieżkę „Udostępnij", gdy przeglądarka nie ma Web Share dla plików.

**Stan weryfikacji zapisu:**

| platforma | stan |
|---|---|
| desktop | ✅ potwierdzone (Filip, 7/8) |
| Android | ✅ potwierdzone (Filip, 7/8) |
| **iOS** | ⚠️ **OTWARTE — niezweryfikowane** |

⚠️ **iOS pozostaje otwarty, nie „działający".** Safari potrafi otworzyć plik w karcie zamiast zapisać go do Zdjęć. Przy wykryciu iOS pokazujemy podpowiedź „przytrzymaj obraz i wybierz Zapisz obraz" — **podpowiedź zostaje niezależnie od wyniku weryfikacji**, bo długie przytrzymanie działa na iOS zawsze, także gdy zapis się powiedzie. Detekcja steruje **wyłącznie tekstem**: błędne trafienie kosztuje jedną zbędną linijkę, nie działanie.

Do domknięcia potrzebny jeden test na iPhonie: kliknąć „Zapisz" i sprawdzić, czy plik trafia do Zdjęć, czy otwiera się w karcie.

## Reguła: odstępy mierzy się po TUSZU, nie po pudełkach

**Wartości ZAAKCEPTOWANE WZROKOWO 2026-08-07 (nie „domyślne" — wybrane po oglądzie renderu):**
- **podpis w portrecie zostaje na `975`** (odstępy tuszu 17 px nad, 35 px pod). Rozważane i **odrzucone**: 984 (26/26) oraz 990 (32/20). Nie wracać do nich bez nowego powodu — to wymiana, nie poprawa: między dolną krawędzią bohatera a statystykami jest stałe 52 px tuszu do rozdania.
- **podgląd w kadrowniku zostaje ciemny** (rysuje scrim aktywnego układu). Kadrowanie jest przez to trudniejsze — świadomy koszt, potwierdzony w pracy: uczciwość podglądu bije wygodę kadrowania.

**Odstępy między elementami mierzyć po ZASIĘGU TUSZU w wyrenderowanej karcie, nie po pudełkach tekstowych.** Bebas ma wewnętrzny odstęp — tusz podpisu zaczyna się 13 px poniżej górnej krawędzi pudełka. Liczenie z rozmiaru fontu zaniża odstępy i prowadzi do poprawek, które **przenoszą problem zamiast go usuwać**.

Przykład z życia (6/8): zgłosiłem „bohater i podpis dzieli 5 px" na podstawie arytmetyki pudełek (bohater kończy się na 970, podpis zaczyna na 975). Pomiar tuszu w PNG pokazał **17 px**. Poprawka wyliczona z błędnej liczby przeniosłaby ciasnotę z góry na dół, bo między dolną krawędzią bohatera a statystykami jest stałe 52 px tuszu do rozdania.

Realne odstępy w portrecie (bohater 820, podpis 975, statystyki 1050): tożsamość→bohater **44**, bohater→podpis **17**, podpis→statystyki **35**, jednostki→stopka **14**.

## RUN_TYPES — trzy kopie, bramka i propozycja wyjścia

Lista typów biegowych żyje w **trzech** plikach:

| # | plik | do czego |
|---|---|---|
| 1 | `sb.js` | `window.RUN_TYPES` — sumy km w kliencie, `isRunType` |
| 2 | `js/silnik-momentu.js` | `RUN_TYPES` w silniku + inline w EF `detect-moment` |
| 3 | `supabase/migrations/*_suma_biegowa.sql` | funkcja SQL zasilająca karty (`share-card`, `miesiac-cron`) |

**BRAMKA po każdej zmianie listy** — polecenie, nie zasada:

```bash
python tools/sprawdz-run-types.py     # kod 0 = zgodne, 1 = rozjazd
```

⚠️ Pierwsza wersja tej bramki (`grep -c "wybieganie"` na trzech plikach) **była błędna** — `grep -c` liczy LINIE zawierające słowo, więc dawała trzy różne liczby (7 / 1 / 2) i nie mówiła nic o zawartości listy. Skrypt wyciąga zbiory typów z każdego pliku i porównuje je po znormalizowaniu; zwraca kod 1 przy rozjeździe, więc nadaje się do CI. Trzecia kopia jest akceptowalna, **czwarta nie będzie** (decyzja Filipa 7/8).

**ZALEGŁOŚĆ — propozycja wyjścia:** wynieść listę do jednego pliku (np. `js/run-types.js`) i **inlinować ją przy buildzie w obu EF-ach**, tak jak `tools/build-ef.js` wstawia silnik do `detect-moment`. Klient ładuje ten plik zwykłym `<script>`. Koszt: `share-card` przestaje być edytowalny ręcznie i staje się artefaktem generowanym — a na tym wzorcu sparzyliśmy się raz (template `detect-moment` rozjechał się z prodem na miesiąc). Stąd propozycja, nie wykonanie.

## Zaległości

**✅ ZAMKNIĘTE 8/8 — detekcja tygodniowa liczyła niedomknięty tydzień.** `suma_km` siedziała w `evidence`, więc każdy dołożony log tworzył nowy moment tego samego tygodnia (Martyna Strzeszyńska, 2026-07-05: pięć pendingów, 74,39 → 110,01 km). Rozwiązanie: `evidence` skrócone do `{tydzien}`, żywe liczby do `payload`, a **karta przelicza sumę z `training_logs`**, nie bierze jej z payloadu. Detekcja zostaje w trakcie tygodnia (baner od razu), ale przycisk „Zobacz kartę" jest nieaktywny do poniedziałku. Okno miesięczne w `detectVolume` usunięte.

**✅ ZAMKNIĘTE 8/8 — Berlin u Kevina.** Sprawdzone, nie jest błędem: Kevin ma 778,4 km, próg Amsterdamu to 846. Hipoteza o blokującym pendingu — obalona.

**✅ ZAMKNIĘTE 8/8 — kilometry niebiegowe w `wolumen` i `top5`.** Oba detektory sumowały rower i siłownię. Filtr `is_run === false` dołożony osobnym commitem przed K4; trzy zatwierdzone `top5` przestawione na `rejected`, jeden `wolumen` skasowany (kryterium DELETE: niepokazany + z naprawianego błędu + okres jeszcze trwa — wszystkie trzy naraz).

**Znana krawędź: „miesiąc bez biegów po fakcie".** Moment miesięczny powstaje, gdy w miesiącu był przynajmniej jeden bieg. Gdyby ktoś później skasował wszystkie logi z tamtego miesiąca, karta zwróci 422 i baner domknie się po cichu — bez błędu, ale i bez karty. Uznane za poprawne: lepszy brak karty niż karta z zerami. To samo dotyczy karty tygodniowej.

**Audyt `elevation_gain`** — 46% wypełnienia, jeden zawodnik z 64 m/km. Przed jakąkolwiek kartą przewyższeniową.

**Baner nie mówi, co niesie** — zawsze „Nowy moment!". Przy kolejce myli nawet nas.

## Kolejność etapów

| etap | zakres | status |
|---|---|---|
| K1 | EF: rozgałęzienie trybów + `kamien` + `pb` | ✅ LIVE |
| K2 | detektor `kamien` w silniku + redeploy | ✅ LIVE |
| K3 | dostarczenie: baner → karta, guard | ✅ LIVE |
| K5 | kadrownik: siatka, ruchliwość, układ portretowy | ✅ **DOMKNIĘTE** (1–3, zaakceptowane wzrokowo 7/8) |
| K4 | `tydzien` + `miesiac` | ✅ LIVE (8/8), cron `0 4 1 * *` czeka na 1 września |

## Na później, nie teraz

**Rok w BiegaMy** — grudniowe podsumowanie w stylu Wrapped. Najbardziej udostępnialny format, jaki istnieje, i raz w roku, więc rzadkość maksymalna. Osobna robota, ale warto mieć w głowie przy planowaniu grudnia.

### Wariant „dane" karty treningu — **po wrześniu**

Dziś karta treningu ma jeden wariant: **moment** — bohater, podpis, trzy liczby na fotografii. Wariant **dane** byłby drugą stroną tej samej karty: **wykres tętna i profil wysokości**, czyli to, co biegacz chce pokazać, gdy trening był ciekawy przebiegiem, a nie wynikiem.

**Powód: sygnał popytu, nie hipoteza.** Kevin Mrotek — wasz zawodnik — wrzucił 8 sierpnia kartę wygenerowaną w **innej aplikacji**, właśnie z wykresami tętna i wysokości. Ktoś, kto ma nasze karty, sięgnął po cudze, żeby pokazać przebieg. To mocniejsza przesłanka niż jakikolwiek pomysł z naszej strony.

**Warunki (ustalone 8/8):**

- **Tylko dla logów z `external_source='intervals'`.** Zmierzone tego dnia: **940 z 1934** wpisów, czyli **49%**. Reszta nie ma przebiegów — wariant jest wtedy **niedostępny**, nie pusty. Nigdy nie pokazujemy wykresu bez danych.
- **Wykres tętna wyłącznie przy `hr_public = true`.** Profil wysokości bez tego warunku — wysokość nie jest daną medyczną.
  ⚠️ **Zanim ktokolwiek napisze ten wariant: `docs/zaleglosci-bezpieczenstwo.md` → `raw_data` trzyma pełne tętno.** Cache w bazie **nie jest** przefiltrowany przez `stripHr` — filtr działa tylko na wyjściu EF-a, a karta chodzi po `service_role` i go omija. Bramka i lista pól do wyczyszczenia są w tamtym pliku.
- **Dane są, nie trzeba ich dowozić.** `intervals-activity-detail` pobiera z intervals.icu strumienie `heartrate, altitude, velocity_smooth, distance, cadence, temp, respiration` i zapisuje je do `intervals_activities.raw_data` jako `series` — **spróbkowane do ~200 punktów** (`TARGET = 200`, kubełek min. 50 m) plus `splits` per kilometr. 200 punktów to dokładnie rozdzielczość, jakiej potrzebuje wykres 1080 px szerokości. Powiązanie: `intervals_activities.linked_training_log_id → training_logs.id`.
- **Bez nowej technologii.** Wykres to `<svg>` z `<polyline>` — Satori renderuje SVG natywnie, tak samo jak dzisiejsze ikony. Zero nowych bibliotek, zero wpływu na cold start.

**Dlaczego nie teraz:** to **ulepszenie rzeczy, która działa**, a Tier 0 ma jeszcze pozycje, których **nie ma wcale** — stronę „Trenerzy" i generator planu. Do mistrzostw świata półtora miesiąca. Wraca do rozmowy po wrześniu.

## Format kart: JPEG q92 (**LIVE 8/8**)

Karty wychodzą jako **JPEG q92, ~240 KB** zamiast PNG ~1,42 MB — **5,9× mniej**. Klucze wszystkich pięciu rodzajów kończą się na `.jpg`.

Ścieżka: `new Resvg(svg).render()` → `.pixels` (surowe RGBA) → enkoder JPEG. **`asPng()` zniknęło ze ścieżki całkowicie** — nie kodujemy PNG po to, żeby go zaraz dekodować.

**Zmierzone przed decyzją:** q92 = 17–18% wagi PNG, PSNR 43,2 dB w całości i 43,1 dB w pasie bohatera (biały Bebas 150–210 px na fotografii, czyli najgorszy przypadek dla JPEG). Średni błąd 1,8/255, maksymalny 26/255. Mapa różnicy ×8 pokazuje błąd na konturach liter — dzwonienie jest, ale o amplitudzie ~4/255 na czarnym tle. Alfa na kartach to 255 na całej powierzchni, więc brak kanału alfa nic nie kosztuje.

**Cold start — zmierzony A/B na tych samych logach w tej samej sesji**, bo liczby sprzed tygodnia pochodziły z nieznanych warunków:

| | zimny (2 próby) | ciepły (4 próby) |
|---|---|---|
| PNG (stary kod) | 4,01 · 3,94 s | średnio 2,16 s |
| JPEG (nowy kod) | 3,51 · 3,22 s | średnio 2,17 s |

**Zimny szybszy o ~0,6 s, ciepły bez różnicy.** Zysk bierze się z tego, że enkodowanie PNG 1080×1350 było droższe niż JPEG.

**⚠️ Enkoder importowany wąsko.** `imagescript/mod.ts` kompiluje przy imporcie komplet wasm-ów (svg 1044 + font 206 + tiff 185 + png 101 + jpeg 89 + gif 57 + zlib 45 = 1727 KB), bo instancjonowanie jest na najwyższym poziomie modułu. Bierzemy sam `utils/wasm/jpeg.js` — 89 KB. Sprawdzone: wynik **bajt w bajt** identyczny z `Image.encodeJPEG(92)`. To API wewnętrzne, URL przypięty do 1.2.15, droga odwrotu opisana w komentarzu w EF-ie.

**⚠️ MINA, która wysadziła wdrożenie:** bucket `share-cards` miał `allowed_mime_types = {image/png}`. Po zmianie formatu **render działał, a upload odbijał się od bucketu** — EF zwracał 500 „zapis karty padł", co wygląda na błąd generatora i prowadzi diagnozę w złą stronę. Naprawione migracją `20260808120000_share_cards_mime_jpeg.sql`. Lista jest celowo jednoelementowa: **powrót do PNG wymaga zmiany także tej migracji**.

**Skasowane przy okazji:** 33 stare PNG-i (26 pierwotnych + 7 z pomiaru A/B), 45,8 MB. Nic nie trzymało ich URL-i, pełniły wyłącznie rolę cache'u renderu.

### ⚠️ `curl -I` KŁAMIE o `Cache-Control` na Supabase Storage

Zgłosiłem tu najpierw zaległość: „karty wychodzą z `Cache-Control: no-cache` mimo `cacheControl: 31536000` przy uploadzie". **To był artefakt metody pomiaru, nie problem.** Cache działa poprawnie od początku.

```
curl -I  (HEAD)  →  Cache-Control: no-cache               ← nieprawda
curl -D- (GET)   →  Cache-Control: public, max-age=31536000   ← prawda
```

Metadane w bazie potwierdzają: `storage.objects.metadata->>'cacheControl' = max-age=31536000` na każdej karcie. To samo na `share-assets` (`max-age=3600` ustawione przez `storage cp`) — HEAD mówi `no-cache`, GET mówi prawdę. Drugie pobranie tej samej karty daje `CF-Cache-Status: HIT`, czyli CDN też ją trzyma.

**Reguła: nagłówków cache'u na Supabase Storage NIE sprawdza się przez `curl -I`.** Przeglądarki robią GET, więc dostają rok cache'u — mierz tak samo. To ten sam gatunek błędu co „curl nie robi preflightu" przy weryfikacji CORS w EF-ach.
