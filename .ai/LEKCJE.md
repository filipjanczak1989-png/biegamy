# Lekcje — błędy metodologiczne złapane w praktyce

Zapis błędów w **sposobie sprawdzania**, nie w kodzie. Każdy z nich raz już
przeszedł przez zielone światło i został wyłapany dopiero przy drugim
spojrzeniu — dlatego są tu spisane.

---

## 1. Porównanie PRÓBKI z POPULACJĄ (14.08.2026)

**Co zrobiłem źle.** Diagnozując, dlaczego chodzenie Maćka trafia do
`Zastępczy` zamiast do `Spacer`, zestawiłem dwie liczby:

```
23 × Walk    z intervals_activities
17 × Spacer  z training_logs
```

i wyciągnąłem wniosek: *„ACT_MAP działa, bo `Spacer` istnieje"*.

**Dlaczego to było bezwartościowe.** Te liczby pochodzą z **różnych
populacji i różnych zakresów czasu**:

| | `intervals_activities` | `training_logs` |
|---|---|---|
| co zawiera | tylko aktywności **obejrzane** w widoku dnia | **wszystkie** importy |
| od kiedy | 29.06.2026 | luty 2026 |
| ile wierszy | 250 (14 osób) | 1 563 z intervals |
| Maciej | **5 wierszy** | **440 wierszy** |

Zbiory przecinają się częściowo i w żadną stronę się nie zawierają.
Postawione obok siebie nie mówią nic o mapowaniu — a wyglądały, jakby
mówiły. Filip zauważył sprzeczność w liczbach („`Walk` = 23, `Spacer` = 17,
sześć wpisów gdzieś poszło") i dopiero to zmusiło mnie do sprawdzenia,
skąd każda z nich pochodzi.

**Zasada.** Przed zestawieniem dwóch liczb sprawdź, czy pochodzą z **tej
samej populacji** i **tego samego zakresu**. Jeśli nie — nie zestawiaj,
albo zawęź obie do części wspólnej i powiedz, że to robisz.

**Objaw ostrzegawczy.** Liczby „prawie się zgadzają" (23 vs 17). Prawdziwa
niezgodność w tych samych danych zwykle jest zerowa albo duża; różnica
o kilka sztuk częściej znaczy, że mierzysz dwie różne rzeczy, niż że
zgubiło się kilka wierszy.

**Jak raportować.** Podając liczbę, podaj **źródło i zakres w tym samym
zdaniu**: nie „typy przychodzące z intervals", tylko „250 aktywności
z `intervals_activities`, 14 osób, od 29.06". Gdybym napisał tak od razu,
błąd byłby widoczny dla mnie, zanim trafił do raportu.

---

## 2. Bramka, która świeci na zielono, nie sprawdzając niczego

Trzy warianty tego samego, wszystkie z sierpnia 2026:

- **`len(zestawy) != len(ZRODLA)`** — tautologia: obie liczby powstawały
  z tego samego przebiegu i kurczyły się razem. Plik, który przestał
  pasować do wzorca, wypadał z kontroli, a bramka pisała „OK, wszystkie
  4 źródła identyczne". Naprawa: **twardy próg wpisany na sztywno**
  (`MIN_ZRODEL`), bo tylko stała z zewnątrz wykrywa utratę wykrywania.
- **`MIN_ZNALEZISK` liczone ze wszystkich plików** — stare migracje
  dostarczały brakujące trafienia i maskowały utratę w najnowszej.
  Naprawa: próg obowiązuje w **pliku rozstrzygającym**, nie w sumie.
- **Test prowizorki z nazwą pliku wpisaną na sztywno** — sprawdzał tylko
  `index.html`, więc ta sama prowizorka w `zawodnik.html` przeszłaby
  niezauważona.

**Zasada.** Bramka musi mieć **odniesienie spoza mierzonego zbioru**.
Jeśli wszystko, z czym się porównuje, pochodzi z tego samego przebiegu,
nie wykryje, że przestała patrzeć.

---

## 3. Narzędzie mierzy inną rzecz, niż sugeruje jego nazwa

- **`intervals_activities`** brzmi jak magazyn zaimportowanych aktywności.
  Jest cache'em szczegółów dla wykresów, zapisywanym tylko dla
  **dzisiejszego** treningu. Stąd 5 wierszy dla kogoś, kto ma 440 logów.
- **Bramki spójności** czytają **repo, nie bazę**. Rozjazd „SQL zastosowany
  w bazie, plik jeszcze nie w repo" jest dla nich niewidzialny —
  w tej sesji zdarzył się dwa razy i oba razy wyłapał go człowiek.
- **`logged_at`** ma godzinę, ale dla wpisów ręcznych jest ona syntetyczna
  (12:00 / 10:00). Reguła oparta na niej mierzyłaby sposób wprowadzenia
  danych, nie porę biegu.

**Zasada.** Przed użyciem pola lub tabeli jako dowodu sprawdź, **co ją
faktycznie zasila i kiedy** — nie co sugeruje nazwa. Ta sama zasada jest
zapisana w `docs/odznaki-katalog-vs-silnik-spec.md` jako „pole musi nieść
tę informację, o której mówi opis".
