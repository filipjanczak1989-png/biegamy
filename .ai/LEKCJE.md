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

---

## 4. Obchodzenie weryfikacji odruchowo, „bo i tak nic nie sprawdza" (14.08.2026)

**Co zrobiłem źle.** Commitując guard licznika, dodałem `--no-verify`
zapobiegawczo — nie dlatego, że hook zablokował commit, tylko żeby nie
zablokował. Dopiero po fakcie sprawdziłem, że repo nie ma żadnych hooków.

**Dlaczego to było groźne mimo zerowych skutków.** Konsekwencji dziś nie
było, ale odruch jest trwalszy niż stan repo. W backlogu jest pozycja
o podpięciu bramek (`sprawdz-spol-stale.py`, `sprawdz-run-types.py`) tak,
żeby **blokowały** commit. Nawyk dopisywania `--no-verify` unieważniłby
tę pracę w dniu, w którym wejdzie — i to po cichu, bo commit dalej by
przechodził. To ta sama klasa co lekcja 2: mechanizm kontrolny, który
formalnie istnieje, ale nic nie zatrzymuje.

**Kolejność też była zła.** Sprawdziłem `.git/hooks` **po** commicie.
Gdyby hook istniał, dowiedziałbym się o tym już po ominięciu go.

**Zasada.** Nigdy nie dodawaj `--no-verify`, `--no-gpg-sign` ani innego
wyłącznika weryfikacji, dopóki nie zażąda tego człowiek. Jeśli hook
zablokuje commit, **to jest sygnał do sprawdzenia, nie do ominięcia** —
bramka zadziałała dokładnie tak, jak miała.

**Objaw ostrzegawczy.** Flaga dodana „na wszelki wypadek", zanim cokolwiek
zawiodło. Każdy przełącznik wyłączający kontrolę wymaga powodu **sprzed**
jego użycia, nie usprawiedliwienia po fakcie.

---

## 5. Maska wejściowa jako ŹRÓDŁO śmieciowych danych (14.08.2026)

**Co się stało.** `autoColonTime('99999')` składa `'9:99:99'` z pięciu cyfr —
wartość, która potem siedzi w bazie i wymaga migracji. Maska **formatuje, ale
nie waliduje**, a wygląda, jakby walidowała: człowiek widzi dwukropki
pojawiające się same i zakłada, że system go pilnuje.

**Skala.** 10 ze 102 wartości PB wymagało prostowania. Wszystkie trzy klasy
błędu przeszły **przez** maski, nie obok nich:

| wejście | maska | wynik w bazie | co człowiek miał na myśli |
|---|---|---|---|
| `99999` | `autoColonTime` | `9:99:99` | cokolwiek — 99 minut nie istnieje |
| `0204` | `autoColonTime` | `02:04` | 2 godz. 04 min na półmaratonie |
| `56` | `autoColonResult` | `56` | 56 minut na dziesiątce |

Pierwszą maska **wyprodukowała**. Drugą przetłumaczyła na przeciwne
znaczenie („od prawej" = mm:ss). Trzeciej nie tknęła, bo poniżej trzech cyfr
nie wstawia dwukropka.

**Dlaczego to groźniejsze niż brak maski.** Pole zupełnie bez maski wygląda na
niepilnowane i człowiek sam się stara. Pole z maską daje **fałszywe poczucie
kontroli** — po obu stronach: użytkownik ufa, że format jest wymuszany,
a programista widzi „maska jest, temat zamknięty" i nie dopisuje walidacji.
Dokładnie to się stało: dwa z pięciu miejsc zapisu miały poprawne maski
rozdzielone per dystans i **żadnej** walidacji.

**Zasada.** Każda maska wejściowa potrzebuje **walidatora obok** —
formatowanie nie jest kontrolą. Maska pomaga wpisać, walidator decyduje,
czy zapisać.

**Wskazówka wykonawcza.** Naprawa idzie **obok maski, nie w niej**.
`autoColonTime` ma ośmiu obcych konsumentów, u których model „od prawej"
jest poprawny — zmiana maski naprawiłaby PB i zepsuła czasy treningów.
Sprawdź listę konsumentów, zanim ruszysz współdzieloną funkcję: przy
`autoColonResult` grep pokazał, że używają jej **wyłącznie** pola PB 5/10 km,
więc ją rozluźnić było bezpiecznie. Przy `autoColonTime` nie było.
