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

**16.08.2026 — drugi raz w dwa dni.** Obszedłem hook trzy razy, z czego **DWA
razy bramka w ogóle nie blokowała** — sięgnąłem po flagę odruchowo, bo poprzednim
razem była potrzebna. Nawyk powstał po **JEDNYM** uzasadnionym użyciu.

**Zasada praktyczna.** Przed `--no-verify` uruchom bramkę osobno i przeczytaj
wynik. Jeśli nie potrafisz powiedzieć, **CO** blokuje, to nie wiesz, co omijasz.

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

---

## 6. `try/catch` nie łapie funkcji zwracających wartość-śmieć zamiast rzucać (15.08.2026)

**Co zrobiłem źle.** Helper `_dzienWaw` miał `try/catch` wokół
`toLocaleDateString`, a **gałąź `catch` nie odpalała się nigdy**:

```js
try { return new Date(iso).toLocaleDateString('sv', {timeZone:'Europe/Warsaw'}); }
catch (_) { return String(iso || '').slice(0, 10); }   // martwy kod
```

`toLocaleDateString('sv')` na złej dacie **nie rzuca** — zwraca napis
`'Invalid Date'`. A `new Date(null)` to epoka, czyli `'1970-01-01'`.

**Dlaczego to groźne.** Oba przeszłyby dalej jako **prawdopodobnie wyglądający
klucz dnia**. `'1970-01-01'` posortowałoby się na początek listy dni i rozbiło
matematykę streaków — a wynik nadal wyglądałby jak data, więc nic by nie
zapaliło się na czerwono. Wartość-śmieć jest gorsza od wyjątku właśnie tym,
że płynie dalej.

**Jak to wyszło.** Testem na wartościach granicznych (`'abc'`, `null`), nie
przeglądem kodu. Czytając ten helper trzy razy, za każdym razem uznawałem
`try/catch` za wystarczające zabezpieczenie.

**Zasada.** Przy funkcjach **formatujących** waliduj **WEJŚCIE przed
wywołaniem**, nie licz na wyjątek. `Number`, `Date`, `toLocaleDateString`,
`parseInt`, `JSON.parse` (ten akurat rzuca) — sprawdź dla każdej z osobna,
czy sygnalizuje błąd wyjątkiem, czy wartością specjalną (`NaN`,
`Invalid Date`, `null`, `undefined`, epoka).

**Objaw ostrzegawczy.** `try/catch`, którego gałąź `catch` **nigdy nie została
wykonana w teście**. Jeśli nie potrafisz podać wejścia, które ją odpala, to
albo jest zbędna, albo pilnuje nie tego, co myślisz.

---

**Wpadłem w tę pułapkę ponownie tego samego dnia**, w `tools/przeglad-bledow.js`,
przy pierwszym uruchomieniu na żywych danych — każdy wiersz pokazywał
„Invalid Date". Napisanie lekcji nie chroni przed jej powtórzeniem —
chroni test.

## 7. Opisanie mechanizmu w komunikacie commita URUCHOMIŁO ten mechanizm (15.08.2026)

**Co się stało.** Commit dodający workflow *Rollback* tłumaczył w uzasadnieniu,
dlaczego rollback musi czyścić znacznik pomijania CI z tematu cofanego commita.
Wyjaśnienie zawierało ten znacznik **dosłownie, trzy razy**. GitHub czyta całą
wiadomość commita, nie tylko pierwszą linię — i **pominął deploy**.

Efekt: commit wylądował na GitHubie, workflow się zarejestrował, ale run nie
powstał. Diagnoza zajęła kilkanaście minut, bo objaw wyglądał jak zepsuty
`deploy.yml` — a plik był w porządku.

**Dlaczego to nie było groźne akurat tutaj.** `deploy.yml` robi
`rsync --exclude '.github'`, więc zmiana wyłącznie w workflowach i tak nie
zmienia zawartości strony. Pominięty deploy był przypadkiem poprawnym
zachowaniem. **Następnym razem może nie być.**

**Zasada.** Komunikat commita to **wejście dla automatu**, nie tylko tekst dla
człowieka. Zanim wkleisz do niego nazwę mechanizmu sterującego CI, sprawdź, czy
CI go nie wykona. Dotyczy to znaczników pomijania builda, słów zamykających
zgłoszenia (`fixes #123`, `closes #123`) i wyzwalaczy botów.

**Jak pisać o takich znacznikach.** W plikach w repo — dosłownie, bo tam są
tylko treścią. W komunikacie commita — opisowo („znacznik pomijania CI"), albo
z rozbiciem, które łamie dopasowanie.

**Objaw ostrzegawczy.** Push przeszedł, commit widać na GitHubie, a runa nie
ma **w ogóle** — nie „failed", tylko brak. Nieudany workflow zostawia ślad;
pominięty nie zostawia żadnego. Zanim zaczniesz debugować plik workflow,
sprawdź, czy run w ogóle powstał.

---

## 8. Test „na sucho", który modyfikuje prawdziwe repo, nie jest testem na sucho (15.08.2026)

**Co się stało — dwa razy w ciągu godziny, przy testowaniu workflow Rollback.**

**Raz.** `git reset --hard HEAD` po próbnym rewercie skasował **niezacommitowane
zmiany w `deploy.yml`** — moją własną, świeżo napisaną edycję. `rollback.yml`
przeżył tylko dlatego, że był nieśledzony.

**Dwa.** Próba `git revert --no-commit`, a po niej **`git revert --quit`** —
i to jest sedno. `--quit` **nie przywraca niczego**: czyści stan sekwencera,
ale zostawia zmiany w indeksie i w drzewie roboczym. Kolejny `git checkout -- .`
odtworzył pliki **z indeksu**, czyli **utrwalił cofnięcie zamiast je usunąć**.
Do przerwania rewertu służy **`git revert --abort`**, nie `--quit`.

Skutek: w katalogu roboczym siedziało cofnięcie, którego nikt nie zamawiał,
w repo, z którego się wypycha. Zauważyłem dopiero przy kolejnym `git status`.

**Dlaczego to jest gorsze niż strata własnej pracy.** Za pierwszym razem
straciłem swoje. Za drugim **mogłem wypchnąć cudzą zmianę jako cofniętą** —
i wyglądałoby to na świadomą decyzję, bo commit revertu niczym się nie różni
od zamierzonego.

**Zasada.** Symulację logiki workflow rób na **kopii repo** (`git clone` do
katalogu tymczasowego) albo na sztucznych danych. Jeśli naprawdę musisz
w prawdziwym — sprawdź `git status` **przed i po**, i **przywróć, zanim
zrobisz cokolwiek innego**. Nie „później", bo później się o tym zapomina.

**Wskazówka wykonawcza.** Do cofania próbnych operacji używaj polecenia, które
przywraca stan **sprzed** operacji, nie tego, które tylko kończy operację:
`revert --abort` / `cherry-pick --abort` / `merge --abort` — nie `--quit`.
A do przywrócenia pojedynczego pliku ze zdalnego stanu:
`git checkout origin/main -- <plik>` (celne), nie `reset --hard` (hurtowe).

**Ta sama zasada dotyczy testów na PRODUKCJI, nie tylko w repo.** 16.08.2026
test limitu kubełka przekroczył limit czasu i **zostawił limit 1 MB nałożony
na żywym buckecie** — wykryte i cofnięte, ale nie zaplanowane. Każda zmiana
konfiguracji produkcji na potrzeby testu musi mieć **twardy timeout
i przywrócenie w tej samej komendzie**, nie w następnej.

**Objaw ostrzegawczy.** Polecenie testowe zawierające **`reset`, `revert`,
`checkout` albo `clean`**, uruchomione w katalogu roboczym, w którym trwa
praca. Każde z nich potrafi skasować rzecz, której nie jesteś właścicielem
w tej sesji.

## 9. Dowód o KODZIE nie jest dowodem o OBJAWIE (15.08.2026)

14.08.2026 poprawka `.catch()` na `viewTransition.finished` została
zatwierdzona jako zamknięcie 42 błędów w `client_errors`. Zmiana była
poprawna — i objęła **ZERO z 9 wierszy**, które przyszły po niej.
Handler wychodził wcześniej (`sb.js:1530`) i nigdy nie dochodził
do naprawionej linii.

Żeby poprawny diff był dowodem na zniknięcie objawu, trzeba pokazać
**dodatkowo**, że każdy producent objawu przechodzi przez zmienioną
linię. Tego nikt nie sprawdził.

**Dane obalające leżały w tabeli przez 16 godzin** — kolumna `app_version`
pokazywała, że build **z poprawką** produkuje nowe wiersze. Jedno zapytanie:

```sql
select app_version, count(*), max(created_at)
from public.client_errors
where message ilike '%ransition%' and created_at >= now() - interval '3 days'
group by app_version order by 3 desc;
```

**Zasada.** Gdy naprawiasz coś, co ma licznik w produkcji, weryfikacją jest
**LICZNIK, nie diff**. A gdy naprawa nie ma licznika — **zbuduj go przed
naprawą, nie po**. Licznik zbudowany po naprawie nie umie pokazać, że
potrafiłby zaświecić na czerwono, więc jego zero nic nie znaczy.

**Wskazówka wykonawcza.** Przyrząd pomiarowy i naprawa idą **osobnymi
wdrożeniami, w tej kolejności**. Gdyby poszły razem, zero po wdrożeniu
mogłoby znaczyć „naprawione" albo „przyrząd nie działa", a tych dwóch
rzeczy nie da się rozróżnić po fakcie.

**Objaw ostrzegawczy.** Uzasadnienie łączące **pomiar o szerokim zakresie**
z **naprawą o wąskim**, w jednym spójnym zdaniu. Sprawdź, czy oba mówią
o tym samym zbiorze. Tutaj brzmiało to tak — i ślad został w komentarzu
w kodzie: „stąd 42 unhandledrejection u 7 osób", dopisane przy linii,
która obsługiwała wyłącznie nawigacje swipe'owe.

## 10. Zero na liczniku może być POPRAWNYM pomiarem (15.08.2026)

Szukaliśmy błędu w przyrządzie i w sposobie klikania, a przyczyną było to,
że kohorta Filipa (**pełny Chrome Android**) przestała produkować objaw
**pięć dni wcześniej — u WSZYSTKICH, nie tylko u niego**.

Jego `user_agent` był **identyczny co do znaku** z osobą, która wiersz
wyprodukowała, a on sam wyprodukował cztery, ostatni 26.07.

**Zanim uznasz brak wyniku za awarię pomiaru, sprawdź, czy zjawisko
w ogóle jeszcze zachodzi — i to w rozbiciu na kohorty, nie łącznie.**

```
suma:  161 wierszy VT           → wygląda na żywy problem

w rozbiciu (ostatnie 5 dni):
  Messenger WebView      89     ostatni 15.08 19:47      19  ← ŻYWE
  iOS Safari             51     ostatni 15.08 21:05      19  ← ŻYWE
  pełny Chrome Android   18     ostatni 10.08 20:15       0  ← HISTORIA
  inne                    3     ostatni 23.07             0  ← HISTORIA
```

Suma wyglądała na jeden problem u wszystkich. W rozbiciu okazało się,
że **18 wierszy to historia**, a żywe są dwie inne kohorty — o innych
komunikatach, czyli prawdopodobnie o innym mechanizmie.

**Zasada.** Agregat ukrywa moment, w którym zjawisko wygasło w części
populacji. Każdy pomiar „czy to jeszcze się dzieje" rozbijaj na kohorty
**i podawaj datę ostatniego wystąpienia w każdej**, nie samą sumę.

**Wskazówka wykonawcza.** Do rozbicia bierz to, co odróżnia ŚRODOWISKA,
nie osoby: `user_agent` (silnik, WebView vs pełna przeglądarka),
`app_version`, kanał wejścia. ⚠️ Pełny Chrome podaje **zredukowany**
UA (`Chrome/150.0.0.0`), a WebView pełny (`Chrome/150.0.7871.181`) —
zmiana na poziomie łatki jest po stronie przeglądarki niewidoczna,
więc nie da się na tej podstawie twierdzić, że „to wina wersji".

**Objaw ostrzegawczy.** Osoba weryfikująca nie potrafi odtworzyć objawu,
a Ty zaczynasz szukać przyczyny w niej: „źle kliknął", „zepsuty przyrząd",
„nie to urządzenie". Najpierw sprawdź, czy ktokolwiek produkuje objaw
DZIŚ — i w jakim środowisku.

## 11. Wskaźnik zastępczy podany jako pomiar (15.08.2026)

Linia `build:` w overlayu diagnostycznym pokazywała `window._appVersion`,
czyli **nazwę cache'u zapisaną przez Service Workera** — a nie wersję
wykonującego się `sb.js`. SW aktualizuje swój cache dopiero przy `activate`,
więc etykieta systematycznie zostawała w tyle za kodem pobranym z sieci.

A instrukcja weryfikacji, którą podałem Filipowi **dwa razy**, brzmiała:
*„sprawdź, czy `build` się zgadza"*. Czyli: zweryfikuj kod polem, które
mierzy co innego.

Wyszło dopiero, gdy jeden zrzut pokazał `cache SW = c0e6333` (stary)
i **jednocześnie** dane, które potrafi wyprodukować wyłącznie `7782816`
(nowy). Wyglądało to na dwie wersje `sb.js` w jednej sesji. Nie było —
kod był jeden, kłamał napis.

**To samo dotyczy `client_errors.app_version`** (`sb.js:4788`), czyli
kolumny, na której opieraliśmy zdanie „build **z poprawką** produkuje nowe
wiersze". Wniosek się obronił, bo niosły go **znaczniki czasu** (wiersze
przyszły kilkanaście godzin po wdrożeniu), ale sformułowanie twierdziło
więcej, niż dane pozwalały.

**Zasada.** Zanim każesz komuś weryfikować cokolwiek polem X, sprawdź,
**co X faktycznie mierzy** — nie co sugeruje jego nazwa. Jedno spojrzenie
w miejsce przypisania wystarcza.

**Wskazówka wykonawcza.** Identyfikator wersji kodu ma być **stałą w tym
samym pliku, co kod** (`var PRZYRZAD = 'v7'`) — wtedy z definicji mówi
o tym, co się wykonuje. Wartość czytana z cache, z bazy albo z nagłówka
opisuje **stan innego systemu** i może się z kodem rozjechać.

**Objaw ostrzegawczy.** Pole o nazwie sugerującej tożsamość (`build`,
`version`, `revision`), którego wartość powstaje **gdzie indziej** niż
opisywana rzecz. Nazwa jest wtedy obietnicą, a nie pomiarem.

## 12. Notatka bez daty ważności starzeje się w nieprawdę (15.08.2026)

Wpis `W3 secret rotation PENDING` leżał w pamięci **miesiąc po wykonanej
rotacji** — rotacja 13.07, odczyt 15.08. Przy odczycie brzmiał jak stan
bieżący: „klucz eksponowany, rotacja czeka". Nie czekała.

Ten sam wpis niósł ostrzeżenie o pułapce (nazwa sekretu w Vault z trailing
space), która **też już nie istniała**. Czyli notatka nie tylko myliła co do
stanu — kazała szukać czegoś, czego nie ma.

**Zasada.** Zapis o stanie **PRZEJŚCIOWYM** — `pending`, `TODO`, `tymczasowo`,
`do sprawdzenia`, `zrobimy jutro` — musi nieść **albo datę weryfikacji, albo
sposób sprawdzenia stanu faktycznego**. Inaczej przy następnym odczycie brzmi
jak fakt bieżący, bo nic w nim nie mówi, że mógł się zdezaktualizować.

**Wskazówka wykonawcza.** Do wpisu o stanie przejściowym dopisz zapytanie albo
polecenie, które **sprawdza stan naprawdę**. Tutaj wystarczyłoby jedno:

```sql
select name from vault.secrets;    -- 15.08 oddało: service_role_key_REVOKED_20260713
```

Wpis, który sam mówi, jak się zweryfikować, nie zestarzeje się w nieprawdę —
najwyżej w nieaktualne polecenie, a to widać od razu.

**Objaw ostrzegawczy.** Notatka opisująca coś, co miało się zdarzyć „jutro",
czytana po miesiącach. Także: „PENDING" bez daty, „tymczasowo" bez warunku
zakończenia, „do usunięcia po X" bez sprawdzenia, czy X już było.

## 13. Pomiar, który wygląda na dowód, ale liczby się nie zgadzają (16.08.2026)

**Co się stało.** Test limitu kubełka: chciałem sprawdzić, czy nałożenie
`file_size_limit` blokuje **odczyt** istniejących, większych plików — bo gdyby
tak, cztery osoby straciłyby awatary i dowiedzielibyśmy się o tym od nich, nie
od nas. Kubełek z limitem **1 048 576 B**, plik **8 372 707 B**. Pobranie
zwróciło `kod=200`, `pobrano=1 288 000 B`.

Kusiło przeczytać to jako **„ucięte przez limit"** — pasuje do hipotezy, kod
sukcesu, a rozmiar mniejszy od pliku. Tyle że **1 288 000 to nie 1 048 576**.
Różnica 23%. To była **moja własna zwłoka `--max-time` na wolnym łączu**,
nie limit.

**Dlaczego to groźne.** Hipoteza „limit tnie odczyt" **nie tłumaczyła**
obserwacji — tylko do niej **pasowała z grubsza**. Gdybym na tym poprzestał,
wyciągnąłbym wniosek odwrotny do prawdziwego i albo zablokował potrzebną
zmianę, albo — gorzej — opisał ludziom nieistniejące ryzyko jako zmierzone.

**Zasada.** Zanim uznasz pomiar za potwierdzenie hipotezy, sprawdź, czy liczby
zgadzają się **DOKŁADNIE**. Jeśli „mniej więcej" — to znaczy, że tłumaczysz je
czymś innym, niż myślisz. Zgodność co do rzędu wielkości jest sygnałem, żeby
szukać dalej, a nie dowodem.

**Co rozstrzygnęło.** Zmiana pytania. Zamiast *„ile się pobrało"* — *„czy plik
jest cały"*: range request na **ostatnie bajty** (`-r 8372000-8372706`).
Odpowiedź `206` z 707 bajtami jest jednoznaczna i **niewrażliwa na przepustowość
łącza**, czyli na tę zmienną, która zafałszowała pierwszy pomiar. Do tego
`Content-Length: 8372707` w nagłówku — serwer sam deklaruje pełny rozmiar.

**Wskazówka wykonawcza.** Gdy pomiar zależy od czasu, sieci albo zwłoki, dobierz
taki wariant pytania, który od nich **nie zależy**: nagłówek zamiast treści,
zakres zamiast całości, istnienie zamiast rozmiaru.

**Objaw ostrzegawczy.** Zdanie w rodzaju „mniej więcej tyle, ile się
spodziewałem", „w okolicach limitu", „prawie dokładnie". Oraz każdy pomiar,
w którym wynik jest **mniejszy** od oczekiwanego, a wytłumaczenie brzmi
„pewnie ucięło" — bo „ucięło" ma zwykle drugą, prostszą przyczynę:
przerwane pobieranie.

**Trzeci raz tego dnia.** Ta sama rodzina co #9 (dowód o kodzie zamiast
o objawie), #10 (zero jako poprawny pomiar) i #11 (wskaźnik zastępczy podany
jako pomiar): za każdym razem obserwacja była prawdziwa, a **wniosek z niej
nie wynikał**.

## 14. Martwa gałąź z pełną implementacją (19.08.2026)

**Objaw.** Kod wygląda na działający, **bo jest kompletny** — funkcja, obsługa
błędów, komunikat po drugiej stronie, wszystko na miejscu. A warunek wejścia
nie jest spełniony **nigdy**, więc nie wykonał się ani raz.

**Trzy przypadki w jednym tygodniu.**

| gdzie | co było kompletne | co blokowało |
|---|---|---|
| reguła odznaki | próg `avg >= 3.5`, pełne liczenie | sufit skali to 3,0 — **arytmetycznie niemożliwe** |
| `PRSclose` | wołanie z `onclick`, obsługa po stronie UI | funkcji o tej nazwie **nie było** |
| `logAsTraining` (gra) | cała funkcja, insert, obsługa błędu, toast | `_lastEndedGameData` **nigdy nieprzypisane**, `id="log-btn"` nie istniał |

**Dlaczego to groźne.** Zwykły martwy kod widać — jest niedokończony. Ten
wygląda na skończoną funkcję, więc przy przeglądzie **broni się sam**: ktoś
czyta ciało, widzi sens, idzie dalej. Gorzej: taki kod **przyciąga naprawy**.
19.08 poprawiłem w `logAsTraining` typ `distance_km` ze stringa na liczbę —
poprawnie co do treści, w ścieżce, której nikt nie przechodzi. To dokładanie
kodu do utrzymania pod pozorem naprawy.

**Czego NIE łapie skaner handlerów.** Skaner szuka funkcji, których **brakuje**
(`onclick="fn()"` bez `fn`). Złapał przypadek `PRSclose`. Nie złapie i nie
złapał dwóch pozostałych, bo tam **wszystko istniało** — brakowało przypisania
zmiennej i możliwej do spełnienia wartości progu. **Kompletność to nie
osiągalność.**

**Zasada.** Zanim naprawisz gałąź, sprawdź, czy ktokolwiek nią przechodzi.
Trzy pytania, wszystkie tanie:
1. **Czy warunek wejścia da się spełnić?** Prześledź KAŻDĄ zmienną z guardu do
   miejsca przypisania. `grep -c 'zmienna\s*=[^=]'` — jeśli 1, to sama
   deklaracja i gałąź jest martwa.
2. **Czy element z `getElementById` istnieje?** `grep 'id="…"'` po całym repo,
   nie po jednym pliku.
3. **Czy w bazie są ślady użycia?** Zero wierszy przy działającej funkcji to
   nie „rzadko", tylko sygnał do sprawdzenia (1) i (2).

**Rozstrzygnięcie zależy od odbiorcy, nie od kodu.** Te same objawy, dwa różne
wnioski tego samego dnia:
- `logAsTraining` — nikt nie czekał na wynik → **usunąć**, z nagrobkiem mówiącym
  od czego zacząć, gdyby ktoś wracał do pomysłu.
- `goLogRealTraining` — odbiorca (`zawodnik.html`, klucz `biegamy_warmup_played`)
  **istniał i czekał** → **ożywić**, bo brakowała jedna linia, a nie pomysł.

**Objaw ostrzegawczy.** „Dziwne, że nikt tego nie zgłosił." Oraz każde zero
w pomiarze użycia funkcji, która teoretycznie działa.

**Piąty raz w tej rodzinie.** Ta sama klasa co martwa polityka RLS
`Athletes can insert own trainings` (dwa modele tożsamości w jednej tabeli,
warunek nie do spełnienia) i `GEN_TESTERZY` (niepusta lista zamiast bramki
wyłączonej). Wspólny mianownik: **warunek, nie kod**.

### Zanim zbudujesz strażnika — policz populację (19.08.2026)

Po trzech przypadkach w tygodniu sprawdziliśmy, **czy to wzorzec**. Okazało się,
że nie — i to jest wynik pomiaru, nie odczucie.

**Zmierzone na 119 plikach:** 431 eksportów `window.*`, z tego 13 bez ani jednego
użycia. Po ręcznym sprawdzeniu każdego: **7 realnych** (4 martwe funkcje w `sb.js`
— 1779 B, 0,5% pliku — i 3 zmienne zapisywane, nigdy nieczytane) oraz
**6 fałszywych alarmów**.

**ROZSTRZYGNIĘTE: BRAMKI NIE ROBIMY.** To decyzja, nie odłożenie. Trzy powody,
każdy zmierzony:

1. **Skaner mylił się w 6 z 13 przypadków (46%).** Fałszywki to wzorzec
   `if (!window.X) { window.X = true; … }` — czytany i pisany w JEDNEJ linii —
   dostęp przez alias (`w.FEEL_ETYKIETY` w teście) i plik vendora. Żeby je
   uciszyć, trzeba analizy wywołań, nie wzorca w tekście.
2. **Bramka z listą wyjątków to bramka, która przestaje sprawdzać.** Mamy na to
   świeży dowód we własnym repo — `sprawdz-run-types.py` przed 14.08 odpalany
   ręcznie był dekoracją, a nie strażą.
3. **Łapie nie tę klasę.** Sprawdzone wprost na trzech przypadkach z tygodnia:
   `logAsTraining` ✅ (eksport bez wywołań), `avg >= 3.5` ❌ (nie jest eksportem),
   `PRSclose` ❌ (odwrotny kierunek — to łapie skaner handlerów). **Jeden na trzy.**
   Ta lekcja mówi o „wołane, ale nieosiągalne"; skaner eksportów mierzy
   „nie wołane" — zjawisko sąsiednie, nie to samo.

**Trzy przypadki obok siebie w tygodniu wyglądały na klasę, a były zbiegiem
okoliczności.** Wspólny objaw był prawdziwy, częstość — nie.

⚠️ **Zasada: zanim zbudujesz strażnika, policz populację.** Jeśli wyjdzie
kilkanaście trafień przy niskim szumie — bramka. Jeśli kilka przy szumie 46% —
lekcja i jednorazowe sprzątanie. Koszt fałszywych alarmów płaci się przy KAŻDYM
commicie, zysk inkasuje się raz.

**Czwarte pytanie kontrolne** do listy wyżej: *czy ktokolwiek woła to, co
wyeksportowałeś?* — `grep` po nazwie w całym repo, nie po jednym pliku, i pamiętaj
o dostępie przez alias.

### ROZSTRZYGNIĘTE: RUN_TYPES zostaje w trzech kopiach do 20.09.2026

Lista typów biegowych żyje w `sb.js`, `js/silnik-momentu.js` (+ inline w EF
`detect-moment`) i w klauzulach `IN` w migracjach. Docelowo ma być **jedna
definicja w bazie** — tabela albo `run_types()`.

**NIE ruszamy w trakcie kampanii.** To inna klasa niż pozostałe długi z tej
serii: **bramka DZIAŁA i pilnuje rozjazdu** (`tools/sprawdz-run-types.py`, od
14.08 skanuje WSZYSTKIE `supabase/migrations/*.sql` po treści, nie po nazwie
pliku, i chodzi w CI z `bramka.yml`). Dług jest więc **pod kontrolą**, a nie
tykający.

Scalenie dotknęłoby `community_km` i innych RPC — czyli kodu obsługującego
**trwające wyzwanie #100kmDlaKasi**. Objawem rozjazdu w tych RPC jest **cichy
błąd**: kilometry przestają się liczyć, bez wyjątku i bez komunikatu. Ryzyko
zepsucia licznika w trakcie kampanii przewyższa zysk ze sprzątnięcia kopii,
których i tak pilnuje zielona bramka.

⚠️ **Warunek powrotu: po 20.09.2026**, gdy licznik przestanie być krytyczny.
Nie „gdy będzie czas" — konkretna data, bo inaczej ta pozycja wróci przy
pierwszym dotknięciu RPC i zostanie zrobiona w najgorszym możliwym momencie.

**Zasada, którą to ilustruje:** dług pod działającą bramką ma inny priorytet niż
dług bez niej. Bramka nie usuwa rozjazdu, ale zmienia go z „zdarzy się i nikt
nie zauważy" na „zdarzy się i CI zaświeci". To wystarczy, żeby poczekać.

## 15. Treść ozdobna też jest komunikatem (21.08.2026)

**8 z 64 cytatów motywacyjnych zachęcało do ignorowania bólu i zmęczenia** — na
tym samym ekranie, na którym karta gotowości radzi odpuścić. Aplikacja mówiła
dwie sprzeczne rzeczy, a bardziej efektowna była ta zła.

Najostrzejsze pary, wszystkie widoczne jednocześnie:

| aplikacja mówi | cytat mówił |
|---|---|
| „Zwolnij i przyjrzyj się regeneracji" (przy ocenie „Ciężko") | „Ciało robi to, do czego głowa go zmusi" |
| „TSB < −30 — przeciążenie, ryzyko kontuzji" | „Ból na treningu to inwestycja w sukces na zawodach" |
| „Dokładaj po trochu, ~5–10% na tydzień" | „Im więcej się pocisz na treningu, tym mniej krwawisz w walce" |

**Zasada.** Każdy element widoczny obok metryk zdrowotnych — cytat, grafika,
hasło — musi przejść test: **co to mówi komuś w kryzysie?** Nie „czy brzmi
ładnie", tylko „co twierdzi wobec kogoś, kto właśnie dostał ostrzeżenie
o przeciążeniu". Jeśli odpowiedź brzmi „dociśnij", treść nie wchodzi.

**Objaw ostrzegawczy.** Treść dodana jako dekoracja i nigdy nieprzeglądana pod
kątem tego, co twierdzi. Cytaty siedziały w kodzie od miesięcy, przeglądane
wyłącznie pod kątem „czy ładne" i „czy autor kontrowersyjny" — nigdy pod kątem
zgodności z resztą komunikatu.

⚠️ **FILTR PO SŁOWACH NIE WYSTARCZY — i to jest osobna lekcja w środku tej.**
Pierwszy przegląd zrobiłem regexem po „ból", „granice", „zmęczenie". Znalazł
**2 z 8**. Przegapił „Płacz w treningu, śmiej się na mecie", „Ciało robi to, do
czego głowa go zmusi", „Zostaw wszystko na trasie" — bo szkodliwość siedzi
w ZNACZENIU, nie w słowniku. Filip podał liczbę 8 z własnego przeglądu i miał
rację przeciw mojemu pomiarowi. **Gdy pytanie brzmi „co to twierdzi", trzeba
przeczytać wszystko, nie przefiltrować.**

**Rozstrzygnięcie ilościowe, które zmieniło projekt.** Trzy cytaty uznano za
warunkowe (dobre przy świeżości, szkodliwe przy przeciążeniu). Naiwny podział na
dwie pule dałby **3 zdania w rotacji** dla kogoś w wysokiej gotowości — te same
co tydzień, czyli gorzej niż brak podziału. Dlatego pula jest **addytywna**:
56 bezpiecznych dla wszystkich, +3 przy potwierdzonej wysokiej gotowości.
⚠️ Domyślnie WYKLUCZAMY: nieznana gotowość ma dawać wariant bezpieczny, nie
odważny — a nieznana jest prawie zawsze, bo forma liczy się na innym ekranie.

Pilnuje tego `tests/blizna-21-cytaty-nie-sa-ozdoba.test.js`.

### ROZSTRZYGNIĘTE 21.08.2026: automatyczne `missed` — NIE, i warunek powrotu

Kusiło, żeby po X dniach oznaczać wiszące `planned` jako `missed` — 1290 wierszy
u 23 osób, najstarszy z 6.04. **Odrzucone, bo „brak logu" to co najmniej trzy
różne sytuacje**, a domysł w danych karmiących model jest gorszy niż pustka:
pustka jest widocznie pusta, fałszywy `missed` wygląda na fakt.

Zmierzone na 840 przeszłych `planned` (bez odpoczynków):

| sygnał | ile | co znaczy |
|---|---|---|
| log TEGO dnia | 293 (35%) | zrobione, tylko nieoznaczone |
| brak logu tego dnia, log ±1 dzień | 347 (41%) | prawdopodobnie zrobione, przesunięte |
| cisza przez ±3 dni | 88 (10%) | prawdopodobnie naprawdę nie było |
| pozostałe | 112 (14%) | niejednoznaczne |

**76% wygląda na „zrobione, tylko nieoznaczone".** Automat pomyliłby się na
trzech czwartych.

⚠️ **WARUNEK POWROTU:** wracamy, gdy przycisk „Nie zrobiłem" będzie używany na
tyle, że da się PORÓWNAĆ deklarację z brakiem logu. Dopiero wtedy będziemy
wiedzieć, ile „pustych dni" to naprawdę pominięcia — dziś to zgadywanie.
Zapytanie: `select count(*) from trainings where status='missed'`.

⚠️ **Bezpieczny automat idzie w DRUGĄ stronę** i czeka na osobną decyzję: 293
wiersze z logiem tego samego dnia powinny być `done`, nie `missed`. To naprawiłoby
`completionRate28`, który dziś zaniża wykonanie o jedną trzecią i karmi EF
zaleceniem „NIE dokładaj objętości". Przyczyna znana: jedyna ścieżka na `done`
działa tylko przy DOKŁADNIE JEDNYM planie w danym dniu.

### ROZSTRZYGNIĘTE 21.08.2026: adaptacja NIE przechodzi na `missed` — warunek powrotu

`_zbierzDaneAdaptacji` liczy wykonanie jako `wykonaneKm / planKm` i **nie czyta
`trainings.status` w ogóle**. Przełączenie na „opuścił jednostki" zmieniłoby
ZNACZENIE, nie kalibrację:

| sytuacja | miara km (dziś) | miara jednostek |
|---|---|---|
| 3 z 4 jednostek, każda −30% | 70% → obniżka | 75% → bez reakcji |
| 4 z 4, ale jedna to spacer zamiast interwałów | 60% → obniżka | 100% → bez reakcji |

Miara kilometrowa łapie **niedowykonanie w środku jednostki**, jednostkowa tylko
**całe opuszczenia**. Próg ±25% jest skalibrowany do pierwszej.

⚠️ **WARUNEK POWROTU: co najmniej 20 wierszy `missed` od realnych ludzi.** Wcześniej
reguła oparta na tym polu widziałaby „nikt nic nie opuszcza" u wszystkich — czyli
dokładnie tę klasę błędu, którą przyciskiem właśnie naprawiamy, tylko przeniesioną
o poziom wyżej. Przy 20+ wierszach da się sprawdzić, czy „opuścił jednostkę"
i „zrobił mniej km" naprawdę wymagają różnych reakcji planu.

⚠️ Kierunek, gdy warunek się spełni: `missed` jako TRZECI sygnał OBOK kilometrów —
odróżniający „biegał mniej" od „nie biegał wcale" — a nie zamiast progu.

### ROZSTRZYGNIĘTE 22.08.2026: „nie wiem" ≠ „nie ma" we wsadzie modelu

Audyt wszystkich pól promptu `generate-training-plan` pod jednym pytaniem: **czy
model dostaje BRAK POMIARU podany jako POMIAR?**

Znaleziony **jeden** jawny przypadek i **jeden** ukryty:

| pole | stan | co model dostawał |
|---|---|---|
| `stravaText` | `strava_activities` = **0 wierszy, 0 osób** | nagłówek sekcji + `(brak Strava)` w KAŻDYM prompcie — **usunięte** |
| `planVsExec` znak `⚪` | `status='missed'` = 0 → gałąź `❌` nieosiągalna | `⚪` znaczy jednocześnie „jeszcze nie" i „olał" — naprawi się samo, gdy przycisk zacznie produkować wiersze |

⚠️ **Reszta pustek BYŁA już strażowana** — `mostMissedTypes`, `last28dMissed`,
notatnik trenera, raporty AI. Ktoś przed nami tę zasadę stosował, tylko
niekonsekwentnie: `watchInsightsText` ma warunek, sąsiedni `stravaText` nie miał.

⚠️ **ZASADA NAZEWNICZA:** gdy pole jest WYŁĄCZONE, a nie puste, placeholder ma
mówić **„nie zbieramy"**, nie **„brak"**. Pierwsze opisuje NAS, drugie opisuje
ZAWODNIKA — i tylko pierwsze jest prawdą. „(brak Strava)" podawało cechę
aplikacji jako cechę człowieka.

**Usunięte przy okazji:** `profileData` — `athletes.profile_data` jest NULL
u 61/61, a zmienna była przypisywana i nigdy nieużywana. Wożenie jej w zapytaniu
sugerowało, że model dostaje profil zawodnika.

### ⚠️ DZIURA W PRODUKCIE: zawodnik nie ma jak zgłosić kontuzji (22.08.2026)

Przy audycie wsadu wyszło coś większego niż prompt. **Kontuzje są najważniejszą
rzeczą, której model i trener powinni być świadomi — i nie ma ich skąd wziąć.**

Zmierzone:
- `coach_athlete_notes` (kanał `tag='kontuzja'`) — **2 wiersze w całej bazie**,
  obie z tagiem `inne`. Zero kontuzji, zero celów, zero strategii, u nikogo.
- `athletes.profile_data`, gdzie ląduje ankieta startowa pytająca o kontuzje —
  **NULL u 61 z 61 kont**.
- `zawodnik.html` — **ani jednej ścieżki zgłoszenia**. Słowo „kontuzja" pada tam
  trzy razy: w opisie ćwiczeń, w karcie onboardingu („Powrót po przerwie lub
  kontuzji" jako CEL) i w nazwie odznaki. Żadne z tych miejsc nie przyjmuje faktu
  „boli mnie kolano".

Dziś zawodnik może to powiedzieć **tylko wiadomością do trenera** — a 33 z 61
osób trenera nie ma, więc **nie ma jak wcale**. Komentarz przy logu jest wolnym
tekstem, którego nikt nie parsuje.

⚠️ Prompt jest tu NIEWINNY: sekcja kontuzji jest strażowana, więc model dostaje
CISZĘ, nie fałszywe „brak kontuzji". Problem nie leży w promptcie — leży w tym,
że nie ma czym go nakarmić.

⚠️ **WARUNEK POWROTU: gdy powstanie sposób zgłaszania kontuzji przez zawodnika.**
Dopóki go nie ma, każda praca nad „uwzględnianiem kontuzji w planie" buduje na
pustym kanale — czyli jest tą samą klasą błędu co mechanizm dla nikogo.

---

## 16. Tekst o OGRANICZENIACH produktu starzeje się przy każdym ulepszeniu (28.08.2026)

Trzy razy to samo zdanie-typ, w trzech różnych miejscach, przez sześć tygodni.
Za każdym razem **prawdziwe w dniu napisania** i za każdym razem **nikt nie
wrócił do niego przy naprawie tego, o czym mówiło**.

| data | zdanie | co je unieważniło |
|---|---|---|
| 17.08.2026 | „Ten plan **się nie dostosuje**" | wdrożenie `oceniAdaptacje()` — plan zaczął reagować na przerwy i niedowykonanie |
| 19.08.2026 | „Filip i Kasia **zauważą**" | generator jest dostępny wyłącznie przy `coach_id IS NULL` — czytelnik nie ma ani Filipa, ani Kasi |
| 28.08.2026 | „Nie widzi za to **kontuzji**, snu ani życia" | dołożenie reguł kontuzji — plan zaczął je widzieć i obniżać objętość |

⚠️ **Kierunek pomyłki jest zawsze ten sam: na własną niekorzyść.** Produkt robi
więcej, niż o sobie mówi. To nie jest wada kosmetyczna — człowiek czyta, że
apka czegoś nie potrafi, i nie korzysta z czegoś, co dostał. Przy „nie widzi
kontuzji" znaczyło to: *zgłoś ból, ale i tak nic z tego nie będzie*.

⚠️ **Dlaczego to umyka.** Naprawiający patrzy na kod funkcji, nie na teksty,
które o tej funkcji mówią. Zdanie leży w innym pliku, w innym module, czasem
w innym języku (prompt EF). Nic w narzędziach nie wiąże „dodałem X" z „gdzieś
napisane jest, że X nie ma".

### Objaw ostrzegawczy: wyliczanka „nie widzi X, Y ani Z"

Każdy element takiej listy to **obietnica, że X, Y i Z nigdy nie zostaną
zaimplementowane**. Lista dwuelementowa starzeje się dwa razy szybciej niż
jednoelementowa. Im dłuższa wyliczanka, tym większa szansa, że któryś element
zniknie z niej po cichu — i tym mniejsza, że ktoś to zauważy.

To samo dotyczy form pokrewnych: „nie ma jeszcze", „na razie nie", „tego nie
potrafi", „musisz zrobić to ręcznie".

### Zasada praktyczna

**Przy dodawaniu funkcji sprawdź, czy żaden tekst w produkcie nie twierdzi,
że jej nie ma.** Konkretnie — zanim domkniesz zmianę, przeszukaj repo pod
kątem nazwy tego, co właśnie dołożyłeś, w zdaniach przeczących:

```bash
grep -rniE "nie (widzi|ma|potrafi|uwzględnia|reaguje)[^.]*<nazwa funkcji>" \
  --include=*.html --include=*.js --include=*.ts .
```

⚠️ Szukaj **także w promptach Edge Functions** — tam teksty o ograniczeniach
żyją równie chętnie, a nie są objęte żadnym testem interfejsu.

⚠️ Poprawka idzie w **TYM SAMYM commicie** co funkcja. Osobny commit „poprawka
tekstu" nie powstanie: nie ma nic, co by o nim przypomniało.

### Czego to NIE rozwiązuje

Nie da się tego zamknąć bramką, bo bramka musiałaby rozumieć, o czym jest
zdanie. Zostaje odruch przy pisaniu i ten wpis. ⚠️ Blizna
`tests/blizna-29-*` przypina JEDEN konkretny przypadek („ZAMKNIECIE nie
twierdzi już, że plan nie widzi kontuzji") — to pilnuje nawrotu, nie klasy.

Pokrewne: **#12** (notatka bez daty ważności starzeje się w nieprawdę — ta sama
mechanika, ale w pamięci roboczej, nie w produkcie) i **#15** (treść ozdobna
też jest komunikatem — tam sprzeczność była między dwoma tekstami, tu między
tekstem a kodem).

---

### ✅ ZAMKNIĘTE 28.08.2026: warunek powrotu z „dziury w produkcie" (22.08) spełniony

Wpis wyżej — *„zawodnik nie ma jak zgłosić kontuzji"* — kończył się warunkiem:
*„każda praca nad uwzględnianiem kontuzji w planie buduje na pustym kanale"*.

Kanał powstał (`injuries` + `window.BOL`), a 28.08 plan zaczął go czytać:
Edge Function już wcześniej, a `js/generator-planu.js` — czyli jedyna ścieżka
dla **35 z 63** zawodników bez trenera — od commita `ed63ce5`.

⚠️ Warunek był postawiony słusznie i **zadziałał dokładnie tak, jak miał**:
powstrzymał budowanie mechanizmu dla nikogo przez sześć dni, aż do momentu,
w którym było czym go nakarmić. To jest przykład warunku powrotu, który
zaoszczędził pracę, a nie ją odroczył.

---

## 17. Katalog, który wygląda na źródło prawdy, a nigdy nim nie był (29.08.2026)

`supabase/migrations/` ma nazwę, strukturę i konwencję nazewniczą migracji.
Wszyscy — łącznie z Filipem i ze mną — czytali go jak **zapis stanu bazy**.
Nie był nim ani przez jeden dzień.

⚠️ **Dowód jest jednoznaczny: nie istnieje `supabase_migrations.schema_migrations`.**
W bazie są wyłącznie wewnętrzne tabele migracji Supabase (`realtime`, `auth`,
`storage`). Projekt nigdy nie użył `supabase db push`; SQL leci przez
`supabase db query` na Management API. Pliki w `migrations/` to **dokumentacja
pisana obok wykonania**, nie coś, z czego cokolwiek się wykonuje.

### Skala, zmierzona 28.08.2026

| | ile |
|---|---|
| funkcji w schemacie `public` na produkcji | **43** |
| opisanych w `supabase/migrations/` | **8** |
| opisanych tylko w pliku rollbacku audytu | 2 |
| **bez definicji gdziekolwiek w repo** | **33** |

Z ośmiu porównywalnych **dwie się rozjechały**, a `trigger_detect_moment` ma
na produkcji poprawkę burstu z 5.08 (statement-level + dedup), której migracja
nie zna.

### Dlaczego to jest lekcja, a nie tylko zaległość

Notatka z 15.08 opisywała **dwa przypadki**, w których „SQL trafił do bazy przed
plikiem w repo" — czyli wyjątki od porządku. Pomiar pokazał coś innego:
**to jest stan domyślny od początku projektu**, a te dwa przypadki były po
prostu tymi, które ktoś zauważył.

⚠️ **Różnica jest praktyczna, nie retoryczna.** Przy „dwóch wyjątkach" naprawą
jest dyscyplina (commituj przed wykonaniem). Przy „stanie domyślnym" dyscyplina
nie wystarcza, bo nie ma czego pilnować — nie istnieje nawet zapis, KIEDY
cokolwiek wykonano (`pg_proc` nie trzyma daty utworzenia), więc bramka
sprawdzająca kolejność w historii gita **nie ma z czym porównać**.

### Objaw ogólny

**Katalog o nazwie sugerującej mechanizm, przy braku mechanizmu.**
`migrations/` bez tabeli migracji, `tests/` bez uruchamiania w CI, `vendor/`
bez przypięcia sumy — każde z nich wygląda jak gwarancja i żadne nią nie jest,
dopóki nie sprawdzisz, **co konkretnie tę gwarancję egzekwuje**.

### Zasada praktyczna

Zanim oprzesz wniosek na zawartości katalogu, sprawdź, **kto go czyta w czasie
wykonania**. Jeśli odpowiedź brzmi „nikt, to dla ludzi" — to dokumentacja,
i ma prawo być nieaktualna. Traktowanie jej jak stanu systemu jest wtedy
błędem czytelnika, nie autora.

⚠️ Konkretnie tu: pytanie „czy repo zgadza się z bazą?" było źle postawione.
Właściwe brzmi: **„czy cokolwiek wymusza, żeby się zgadzały?"** — i odpowiedź
brzmiała „nie", zanim jeszcze policzyliśmy rozjazdy.

### Co z tego wyszło

`supabase/schema/funkcje/` — migawka 53 obiektów (43 funkcje + 10 triggerów)
zrzucona **z produkcji**, jeden plik na obiekt, plus `SUMY.txt`.
`tools/funkcje-bazy.js` porównuje ją z bazą **lokalnie** (nie w CI: wymagałoby
poświadczeń do produkcji, co zmienia CI w cel ataku).

⚠️ Migawka odwraca pytanie: zamiast dowodzić KOLEJNOŚCI zdarzeń, których nikt
nie zapisał, dowodzi RÓWNOŚCI stanów, którą da się sprawdzić w każdej chwili.

Pokrewne: **#12** (notatka bez daty ważności starzeje się w nieprawdę) i
**#16** (tekst o ograniczeniach starzeje się przy ulepszeniu) — w obu ta sama
rodzina: zapis, którego nic nie wiąże z rzeczywistością, rozjeżdża się z nią
po cichu i w tempie, którego nikt nie mierzy.

## 18. Oczywista wada, która przy pomiarze okazuje się najlepszym z wariantów (2.09.2026)

⚠️ **TA LEKCJA ISTNIEJE PO TO, ŻEBY NIE OTWIERAĆ TEGO PONOWNIE.** Za pół roku
ktoś — Filip albo ja — znowu spojrzy na `najblizszyWynik()` w generatorze
i zobaczy coś, co wygląda na ewidentny błąd: **kotwica temp wybiera bieg
NAJBLIŻSZY dystansowi docelowemu, a przy maratonie najbliższy jest zwykle
32-kilometrowym wybieganiem — czyli biegiem wolnym z definicji.** Odruch
„to trzeba naprawić" jest słuszny w opisie i błędny we wniosku. Zmierzone.

### Objaw był prawdziwy i został policzony

Na produkcji, 40 osób z użytecznymi logami:

| | 5 km | 10 km | półmaraton | maraton |
|---|---|---|---|---|
| kotwica pochodzi z TRENINGU, nie ze startu | 80% | 90% | 90% | **83%** |

Kotwica jest wolniejsza od najlepszego biegu tej samej osoby u **25 z 40**,
mediana **−70 s/km** na maratonie, **zero przypadków w drugą stronę**.
Skrajny: prognoza 6:57:57 zamiast 3:30:51.

### Pięć wariantów, jeden przyrząd

**Leave-one-out na startach.** Bierzemy osobę z ≥2 startami „na maksa" na
różnych dystansach, **zatrzymujemy jeden start jako „zawody"** i pytamy każdą
regułę o prognozę z pozostałych kandydatów. Porównujemy z faktycznym czasem.

```
n = 33 próby · 12 osób · największa osoba daje 21% prób

                          mediana błędu   średnia    max    brak kotwicy
DZIŚ „najbliższy dystans"      6,9%        11,4%     45%         0
A  najlepszy VDOT             21,7%        21,6%     53%         0
B  tylko starty                7,3%        20,8%     97%     6 z 33
C  powyżej własnej mediany     9,2%        15,8%     45%         0
D  odrzut odstających 90 s    11,8%        13,4%     45%         0
E  odrzut „≥30 km i wolne"    12,1%        13,2%     45%         0
```

⚠️ **n=33 to nie pomiar, to kontrola rzędu wielkości** — mediana błędu per
osoba idzie od 2,4% do 42%. Wystarcza jednak, żeby odróżnić „trzy razy gorzej"
od „w granicach szumu", i to jest jedyne wejście, przy którym znamy odpowiedź.

### Dlaczego obecna reguła wygrywa

**Obecna reguła wygrywa, bo Riegel w górę myli się mocniej niż w dół.**
Szybka piątka ekstrapolowana na maraton przeszacowuje mocniej, niż wolne
wybieganie niedoszacowuje — a wariant „najlepszy VDOT" robi dokładnie tę
pierwszą rzecz i dlatego jest najgorszy z całej piątki. Bliskość dystansu jest
więc **ochroną przed ekstrapolacją**, nie przeoczeniem: im mniejszy przeskok,
tym mniejszy błąd, niezależnie od tego, jak wolny był bieg źródłowy.

### Trzy pułapki, w które wpadły warianty

**1. Znacznik `Start` nie oddziela startu od ultra.** `training_type IN
('Start','Wyścig')` + `casual_effort = false` istnieje od 16.08 i wygląda na
gotowe rozwiązanie. W tej puli siedzą 33,5 km @ 9:05/km, 45,7 @ 9:12,
64,5 @ 9:07 — wszystkie oznaczone jako maksymalny wysiłek, bo nimi były.
Wariant B wybiera ultra jako kotwicę **2 z 3 razy, dokładnie tak samo jak
reguła dzisiejsza**. Do tego start w granicach ×1,5 od celu maratońskiego ma
**3 osoby z 66**.

**2. Odrzucanie odstających odrzuca życiówkę, nie ultra.** Intuicja była
mocna: rozstęp VDOT między startami tej samej osoby to 1–25 s/km, a 150–270
pojawia się wyłącznie przy ultra/trailu — więc outlier powinien się sam
odsłonić. ⚠️ **Ale ta separacja dotyczyła porównania startów ze startami.**
W pełnej puli kandydatów 90% to biegi spokojne, więc mediana jest wolna
i odstającym jest PB:

```
próg  45 s/km → odrzuca SZYBSZYCH: 39 · WOLNIEJSZYCH: 36
próg  90 s/km → odrzuca SZYBSZYCH:  8 · WOLNIEJSZYCH: 15
próg 120 s/km → odrzuca SZYBSZYCH:  1 · WOLNIEJSZYCH:  9   ← ale wtedy nie robi już nic
```

**3. Stała, która nie jest parametrem, tylko samą regułą.** Kierunek zmiany
kotwicy w wariancie D **zmienia znak** wraz z progiem: dla piątki +96 s/km
przy 60 s, +117 przy 90 i −25 przy 120. Nie ma z czego wziąć tej liczby,
a wynik zależy od niej całkowicie. Po ośmiu stałych bez pokrycia, które
z tego silnika wyrzuciliśmy, dziewiąta musiałaby zarobić na siebie — ta nie
umie nawet powiedzieć, w którą stronę działa.

### Objaw ogólny

**Wada opisana poprawnie, z wnioskiem wyprowadzonym z proxy zamiast z prawdy.**
Mierzyłem kotwicę względem „najlepszego kandydata tej osoby", traktując go jak
prawdę o formie. Nie jest nią: jako predyktor realnych startów wypada trzy razy
gorzej niż to, co skrytykował. Mechanizm był opisany dobrze — brakowało
pytania **„a względem czego to jest gorsze?"**.

To jest bliski krewny **#13** (pomiar, który wygląda na dowód) i **#11**
(wskaźnik zastępczy podany jako pomiar). Różnica: tam proxy było zamiast
pomiaru, tu proxy było **punktem odniesienia dla pomiaru** — subtelniejsze,
bo liczby się zgadzały, tylko mierzyły odległość od czegoś, co samo jest gorsze.

### Zasada praktyczna

Zanim nazwiesz regułę wadliwą, sprawdź, **czym ją zastąpisz i czy to jest
lepsze na danych**. Reguła, której mechanizm brzmi źle, a wynik jest najlepszy
z dostępnych, jest dobrą regułą źle opisaną — i naprawia się ją **opisem, nie
kodem**.

### Co z tego wyszło

Reguła doboru **nietknięta**. Zmieniło się to, że plan mówi, z czego liczy:
zamiast „Tempa liczone od Twojej dziesiątki (6:04/km)" — liczby, której nikt
nigdy nie biegł — stoi **„Tempa liczone z Twojego biegu na 32 km (6:30/km)"**,
czyli bieg, który człowiek rozpoznaje. Pod tempami na ekranie wyniku doszedł
blok „Skąd te tempa" z przyciskiem **„Mam lepszy wynik →"**, który otwiera
krok 4 z podstawioną znaną objętością.

⚠️ **To jest naprawa przyczyny, nie obejście skutku, i to jest cała pointa.**
Skoro automat nie potrafi wybrać lepiej — a właśnie to zmierzyliśmy — to
jedyną uczciwą drogą jest pokazać, z czego liczy, i zapytać człowieka.
On jeden wie, czy tamto wybieganie było spacerem, czy sprawdzianem.

Otwarte świadomie: sanity `[150, 600] s/km` przepuszcza marsz (20,7 km
@ 8:58/km zostaje kandydatem). Zawężenie progu to nowa stała — po tym pomiarze
nie wchodzi bez własnego uzasadnienia.
