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

⚠️ **iOS — NIEZWERYFIKOWANE NA URZĄDZENIU.** Safari potrafi otworzyć plik w karcie zamiast zapisać go do Zdjęć. Przy wykryciu iOS pokazujemy podpowiedź „przytrzymaj obraz i wybierz Zapisz obraz". Detekcja steruje **wyłącznie tekstem** — błędne trafienie kosztuje jedną zbędną linijkę, nie działanie.

## Reguła: odstępy mierzy się po TUSZU, nie po pudełkach

**Odstępy między elementami mierzyć po ZASIĘGU TUSZU w wyrenderowanej karcie, nie po pudełkach tekstowych.** Bebas ma wewnętrzny odstęp — tusz podpisu zaczyna się 13 px poniżej górnej krawędzi pudełka. Liczenie z rozmiaru fontu zaniża odstępy i prowadzi do poprawek, które **przenoszą problem zamiast go usuwać**.

Przykład z życia (6/8): zgłosiłem „bohater i podpis dzieli 5 px" na podstawie arytmetyki pudełek (bohater kończy się na 970, podpis zaczyna na 975). Pomiar tuszu w PNG pokazał **17 px**. Poprawka wyliczona z błędnej liczby przeniosłaby ciasnotę z góry na dół, bo między dolną krawędzią bohatera a statystykami jest stałe 52 px tuszu do rozdania.

Realne odstępy w portrecie (bohater 820, podpis 975, statystyki 1050): tożsamość→bohater **44**, bohater→podpis **17**, podpis→statystyki **35**, jednostki→stopka **14**.

## Zaległości

**⚠️ BLOKUJE `tydzien` (K4): detekcja tygodniowa liczy niedomknięty tydzień.** `detectVolume` i `detectTop5Tygodni` ogłaszają wynik, który jeszcze rośnie — a karta zamraża liczbę, która nie była ostateczna, i idzie na Instagram. Gorzej: `suma_km` siedzi w `evidence`, czyli w kluczu dedupu, więc **każdy dołożony log tworzy nowy moment tego samego tygodnia**. Dowód: Martyna Strzeszyńska, 2026-07-05 — pięć pendingów jednego tygodnia (74,39 → 79,39 → 84,39 → 89,39 → 110,01 km). Przy `dystans` ten sam błąd naprawiono, wynosząc żywą sumę poza `evidence`.

Kierunki: detekcja po zamknięciu tygodnia · albo moment w trakcie, ale karta z domkniętego tygodnia · plus wyniesienie `suma_km` i `slupki` do `payload`. Naprawa evidence odpali wszystkie dotychczasowe wolumeny ponownie — rozegrać razem z decyzją o oknie.

**⚠️ Berlin u Kevina — moment `dystans` nie idzie dalej.** Zgłoszone 6/8: Kevin ma moment „Berlin", choć według sumy rocznej powinien być już w Amsterdamie. Hipoteza (NIEsprawdzona): niezatwierdzony `pending` blokuje kolejny próg, bo dedup patrzy także na oczekujące. **Nie zgadywać — sprawdzić przy K4**, gdzie i tak wracamy do dedupu i evidence.

**Audyt `elevation_gain`** — 46% wypełnienia, jeden zawodnik z 64 m/km. Przed jakąkolwiek kartą przewyższeniową.

**Baner nie mówi, co niesie** — zawsze „Nowy moment!". Przy kolejce myli nawet nas.

## Kolejność etapów

| etap | zakres | status |
|---|---|---|
| K1 | EF: rozgałęzienie trybów + `kamien` + `pb` | ✅ LIVE |
| K2 | detektor `kamien` w silniku + redeploy | ✅ LIVE |
| K3 | dostarczenie: baner → karta, guard | ✅ LIVE |
| K5 | kadrownik: siatka, ruchliwość, układ portretowy | ✅ LIVE (1–3) |
| K4 | `tydzien` + `miesiac` | TODO, `tydzien` zablokowany |

## Na później, nie teraz

**Rok w BiegaMy** — grudniowe podsumowanie w stylu Wrapped. Najbardziej udostępnialny format, jaki istnieje, i raz w roku, więc rzadkość maksymalna. Osobna robota, ale warto mieć w głowie przy planowaniu grudnia.
