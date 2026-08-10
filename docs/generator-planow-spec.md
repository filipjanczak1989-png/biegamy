# Generator planów BiegaMy — spec

## Pozycjonowanie

Generator jest **świadomie nieadaptacyjny**. Plan powstaje raz i się nie zmienia.
To nie jest ograniczenie techniczne — to granica produktu.

Komunikat wprost, na końcu każdego planu:

> Ten plan się nie dostosuje. Jeśli złapiesz kontuzję, tydzień Ci wypadnie
> albo coś przestanie działać — plan tego nie zauważy.
> Filip i Kasia zauważą.

Konkurencja (Kiprun Pacer, 500k+ pobrań) jest adaptacyjna i darmowa.
Nie wygramy z nią na funkcjach. Wygrywamy tym, że po drugiej stronie
stoją dwie realne osoby z wynikami.

## Największy błąd do uniknięcia

Najczęstsza skarga na Kiprun: **przeszacowane tempa**. Doświadczony,
ale wolny biegacz dostał pierwszą sesję 30% szybszą niż jego życiówki
— mimo że wpisał je do profilu — i już nie wrócił.

Zasada: **przy braku danych pytamy, nigdy nie zgadujemy w górę.**
Lepiej jedno pytanie więcej niż plan, który odstrasza w pierwszym tygodniu.

---

## Wejście

| pole | zalogowany | gość |
|---|---|---|
| dystans docelowy | 5 / 10 / 21,1 / 42,2 km | to samo |
| data startu | z `races` albo ręcznie | ręcznie |
| dni w tygodniu | 3–6 | 3–6 |
| poziom wyjściowy | liczony z `training_logs` | pytamy o jeden wynik |
| cel czasowy | opcjonalny | opcjonalny |

**Poziom z danych (zalogowany):**
- najlepszy wynik z ostatnich 12 miesięcy → przelicz Rieglem
- brak wyniku → średnie tempo biegów ≥5 km z ostatnich 8 tygodni + 20 s/km
- brak jednego i drugiego → pytaj jak gościa

**Objętość wyjściowa:** średnia tygodniowa z ostatnich 4 tygodni.
Gość podaje sama. Brak danych → start od 20 km/tydz.

---

## Silnik temp

Kotwica: **przewidywane tempo na 10 km (P10)**, s/km.

Z wyniku na innym dystansie — wzór Riegela:

```
T2 = T1 × (D2 / D1) ^ 1.06
```

Strefy liczone od P10:

| strefa | tempo | zastosowanie | pochodzenie |
|---|---|---|---|
| Spokojne (E) | P10 + 95 s/km | większość objętości, długie | skalibrowane (mediana 97) |
| Regeneracja | P10 + 120 s/km | osobna jednostka po mocnym akcencie | skalibrowane (mediana 122) |
| Maratońskie (M) | P10 + 25 s/km | fragmenty długich | **brak danych**, wzór wyjściowy |
| Próg (T) | P10 + 30 s/km | tempo, próg mleczanowy | skalibrowane (mediana 30) |
| Interwały (I) | P10 + 5 s/km | VO2max | ⚠️ **niezatwierdzone** — patrz niżej |
| Rytmy (R) | P10 − 30 s/km | przebieżki, akcenty | **brak danych**, wzór wyjściowy |

**Kalibracja.** Skalibrowane na 489 treningach z waszej biblioteki planów,
sierpień 2026. Zastrzeżenie: `pb_10k` to wartość BIEŻĄCA, nie migawka
z chwili generowania — snapshotu poziomu wyjściowego w bazie nie ma.

Zmierzony rozkład różnicy (tempo zadane − P10), s/km:

| strefa | n | p25 | mediana | p75 |
|---|---|---|---|---|
| łatwe (spokojny + wybieganie) | 489 | 80 | 97 | 113 |
| Regeneracja | 270 | 96 | 122 | 133 |
| Tempo | 48 | 22 | 30 | 35 |
| Interwały | 119 | −9 | 5 | 10 |

Zmiany względem wzorów wyjściowych: spokojne +75 → +95 (mediana 97, ale
95 jest okrągłe i leży między spokojnym 97 a wybieganiem 93). Próg +8 → +30
— wzór wyjściowy był o 22 s/km za szybki, czyli mylił próg z wyścigiem.
Regeneracja to nowa strefa: nie było jej w spisie, a jest trzecią
najczęstszą jednostką w planach.

Maratońskie i Rytmy zostają na wzorach wyjściowych — biblioteka nie ma
dla nich osobnego typu treningu, więc nie ma czego zmierzyć.

⚠️ **Interwały — wartość niezatwierdzona, nie wdrażać.** Pomiar mówi
P10 + 5 s/km, czyli interwały zadawane mniej więcej w tempie dziesiątki,
a nie szybciej niż ona. Czeka na potwierdzenie Filipa.

Hipoteza „w próbce mieszają się różne długości odcinków" — sprawdzona.
Tłumaczy ogony, nie tłumaczy środka:

| odcinek | n | mediana (najszybsze tempo − P10) |
|---|---|---|
| 200 m | 9 | −67 |
| 1000 m | 28 | −6 |
| 400 m | 11 | −1 |
| 600 m | 26 | +5 |
| brak w opisie | 21 | +6 |
| 800 m | 18 | +7 |
| 100 m | 4 | +24 |
| 300 m | 2 | +64 |

Skrajne −67 to dziewięć jednostek po 200 m, +64 to dwie po 300 m
(prawdopodobnie źle opisane). Na dystansach 400–1000 m, które stanowią
większość próbki, mediana leży między −6 a +7.

Wartość nie zależy też od metody parsowania: najszybszy token z pola daje
medianę +2, średnia zakresu +5, a same pola z jedną wartością (n=42, bez
zakresów i mieszanek) +5. Pola dwutokenowe to zakresy o medianie
rozpiętości 10 s/km, nie mieszanki „tempo odcinka + tempo truchtu".

Czyli: +5 trzyma się niezależnie od tego, jak liczyć. Do potwierdzenia
zostaje pytanie merytoryczne, nie pomiarowe. Do tego czasu generator nie
wystawia strefy interwałowej.

Format tempa — wzorzec projektu:
```js
const t = Math.round(p);
Math.floor(t/60) + ':' + String(t%60).padStart(2,'0')
```

---

## Struktura planu

**Bloki 3:1** — trzy tygodnie narastające, czwarty regeneracyjny (~75% objętości).

**Taper:**
- 5 / 10 km → 1 tydzień
- 21,1 / 42,2 km → 2 tygodnie

**Progresja objętości:** maksymalnie +10% tydzień do tygodnia,
nigdy w tygodniu regeneracyjnym.

**Szkielet tygodnia:**

| dni | układ |
|---|---|
| 3 | spokojny · jakość · długi |
| 4 | spokojny · jakość · spokojny · długi |
| 5 | spokojny · jakość · spokojny · jakość* · długi |
| 6 | + drugi spokojny |

\* druga jednostka jakościowa co drugi tydzień w fazie budowania,
co tydzień w fazie szczytowej.

**Rodzaj jakości zależy od fazy:**
- baza (pierwsze 1/3) → rytmy + tempo ciągłe
- budowanie (środek) → próg, dłuższe odcinki
- szczyt (przed taperem) → interwały + tempo w tempie docelowym

Długi rośnie do:
- 10 km → maks. 16 km
- 21,1 km → maks. 24 km
- 42,2 km → maks. 32 km

---

## Ściana — kiedy generator odmawia

To najważniejsza funkcja, nie wyjątek.

**Minimum tygodni:**

| dystans | minimum |
|---|---|
| 5 km | 6 |
| 10 km | 8 |
| 21,1 km | 10 |
| 42,2 km | 12 |

Poniżej → nie generujemy.

**Cel poza zasięgiem:** jeśli wymagana poprawa względem obecnej formy
przekracza **8%** w dostępnym czasie — odmowa.
(Realna poprawa w 12 tygodniach: 3–5% u wytrenowanych, więcej u początkujących.)

**Za mało dni:** maraton przy 3 dniach w tygodniu — odmowa.

**Skok objętości:** jeśli plan wymagałby startu od objętości
o ponad 50% wyższej niż obecna — odmowa.

**Komunikat odmowy** — nazywa problem i proponuje dwa wyjścia:

> Przy 8 tygodniach do startu nie ułożę uczciwego planu maratońskiego.
> Możesz wybrać bliższy cel — albo napisać do nas.
> Filip i Kasia układają plany także wtedy, gdy czasu jest mało.
>
> [Zmień cel]  [Napisz do nas]

Nigdy nie generujemy planu, o którym wiemy, że jest zły.

---

## Relacja do istniejącego generatora AI

**W projekcie już działa generator — trenerski i AI-owy.**
Ustalone zwiadem 10/8:

```
trener.html → EF generate-training-plan (LLM czyta historię)
            → training_plans + training_plan_workouts   (propozycja)
            → EF approve-training-plan
            → trainings
```

To jest co innego niż ten generator i **oba zostają**:

| | generator AI | ten generator |
|---|---|---|
| kto uruchamia | trener | zawodnik sam |
| podstawa | historia zawodnika, LLM | tempo docelowe, wzory |
| wynik | za każdym razem inny | deterministyczny |
| dla kogo | płacący | free i gość |
| koszt | wywołanie modelu | zero |

Nie przebudowujemy tamtego. Budujemy drugie wejście.

## Zapis

**Plan ląduje w `training_plans` + `training_plan_workouts`,
nie prosto w `trainings`.**

Powód jest produktowy, nie techniczny: panel trenerski **już umie**
wyświetlić, edytować i zatwierdzić plan w tym kształcie. Wpisując się
w istniejący format, generator dostaje ścieżkę konwersji za darmo —
trener przejmuje gotowy plan zamiast zaczynać od zera.

Zatwierdzenie idzie istniejącym `approve-training-plan`,
który przenosi plan do `trainings`.

- **oznaczenie źródła** — `trainings` nie ma dziś pola na źródło
  (zwiad 10/8: zero kolumn `source|origin|created_by`).
  Sprawdzić, czy `training_plans` ma takie pole; jeśli nie —
  migracja. Trener musi wiedzieć, co przejmuje.
- **zawodnik bez trenera** — zapisze plan sam.
  RLS na `trainings` (`trainings_athlete_insert`) tego nie warunkuje
  obecnością trenera. Sprawdzić to samo dla `training_plans`.
- **gość** — widzi cały plan, ale zapis wymaga rejestracji
- **konflikt z istniejącym planem** — pytamy, nie nadpisujemy.
  `approve-training-plan` ma tryb `overwrite` (delete + insert) —
  użyć go świadomie, nie domyślnie.

## Data celu — z kalendarza startów

`races` (58 wierszy, 16 przyszłych) i `race_signups` już istnieją.
Zawodnik zapisany na bieg nie musi wpisywać daty ręcznie —
wybiera z listy swoich startów.

To przy okazji domyka punkt 24 z listy dystrybucyjnej:
plan przygotowań pod konkretne zawody.

---

## Czego NIE robimy

- **adaptacji** — żadnego „za trudne / za łatwe", żadnego przeliczania w trakcie
- **planów trailowych i ultra** — zbyt zależne od terenu i doświadczenia
- **planów dla dzieci** — poniżej 16 lat kierujemy do trenera
- **treningu siłowego, diety, regeneracji** — poza zakresem generatora
- **przewidywania czasu na podstawie samego wieku i wagi** — bez wyniku nie zgadujemy

---

## Punkty konwersji

Trzy, wszystkie naturalne:

1. **Ściana** — generator odmawia i mówi, kto potrafi pomóc
2. **Koniec planu** — po ostatnim tygodniu: „co dalej?"
3. **Zapis planu** — gość musi założyć konto

Żadnych banerów w środku planu. Człowiek ma dostać to, po co przyszedł.

---

## Bezpieczeństwo

Krótka, jednorazowa nota przy generowaniu — bez moralizowania:

> Plan zakłada, że jesteś zdrowy. Ból to nie zmęczenie —
> jeśli coś boli, odpuść i skonsultuj się z lekarzem.
