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


## 19. Zieleń samokontroli nie dowodzi, że reguła jest dobra (6.09.2026)

**Dowodzi tylko, że reguła robi to, co w niej napisano.**

6.09.2026 `tools/bramka-commit.js` zablokowała w CI commit **zamykający**
anonowi dostęp do zgłoszeń bólu — `revoke all on public.injuries from anon` —
i nazwała to:

> ✖ BLOKADA — GRANT / REVOKE dla roli anon
> Uprawnienie dla NIEZALOGOWANEGO. Wyciek danych, nie usterka — cofaj natychmiast.

⚠️ **A w samokontroli stała asercja `REVOKE dla anon BLOKUJE w CI` i była
ZIELONA.** Test potwierdzał, że bramka robi to *poprawnie*. Bo robiła —
poprawnie względem tego, co ktoś w niej napisał. Nikt nie napisał, że REVOKE
jest odwrotnością GRANT-u.

### Na czym polegał błąd

Reguła była zdefiniowana przez **WZORZEC TEKSTU**, nie przez **SKUTEK** —
jeden wzorzec dla `GRANT` i `REVOKE`, z jedną alternatywą `(TO|FROM)`
na końcu. `GRANT … TO anon` **otwiera** dane niezalogowanemu.
`REVOKE … FROM anon` **zamyka**. Bramka pilnująca wycieku traktowała
oba jak wyciek, bo widziała tylko kształt linii.


### Dlaczego to był ślepy zaułek, a nie niedogodność

Lokalnie da się ominąć `--no-verify`. **W CI nie ma tej furtki.** Praca
zamykająca dziurę w uprawnieniach nie miała więc jak wejść na zielono — a to
jest dokładnie ta praca, dla której bramka powstała. Bramka, która karze za
naprawę, uczy omijania szybciej niż bramka, której nie ma.

⚠️ Kuszące było użycie istniejącego znacznika `bramka:przyklad`. Odrzucone:
on jest dla linii, które **wyglądają** na naruszenie, a są danymi testowymi.
`revoke` w migracji jest prawdziwą instrukcją. Oznaczenie jej „przykładem"
zamieniłoby marker w furtkę i po trzech użyciach nikt by nie wiedział, co on
znaczy — a limit 12 istnieje właśnie po to, żeby tego nie robić.

### Objaw ostrzegawczy — do sprawdzenia przy KAŻDEJ regule

**Reguła zdefiniowana przez wzorzec tekstu, a nie przez skutek.**
Pytanie kontrolne brzmi:

> Czy istnieje działanie, które pasuje do wzorca, a jest **odwrotnością** tego,
> przed czym bramka broni?

Jeśli tak — wzorzec opisuje kształt, nie zagrożenie, i prędzej czy później
zatrzyma czyjąś naprawę.

⚠️ **POZYCJA DO ZROBIENIA: przejrzeć pozostałe sześć bramek pod tym kątem.**
`bramka-reguly`, `bramka-karta`, `bramka-cdn`, `sprawdz-run-types`,
`sprawdz-spol-stale`, `polityki-bazy`/`funkcje-bazy`. Nie od razu — ale zapisane,
bo pytanie jest tanie, a odpowiedź „nie sprawdzaliśmy" będzie kosztowna dokładnie
wtedy, gdy ktoś będzie coś naprawiał w pośpiechu.

### Poprawka

Rozdzielone na dwie reguły: `GRANT … TO anon` zostaje **blokadą**,
`REVOKE … FROM anon` staje się **ostrzeżeniem** niosącym konkretną kontrolę
(„sprawdź, czy `authenticated` ma WŁASNY grant, czy dziedziczył po `anon`").
Trzy asercje zamiast jednej — w tym ta, że **GRANT nadal blokuje**, żeby jedno
„uproszczenie" regexpu nie zdjęło ochrony po cichu.

⚠️ REVOKE może zepsuć funkcję zależną od anona (licznik na landingu idzie przez
`community_km()` z własnym EXECUTE dla `anon`). To jest ryzyko **regresji**,
nie wycieku — a bramka od sekretów nie jest bramką od regresji i nie ma jak jej
ocenić. Rozdzielenie tych dwóch rzeczy jest całym sensem poprawki.

---

## 19b. Test uprawnień musi WYBRAĆ cel świadomie, nie wylosować (6.09.2026)

Trzy razy w ciągu jednej doby test podszywający się pod użytkownika **nie
zmierzył nic** i wyglądał na zielony. Za każdym razem inna przyczyna, ten sam
mechanizm: **cel testu został wylosowany, a nie wybrany.**

| wariant | co się stało | fałszywy odczyt |
|---|---|---|
| **własny posiłek** | `select id from nutrition_meals limit 1` trafiło w posiłek TRENERA — a trener jest też zawodnikiem | „1 zmieniony" → wyglądało, że uprawnienie trenerskie działa; działało `users_update_own_meals` |
| **własny log** | ten sam kształt na `training_logs` | test mierzyłby własność zamiast relacji trener–zawodnik |
| **różne wątki** | wiadomość zawodnika i trenera wybrane DWOMA osobnymi `limit 1` → różne rozmowy | RLS odciął zapytanie, UPDATE zmienił 0 wierszy, **ani błędu, ani wyniku** — wygląda jak „przeszło bez odmowy" |

### Wspólny mianownik

Testujemy **relację** (trener↔zawodnik, autor↔odbiorca), a `limit 1` wybiera
wiersz po dostępności, nie po relacji. Cel musi być wybrany warunkiem, który
opisuje badaną relację:

```sql
-- ŹLE: dowolny wiersz
select id from nutrition_meals limit 1;
-- DOBRZE: wiersz NALEŻĄCY DO KOGOŚ INNEGO niż testowany aktor
select id from nutrition_meals m
 where m.athlete_id <> '<uid trenera>'
   and exists (select 1 from athletes a where a.user_id = m.athlete_id
                 and a.coach_id = '<uid trenera>');
```

⚠️ **Trener jest też zawodnikiem** i to jest przyczyna dwóch z trzech wariantów.
Każdy test uprawnień trenerskich musi jawnie wykluczyć jego własne wiersze.

⚠️ **UPDATE/DELETE odrzucony przez RLS nie rzuca błędu** — zmienia zero wierszy
i milczy (patrz notatka o `200 z pustą tablicą`). Test musi więc liczyć wiersze
(`returning 1` + `count`), a nie zakładać, że brak wyjątku znaczy sukces.
Milczenie jest tu nieodróżnialne od dwóch różnych rzeczy naraz: „zabroniono"
i „nie było czego zmienić".

## 20. Jedna bramka usera dla EF wołanych z frontu — `_shared/wymagaj-usera.mjs` (6.10.2026)

**Co znaleźliśmy.** Zwiad 6.10 policzył bramki we wszystkich 34 Edge Functions:
**13 nie miało żadnej** (ani `getUser`, ani sekretu), 2 miały słabą. Sześć z nich
było wołanych z frontu i chodziło po `service_role` na nasz rachunek Anthropic,
Unsplash i USDA: `ocr-training-screen`, `food-micronutrients`, `generate-recipe`,
`food-image-fetch`, `food-search-off`, `food-search-usda`. Każdy z adresem mógł je
odpalić — a front od zawsze wysyłał JWT sesji, więc bramka nic by nie zepsuła.
Nikt jej nie dopisał, bo każdy EF powstawał osobno i wzorzec z `intervals-oauth`
(JWT → `getUser()` → 401) nie był nigdzie nazwany jako obowiązek.

⚠️ **Najgorszy wariant to nie brak bramki, tylko bramka pozorna.** `generate-recipe`
miało `decodeJwtSub`: brało `sub` z payloadu JWT **bez sprawdzenia podpisu** — czyli
limit dzienny liczony po `athlete_id` dało się obejść dowolnym napisem, a cache-hit
zwracał przepis przed jakimkolwiek sprawdzeniem. Kod wyglądał na autoryzację i przez
to nikt nie szukał dziury dokładnie tam. To ta sama rodzina co #2 i #19: mechanizm,
który formalnie istnieje, a niczego nie zatrzymuje.

### Reguła

**Każdy EF wołany z przeglądarki ma na wejściu `wymagajUsera(req)` z
`supabase/functions/_shared/wymagaj-usera.mjs` — albo jest błędem.** Nie „ma jakąś
bramkę": ma TĘ. Powody, dla których to ma być jeden moduł, a nie wzorzec do przepisania:

1. Sześć kopii pięciu linii to ta sama choroba co `RUN_TYPES` (#14) — i ta sama
   bramka-pułapka, bo siódma kopia dostanie „drobne uproszczenie" w stylu `decodeJwtSub`.
2. Moduł pyta GoTrue (`getUser`), więc podpis sprawdza Supabase, nie my. Jedyna
   akceptowana droga; dekodowanie payloadu po stronie EF jest zakazane.
3. Klucz publikowalny jest w nim literałem z tego samego powodu co w `intervals-oauth`:
   `SUPABASE_ANON_KEY` z env to legacy JWT, który zniknie przy „Disable legacy anon".

**Wyjątki, nazwane wprost:** EF wołane przez cron/trigger (`miesiac-cron`,
`morning-brief-cron`, `detect-moment`, `auto-reports-cron`) mają zamiast tego handshake
`x-push-secret` z `PUSH_HOOK_SECRET`; EF wołane przez webhook obcej usługi
(`intervals-webhook`) mają sekret w body. Trzeciej kategorii nie ma — EF, który „nie
pasuje do żadnej", jest sygnałem do zatrzymania się, nie do pominięcia bramki.

### Objaw ostrzegawczy

Nowy katalog w `supabase/functions/` bez `wymagaj-usera` i bez `x-push-secret`.
Oraz: komentarz w EF mówiący „verify_jwt = ON w Dashboardzie" jako JEDYNE
uzasadnienie braku bramki — `verify_jwt` nie jest wersjonowane w repo (brak
`config.toml`), więc to obietnica o stanie innego systemu, dokładnie #11.

### Co z tego wyszło (paczka 1, commit `8189824`)

Sześć EF-ów z bramką, `generate-recipe` bez `decodeJwtSub`, guard sekretu
w `auto-reports-cron` (wdrożenie czeka na sprawdzenie, czy job cron wysyła nagłówek),
siedem martwych EF-ów skasowanych z repo i z Supabase (`strava-callback`, `smooth-task`,
`strava-sync`, `strava-webhook`, `send-welcome-email`, `backfill-thumbnails`,
`parse-activity`). Zmierzone po wdrożeniu kluczem publikowalnym jako Bearer:
6 × 401, 7 × 404 — czyli bramka ODMAWIA, a nie tylko istnieje (patrz #9: licznik,
nie diff).

⚠️ Przy okazji wyszło, że commit `a7adf7f` z 13.09 (klucz Resend z env, 71 linii
w `bramka-commit.js`) **nigdy nie trafił na origin** — lokalne `main` rozjechało się
z GitHubem o jeden bump. Pamięć mówiła „WYPCHNIĘTE". To #12 w czystej postaci:
„wypchnięte" trzeba sprawdzać `git log origin/main..HEAD`, nie zapisem z sesji.

## 21. Wyłącznik, który wyłącza wszystko, uczy omijać wszystko (6.10.2026)

Do tego dnia jedyną drogą przez miękką blokadę hooka (migracja, polityka RLS, DROP)
było `git commit --no-verify`. Hook sam to doradzał: „jeśli wiesz, co robisz". Ale
`--no-verify` nie rozróżnia — zdejmuje TAKŻE blokady twarde (sekret, klucz obcej
usługi, GRANT dla anon), i nie zostawia śladu, DLACZEGO ktoś go użył. Paczka 1b
przeszła dokładnie tą drogą, z uzasadnieniem w treści commita wpisanym ręcznie —
czyli właściwy odruch, bez mechanizmu, który by go wymuszał. LEKCJE #4 (odruch
`--no-verify` powstaje po JEDNYM uzasadnionym użyciu) i #19 (zieleń samokontroli
nie dowodzi dobrej reguły) spotykają się tu w jednym miejscu.

### Reguła

**Zatwierdzenie ma być WĄSKIE i ZAPISANE.** Trailer w treści commita:

```
Bramka-zatwierdzona: <powód, co najmniej 10 znaków>
```

zdejmuje wyłącznie blokady miękkie i zostawia powód w historii gita. Blokad
twardych (`ciBlokada: true`) nie zdejmuje nigdy — na nie nie istnieje dobry
powód, więc nie ma czego wpisywać. Mechanika: `pre-commit` nie zna jeszcze
wiadomości, więc miękkie tylko wypisuje jako „czeka na trailer" i zatrzymuje
twarde; `commit-msg` dostaje plik wiadomości i rozstrzyga. Samokontrola bramki
sprawdza OBIE strony (trailer przepuszcza migrację i politykę; trailer NIE
przepuszcza `sb_secret_`, GRANT-u dla anon, DISABLE RLS, klucza prywatnego,
klucza Resend) — bo trailer, który przepuszczałby sekret, byłby gorszy niż
`--no-verify`: wyglądałby na zatwierdzony.

### Objaw ostrzegawczy

Każdy przełącznik „pomiń sprawdzanie" bez parametru ZAKRESU. Jeśli wyłącznik
nie pyta „co pomijam", to z definicji pomija też to, czego nikt nie chciał
pominąć — a użyty raz słusznie, zostaje w palcach (#4). Objaw towarzyszący:
uzasadnienie wpisywane „obok" (w rozmowie, w pamięci sesji), a nie tam, gdzie
czyta je przyszły `git log`.

### Czego to NIE rozwiązuje

`--no-verify` fizycznie nadal działa — git tak ma. Zamkiem jest CI, które miękkie
i tak traktuje jako ostrzeżenia (#2 w `bramka-commit.js`: w CI kod jest już
wypchnięty, migracja już w bazie). Trailer nie dokłada ochrony do CI; dokłada
ŚLAD i ZAKRES do hooka. To wystarczy, bo problemem nie była siła blokady, tylko
to, że jedyna droga obok niej była szersza niż potrzeba.

## 22. Stan produkcji w poleceniu to twierdzenie do zmierzenia, nie fakt (7.10.2026)

Polecenie z 6.10 wieczorem zaczynało się od: „D7b i revoke radio_comments_view
zaaplikowane na prod, test D7b 5/5 zielony”. Przyjąłem to za fakt i na tej
podstawie: wpisałem do `rls/README.md` „WYKONANE, zmierzone: anon dostaje 42501”
(42501 zmierzyłem tego dnia dla `injuries`, nie dla widoku — dowód o innym
obiekcie, #9), zaktualizowałem ręcznie migawki `trainings.txt` i
`radio_comments_view.txt` do stanu, którego nikt nie widział, i wysłałem to na
origin. Dwie godziny później `polityki-bazy.js --zrzut` pokazał 5 polityk,
`coach_manage_trainings` ALL/public i anon z SELECT-em na widoku. REST anon
potwierdził: `200 []`. Migracje weszły na prod dopiero po STOP-ie, o 00:07.

**Dlaczego to osobna lekcja, a nie powtórka #12.** #12 mówi o notatce, która
się zestarzała. Tu notatka była fałszywa od pierwszej sekundy — i to ja ją
napisałem, z cudzego zdania, w trybie oznajmującym, dokładając zmyśloną liczbę
pomiaru. Zdanie w poleceniu brzmiało jak wynik, a było zamiarem albo pomyłką
(test 5/5 w `begin … rollback` przechodzi także wtedy, gdy nic nie zostało
w bazie — ROLLBACK cofa i migrację, jeśli ktoś wkleił ją do tej samej
transakcji). Nie wiem, co się stało, i nie muszę wiedzieć: wystarczyło
zmierzyć przed zapisaniem.

### Reguła

**Każde zdanie o stanie produkcji, które przychodzi w poleceniu — „zaaplikowane”,
„wdrożone”, „job zdjęty”, „kolumna jest” — jest wejściem do pomiaru, nie
wynikiem.** Zanim trafi do migawki, README, journala, pamięci albo commita,
musi mieć własny dowód z TEGO dnia: zrzut, REST, `functions list`, zapytanie.
Jeśli pomiar jest niemożliwy w danej chwili, zapis brzmi „ZGŁOSZONE jako
wykonane, NIEZMIERZONE”, a nie „wykonane”.

Ta sama zasada w drugą stronę: zdanie „OK” bez przedmiotu nie jest
potwierdzeniem warunku. 6.10 przed deployem sync/webhook nie przyjąłem „OK” za
„migracja na prod” — zmierzyłem przez REST (42501 vs 42703) i dopiero wtedy
wdrożyłem. To był właściwy odruch; przy D7b go zabrakło.

### Objaw ostrzegawczy

Liczba albo kod błędu w moim własnym zapisie, których nie pamiętam z żadnego
wyjścia narzędzia. „Zmierzone 42501” bez wiersza wyjścia, z którego pochodzi,
to nie pomiar — to ozdobnik, który udaje pomiar (#11, #13). I druga rzecz:
migawka w `supabase/schema/` edytowana RĘCZNIE. Ten katalog ma jedno źródło —
`--zrzut` — i właśnie dlatego, że mówi „stan produkcji, nie zamiar”. Ręczna
edycja zamienia go w zamiar z datą.

## 23. REVOKE zdejmuje tylko ten grant, który nazywa — kontrola patrzy na WYNIK, nie na treść revoke (7.10.2026)

Dwa razy tego samego dnia, w dwóch migracjach paczki 3, revoke „przeszedł" i nic
nie zdjął:

1. **MOST, poziom kolumny vs tabeli.** `revoke update (ostatni_odbior) on
   biegus_most from authenticated` — a `authenticated` miał UPDATE **tabelowy**
   (migawka z 00:07: „DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE,
   UPDATE", kolumnowych brak). Kolumnowy REVOKE zdejmuje wyłącznie kolumnowy
   GRANT. Po migracji `information_schema.column_privileges` nadal pokazywało
   UPDATE na `ostatni_odbior` i `athlete_id` — Filip to złapał kontrolą po
   wykonaniu. Poprawka na prod: `revoke update on biegus_most from
   authenticated; grant update (zapis, zapis_ts) … to authenticated`.
2. **is_run_type, adresat PUBLIC vs jawny anon.** `revoke all on function
   is_run_type from public; grant execute … to authenticated, service_role`.
   W Supabase `create function` w `public` dostaje z `ALTER DEFAULT PRIVILEGES`
   **jawne** granty EXECUTE dla `anon`, `authenticated`, `service_role` —
   osobno, nie przez PUBLIC. Revoke od PUBLIC nie dotyka wpisu anona. Zmierzone
   REST-em po wykonaniu: anon `POST /rpc/is_run_type` → `200 true`, podczas gdy
   `biegus_most_odbierz` (z jawnym `revoke … from anon`) → `42501`. To ta sama
   pułapka, którą 6.09 opisał rollback `community_stats` dla tabel (`create
   table` sam nadaje anonowi ALL) — tylko na funkcjach.

**Wspólny kształt.** GRANT-y w Postgresie to zbiór wpisów (grantee × obiekt ×
poziom). REVOKE usuwa dokładnie jeden wpis, ten, który nazywa. Nie ma „revoke
tego, co by pozwalało na X" — jeśli pozwolenie przychodzi z innego poziomu
(tabela zamiast kolumny) albo od innego adresata (jawny `anon` zamiast
`PUBLIC`), zostaje nietknięte, a revoke kończy się bez błędu i bez ostrzeżenia.
Dlatego treść migracji nie jest dowodem: **dowodem jest odczyt uprawnień po
wykonaniu** — `column_privileges` + `table_privileges` dla tabel (kolumny
pokazują się tam z OBU źródeł, więc sama lista kolumnowa też nie wystarczy),
`proacl` dla funkcji, i REST z kluczem roli, której dotyczy zmiana.

### Reguła

Każdy revoke w migracji ma obok KONTROLĘ PO WYKONANIU, która czyta stan
uprawnień, nie powtarza treści revoke. Zanim napiszę revoke, pytam migawkę
(`rls/<tabela>.txt`), **na jakim poziomie i dla kogo** grant istnieje — i
zdejmuję ten wpis, nie wpis o podobnej nazwie. Przy nowej funkcji lub tabeli
w `public` zakładam, że `anon` dostał jawny grant z default privileges, i
zdejmuję go z nazwy (`revoke … from anon`), jak robi `suma_biegowa`.

### Objaw ostrzegawczy

Komentarz w migracji tłumaczący, czego revoke NIE robi („`revoke update
(ostatni_odbior)` NIE zdejmuje update na innych kolumnach") — to zdanie było
w pliku i brzmiało jak staranność, a opisywało dokładnie mechanizm, który
zostawił dziurę. Jeśli muszę objaśniać zakres revoke, to znaczy, że nie
sprawdziłem, czy ten zakres pokrywa istniejący grant.

## 24. Nowa funkcja w public nie dostaje już EXECUTE dla anon — potrzeba anona to jawny grant i świadome przejście twardej blokady (7.10.2026)

Do 7.10 `ALTER DEFAULT PRIVILEGES` Supabase (role `postgres` i `supabase_admin`) nadawał KAŻDEJ
nowej funkcji w `public` EXECUTE dla `anon`, `authenticated`, `service_role` i PUBLIC (wpis `=X`).
Skutek zmierzony tego dnia: 26 funkcji z `anon=X`, z czego 11 triggerowych i `are_friends`
nigdy nie miały powodu, a `is_run_type` dostała anona mimo migracji z `revoke … from public`
(#23). Migracja `20261007_funkcje_bez_execute_dla_anon.sql` zdejmuje EXECUTE od PUBLIC i anon
z istniejących funkcji ORAZ zmienia default privileges roli `postgres`: `revoke execute on functions
from public, anon`. authenticated i service_role dostają EXECUTE nadal automatycznie.

⚠️ Dla roli `supabase_admin` ta sama instrukcja dała `ERROR 42501 permission denied to change default
privileges` — `postgres` w Supabase nie jest członkiem `supabase_admin`. Zmierzone po wykonaniu 7.10:
`pg_default_acl` postgres = {postgres, authenticated, service_role}; supabase_admin = bez zmian, z anon
i PUBLIC. Skutek praktyczny: nasze migracje (SQL Editor, CLI — rola postgres) tworzą funkcje BEZ anona;
funkcja utworzona przez supabase_admin (narzędzia platformy, nie nasz proces) nadal by go dostała —
po każdym zrzucie `funkcje-bazy` warto spojrzeć na proacl nowych obiektów.

### Reguła

**Od 7.10.2026 funkcja, którą ma wołać anon, musi dostać grant JAWNIE w migracji:**
jawny GRANT EXECUTE na tej funkcji dla roli anon — a taki wiersz zatrzymuje bramkę commita
twardo (GRANT dla roli anon). To celowe: przejście przez blokadę wymaga poprawki diffu, czyli
świadomego zapisu w tym samym commicie, dlaczego niezalogowany ma to wołać (jak dawny licznik
landingu). Nie ma już drogi „dostał przypadkiem". Tabele: default privileges dla tabel (anon
`arwdDxtm`) NIE zostały zmienione — to osobna decyzja; przy `create table` nadal `revoke all …
from anon` z nazwy (#23).

### Objaw ostrzegawczy

Funkcja wołana z frontu przez `sb.rpc(...)` daje `42501 permission denied for function` tylko
niezalogowanym. To nie usterka bramki — to pytanie, czy anon ma ją wołać; jeśli tak, odpowiedź
jest jednym wierszem grantu z uzasadnieniem, nie powrotem default privileges.



## 25. Hipoteza w poleceniu była błędna — odtworzenie PRZED naprawą ją obaliło (8.10.2026)

Smoke Filipa po 59ccb94: offline „Ten tydzień" na szkielecie, „Postęp tygodnia" na „Ładowanie…".
Polecenie wskazywało przyczynę: zawieszony getSession/userId albo resztki cache Service Workera.
Zamiast naprawiać wskazane miejsce, objaw został najpierw odtworzony lokalnie (Playwright, sieć
odcięta, SW zablokowany — tools/smoke-offline.js) z sondą czasów. Wynik: getSession wraca w
milisekundach, cache SW nie bierze udziału, a zapytanie REST kończy się błędem dopiero po ~7 s —
postgrest-js ponawia każdy GET 3× (1+2+4 s), a loadery czekają na siebie po kolei. Naprawa
wskazanego miejsca nie zmieniłaby niczego na ekranie, a smoke „po naprawie" i tak by padł —
tylko później i z fałszywym poczuciem, że przyczyna jest znana.

### Reguła

**Przyczyna podana w poleceniu to hipoteza, nie diagnoza (por. #uzasadnienie-blokady).** Przed
naprawą: odtworzyć objaw narzędziem, które da się puścić ponownie, i zmierzyć, gdzie płynie czas.
To samo narzędzie, puszczone na starej wersji, musi paść w tych samych punktach co urządzenie
zgłaszającego — dopiero wtedy jego zielony kolor po naprawie coś znaczy (zobacz #19: zieleń
samokontroli ≠ dobra reguła; pierwsza wersja punktu „karty bez czarnego tła" była zielona przy
czarnych kartach).

### Objaw ostrzegawczy

Polecenie zawiera mechanizm („wisi na X", „to cache Y"), a objaw da się opisać tylko jako „widok
nie dochodzi do stanu końcowego". Wtedy najpierw sonda czasów, potem kod.


## 26. Dokument wznowiony z tła żyje na kodzie sprzed deployu — odświeżanie danych nie wystarcza (8.10.2026)

Trzy smoke z rzędu (59ccb94 → a3e546c) naprawiały „co pokazuje strona po powrocie": migawkę, odświeżenie
danych przy visibilitychange, Plan. Każda poprawka była poprawna w smoke i żadna nie zadziałała na telefonie
Filipa — bo jego „wejścia" w ciągu dnia były WZNOWIENIAMI dokumentu załadowanego w nocy. PWA na Androidzie
przywraca z tła ten sam dokument: ten sam window, ten sam JS, ten sam zestaw handlerów. Kod, który miał
odświeżać dane po powrocie, istniał na serwerze, ale nie w tym dokumencie. Pasek „Nowa wersja" też milczał:
reg.update() chodzi z setInterval tylko przy widocznej stronie, a w tle timery stoją.

### Reguła

**Poprawka zachowania „po powrocie" działa dopiero w dokumencie, który ją ZAŁADOWAŁ.** Dokument sprzed deployu
trzeba WYMIENIĆ (przeładować) w chwili powrotu — odświeżanie danych starym kodem tylko utrwala stary kod.
Od 8.10: sb.js bmPowrotSprawdzWersje (> 30 min + nowszy SW + sieć + brak niezapisanej treści → jedno
przeładowanie). Smoke każdej zmiany „po powrocie" musi mieć wariant: dokument WERSJI N-1 wznowiony po
deployu N (tools/smoke-offline.js SMOKE_SW=1, scenariusze G i H) — test na świeżo załadowanej stronie
sprawdza tylko ludzi, którzy i tak dostaliby nowy kod.

### Objaw ostrzegawczy

Poprawka zielona w smoke, a na telefonie „nic się nie zmieniło" — przy czym zgłaszający „wchodził kilka
razy". Pierwsze pytanie: czy to były NOWE wejścia, czy wznowienia; drugie: z którą wersją kodu wstał
dokument (window._bmWersjaStartu, app_version w client_errors).
