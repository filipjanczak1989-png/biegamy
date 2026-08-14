# Feedback — Maciej Siedlecki, 14.08.2026

Zawodnik, programista. Zarejestrował się 14.08.2026 (07:38), 440 treningów
zaimportowanych z intervals.icu. Pierwszy tester z zewnątrz, który zna się
na rzeczy — stąd feedback techniczny, nie tylko wrażeniowy.

**Status: zebrane, nic nie naprawione. Priorytety po weekendzie.**

---

## BŁĘDY (nie kosmetyka)

### 1. Import z intervals: złe typy i szczątkowe dystanse

Treningi wpadają jako **`Zastępczy`** z opisami `"Thasos Chodzenie"`,
`"Thasos Pływanie open water"`, a dystanse wynoszą **0,1 / 0,4 / 0,3 km**.
Do tego **brak szczegółów treningu siłowego z 13.08**, choć w intervals.icu
jest widoczny. Prawdopodobnie jedno źródło obu objawów.

**Co ZMIERZONE 14.08 — rozkład typów u Maćka:**
```
Spokojny    181 logów   1 005 km    <- jego BIEGI, mapują się POPRAWNIE
Zastępczy   258 logów     224 km    <- średnio 0,87 km na wpis
Pływanie      1 log                  <- OpenWaterSwim zmapowany poprawnie
```

⚠️ **258 wpisów `Zastępczy` pozostaje NIEWYJAŚNIONE.** To chodzenie
(„Poznań Chodzenie", „Thasos Chodzenie") i siła — czyli aktywności, które
faktycznie nie są bieganiem. Ale chodzenie powinno trafiać do `Spacer`
(`Walk` **jest** w `ACT_MAP`), a trafia do `Zastępczy`.

**Przyczyny NIE DA SIĘ ustalić z bazy** — patrz pozycja „Luka
w obserwowalności" niżej. Surowy `type` z API nie jest nigdzie utrwalany.
Najtańsza droga: poprosić Maćka o zrzut z intervals.icu dla jednego
spaceru — typ aktywności jest tam widoczny wprost. (Odpytanie API jego
tokenem odrzucone świadomie: nie używamy cudzego tokena do diagnozy.)

⚠️ **Dystanse 0,1–1,0 km to REALNE dystanse spacerów, nie obcięte
wartości.** Tu nie ma błędu w danych — jego spacery po prostu tyle mają.

⚠️ Co to zmienia w ocenie wagi: `Zastępczy` nie jest typem biegowym, więc
te wpisy nie wchodzą do sum km ani do licznika wyzwania — **ale sprawdzone
14.08: nikt przez to nie traci kilometrów.** W całej bazie jest jeden
kandydat na zgubiony bieg (12 km, tempo 6:18) i ma w opisie 🚴🚴🚴🚴🚴.
W oknie wyzwania 15.08–20.09: zero wpisów `Zastępczy`.
Problem jest więc **etykietą i wykresami**, nie utratą danych.

### 1b. LUKA W OBSERWOWALNOŚCI — surowy `type` nie jest nigdzie utrwalany

Wyszło przy próbie zdiagnozowania punktu 1 i jest **ważniejsze niż sam
objaw**, bo dotyczy każdego przyszłego problemu z mapowaniem.

`intervals_activities` **NIE jest magazynem surowych aktywności**. To
**cache szczegółów dla wykresów**:
- pisze do niej **wyłącznie** `intervals-activity-detail` (`:179-180`)
- wołana **na żądanie**, dla pojedynczej aktywności
- i tylko dla **DZISIEJSZEGO** treningu (`zawodnik.html:6620` odrzuca
  wszystko, czego `logged_at` != dzisiejszy klucz daty)

`intervals-sync` i `intervals-webhook` **nie dotykają jej ani razu** —
zapisują wyłącznie do `training_logs`.

Zmierzone 14.08:
```
intervals_activities:  250 wierszy · 14 zawodników · od 29.06.2026
Maciej w tej tabeli :    5 wierszy  <- przy 440 logach w training_logs
```

**Skutek: po imporcie nie da się odtworzyć, jaki `type` przyszedł z API.**
Mapowanie jest jednokierunkowe i bezśladowe — wpada `Zastępczy` i tyle
wiadomo. Każdy przyszły problem z `ACT_MAP` będzie tak samo
niediagnozowalny, dopóki tego nie zmienimy.

⚠️ To ta sama klasa co **„bramki czytają repo, nie bazę"**: narzędzie
wygląda, jakby dawało wgląd, a daje go dla innej populacji, niż się
zakłada. Propozycja naprawy z wyceną — w backlogu październikowym.

### 2. Migotanie ekranu

„Chwilami mi ekran miga" — **najnowszy Android, Chrome**. Jedyna pozycja
z całej listy, która wygląda na błąd, a nie na preferencję.

Podejrzenie zgłaszającego: **View Transitions**. Do zdiagnozowania —
nie potwierdzone.

---

## UX — JEDEN WZORZEC, NIE CZTERY UWAGI

⚠️ **Nie rozbijać na osobne tickety per ekran.**

„znowu to małe" pada **cztery razy w różnych miejscach**. Do tego czcionki
jasnoszare i drobne, a grafika na „Dziś" za duża względem przycisków.

To jest **jedna decyzja projektowa**: kontrast + skala typografii,
do poprawy w `theme.css` jako SSOT, raz dla całej aplikacji.
Poprawianie punktowo per ekran da cztery niespójne łatki zamiast jednej
zmiany — i wróci przy piątym ekranie.

---

## MERYTORYCZNE

### 3. Odznaka „Letnia Forma" — pole kłamie o swojej zawartości
Pole **„ZA CO ZDOBYTA"** pokazuje **datę** (14 sierpnia 2026), a warunek
zdobycia siedzi w polu „JAK ZDOBYĆ". Etykieta powinna brzmieć
**„KIEDY ZDOBYTA"**.

### 4. Rzadkość odznak po angielsku
`COMMON`, `rare` — do spolszczenia. Aplikacja jest polska od A do Z.
(Wartości pochodzą z pola `rarity` w `BADGES`; ⚠️ lista jest w DWÓCH
kopiach — `zawodnik.html` i `odznaki.html` — więc tłumaczenie musi trafić
w obie albo, lepiej, w warstwę wyświetlania.)

### 5. Brak opcji „nie biegłem" przy logowaniu treningu

### 6. Onboarding intervals.icu niejasny
„nie jest dla mnie jasne jak połączyć" — **mimo instrukcji z czterema
zrzutami ekranu**. Skoro programista z tym utknął, instrukcja nie jest
problemem; problemem jest przepływ. Do przemyślenia od nowa.

### 7. Data urodzenia przez `prompt()`
⚠️ Znana zaległość: **`prompt()` jest blokowany w PWA bez żadnego śladu** —
człowiek klika i nic się nie dzieje. Zostało **15 wystąpień w 9 plikach**
(`profil.html` 5, `trener.html` 3, reszta po jednym), do wymiany razem
z 46 `confirm()`.

---

## DO DECYZJI FILIPA (nie do zrobienia)

### 8. Zdjęcie zamiast serduszek przy wyborze trenera
Ekran **„WYBIERZ TRENERA"** — dziś ikony serc przy Filipie i Kasi.
Propozycja: zdjęcia zamiast ikon.

### 9. Pikseloza na tłach w KALENDARZU zawodnika
⚠️ **Nie na zdjęciach trenerów** — na tłach w kalendarzu. Codziennie inny
obrazek, robione na szybko, stąd niska rozdzielczość.

Do rozważenia: podmiana na wyższą rozdzielczość **albo mniejsza liczba
lepszych teł**.

⚠️ **Uwaga na rozmiar bucketu**: `biegamy-assets` nie ma limitu, a same
awatary zajmują już **8,2 MB**. Podniesienie rozdzielczości wszystkich teł
może to zwielokrotnić. Mniej lepszych teł jest tańsze i w utrzymaniu,
i w transferze.

---

## Kolejność, gdyby trzeba było wybrać

Sugestia, nie decyzja:

1. **Import z intervals (1)** — psuje dane, nie wygląd. Treningi wpadają
   z błędnym typem i zerowym dystansem, więc znikają z sum.
2. **Migotanie (2)** — jedyny inny realny błąd, i widoczny natychmiast.
3. **Typografia i kontrast (UX)** — jedna zmiana, największy zasięg.
4. **Etykieta odznaki (3)** i **spolszczenie rzadkości (4)** — tanie, szybkie.
5. Reszta.
