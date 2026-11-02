# Okienko „Zapytaj” — projekt „superinteligentne” po 8.11.2026 (2.11.2026, STOP przed kodem)

Autor przeglądu: Claude Fable 5.1, tylko odczyt repo (bez bazy, bez żywego Gemini, bez F6). Stan wyjściowy: v28 (pięć reguł
„przed 8.11”, blizna-107). Ławka uruchomiona ponownie 2.11 wieczorem **na kopii w scratchpadzie** (żeby nie nadpisywać
`docs/lawka-pytan-2026-11-02.md`): wynik identyczny — **dobra 66, za droga 9, zła 1 z 76; koszt symulacji $0,30**.
Lista „za drogich” i jedynej „złej”: pytania #9, 43, 46, 47, 48, 49, 72, 74, 75 (za drogie) i #76 (zła) — sekcja 2.

Co NIE jest w repo i w tym raporcie jest oznaczone jako **[poza repo]**: nowe RPC F6 — projekt równoległy powstał tego
samego wieczoru jako `docs/projekt-wyniki-jak-manager-2026-11-02.md` (dalej: **projekt A/B**) i to z nim sekcja 3 jest
uzgodniona nazwami (`runner_results` + kolumny `event_key`/`edition_id`/`finishers_total`/`position_gender`,
`event_results(p_edition_id, p_offset, p_limit ≤ 200)`, `event_info(p_event_key)` z edycjami i rekordem trasy, **bez**
`head_to_head` w v1, `nasi_po_kluczach_f6` po naszej stronie, nowa strona `wyniki.html#/…`). Nic z tego nie jest
wdrożone — `js/wyniki-api.js` `RPC_DOZWOLONE` zna dziś 11 RPC (search_runners, runner_results, upcoming_races,
event_course_status, events_search, erasure_*, event_hide); kształty kolumn F6 są tam też oznaczone „nie do ustalenia
z repo”. Podobnie: wartość `OKIENKO_BUDZET_USD` na prod, realne liczby z `okienko_log` po 1.11, zbiór nazwisk
z dane.gov.pl (jest tylko zbiór imion użyty w `_shared/imiona.mjs`).

Słownik ścieżki (z `index.ts`): router (0 tok.) → osoba → impreza → katalog → pamięć sieci → limity → model (flash) → sieć.
Zapis: `okienko_log.tryb ∈ {router, flash, siec, siec-cache, osoba, impreza, limit, blad, budzet80}` (CHECK z migracji
`20261101_okienko_impreza.sql`) — nowy tryb = nowa migracja CHECK.

---

## 1. Nazwiska pisane małą literą

### 1.1 Gdzie dziś ginie „wyniki nowaka”

Prześledzone w kodzie (nie w atrapie):

1. `router.dopasuj` — nic (brak słowa „moje”, „rekord”, okresu).
2. `osoba.osobaZPytania`: szablon `wyniki X` → `toImie("nowaka")` = `wygladaNaOsobeSlownik` wymaga 2–3 słów → nie;
   `samoNazwisko` → `NAZWISKO_SAMO = /^[\p{Lu}][\p{Ll}'-]{2,}$/u` wymaga **dużej litery** → nie; `osobaWZdaniu` wymaga ≥ 4 słów → nie.
3. `impreza.imprezaZPytania`: `NIE_IMPREZA` ma `wynik\w*` → null (dobrze).
4. katalog: słowa „wyniki”, „nowaka” nie trafiają w tytuły (prawie na pewno; zależy od bazy radia/przepisów).
5. model → bez narzędzia / `poza_danymi` → `czyDoSieci` (brak „moje/mam”) → **strażnik `blokadaSieci`**:
   `wygladaNaOsobe("wyniki nowaka")` = false (słowo „wyniki” jest w `BIEGOWE`), `osobaWZdaniu` = null (< 4 słów),
   `wygladaNaNazwisko` = false (wymaga `[\p{Lu}]`) → **tekst idzie do Google**. To samo: „jak pobiegl kowalski w debnie”
   (4 słowa, ale „kowalski” nie jest imieniem ze słownika i nie ma dużej litery → `osobaWZdaniu` null), „kim jest nowak”.

Wniosek: dziura jest symetryczna do zamkniętej 2.11 reguły (4) — brakuje tylko wersji dla małej litery. Wszystko inne
(tryb osoby po nazwisku, F6 po rdzeniach, odpowiedź informacyjna, zero sieci dla prywatnych) już działa i wystarczy je
**zasilić** detektorem, który nie opiera się na wielkości liter.

### 1.2 Trzy warstwy, od najtańszej — i dlaczego F6 NIE ma być wyrocznią

**(A) Szablon wyników + wykluczenia = nazwisko** — 0 tokenów, 0 wywołań, decyduje o TRYBIE OSOBY i o blokadzie sieci.
Rozszerzenie `samoNazwisko` (osoba.mjs) i `wygladaNaNazwisko` (pamiec.mjs) o wariant „małe litery, ale tylko w szablonie”:

```js
// osoba.mjs — nowy wzorzec; działa na tekście po normalizuj() (małe litery, bez polskich znaków, bez interpunkcji)
const RE_SZABLON_NAZWISKA = /^(?:wyniki|rezultaty|czasy|starty|jak (?:pobieg[l]\w*|biega\w*|wypad[l]\w*|poszlo)|kim jest|kto to(?: jest)?|czy (?:biega\w*|startowa\w*))\s+([a-z][a-z'-]{3,})(?:\s+(?:w|we|na)\s+([a-z][a-z.-]{2,39}))?$/;
const RE_SZABLON_ODWROTNY = /^([a-z][a-z'-]{3,})\s+(?:wyniki|rezultaty|czasy|starty|biega|startuje|startowa[l]\w*)$/;
// słowo-kandydat musi przejść: !zleSlowoOsoby(s) (PYTAJNE, NIE_IMIE, PRZYIMKI, SLOWA_IMPREZ_OS, MIESIAC_OS, CZASOWNIK_OS)
//   && !BIEGOWE.test(s) && !SLOWA_APLIKACJI.test(s) && !czyMiasto(s)
const SLOWA_APLIKACJI = /^(plan\w*|trening\w*|odznak\w*|wyzwan\w*|form[aey]|tsb|ctl|atl|trimp|radio|przepis\w*|cwiczen\w*|profil\w*|konto|haslo|kalendarz\w*|kategori\w*|dystans\w*|tempo|czas\w*|rekord\w*|akcj\w*|zbiork\w*|fabian\w*)$/;
```

Mają trafić (→ tryb osoby, `q` = słowo, `gdzie` = miejsce; NIGDY sieć — reguła publiczności liczy się z F6 jak dziś):
„wyniki nowaka”, „jak pobiegl kowalski w debnie”, „kim jest nowak”, „czasy kowalskiego”, „nowak wyniki”, „jak poszlo
wisniewskiemu”, „starty lewandowskiej”, „czy kowalski biega”.
Mają NIE trafić: „wyniki biegu” / „wyniki maratonu” (`BIEGOWE`), „wyniki poznania” (miasto), „kim jest trener” (`NIE_IMIE`),
„wyniki wczoraj” / „wyniki z listopada” (`MIESIAC_OS`), „jak pobiegl maraton” (`BIEGOWE`), „wyniki wyzwania” / „starty
w kalendarzu” (`SLOWA_APLIKACJI`), „jak biega sie zima” (3 słowa po szablonie — wzorzec dopuszcza tylko `w/na Miejsce`),
„ile km” (brak szablonu), „kim jest fabianek” (router zagadka wygrywa wcześniej — bez zmian).
Przypadki graniczne, ŚWIADOMIE przepuszczane do trybu osoby (nie do sieci): „wyniki cytadeli” (parkrun Cytadela — „cytadeli”
nie jest słowem biegowym) → F6 `search_runners("cytadel")` → 0 → zdanie „Maszyna wyników nie zna startów pod tym
nazwiskiem — sprawdź pisownię.” Koszt: 1–2 RPC F6, 0 tokenów, 0 sieci. To jest cena za szczelność i trzeba ją zmierzyć
na ławce (lista „nie-nazwiska” niżej), nie zgadywać.

`wygladaNaNazwisko` (strażnik sieci w ścieżce ogólnej i w imprezie) dostaje ten sam wzorzec — jeśli (A) trafi, do Google
nie idzie nic, nawet gdy tryb osoby z jakiegoś powodu nie przejmie pytania (pas bezpieczeństwa, jak dziś `osobaWZdaniu`).

**(B) Słownik nazwisk `_shared/nazwiska.mjs`** — generowany, nie ręczny, wzorzec `imiona.mjs` + `tools/kopie-okienka.js`.
Źródło: dane.gov.pl, „Nazwiska występujące w rejestrze PESEL” (osobne pliki męskie i żeńskie, z liczbą nosicieli) —
**[poza repo]**: numer zbioru/zasobów i aktualna data do sprawdzenia przy pobraniu; rozmiar po progu nie do ustalenia bez
pliku. Szacunek (ostrożny): próg ≥ 2000 nosicieli → kilka tysięcy form, plik ~100–200 kB; ≥ 1000 → dwa razy tyle. EF
ładuje go raz na zimny start (tak jak 13 kB imion); 200 kB to nadal mniej niż `js/generator-planu.js`.
Odmiana: rejestr ma mianownik („Nowak”, „Kowalska”), pytania są w dopełniaczu/celowniku („Nowaka”, „Kowalskiego”,
„Kowalskiej”). Nie generować form — porównywać **rdzeniami** `T.rdzen` (js/tekst.mjs: ≤ 4 znaki bez zmian, inaczej −3,
min 4): rdzen(„nowak”)=„nowa”, rdzen(„nowaka”)=„nowa” ✓; rdzen(„kowalski”)=„kowal”, rdzen(„kowalskiego”)=„kowalski”
→ trzeba dopuścić **prefiks** (`kandydat.startsWith(rdzenNazwiska)`) z minimalną długością 4 i ograniczeniem
`kandydat.length ≤ rdzen.length + 5`. Słownik = `Set` rdzeni (deduplikacja zmniejszy plik o ~⅓).
Po co (B), skoro jest (A): (A) widzi nazwisko tylko **w szablonie**. Poza szablonem („nowak w debnie”, „czy nowak biegal
w sobote”, „ile ma nowak”) każdy rzeczownik mógłby być nazwiskiem — bez słownika nie da się tego odróżnić, a ze
słownikiem da się rozszerzyć `osobaWZdaniu` o wariant (C): „słowo małą literą ze słownika nazwisk, nie po przyimku
miejsca, nie słowo biegowe/aplikacji/miasto”. Kolizje ze słowami pospolitymi (Baran, Lis, Sowa, Kowal, Wrona, Mróz, Kot,
Król, Mały, Duda, Zając) — każde z nich jest też nazwiskiem w rejestrze; wykluczenia jak wyżej plus `SLOWA_POSPOLITE`
(ręczna lista ~30 słów, jak „wykluczone mimo obecności w rejestrze” w imiona.mjs). W (A) słownik NIE jest warunkiem
koniecznym (rzadkie nazwisko „Chojnacka-Grabowska” nadal ma działać) — jest **podnoszeniem pewności** i warunkiem dla
pozycji poza szablonem.

**(C) F6 `search_runners` — potwierdza, nie wykrywa.** Dziś tryb osoby i tak woła F6 (`wynikiSzukaj`: `search_runners`
jak wpisano, przy 0 drugie wywołanie rdzeniami; potem `runner_results`). Dla samego nazwiska to ZOSTAJE jedynym źródłem
prawdy — ale wołanym PO decyzji (A)/(B), nie przed nią. Dlaczego nie „wyrocznia przed siecią” (pomysł z briefu):
- koszt: każde pytanie z nieznanym słowem = 1 RPC F6 (limit Caddy 60/min na token — per użytkownik to nic, ale wspólny
  adres wyjściowy EF ma 300/min na IP; „kto wygrał maraton w berlinie” → `search_runners("berlinie")` to marnowanie puli);
- fałszywe trafienia: `search_runners` dopasowuje po tokenach (spec M3-1 (2): „katarz chojnack” → 4 trafienia na prod), więc
  „poznan” trafi w Poznańskiego, „bieg” w Biegę, „maj” w Maja — F6 powie „to nazwisko” dla sporej części miast
  i słów pospolitych; wyrocznia zwróciłaby szum, nie decyzję;
- prywatność bez zmian (F6 to nasz serwer), ale log F6 dostawałby każde słowo każdego pytania.

Co trzeba poprawić w trybie osoby dla samego nazwiska (niezależnie od wielkości liter — dotyczy też dzisiejszego
„wyniki Nowaka”): `MAX_DOPASOWAN = 3` i „najlepszy = s[0]” dają **losowego Nowaka**. Propozycja: gdy `q` to jedno słowo
i `search_runners` zwróci ≥ 2 osoby → zdanie „Maszyna wyników zna kilka osób o nazwisku Nowak — dopisz imię.” + karta
`ktory_to` (≤ 5: nazwa, rocznik, liczba startów, ostatni bieg; **bez** przycisku „To ja”, zamiast tego „Pokaż” → to samo
pytanie z `wybor: <runner_key>` w ciele żądania, walidowanym `RE_KLUCZ_F6` jak dziś w `ktory_to_ty`). Jedna osoba → jak
dziś. Zero kosztu tokenów.

### 1.3 Lista miast — czego brakuje i skąd ją wziąć

W repo nie ma listy miejscowości (jedyny „MIASTA” to `osoby_z_miasta` w narzedzia.mjs — pole profilu). Bez niej (A)
puści „wyniki poznania”, „jak pobiegl krakow”? (tego drugiego nie — brak szablonu). Propozycja `_shared/miasta.mjs`:
TERYT TERC (GUS, dane.gov.pl) — gminy miejskie i miasta, ~2,5 tys. nazw, ~30 kB; porównanie rdzeniami jak w
`pogodaLokalnie` (`ra.startsWith(rb) || rb.startsWith(ra)`; rdzen(„poznania”)=„pozna”, rdzen(„poznan”)=„pozn” → prefiks
✓). **[poza repo]** pobranie i próg (same miasta czy też wsie — SIMC ma ~100 tys. miejscowości i jest za duże; wieś
„Kowale” przegra z nazwiskiem Kowal, i dobrze: w szablonie „wyniki X” częściej chodzi o człowieka). Generator w `tools/`,
blizna pilnuje, że plik jest wygenerowany (nagłówek ze źródłem i datą) i że „poznan”, „krakow”, „debno”, „gdynia” są
w środku, a „nowak”, „kowalski” nie.

### 1.4 Jak to mierzyć na ławce

Nowa kategoria `nazwiska` w `tests/_lawka-pytan.js`, dwie listy, ocena **obiektywna** (sekcja 4.2):
- MUSZĄ dać ścieżkę `osoba` i `siec === false` (10): „wyniki nowaka”, „jak pobiegl kowalski w debnie”, „kim jest nowak”,
  „czasy kowalskiego”, „nowak wyniki”, „jak poszlo wisniewskiemu”, „starty lewandowskiej”, „czy kowalski biega”,
  „wyniki chojnackiej” (nazwisko spoza progu słownika — ma zadziałać przez (A)), „kowalski w debnie” (poza szablonem — (C),
  przejdzie dopiero po słowniku; do tego czasu oczekiwane: ścieżka ogólna BEZ sieci — czyli test, że strażnik trzyma).
- MUSZĄ NIE dać trybu osoby (10): „wyniki poznania”, „wyniki biegu niepodleglosci”, „jak pobiegl maraton”, „kim jest trener”,
  „wyniki wyzwania”, „czasy na 10 km”, „wyniki z wczoraj”, „starty w debnie”, „jak biega sie zima”, „wyniki maratonu debno”.
- Tolerowane (osobna lista, liczone osobno, nie psują progu): „wyniki cytadeli”, „jak pobiegl baran” (→ osoba, F6 0).
Miara: 0 wyjść do sieci na liście pierwszej (twardo), ≤ 1 fałszywe trafienie na liście drugiej, koszt obu list = 0 tokenów.

---

## 2. Dziewięć „za drogich” i jedna „zła” → router / katalog (0 tokenów)

Numeracja wg `docs/lawka-pytan-2026-11-02.md`. Dla każdego: skąd odpowiedź, reguła, co ma NIE trafić, karta.

| # | pytanie | dziś | propozycja | źródło danych |
|---|---|---|---|---|
| 76 | ile juz km | **ZŁA** → model → sieć „ile juz km” | router `km` bez okresu → **domyślnie ten tydzień** | `moje_treningi` od poniedziałku |
| 75 | 🏃‍♂️ | model + sieć (~$0,02) | **bramka „bez liter”** przed routerem → `POWITANIE` | — |
| 9 | ile spalilem kalorii w tym tygodniu | model | nowe narzędzie `moje_kalorie` | `training_logs.calories`, `nutrition_profiles.weight_kg`, MET z sb.js |
| 43 | ile kalorii ma banan | sieć | narzędzie `produkt` (katalog) | tabela `food_database` (RLS: SELECT dla authenticated) |
| 49 | ile powinienem biegac tygodniowo | model | narzędzie `moja_objetosc` | `trainings` (plan tygodnia), `training_logs` (4 tyg.), `GeneratorPlanu.maxPrzyrostDla` |
| 48, 74 | czy biegac z katarem / mam katar czy moge biegac | sieć (prompt zakazuje porad → 2 próby i „nie znalazłem”) | `ZDROWIE` += infekcje → stałe zdanie | — (zmiana decyzji 1.11, pyt. do Filipa) |
| 46 | co jesc przed polmaratonem | **impreza→sieć z błędną intencją** | (a) `NIE_IMPREZA` += porady → ścieżka ogólna; (b) opcjonalnie stała treść od trenera | (b) tekst od Filipa |
| 47 | jak dobrac buty do biegania | sieć | zostaje sieć (decyzja 1.11) + pamięć sieci po rdzeniach; opcjonalnie (b) jak wyżej | — |
| 72 | polmaraton warszawski ile kosztuje | impreza→sieć (bez karty w atrapie) | zapytanie do sieci z intencją ceny; atrapa ławki z kartą jak prod | `events_search` url_zapisy |

### 2.1 Bramka „bez liter” (#75; także „12”, „???”, „ok”, „?”)

`index.ts`, zaraz po `if (!tekst) return 400`:
```ts
const liter = (normalizuj(tekst).match(/[a-z]/g) || []).length;
if (liter < 3) { await zapiszLog(adm, { athlete_id: ath.id, tekst, tryb: "router", narzedzia: ["powitanie"] }); return odp(200, { ...pusto("router"), zdania: [POWITANIE] }); }
```
Ma trafić: „🏃‍♂️”, „12”, „???”, „ok”, „5k”, „..”. Ma NIE trafić: „tsb” (3 litery → katalog pojęć), „hej” (powitanie
i tak), „10 km” (2 litery → powitanie — akceptowalne: samo „10 km” nie jest pytaniem), „co” (2 → powitanie; dziś
„co” szłoby do modelu). Koszt: 0. Blizna: 8 wejść, żadne nie dociera do `zapytajModel` (atrapa fetch rzuca).

### 2.2 „ile juz km” / „ile przebieglem” bez okresu (#76)

`router.mjs`, w bloku `if (km)` po gałęziach tydzień/miesiąc/rok dopisać: `return { narzedzie: "moje_treningi", args:
{ od: poniedzialek(dzis), do: dzis, domyslnie: "tydzien" } }`. `odpowiedz.zWyniku` przy `args.domyslnie` zaczyna zdanie od
„W tym tygodniu (od 27.10): …”, żeby człowiek wiedział, jaki okres dostał. Kolejność bez zmian: `czyZagadka` jest
pierwsze, więc PO starcie akcji „ile juz km” nadal daje kartę akcji (`ZAGADKA_PO_STARCIE`), PRZED startem — kilometry
tygodnia. Ma trafić: „ile juz km”, „ile przebieglem”, „ile km mam”, „ile nabiegalem”. Ma NIE trafić: „ile km ma akcja”
(zagadka wcześniej), „ile km do maratonu” (dziś też nie trafia w `km`? — trafia: `ile … km` → dałoby tydzień; dopisać
wykluczenie `\b(do|na) (maraton|polmaraton|start)\b` → nie-router, jak dotąd model). Blizna: 5 trafień, 2 wykluczenia,
oba stany akcji.

### 2.3 `moje_kalorie` (#9)

Dane są w aplikacji: `training_logs.calories` (OCR/zegarek; sb.js 4335 `formaCalories`: zapisane > 0 wygrywa), inaczej
MET × waga × godziny (`window.FORMA_MET_FACTORS`, sb.js 4309; waga z `nutrition_profiles.weight_kg`, zawodnik.html
2993). Wszystko czytelne JWT-em użytkownika (RLS własnego wiersza). Kopia dla Deno: `_shared/kalorie.mjs` = tablica MET +
funkcja, pilnowana testem równości z sb.js (wzorzec `pojecia.mjs` / `tools/kopie-okienka.js`), albo lepiej: przenieść
MET i `formaCalories` do `js/kalorie.mjs` (globalThis, jak `js/tekst.mjs`) i kazać sb.js z niego czytać — jedna kopia.
Router: `/\b(kalori\w*|kcal)\b/` **i** (`spali\w*|spalon\w*|zuzyl\w*|wydatek|przebieg\w*|trening\w*|tydz\w*|miesiac\w*|mam|moje`) → okres jak w `km`
(domyślnie tydzień). Zdanie: „Od 27.10: ~1 240 kcal w 3 treningach (szacunek z czasu i wagi).” — liczby z narzędzia. Bez
wagi i bez zapisanych kalorii: „Podaj wagę w Jedzeniu, to policzę kalorie z czasu treningów.” + Otwórz Jedzenie.
Ma trafić: „ile spalilem kalorii w tym tygodniu”, „kalorie z treningow w pazdzierniku”, „ile kcal spalilem”. Ma NIE trafić:
„ile kalorii ma banan” (brak słowa o treningu/okresie; „ma” + produkt → 2.4), „ile mam jesc kalorii” (cel kcal — to
`nutrition_profiles`, osobna decyzja; dziś → model/„nie mam”; do pytań do Filipa).

### 2.4 `produkt` — kalorie z bazy produktów (#43)

`food_database` (kolumny z `search_food_by_name`: display_name, brand, kcal_per_100, protein/carbs/fat/fiber per 100,
serving_unit, source). Dziś woła ją tylko EF `food-search-off` (service_role) — ale tabela ma politykę SELECT dla
authenticated, więc okienko czyta ją **klientem z JWT**, bez RPC i bez service_role (zgodnie z blizna-69). Zapytanie:
`ilike('name_normalized', '%banan%')` po rdzeniu słowa, `order hit_count desc`, limit 3.
Router (katalog, po pojęciach): `/\b(ile|jakie|jaka)\b.*\b(kalori\w*|kcal|bialk\w*|wegl\w*|tluszcz\w*)\b.*\b(ma|maja|w|jest)\s+(\p{L}{3,})/u`
→ produkt = słowa po `ma|maja|w` bez słów aplikacji/okresów. Zdanie: „Banan: 89 kcal na 100 g (białko 1,1 g, węgle 23 g,
tłuszcz 0,3 g) — wg bazy produktów.” + karta `produkt` → „Otwórz Jedzenie”. Liczby wyłącznie z wiersza tabeli.
Ma trafić: „ile kalorii ma banan”, „ile kcal w jajku”, „ile bialka ma twarog”. Ma NIE trafić: „ile kalorii spalilem” (2.3),
„ile kalorii dziennie” (cel → do decyzji), „kalorie” (samo — katalog ekranu Jedzenie jak dziś). Decyzja Filipa: produkty
były dwukrotnie „osobną decyzją” (1.11); ławka pokazuje 2×2 wagi — niewiele, ale za 0 tokenów.

### 2.5 `moja_objetosc` (#49)

Trzy źródła, w tej kolejności (pierwsze niepuste):
1. plan na ten tydzień: `trainings` pn–nd, suma `distance_km` → „W planie na ten tydzień masz 32 km (4 treningi).”;
2. brak planu: 4 ostatnie pełne tygodnie z `training_logs` (tylko `isRunType`) → „Przez ostatnie 4 tygodnie biegasz średnio
   24 km tygodniowo.”;
3. do obu dokładane JEDNO zdanie z silnika generatora: „Generator planu przy takiej bazie dokłada najwyżej 6 % tygodniowo.”
   — `GeneratorPlanu.maxPrzyrostDla(bazaKm)` (js/generator-planu.js, eksportowane na `root`; `PRZYROST_WG_BAZY`:
   10 km → 8 %, 30 → 6 %, 55 → 4 %, 85 → 3 %, interpolacja). EF nie powinien ładować 4,4 tys. linii generatora (ma
   self-test i `module.exports`) — kopia 10 linii w `_shared/przyrost.mjs` z testem równości (jak pojęcia).
Bez planu i bez logów: „Nie mam Twoich treningów z ostatnich tygodni. Generator liczy objętość z Twojej bazy.” + karta
`plan_pusty` (generator / „Napisz do trenera” — ta sama reguła `stanPlanu` co M3b).
Router (PO regule `km`, żeby „ile km w tym tygodniu” zostało w `moje_treningi`):
`/\bile\b.*\b(powin\w*|trzeba|warto|zalec\w*|moge|mozna)\b.*\bbiega\w*|\bile (km )?(tygodniowo|na tydzien|w tygodniu) (powin\w*|biegac)|\bjaka objetosc\b/`.
Ma trafić: „ile powinienem biegac tygodniowo”, „ile km tygodniowo powinnam”, „jaka objetosc tygodniowa”. Ma NIE trafić:
„ile km w tym tygodniu” (km → treningi), „ile biegac przed maratonem” (porada → sieć; patrz 2.7), „ile dni w tygodniu
biegac” (→ model/sieć; świadomie — to pytanie o liczbę jednostek, generator ma `dniWTygodniu` jako WEJŚCIE, nie radę).

### 2.6 Infekcje → stałe zdanie zdrowotne (#48, #74)

`ZDROWIE` (router.mjs) += `katar\w*|przezieb\w*|goraczk\w*|grypa|grypy|grype|kaszel|kaszl\w*|angin\w*|zatok\w*|antybiotyk\w*|chory|chora|choroba|choruje|infekcj\w*`.
Drugie stałe zdanie (nie to samo co kontuzja): `ODP_INFEKCJA = "Przy infekcji decyzję o treningu podejmij z lekarzem albo
trenerem — okienko nie udziela porad zdrowotnych."` + „Napisz do trenera” gdy jest trener (jak etap 5 (c)). Log
`router/zdrowie`. Ma trafić: „czy biegac z katarem”, „mam katar czy moge biegac”, „trening z goraczka”, „po antybiotyku
kiedy biegac”. Ma NIE trafić: „odznaka wracam do gry” (wyjątek `odzna` już jest), „katar” w nazwie utworu radia (zwiad:
sprawdzić `radio_tracks` — nie do ustalenia z repo; jeśli jest, kolejność router > katalog i tak wygra; świadome).
To **zmienia decyzję 1.11** („katar zostaje w sieci”). Argument z ławki: prompt sieci zakazuje porad medycznych, więc
model albo nie odpowiada (retry = 2 × koszt), albo odpowiada ogólnikiem bez zastrzeżenia zdrowotnego — płacimy za
odpowiedź, której nie chcemy. Pytanie do Filipa.

### 2.7 Porady ogólne (#46, #47) — minimum i opcja

Minimum (bez decyzji, naprawia błąd): `impreza.mjs NIE_IMPREZA` += `co jesc|co zjesc|jak sie przygotowac|przed
(maratonem|polmaratonem|biegiem|startem)|po (maratonie|polmaratonie|biegu|starcie)|ile biegac` → „co jesc przed
polmaratonem” przestaje być imprezą i idzie ścieżką ogólną (sieć z ORYGINALNYM tekstem, nie „… bieg — termin, dystanse,
miejsce”). Ma trafić w wykluczenie: „co jesc przed polmaratonem”, „jak sie przygotowac do maratonu”, „ile biegac przed
maratonem”. Ma NIE trafić (nadal impreza): „maraton warszawski”, „zapisy na polmaraton poznanski”, „ultrakotlina trasa”.
Tani zysk dla sieci: klucz pamięci `okienko_siec_cache` = posortowane rdzenie słów bez stop-słów (zamiast
znormalizowanego zdania) → „jak dobrac buty do biegania” i „jakie buty do biegania” dzielą jedną odpowiedź 24 h.
Opcja (decyzja, treść od Filipa — ja NIE piszę porad treningowych): `_shared/porady.mjs` z 5–8 stałymi odpowiedziami
trenera (jedzenie przed startem, buty, ile biegać na start, rozgrzewka), każda z kartą „Napisz do trenera” / „Ułóż plan”,
log `router/porada`. To jedyna droga do 0 tokenów dla #46/#47; bez niej „za drogie” zostają za drogie i liczą się jako
świadome w ławce (lista `tolerowane`, sekcja 4.2).

### 2.8 Cena bez karty (#72)

`impreza.mjs`: przy `deps.cena` zapytanie do sieci `${nazwa} bieg — wpisowe, zapisy, termin` (zamiast „termin, dystanse,
miejsce”). Atrapa ławki (`F6.events_search`) dostaje „Półmaraton Warszawski” z `url_zapisy` — na prod karta jest (0 zł),
ławka ma odzwierciedlać prod. Opcjonalnie twardsze: cena bez karty → bez sieci, zdanie „Maszyna wyników nie zna tej
imprezy — cenę i zapisy podaje organizator.” (0 tokenów) — do decyzji.

---

## 3. Pytania wynikowe z nowych RPC F6 („wyniki jak manager”)

Kontrakt: **projekt A/B** (`docs/projekt-wyniki-jak-manager-2026-11-02.md`, pkt 2.3) — tu tylko to, co okienko z niego
bierze. Co jest pewne z repo dziś: `search_runners {q, lim}` → `runner_key, display_name, yob, results_count, last_event,
last_city, probable`; `runner_results {p_runner_key}` → `event_name, event_date, event_city, distance_km, time_seconds,
position_total, position_category, category, result_url, scope`; `events_search {p_q, p_from?, p_to?, p_limit ≤ 20}` →
nazwa, data, miejscowosc, dystanse, url_*, klucz, status, przeszla. Klucz imprezy: `kalendarz|biegamy|wyniki|zgloszenie:…`.
Co dokłada projekt A/B (**[poza repo]**, czeka na kolektor): `runner_results` += `event_key, edition_id, position_gender,
finishers_total, finishers_category, result_id, source` (tylko dokładanie kolumn — okienko czyta po nazwach, więc nic nie
pęka); `event_results(p_edition_id, p_offset=0, p_limit ≤ 200)` → wiersze z `position_total/position_category/
position_gender, display_name, yob, gender, time_seconds, runner_key, probable, scope` + `total`; `event_info(p_event_key)`
→ `edycje[{edition_id, rok, data, miejscowosc, dystans_km, finishers}]`, `rekord_trasy[{dystans_km, time_seconds,
runner_key, display_name, rok}]`. **`head_to_head` nie powstaje w v1** — porównanie liczy klient z dwóch `runner_results`
po `edition_id` (do tego czasu: data ±1 + dystans ±3 %); okienko robi dokładnie to samo w EF. Każda nowa nazwa = Caddy
`@dozwolone` + `f6.bramka` + `RPC_DOZWOLONE` + blizna-53 (cztery miejsca, dwa poza repo). Pytanie o `probable`
w rekordzie trasy i o klucze `k:<nazwisko>|<rocznik>` rozstrzyga projekt A/B (jego pytania 3 i 10); dla okienka ważne:
`RE_KLUCZ_F6` już odrzuca klucze ze spacją i `|`, więc karta nigdy nie zrobi z nich linku.

### 3.1 Zasady wspólne (wszystkie tryby wynikowe)

- **0 tokenów**: router → narzędzie → `zWyniku` z szablonami; model dostaje te narzędzia w `DEKLARACJE` dopiero w drugim
  kroku i z wynikiem przyciętym do ≤ 20 wierszy (`MAX_LISTA`) — `event_results` całej imprezy to tysiące wierszy, do modelu
  nie może pójść pełny JSON (tokeny), do strażnika `dozwoloneLiczby` też niepotrzebnie.
- **Strażnik liczb**: ścieżka routera z szablonów ma liczby wyłącznie z wyniku narzędzia (jak dziś); ścieżka modelu —
  `sprawdz()` bez zmian, ale nowe narzędzia zwracają już policzone pola (`liczba_na_mecie`, `rekord.czas_s`), żeby model
  nie musiał liczyć.
- **Sieć**: w trybach wynikowych **nigdy**, gdy F6 odpowiedziało (także „0 wierszy”). Sieć zostaje tylko dla „kto wygrał
  maraton w Berlinie” (impreza spoza Polski — F6 nic nie zna) i to nadal przez dzisiejszą ścieżkę ogólną ze strażnikiem.
- **Prywatność**: dane F6 są publiczne (ta sama tabela, którą pokazuje widżet w races.html), ale do Google nie idzie
  żadne nazwisko z tych trybów — ani pytającego, ani X. „porównaj mnie z X”: X **wyłącznie** przez F6 (i profile BiegaMy
  jak tryb osoby), `siec: false` twardo w kodzie, bez wyjątku dla osoby „publicznej sportowo” (pytanie nie jest o tożsamość
  X, więc reguła publiczności tu nie ma zastosowania). Moje dane (runner_key, wyniki) nigdy w tekście do sieci — to już
  dziś gwarantuje `jednoWyszukanie` (tylko tekst pytania + data).
- **F6 429 / Retry-After**: `f6.mjs` czyta nagłówek `Retry-After` (dziś nie czyta; `js/wyniki-api.js` już to robi) →
  `BladF6("limit", retryS)` → zdanie „Maszyna wyników jest teraz zajęta — spróbuj za N s.” i pole `retry_s` w odpowiedzi;
  klient pokazuje chip „Spróbuj ponownie” po N s. Timeout 8 s bez zmian.
- **Log**: tryb `wyniki` (nowa wartość CHECK, migracja) albo `router` z nazwą narzędzia — rekomendacja: `router`
  + narzędzia `[nazwa]` jak katalog (bez migracji), plus **nowa kolumna `zapytania_f6 integer`** (migracja), żeby po
  tygodniu wiedzieć, ile RPC F6 generuje okienko (sekcja 5).

### 3.2 Pytania, wzorce, narzędzia, karty

| pytanie | router (po normalizuj) | narzędzie → RPC F6 | zdanie (liczby z narzędzia) | karta |
|---|---|---|---|---|
| kto wygrał Bieg Niepodległości 2025 | `^(kto|ktora|ktory)\b.*\b(wygra\w*|zwyciez\w*|pierwsz\w*|najszybsz\w*)\b` + nazwa (słowa bez pytajnych/wygrał/roku) + rok `\b20\d\d\b`? | `wyniki_imprezy {q, rok?, dystans?}` → `events_search` (klucz) → **`event_info`** (edycja roku → `edition_id`; bez roku: ostatnia) → **`event_results(edition_id, 0, 3)`** — 3 RPC, pamięć 10 min | „Bieg Niepodległości 2025 (10 km): 1. KOWALSKI JAN 31:02, 2. …, 3. ….” | `podium` (≤ 3 wiersze: miejsce · nazwa · czas) + „Otwórz wyniki” → `wyniki.html#/impreza/<klucz>/<rok>` |
| wyniki Biegu Niepodległości / jak poszło w Dębnie (bez „mi”) | `^(wyniki|rezultaty)\b` + nazwa imprezy (słowo biegowe w tekście) — PRZED trybem osoby, bo nazwisko tam nie ma słowa biegowego | jw. + jeśli `athletes.f6_runner_key` → moje miejsce z `runner_results` (`edition_id` = ta edycja) | „52. Maraton Dębno (18.10.2026): 1 234 osoby na mecie. Twoje miejsce: 120.” | `impreza_wyniki` + `podium` |
| ile osób biegło w Dębnie / ilu ukończyło maraton w Dębnie | `\bil[eu] (osob|ludzi|biegaczy|zawodnikow|uczestnikow)\b` + `(bieg\w*|startowa\w*|ukonczy\w*|na mecie)` + nazwa/miejsce | `wyniki_imprezy` → `event_info.edycje[].finishers` (bez `event_results`; 2 RPC) | „52. Maraton Dębno (2026): 1 234 osoby na mecie w maratonie.” | `impreza_wyniki` |
| moje miejsce w kategorii / które miejsce zająłem | `\b(moje|jakie|ktore) miejsce\b|\bna ktorym miejscu\b` (+ `kategori\w*` → flaga) | `moje_wyniki {gdzie?, miejsce:true}` — **bez nowego RPC** (`position_category`, `category` już są w `runner_results`; `position_gender`/`finishers_total` dojdą z projektu A/B — zdanie rośnie o „z 1 234”) | „Ostatni start: Bieg Niepodległości (11.11.2026) — 120. open, 15. w kategorii M40.” | `wyniki` (istniejąca, dopisać kategorię) |
| rekord trasy w Dębnie / najlepszy czas w historii Maratonu Dębno | `\brekord\w* (trasy|biegu|imprezy)\b|\bnajlepszy czas (na trasie|w historii)\b` + nazwa; „świata/polski/europy” → NIE (sieć jak dziś) | `rekord_trasy {q, dystans?}` → `events_search` → **`event_info.rekord_trasy[]`** (dystans z pytania albo wszystkie ≤ 4) | „Rekord trasy Maratonu Dębno: 2:12:34 (NAZWISKO, 2019).” | `rekord_trasy` |
| ile edycji miał / kiedy była ostatnia edycja Maratonu Dębno | `\b(ile|ktora) edycj\w*\b|\bostatni\w* edycj\w*|\bpoprzedni\w* edycj\w*` + nazwa | `edycje_imprezy {q}` → dziś `events_search` bez zakresu (`przeszla`), po projekcie A/B `event_info.edycje` (z liczbą ukończonych) | „Maszyna wyników zna 6 edycji Maratonu Dębno (2019–2026); ostatnia 18.10.2026.” | `impreza` ×≤3 (istniejąca) |
| porównaj mnie z X / kto szybszy ja czy X / ja vs X | `^(porownaj mnie z|porownanie z|kto (jest )?szybszy ja czy|ja vs|ja kontra)\s+(.+)$` → reszta przez `osobaZPytania` (imię+nazwisko, samo nazwisko, małe litery z sekcji 1) | `porownaj {q_x}` → mój klucz (`f6_runner_key` albo `search_runners` z profilu + rocznik → „Który to Ty?”) + X (`search_runners`, ≥ 2 → „Który X?”) → dwa `runner_results` → **wspólne starty liczy EF** (ta sama reguła co `#/porownaj` w projekcie A/B: `edition_id`, a do jego czasu data ±1 + dystans ±3 %; do wyniesienia do `js/wyniki-dopasuj.mjs`, żeby EF i `wyniki.html` miały JEDNĄ kopię) — ≤ 4 RPC, bez nowego RPC | „Wspólne starty: 3. Ty szybszy w 2 (Bieg Niepodległości 2025: 45:10 vs 46:02; …).” | `porownanie` (dwie kolumny, ≤ 5 wierszy) + „Otwórz porównanie” → `wyniki.html#/porownaj/<a>/<b>` |
| mój najlepszy wynik na 10 km w tym roku | `\b(najlepsz\w* (czas\w*|wynik\w*)|rekord\w*|zyciowk\w*)\b.*\b(w tym roku|w 20\d\d|z 20\d\d)\b` + dystans (jak kalkulator: dycha/piątka/km) | `moje_wyniki {rok, dystans}` — **bez nowego RPC** (filtr `runner_results` po roku i ±3 % dystansu) | „Najlepszy czas na 10 km w 2026: 48:10 (Bieg Testowy, 10.09).” | `rekord` (istniejąca, `zrodlo: wyniki`) |

Kolejność w routerze: zagadka → „kto wygrał …” → „moje miejsce” / „najlepszy w roku” (przed dzisiejszym `moje_rekordy`,
bo „rekord” + rok to F6, nie `pb_*`) → `rekord trasy` (przed `cudzyRekord`, który dziś wyrzuca „trasy” do sieci) →
„porównaj” (przed trybem osoby — inaczej „porównaj mnie z Janem Kowalskim” wpadnie w `osobaWZdaniu` jako zwykłe
pytanie o osobę) → reszta jak dziś. Ma NIE trafić: „kto wygrał maraton w berlinie” → `wyniki_imprezy` → F6 0 → **nie**
„Nie znalazłem” tylko dalej do ścieżki ogólnej (sieć) — jak dziś; „kto jest moim trenerem” (`moj_trener` wcześniej);
„porównaj tempo 5:00 i 12 km/h” (brak osoby → kalkulator/model).

Karty UI (js/okienko.js, wszystko przez `esc`, klucze przez `data-*` + `RE_KLUCZ_F6`): `podium` (3 wiersze, bez linków
do profili obcych), `impreza_wyniki` (nazwa, data, dystans, liczba na mecie, „Twoje miejsce” tylko gdy jest), `porownanie`
(nagłówek „Ty · X”, wiersze impreza · czas · czas, przewaga pogrubiona), `rekord_trasy`. „Otwórz wyniki” — dziś
`races.html` (widżet od zera); po kroku 1 projektu A/B `wyniki.html#/zawodnik/<klucz>`, `#/impreza/<klucz>/<rok>`,
`#/porownaj/<a>/<b>` — to zmiana `EKRANY` w DWÓCH kopiach (EF `narzedzia.mjs` + `js/okienko.js`, blizna-65/76) i
`bezpiecznyCel` musi dopuścić hash z kluczem walidowanym wzorcem (dziś porównuje adres z listą 1:1). Nazwiska zwycięzców
są pokazywane tak, jak pokazuje je dziś widżet wyników — żadnej nowej kategorii danych; wiersz `scope='private'` i wiersze
ukryte wnioskiem erasure filtruje F6 (wymaganie projektu A/B do kontraktu), okienko nic nie dokłada.

„Który X?” / „Który to Ty?”: klient wysyła to samo pytanie z `wybor: { x: <runner_key> }` (i/lub `ja: <runner_key>` —
„ja” zapisuje się jak dziś RPC `ustaw_f6_runner_key` po tapnięciu „To ja”); EF waliduje `RE_KLUCZ` i używa klucza
zamiast `search_runners`. Pole `wybor` NIE pozwala pominąć `athlete_id` z sesji — dotyczy tylko kluczy F6 (dane publiczne).

Strażnik liczb dla `porownaj`: wynik narzędzia zawiera `czas_s` obu osób, daty i **policzone w EF** `roznica_s`,
`roznica_pct`, `bilans` — zdania z szablonu; model (jeśli kiedyś dostanie to narzędzie) nie może liczyć różnic („o 52 s”),
bo strażnik odrzuci liczbę, której nie ma w JSON-ie wyniku.

---

## 4. Ławka 100 pytań, cel ≥ 95 % dobrych

### 4.1 24 nowe pytania (76 → 100), z oczekiwaną ścieżką

| # | pytanie | kat. | oczekiwane | zależy od |
|---|---|---|---|---|
| 77 | wyniki nowaka małą literą → `wyniki kowalskiego` | nazwiska | osoba, siec=false, koszt 0 | 1 (A) |
| 78 | jak poszlo wisniewskiemu | nazwiska | osoba, siec=false | 1 (A) |
| 79 | nowak wyniki | nazwiska | osoba, siec=false | 1 (A) |
| 80 | czy kowalski biega | nazwiska | osoba, siec=false | 1 (A) |
| 81 | wyniki poznania | nazwiska-nie | NIE osoba; impreza/biegi lub ścieżka ogólna; siec dozwolona (nazwa miasta) | 1.3 miasta |
| 82 | wyniki biegu niepodleglosci | wyniki | `wyniki_imprezy` (po 3) / do tego czasu impreza bez sieci; siec=false | 3 (event_info + event_results) |
| 83 | kto wygral bieg niepodleglosci 2025 | wyniki | `wyniki_imprezy`, siec=false, koszt 0 | 3 (event_info + event_results) |
| 84 | ile osob bieglo w debnie | wyniki | `wyniki_imprezy`, koszt 0 | 3 (event_info) |
| 85 | moje miejsce w kategorii | wyniki | `moje_wyniki` {miejsce}, koszt 0 | 3 (bez nowych RPC) |
| 86 | rekord trasy w debnie | wyniki | `rekord_trasy`, siec=false | 3 (event_info) |
| 87 | porownaj mnie z Robertem Korzeniowskim | wyniki | `porownaj`, siec=false (mimo osoby publicznej!) | 3 (bez nowych RPC; `edition_id` tylko poprawia dopasowanie) |
| 88 | moj najlepszy wynik na 10 km w tym roku | wyniki | `moje_wyniki` {rok, dystans}, koszt 0 | 3 (bez RPC) |
| 89 | ile przebieglem | wlasne | `moje_treningi` domyślnie tydzień | 2.2 |
| 90 | ile spalilem kalorii w pazdzierniku | wlasne | `moje_kalorie`, koszt 0 | 2.3 |
| 91 | ile kcal w jajku | poza | `produkt` (katalog), koszt 0 | 2.4 |
| 92 | mam goraczke czy moge biegac | wlasne | router/zdrowie, koszt 0 | 2.6 |
| 93 | jak sie przygotowac do maratonu | poza | NIE impreza; sieć z oryginalnym tekstem (tolerowane: za droga) | 2.7 |
| 94 | 12 | poza | router/powitanie, koszt 0 | 2.1 |
| 95 | ok | poza | router/powitanie | 2.1 |
| 96 | ile dni w tygodniu biegac | poza | model (tolerowane) — kontrola, że NIE wpada w `moja_objetosc` | 2.5 |
| 97 | ile km mam w planie na ten tydzien | wlasne | `moj_plan` tydzień (dziś: `plan … tydz`) — kontrola regresji po 2.5 | 2.5 |
| 98 | kim jest Fabian Kowalski | akcja | zagadka (oba stany) — kontrola, że sekcja 1 nie przebija `fabian*` | 1 |
| 99 | wyniki Fabianka | akcja | zagadka, siec=false, F6=0 wywołań | 1 |
| 100 | Jan Kowalski vs Anna Nowak | wyniki | `porownaj` dwóch obcych → siec=false; albo odmowa „porównuję tylko Ciebie z kimś” (decyzja) | 3 |

Rozkład po dołożeniu: własne 15, osoby 16, nazwiska 5, imprezy 12, treści 13, poza 17, akcja 13, wyniki 9 = 100.

### 4.2 Ocena obiektywna zamiast kolumny „ocena”

Dziś `PYTANIA[i][3]` to ręczna ocena wpisana po przebiegu — ławka nie może więc zmienić koloru sama. Propozycja: kolumna
`oczekiwane` (obiekt) i wyliczana ocena:

```js
// pytanie, kategoria, waga, oczekiwane, komentarz
['wyniki nowaka', 'nazwiska', 3, { sciezka: /^osoba$/, siec: false, kosztMax: 0 }, '…'],
['kto wygral maraton w berlinie', 'poza', 3, { sciezka: /SIEĆ/, siec: true, kosztMax: 0.03 }, '…'],
['co jesc przed polmaratonem', 'poza', 4, { sciezka: /^MODEL→SIEĆ/, siec: true, kosztMax: 0.03, tolerowane: 'za_droga' }, '…'],
```
Reguła oceny (w tej kolejności): `zla` gdy `oczekiwane.siec === false && siec` (wyciek) **albo** ścieżka nie pasuje do
`sciezka`; `pusta` gdy zdanie ∈ {NIE_MAM, ODP_NIC, ODP_IMPREZA_PUSTO} a `oczekiwane.pusta !== true`; `za_droga` gdy
`koszt > kosztMax`; inaczej `dobra`. `tolerowane` liczy się osobno („świadomie drogie”) i nie wchodzi do mianownika progu.
Do tego dwie twarde asercje niezależne od progu: (1) suma wyjść do sieci dla pytań z `siec: false` = 0; (2) liczba wywołań
F6 dla pytań kategorii `akcja` = 0 (licznik w `fetchF6` atrapy). Wyjście: jak dziś tabela + „% dobrych = dobra / (100 −
tolerowane)”; flaga `--prog 95` → kod wyjścia 1 poniżej progu. Ławka zostaje narzędziem ręcznym (nazwa bez `.test.js`),
ale blizna-108 wywołuje ją programowo i sprawdza TYLKO twarde asercje (wyciek, F6 w akcji) — kolor progu to decyzja Filipa
(sekcja „Pytania”).

Atrapa F6 do rozbudowy razem z 3: `event_info`, `event_results` i `runner_results` z `edition_id` w `F6` w `_lawka-pytan.js`,
z kształtem z uzgodnionego kontraktu — dopóki kontraktu nie ma, pytania 82–88 mają `oczekiwane.sciezka` ustawione na stan
dzisiejszy (impreza bez sieci / osoba) i podnosi się je dopiero w etapie 6.

---

## 5. Koszty i limity

### 5.1 Stan (z kodu)

- Model: `gemini-3.5-flash-lite`, 0,30 / 2,50 USD za 1 M (we/wy), do 1 + 3 rund narzędzi, `maxOutputTokens 256`; średnio
  (log 1.11, w ławce) 2143/63 tok ≈ $0,0008; sieć +1842/157 tok + 1,44 zapytania × $0,014 ≈ $0,021; retry bez
  `groundingChunks` podwaja.
- Limity okienka: **60/dobę/osobę** dla trybów `flash`+`blad` (`uzyteDzis`), **20/dobę/osobę** sieci (`siec` + `osoba`/
  `impreza` z `zapytania_sieci ≥ 1`), **`OKIENKO_BUDZET_USD`** miesięcznie z sumy logu (0 = brak limitu; ≥ 80 % → jeden
  wpis `budzet80`). Wartość na prod — **[poza repo]**. Luki (przegląd A pkt 14): sieć w trybach osoba/impreza omija
  budżet; `siec` nie wlicza się do 60 (realnie 80 wywołań modelu/dobę/osobę).
- F6: Caddy 300/min na IP + 60/min na nagłówek Authorization (spec, decyzja B2); `event_propose` 5/dobę/konto; strefa
  `na_zapis` 10/min; `events_search` z `Cache-Control: private, max-age=3600`; w EF pamięć 10 min / 500 wpisów w
  izolacie (znika przy zimnym starcie), timeout 8 s, 429 → `BladF6("limit")` bez odczytu `Retry-After`.
- Bez `GEMINI_API_KEY`: router/osoba/impreza/katalog/pamięć działają, model → 502 bez wpisu w logu (przegląd A).

### 5.2 Co zmienić po dołożeniu narzędzi wynikowych

1. **Liczyć F6 w logu**: kolumna `okienko_log.zapytania_f6` (migracja + WYCOFANIE), `f6()` inkrementuje licznik
   w kontekście żądania (nie globalny). Bez tego nie wiemy, czy „porównaj” (do 4 RPC: 2× search_runners, 2× runner_results)
   albo „kto wygrał” (3 RPC: events_search, event_info, event_results) jest problemem. Pamięć 10 min łapie powtórki.
2. **429 z F6 z `Retry-After`** → `retry_s` w odpowiedzi EF i chip „Spróbuj ponownie” w kliencie; przy 429 w środku
   „porównaj” (np. po 3 z 5 RPC) — odpowiedź częściowa z tym, co jest (karta wyników jednej osoby) + zdanie o zajętej
   maszynie, nie pusty ekran. Limit 60/min na token jest per użytkownik, więc jedno pytanie go nie wyczerpie; wspólne
   300/min na IP EF może — gdy to się zdarzy, log pokaże skupisko `f6: limit` i wtedy decyzja o drugim adresie/wyższym
   limicie w Caddy (ops kolektora, poza tym repo).
3. **Budżet i 60/dobę**: `sieciDozwolona` (osoba/impreza) też przez `sprawdzLimity(adm, …, BUDZET)`; `uzyteDzis` liczy
   także tryb `siec`. Tryby wynikowe są 0 tokenów — nie wchodzą do 60 ani budżetu (jak router), ale wchodzą do
   `zapytania_f6`.
4. **Timeout Gemini** (przegląd A pkt 17): `AbortController` 15 s w `model.mjs` i `siec.mjs` — klient i tak przerywa
   po 20 s, EF dziś liczy i płaci dalej.
5. **Szacunek budżetu** (do ustawienia `OKIENKO_BUDZET_USD`, jeśli jest 0): ławka = $0,30 / 76 pytań ≈ $0,004 na
   pytanie przy obecnym rozkładzie; po sekcjach 1–3 udział sieci spada (9 „za drogich” → ≤ 3). Przy 60 osobach × 5 pytań
   dziennie ≈ $1,2/dobę ≈ $36/mies. w górnym scenariuszu → sugerowane 40 USD z progiem 80 % = ostrzeżenie przy 32.
   To rachunek z symulacji, nie z faktury — **[poza repo]** realne liczby z `okienko_log`; sprawdzić po tygodniu.
6. **Pamięć sieci po rdzeniach** (2.7) obniża koszt sieci bez zmiany limitów; klucz: posortowane rdzenie bez stop-słów,
   TTL 24 h bez zmian, nadal bez pytań „wyglądających na osobę”.

---

## Kolejność wdrożenia po 8.11 (każdy etap: jeden commit, blizna, miara na ławce)

Numery blizn od 108 (ostatnia w repo: 107). Etapy 1–3 nie zależą od F6; 6 zależy od projektu równoległego.

| etap | zakres | blizna | miara na ławce (100 pytań) |
|---|---|---|---|
| **E0** (bez zmian zachowania) | 24 pytania (4.1), `oczekiwane` + ocena obiektywna (4.2), twarde asercje wycieku i F6-w-akcji, atrapa z Półmaratonem Warszawskim | blizna-108 (ławka programowo: 0 wyjść `siec:false`, 0 F6 w `akcja`) | linia bazowa: dobra 66+?, policzone automatycznie, bez ręcznej kolumny |
| **E1** tanie bramki | bez liter (2.1), `km` domyślnie tydzień (2.2), `ZDROWIE` infekcje (2.6, po OK Filipa), `NIE_IMPREZA` porady (2.7 min.), cena z intencją (2.8), timeout Gemini, `siec` w 60 + budżet w `sieciDozwolona` (5.2 pkt 3–4) | blizna-109 | zła 0; za droga 9 → ≤ 5; koszt symulacji $0,30 → ≤ $0,22 |
| **E2** nazwiska małą literą (A) + miasta | `RE_SZABLON_NAZWISKA`, `SLOWA_APLIKACJI`, `_shared/miasta.mjs` + generator, „Który X?” dla ≥ 2 trafień samego nazwiska, `wygladaNaNazwisko` bez wymogu dużej litery w szablonie | blizna-110 (10 trafień, 10 nie-trafień, 0 sieci; plik miast wygenerowany) | kategoria `nazwiska`: 5/5 dobre, `nazwiska-nie` 0 fałszywych; wyjścia nazwisk do sieci = 0 |
| **E3** słownik nazwisk (B) + pozycja poza szablonem (C) | `_shared/nazwiska.mjs` (generator w tools/, próg z decyzji), `osobaWZdaniu` wariant małej litery ze słownika, `SLOWA_POSPOLITE` | blizna-111 (kształt słownika jak blizna-72; „kowalski w debnie” → osoba) | +2 pytania poza szablonem dobre; tolerowane fałszywe ≤ 1 |
| **E4** narzędzia własne | `moja_objetosc` (2.5) + `_shared/przyrost.mjs` (równość z generatorem), `moje_kalorie` (2.3) + `js/kalorie.mjs` jako jedna kopia MET | blizna-112 (równość kopii; filtr na wołającego; liczby tylko z narzędzia) | #49, #9, #89, #90 dobre; 14 narzędzi w blizna-64 |
| **E5** produkty | `produkt` z `food_database` (2.4) — po decyzji | blizna-113 | #43, #91 dobre |
| **E6a** wyniki bez nowych RPC (niezależne od kolektora; razem z krokiem 1 projektu A/B) | `moje_wyniki {miejsce, rok, dystans}`, `edycje_imprezy` na `events_search`, **`porownaj`** z dwóch `runner_results` (data ±1 + dystans ±3 %, wspólna funkcja `js/wyniki-dopasuj.mjs` z projektem A/B), „Który X?”/`wybor` w ciele, karty `wyniki` z kategorią i `porownanie`, `siec: false` twardo, `Retry-After` w f6.mjs, `zapytania_f6` w logu (migracja), `EKRANY` → `wyniki.html#/…` gdy strona istnieje | blizna-114 (0 wyjść do sieci także dla osoby publicznej; `wybor` tylko RE_KLUCZ; dopasowanie = ta sama funkcja co `wyniki.html`) | #85, #87, #88, #100 dobre; log ma licznik F6 |
| **E6b** wyniki imprezy (po kroku 3 projektu A/B: kolektor `event_info`, `event_results`, `edition_id`) | `wyniki_imprezy` (`events_search` → `event_info` → `event_results` limit 3), `rekord_trasy` (`event_info.rekord_trasy`), `edycje_imprezy` na `event_info`, `porownaj` po `edition_id`, karty `podium`/`impreza_wyniki`/`rekord_trasy`, `RPC_DOZWOLONE` + blizna-53 | blizna-115 (sieć = 0 gdy F6 odpowiedziało; wynik do modelu ≤ 20 wierszy; `event_results` zawsze z `p_limit ≤ 3` z okienka) | #82, #83, #84, #86 dobre; cel ≥ 95 % liczony bez tolerowanych |
| **E7** porady stałe (opcja) | `_shared/porady.mjs` z treścią od Filipa, pamięć sieci po rdzeniach | blizna-116 | #46, #47, #93 z „tolerowane” → dobre |

Po każdym etapie: `node tests/_lawka-pytan.js --etap E<n>` → `docs/lawka-pytan-<data>-E<n>.md`; wpis w
`docs/okienko-spec.md` (sekcja „Po 8.11”), `CACHE_VERSION` bumpuje CI. Przy zamknięciu akcji (`ZAMKNIETA = true`) —
osobny punkt z pamięci: zawęzić `fabian*` (nie w tym projekcie, ale E2 nie może tego ominąć: test #98/#99).
Splot z projektem A/B: E6a może iść razem z jego krokiem 1 (`wyniki.html` na istniejących RPC), E6b czeka na jego krok 3
(kolektor); okienko „pobiegłem 10 km w 44:30 w Dębnie” → karta „Zapisz wynik” (jego krok 5, część B) nie jest w tym
projekcie — zasada bez zmian: EF i model nie piszą.

---

## Pytania do Filipa

1. **Katar/infekcje → stałe zdanie** (2.6) — zmiana decyzji z 1.11 („zostaje w sieci”). Ławka: sieć płaci za odpowiedź,
   której prompt zabrania. Tak/nie?
2. **Porady ogólne** (2.7): buty, co jeść przed startem, jak się przygotować — zostają w sieci (24 h pamięć po
   rdzeniach), czy dostają 5–8 stałych odpowiedzi trenera? Jeśli tak — teksty od Ciebie, ja nie piszę porad treningowych.
3. **Produkty i kalorie** (2.3, 2.4): dwa razy „osobna decyzja” — czy okienko ma czytać `food_database` (SELECT
   authenticated już jest) i liczyć spalone kcal z MET × waga (ta sama formuła co kafel Forma)? Osobno: „ile kalorii
   dziennie” (cel z `nutrition_profiles`) — w zakresie czy nie?
4. **Słownik nazwisk** (1.2 B): zgoda na pobranie zbioru PESEL nazwisk z dane.gov.pl i próg (≥ 1000 jak imiona, czy
   ≥ 2000 = mniejszy plik)? Oraz lista miast z TERYT (1.3) — same miasta (~2,5 tys.) czy też wsie?
5. **Samo nazwisko z wieloma trafieniami** (1.2 C): pokazać listę ≤ 5 obcych osób „Który X?” (dane publiczne F6, jak
   widżet), czy tylko zdanie „dopisz imię”?
6. **Kontrakt F6** — przyjmuję nazwy z projektu A/B (`event_info`, `event_results`, kolumny w `runner_results`, bez
   `head_to_head`). Do rozstrzygnięcia dla okienka: podium K/M osobno (jest `position_gender`/`gender`) czy tylko open;
   czy zwycięzcy mają być pokazywani nazwiskiem w okienku (tak jak dziś w widżecie) — zakładam tak; czy funkcja dopasowania
   wspólnych startów ma leżeć w `js/wyniki-dopasuj.mjs` (jedna kopia dla EF i `wyniki.html`).
7. **„Porównaj X z Y”** (dwie obce osoby, #100): dozwolone (dane publiczne) czy tylko „ja vs X”?
8. **`OKIENKO_BUDZET_USD`** na prod: jest ustawione? Jeśli 0 — propozycja 40 USD (5.2 pkt 5) po tygodniu z licznikiem
   `zapytania_f6`.
9. **Ławka jako bramka**: zostaje ręczna (dziś), czy blizna-108 ma też próg 95 % (czerwono przy spadku)? Twarde asercje
   wycieku rekomenduję blokująco niezależnie od decyzji o progu.
10. **Cena bez karty** (2.8): sieć z intencją wpisowego, czy w ogóle bez sieci („cenę podaje organizator”)?
11. **Log**: nowy tryb `wyniki` w CHECK (migracja) czy `router` + nazwa narzędzia (bez migracji; ale `zapytania_f6`
    i tak wymaga migracji)?
