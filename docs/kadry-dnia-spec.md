# Kadry dnia — hero „Dziś" (kadry v2)

> **Status na 2026-10-31.** Dokument opisuje stan faktyczny, nie pierwotny pomysł:
> gdzie decyzja zmieniła się w trakcie budowy, jest tu wersja obowiązująca.
> Liczby zweryfikowane pomiarem są oznaczone „(zmierzone)".

## Zasada nadrzędna

Kadr na „Dziś" pokazuje to, co człowiek dziś **naprawdę zobaczy**: porę roku, pogodę, typ treningu. Prawda przed efektem — kadr ze śniegiem w lipcu to błąd, nie nastrój. Wybór kadru jest **twardy** po porze roku i pogodzie, a dopiero potem losowy.

## Gdzie żyje

| warstwa | co |
|---|---|
| obrazy | `biegamy-assets/kadr-01…65.jpg` (commit `9e008fa`), 893×1600, JPEG; stare `solo-01…65.webp` zostają do decyzji |
| dobór | `sb.js` → `window.SOLO`: `TAGI`, `sezonKadru`, `sezonDnia`, `dopasujN` |
| ekran | `zawodnik.html` → `SOLO_PREFIX = 'kadr-'`, `SOLO_EXT = '.jpg'`, `SOLO_ILE = 3`, podpisy `_SOLO_PODPISY[nr-1]` |
| generator | `tools/kadry/generuj-kadry.mjs` (lokalny, nie front) |
| strażnik | `tests/blizna-56-solo-pora-roku.test.js` |

**Numer jest kluczem wszystkiego:** kadr `NN` = podpis `_SOLO_PODPISY[NN-1]` = tag `TAGI[NN]` = pora `sezonKadru(NN)`. Pula = `_SOLO_PODPISY.length` = **65**.

## Tagi

| tag | źródło | znaczenie |
|---|---|---|
| `p:` (pogoda) | `TAGI[n].p` | `deszcz`, `snieg`, `upal`, `wiatr`, `mgla` — wykluczenia `WYKL` (np. upał wyklucza deszcz i śnieg) |
| `t:` (trening) | `TAGI[n].t` | `interwaly`, `tempo`, `regeneracja`, `dlugie`, `silownia` — preferencja 55 % |
| `s:` (pora roku) | `sezonKadru(n)` | `p:snieg` → zima, `p:upal` → lato, **nocne `n % 12 = 0` → `PORY[(n/12−1) % 4]`** (12 wiosna, 24 lato, 36 jesień, 48 zima, 60 wiosna), reszta `PORY[n % 4]` (wiosna/lato/jesień/zima) |

Nocne rotują po porach, bo przy samym `n % 4` wszystkie pięć byłyby wiosenne (pokazywane tylko marzec–maj).

**Pule pór (zmierzone):** wiosna 14, lato 19, jesień 13, zima 19.

## Dobór — `SOLO.dopasujN(N, dzień, 3)`

Kolejność filtrów:
1. **pora roku** — `sezonDnia()` z daty w Warszawie (meteorologicznie: III–V wiosna, VI–VIII lato, IX–XI jesień, XII–II zima); kadr innej pory **wykluczony**;
2. **pogoda** — z `sessionStorage` (`weather:*`), wykluczenia `WYKL`;
3. **anty-powtórka** — ostatnie `min(30, floor(pula pory / 2))` kadrów z `solo_hist`;
4. preferencja (55 %): tag `t:` zgodny z dzisiejszym treningiem albo `p:` zgodny z pogodą.

**Pula nigdy pusta:** gdy anty-powtórka zjada wszystko, odpada anty-powtórka; gdy pogoda — odpada pogoda; gdy pora — cała pula.

**Wynik dnia jest stały** (`localStorage.solo_dzien = {d, N, ile, nr}`): pierwsze wejście dnia losuje i raz dopisuje do `solo_hist`; kolejne zwracają to samo. Do 31.10 każde przeładowanie dawało inny kadr.

## Generator — `tools/kadry/generuj-kadry.mjs`

```
node tools/kadry/generuj-kadry.mjs --out <katalog> [--nr 46,31,7 | --od 1 --do 65] [--odstep 10] [--force]
    [--log <plik>] [--podglad <html>] [--tylko-podglad] [--pokaz-prompty] [--dociagnij-rozmiar]
```

- `--out` **obowiązkowe** — do `biegamy-assets` dopiero po akceptacji siatki; próby do scratchpada.
- Klucz z `GEMINI_API_KEY` (środowisko), nie trafia do plików.
- `TAGI` i `sezonKadru` **wycinane z `sb.js`**, podpisy z `zawodnik.html` — żadnej drugiej kopii mapy.
- Model `gemini-nano-banana-2.1` (Interactions API), `aspect_ratio 9:16`, `image_size 2K` → (zmierzone) 1536×2752, 3–4,4 MB.
- Skalowanie: dłuższy bok → 1600 px (893×1600), JPEG q80; **> 300 KB po q80 → q75**. Ten sam `jpeg.wasm` (imagescript 1.2.15) co EF `race-image`.
- **Limit 150 s na zapytanie + jedno ponowienie** (zmierzone 31.10: kadr 32 wisiał 19 min, kadr 35 prawie 3 h bez limitu). 401/403/429/5xx → STOP; brak obrazu → następny numer. Domyślnie pomija istniejące pliki.
- `--podglad` buduje siatkę 6×11 (lokalne ścieżki `file://` — plik roboczy, nie do repo).

### Prompt (rdzeń)

```
Pionowy kadr dnia dla biegacza, Polska. {SCENA}. {PORA ROKU}, {PORA DNIA}.
Kadr: {KOMPOZYCJA}; daleko od siebie, na pustym odcinku trasy. Żadnego tłumu, żadnej grupy.
Styl dokumentalny: obiektyw 35 mm, lekkie poruszenie sylwetek w ruchu, zróżnicowane zwykłe stroje biegowe, niedoskonałe, nieustawiane światło.
Kompozycja pionowa: biegacz w górnej lub środkowej części kadru, dolna jedna trzecia spokojna — pusta nawierzchnia, cień, bez ważnych szczegółów.
Bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów.
```

- **SCENA** z tagu (`p:`/`t:`, tabela `SCENA`), bez tagu → `BEZ_TAGU[n % 4]` (osiedle / park / droga polna / nabrzeże). Siłownia: osoba w rozciąganiu, bez biegania.
- **PORA ROKU** = `sezonKadru(n)` — ta sama funkcja co dobór, więc obraz zgadza się z wykluczeniem.
- **PORA DNIA** = `n % 3` (świt / dzień / zmierzch); nocne `n % 12 = 0` → noc, czołówka, latarnie.
- **KOMPOZYCJA** = `(n·7) % 4`: 0 od tyłu w osi drogi · 1 z boku przy krawędzi kadru · 2 z góry (most, nasyp, wzgórze) · 3 nisko przy ziemi.
- **Wyjątki sceny z podpisu** (`SCENA_Z_PODPISU`, każdy = decyzja Filipa):

| kadr | podpis | scena |
|---|---|---|
| 5 | Wszystko zaczyna się od *sznurówek*. | para butów do biegania na progu, poranne światło, nisko przy ziemi, **bez człowieka i bez dłoni** |
| 14 | Jesień kibicuje *złotem*. | droga polna w złotych i czerwonych liściach, ciepłe niskie słońce |
| 22 | Na starcie wszyscy mamy *ten sam puls*. | pusta linia startu na asfalcie, jeden biegacz w rozgrzewce, świt |

## Pula v2 (31.10.2026)

| | |
|---|---|
| kadry | 65 (57 z rundy v3 + 8 zachowanych z v2: śnieg 6, 49–51; upał 28, 52–54) |
| rozmiar (zmierzone) | 141–466 KB, średnio 264 KB, razem ~16,8 MB |
| generowanie (zmierzone) | średnio 49 s/kadr (31–194 s) + 10 s odstępu |
| koszt | stawka 2K niezweryfikowana (1K = ≈ $0.034) |

## Zaległości

**(a) Pule 13–19 kadrów na porę → powtórki po 2–3 dniach.** Anty-powtórka = połowa puli pory (6–9 kadrów), przy 3 kadrach dziennie. Lekarstwo: numery **66+** z nowymi podpisami (pula rośnie, a numer nadal = podpis = tag).

**(b) 16 plików > 300 KB mimo q75:** 01 (342), 13 (344), 14 (368), 16 (356), 19 (315), 25 (329), 28 (301), 34 (327), 37 (356), 39 (337), 40 (466), 46 (307), 53 (310), 54 (317), 61 (376), 64 (316). → **WebP osobnym commitem** (gęsta zieleń i mokre liście to najgorszy przypadek dla JPEG).

**(c) RÓŻNORODNOŚĆ v4 — kadry za podobne do siebie** (uwaga Filipa po akceptacji siatki v3). Cztery kompozycje to za mało: wciąż dominuje „jedna sylwetka na drodze". Następna runda wariantuje kilka osi naraz — **tabela osi, bez implementacji**:

| oś | warianty | uwagi |
|---|---|---|
| podmiot | 1 biegacz · 2 biegaczy · **bez człowieka**: buty, zegarek, znak szlaku, linia mety | „bez człowieka" sprawdzone na kadrze 5 (buty na progu) — działa |
| kompozycja | od tyłu w osi · z boku przy krawędzi · z góry · nisko przy ziemi | dziś jedyna oś; „z boku" wychodzi tylko częściowo (część nadal od tyłu) |
| pora dnia | świt · południe · zmierzch · noc | dziś `n % 3` (bez południa) + noc co 12. numer; SOLO nie zna godziny |
| pogoda | deszcz · mgła · wiatr · (pogodnie) | dziś tylko przez tagi `p:`; kadry bez tagu bywają szare z przyzwyczajenia modelu |
| ogniskowa | szeroki 24 mm · standard 35 mm · kompresja 85 mm | dziś zawsze 35 mm — główna przyczyna podobieństwa perspektywy |
| dystans | detal (buty, dłoń na zegarku, sznurówka) · plan średni · pejzaż | dziś niemal zawsze plan średni / daleki |

Warunek: każda oś musi dać się wyprowadzić **z numeru** (jak `(n·7) % 4`), żeby numer pozostał jedynym kluczem, a ponowne wygenerowanie dawało ten sam opis.

## Grafiki v4 — osie wariantów (G1, 31.10.2026)

Odpowiedź na zaległość (c): `tools/kadry/osie.mjs` — jedno źródło dla generatora i testu `blizna-57`. Każdy numer dostaje
deterministycznie: kompozycja `(n·7)%4`, podmiot `(n·3)%5` (1 biegacz od tyłu / dwójka / detal bez człowieka /
pejzaż bez człowieka / biegacz mały w dużym pejzażu), pora dnia `(n·5)%4` (świt / rano / południe / zmierzch),
pogoda `(n·11)%4` (czyste niebo / zachmurzenie / mgła / po deszczu), ogniskowa `(n·13)%3` (24 / 50 / 85 mm).
Reguły nadrzędne: wyjątek sceny wygrywa; noc tylko `n % 12 = 0`; tag `p:` i siłownia znoszą oś pogody; zima + po deszczu
= mokry śnieg; detal bez twarzy i dłoni, **detal + 24 mm → 85 mm**; dwójka obok siebie, nie grupa; pejzaż 21:9 bez
biegacza z bliska (0/1 → 3/4); **mgła tylko o świcie/rano** (mgła z osi albo `p:mgla` + południe/zmierzch → świt).
Generator: `--pula dzis|pejzaz|typ|strona`, `--format 9x16|21x9`; kadry 1–65 powstały promptem v3 (bez osi) i zostają.

### G2 — kadry 66–89 (31.10.2026, NA PROD)

24 nowe numery z podpisami SOLO-3 i JAWNĄ porą `s:` w `TAGI` (6 na porę: 66–71 zima, 72–77 lato, 78–83 wiosna,
84–89 jesień; noce 72 i 84 w swojej porze). Pliki `kadr-66…89.jpg` w `biegamy-assets` (`430523b`), pula „Dziś" = 89.
- **Osie a poprawka nawierzchni:** 66–83 wygenerowane na osiach SPRZED poprawki nawierzchni (kompozycja mówiła „droga"
  na sztywno); 84–89 oraz powtórki 69, 74, 88 — PO niej (kompozycja odmienia nawierzchnię sceny).
- **Detale wg pory roku (decyzja Filipa po siatce G2):** „numer startowy z agrafkami" wypadł z detali NA STAŁE (model
  rysował cyfry albo pustą kartkę). Listy: zima {rękawiczki, czołówka, buty}, jesień {rękawiczki, czołówka, buty, zegarek},
  wiosna {buty, zegarek, bidon, czołówka}, lato {buty, zegarek, bidon, czapka z daszkiem}; indeks `floor(n/5) % długość
  listy pory`. `blizna-57`: rękawiczki nigdy latem, bidon nigdy zimą, każdy przedmiot swojej pory występuje w 1..200.
- **Wyjątek sceny 88:** „buty startowe i agrafki na stole, obok zegarek, poranek" — podpis o starcie czytelny bez numeru.
- **Powtórzone 69, 74, 88** (wszystkie trzy lepsze, wzięte): 69 czołówka na ośnieżonej ławce (było: pusta kartka),
  74 bidon na polnej drodze we mgle (było: rękawiczki latem), 88 buty + agrafki + zegarek (było: pusta kartka).
- **Nie powtórzone, choć prompt się zmienił** (obraz zgodny z porą, zostaje): 79 obraz buty / prompt czołówka,
  84 obraz zegarek / prompt rękawiczki, 89 obraz bidon / prompt czołówka. Ponowne wygenerowanie da inny przedmiot.

### Na później (decyzje Filipa 31.10, NIE zrobione)

**G3 — pula pejzażowa 21:9 dla `.bm-hero`:**
- `SOLO.dopasujN` ma JEDEN klucz `solo_dzien` i jedną `solo_hist`. Druga pula wołana tą samą funkcją nadpisałaby wynik
  dnia „Dziś" i zepsuła anty-powtórkę → **osobny klucz i historia per pula** (`solo_dzien_pejzaz`, `solo_hist_pejzaz`),
  tagi pejzażu bez `TAGI` kadrów Dziś.
- Lista stron z `.bm-hero` **wg zwiadu, nie wg projektu**: races, kalendarz, raporty, nutrition, odznaki, wyzwania,
  radio, compare, trener, ankieta. Bez Profilu (wyłączony z ujednolicenia hero), bez Społeczności, Logu i Formy
  (to sekcje `zawodnik.html` bez `.bm-hero`).

**G4 — banery typów 21:9 (`typ-<slug>.jpg`), 8 typów z `TRAINING_TYPE_BANNERS`:**

| typ | temat |
|---|---|
| Spokojny | alejka w parku rano |
| Interwały | linia bieżni, 85 mm |
| Tempo | mokra asfaltowa prosta o zmierzchu |
| Wybieganie | pusta droga przez pola, 24 mm |
| Regeneracja | ławka w parku, poranek |
| Wzmacniający | hantle na podłodze przy oknie |
| Start | pusta linia startu o świcie |
| Zastępczy | rower oparty o płot o świcie |

**Koszt 2K:** do sprawdzenia w rozliczeniu AI Studio po G2 (stawka $0,034 dotyczy 1K).

## LEKCJA (31.10.2026): oś „mod 4" z nieparzystym mnożnikiem to n % 4 w przebraniu

Osie G1 liczyły pogodę `(n·11)%4`, porę dnia `(n·5)%4` i kompozycję `(n·7)%4`. Każdy nieparzysty mnożnik jest
względnie pierwszy z 4, więc każda z tych osi to bijekcja `n % 4` — a pora roku pejzażu (i kadrów bez tagu) to też
`n % 4`. Skutek: w obrębie pory roku pogoda, pora dnia i kompozycja były **stałe** (lato = zawsze „po deszczu",
jesień = zawsze mgła, zima = zawsze zachmurzenie). Filip zobaczył to na siatce jako „głównie jesienno-zimowo".
`blizna-57` była zielona, bo sprawdzała **listy** wartości, nie to, co trafia do promptu.

**Reguła:** test różnorodności czyta **prompt** (wyjście generatora `--pokaz-prompty`, z tagami, nocami, wyjątkami
i regułami), nie tablice w kodzie. Wzór wybiera się **wyszukiwaniem pod test**, nie zgaduje.

### Stan po poprawce

- Osie mod 4 od `m = n + floor(n/4)`: **pogoda `m % 4`**, **pora dnia `(floor(n/2) + floor(m/16)) % 4`**,
  **kompozycja `(2m + floor(m/4)) % 4`**; podmiot `(n·3)%5`, ogniskowa `(n·13)%3` bez zmian.
  Propozycja „pora `(3m+1)%4`, kompozycja `(m+floor(m/4))%4`" obalona testem: `(3m+1)%4` to przesunięta kopia pogody
  (4 z 16 par), a reguła „mgła tylko o świcie" zlewała dwie z trzech pór w oknie. Z 1024 + 528 kandydatów 283 przeszło;
  wybrany najprostszy przy pogodzie `m % 4`.
- **Pogoda wg pory roku** (`POGODA_PORY`): wiosna i lato jasne (czyste niebo, świeża zieleń / ostre słońce, lekkie
  chmury, po burzy w słońcu), jesień i zima jak były; „odwilż — mokry śnieg" zastąpiła regułę zima + po deszczu.
  Tag `p:` wygrywa, mgła tylko o świcie/rano.
- `blizna-57`: (a) okna 6 kolejnych, (b) ciągi 6 co 4, (c) pejzaż 1–40 i Dziś 66–89 per pora roku — ≥ 3 wartości
  każdej osi; (d) wiosna i lato ≥ 60 % pogód ze słońcem/czystym niebem, latem bez mgły; (e) ≥ 3 pary w oknie oraz —
  w obrębie pory, na kategoriach pogody — żadna oś nie jest przesuniętą kopią innej. Mutacje: stary wzór oblewa (a)/(c),
  kopia pogody `(m+2)%4` oblewa (e).

### Prompty 66–89 w repo ≠ obrazy na prod (notatka, jak przy nawierzchni)

Kadry 66–89 (biegamy-assets `430523b`, 88: `bd842cc`) powstały na osiach G1. Po tej zmianie `--pokaz-prompty` dla
66–89 pokazuje inne pogody, pory dnia i kompozycje niż te, z których powstały obrazy. Obrazy zostają; ponowne
wygenerowanie numeru da obraz wg nowych osi. Wyjątki: 73, 74, 77, 78, 79, 81, 83 — regenerowane na nowych osiach
(decyzja po siatce, podmiana po OK Filipa).

## G3 W KODZIE (31.10.2026): pejzaże 21:9 w `.bm-hero` na 10 widokach

- `SOLO.dopasujN(N, dzień, ile, teraz, pula)` — pula `dzis` (domyślna, klucze `solo_dzien`/`solo_hist`, `TAGI`)
  albo `pejzaz` (klucze `solo_dzien_pejzaz`/`solo_hist_pejzaz`, bez tagów: pora roku z wzoru, bez wykluczeń pogody
  i preferencji typu). `sezonKadru(n, tagi)` — drugi argument `{}` = pora pejzażu; generator wycina tę samą funkcję.
- `SOLO.pejzazDnia(N, dzień, przes)` — jeden pejzaż bazowy dnia (z anty-powtórką), strona `przes` bierze pejzaż
  o `przes` dalej na liście pejzaży tej pory. Przy N = 40: wiosna 8, lato 11, jesień 11, zima 10 → 10 stron widzi
  10 różnych pejzaży (wiosną dwa się powtarzają).
- `BANERY`: `STRONY` = races, kalendarz, raporty, nutrition, odznaki, wyzwania, radio, compare, trener, ankieta
  (indeks = przesunięcie), `PEJZAZE_N = 40` (= N puli w generatorze, pilnuje test). Zapas: brak SOLO / N = 0 →
  stary obraz z FLOTA/STALE; błąd pliku pejzażu → stary URL; błąd starego → gradient. Pejzaż: `center 55%`.
- `ozyw()` przy dokumencie już sparsowanym idzie mikrozadaniem — SOLO jest definiowane w sb.js PO BANERY.
- `blizna-58`: osobne klucze (mutacja „wspólny klucz" oblewa), 366 dni × 10 stron = pora dnia, różne strony
  (mutacja „bez przesunięcia" oblewa), anty-powtórka bazy, zapas URL i łańcuch `onerror`.

### Siódemka na nowych osiach (31.10.2026, decyzja Filipa)
- Podmienione w biegamy-assets: 73, 74, 77, 78, 79, 81 (jaśniejsze, słońce latem i wiosną).
- 83: na nowych osiach dalej szary („mgła o świcie" z osi) → wyjątek sceny „park o świcie, niskie słońce między
  drzewami, mokra alejka błyszczy, świeża zieleń" i nowe pole wyjątku **`pogoda`** (nadpisuje oś pogody, jak
  `poraDnia`/`ogniskowa`; nie działa przy tagu `p:` ani w nocy). Reguła „mgła tylko świt/rano" liczy się teraz od
  pogody PO wyjątku.

## G4 W KODZIE (31.10.2026): banery typów `typ-<slug>.jpg` (21:9, 1K → 1200×509)

- 9 typów: spokojny, interwaly, tempo, wybieganie, regeneracja, wzmacniajacy, start, zastepczy, **odpoczynek**
  („buty odstawione pod ścianę i kubek na parapecie, popołudniowe światło", decyzja Filipa). Pula `typ` w
  generatorze: jeden obraz na typ, cały rok, bez osi; kompozycja pod PAS 21:9 z A2 (przedmiot w środkowej tercji,
  lewa tercja spokojna na liczbę km) — miniatura 96×76 ma być tylko czytelna.
- Prompt typu: „zdjęcie na cały kadr, bez ramki" — pierwszy zastepczy wyszedł z białą ramką skanu.
  Start: „linia startu" model rysował jako linię środkową pasa (2 razy) — trafiła dopiero geometria
  „w poprzek jezdni, POZIOMO od lewej do prawej krawędzi kadru". Razem 12 generacji (~0,40 $ przy 0,0336 $/1K).
- `sb.js`: TRAINING_TYPE_BANNERS = typ → slug (z Odpoczynkiem), `trainingTypeBannerUrl` → typ-<slug>.jpg,
  `trainingTypeBannerZapas` → banner-<slug>.webp, `obrazTypu(type)` (nieznany typ → Odpoczynek),
  `ustawTloTypu(el, type, naKoniec)` — sonda Image(): błąd → zapas → tło końcowe.
- `zawodnik.html`: miniatura „Dzisiejszy trening" przez `ustawTloTypu`; pasek planu tygodnia przez `obrazTypu`
  (typeBgMap z card-*.jpg / ob-s*.jpg usunięta — Interwały ≠ Tempo, Spokojny ≠ Wybieganie), `data-bgzapas` w sondzie tła.
- `blizna-59`: slugi mapy = pula generatora (9), różne obrazy typów, zapas URL (mutacja „bez zapasu" oblewa),
  pasek i miniatura przez to samo źródło.

## STAN po G1–G4 (31.10.2026, koniec dnia) i co dalej

| etap | biegamy | biegamy-assets | co jest na prod |
|---|---|---|---|
| G1 osie wariantów | `f929758` | — | osie.mjs, --pula/--format, blizna-57 |
| G2 kadry 66–89 | `edbbcdf` | `430523b`, 88: `bd842cc` | pula „Dziś" 89, detale wg pory roku |
| G3 pejzaże | `0dc15f2` | `b3c111f` | 40 pejzaży 21:9 w .bm-hero na 10 stronach, osobna pula SOLO; kadry 73,74,77,78,79,81,83 podmienione |
| G4 banery typów | (ten commit) | `e379d39` | typ-<slug>.jpg × 9 w miniaturze „Dzisiejszy trening" i pasku tygodnia, zapas banner-*.webp |

Lekcje dnia: oś „mod 4" z nieparzystym mnożnikiem = n % 4 (test czyta prompt, nie listę); model nie umie
„linii startu" bez opisu geometrii; „bez ramki" w każdym prompcie 21:9; Gemini 504 co ~10–20 obrazów —
skrypt staje, wznowienie tym samym poleceniem pomija gotowe.

**Następne (w tej kolejności):**
1. **G5 — 7 ikon kafli** (siatka skrótów pod hero „Dziś"): tematy i styl do ustalenia na starcie G5.
2. **A2 — „Dziś v2" karta treningu** (plik `Dzis-v2-projekt.md` od Filipa na starcie A2): kafle z sygnałami,
   **pas 21:9 z liczbą km** (obraz = `obrazTypu(type)` z G4; liczba w LEWEJ TERCJI U DOŁU, ten sam róg co tekst
   .bm-hero — banery G4 są pod to skomponowane, miniatura 96×76 znika), zegarek, pogoda.

## A2b + G5 W KODZIE (31.10.2026, Dzis-v2-A2-G5-projekt.md + decyzje Filipa po ZWIADZIE)

**Zasada kafla: LICZBA albo KROPKA, nigdy obie, i NIC przy braku danych** (błąd zapytania = brak sygnału, nie „0").
`KAFLE` w sb.js: czyste reguły (`KAFLE.reguly`), zapytania (`policz`), rysowanie przez textContent (`pokaz`),
liczenie przy wejściu i po `visibilitychange` (`podepnij`) — bez pollingu. CSS: blok „KAFLE z sygnałem" w theme.css.

| kafel | Dziś | Profil | sygnał | źródło |
|---|---|---|---|---|
| Ciało | ✓ | ✓ | liczba sesji ćwiczeń od pn; 0 → nic | `training_logs` `source='circuit'` (oddech się nie zapisuje) |
| Wyzwania | ✓ | ✓ | % najbliższego ukończenia (< 100) | `WYZWANIA.najblizsze` |
| Odznaki | ✓ | ✓ | kropka „nowa" + obwódka/tło w akcencie | `achievements` vs localStorage `odznaki_widziane` (zapis na odznaki.html; 1. wizyta = punkt odniesienia) |
| Starty | ✓ | ✓ (tylko własny) | dni do celu / „dziś"; bez celu → na Dziś kropka znajomych | `czytajRaceGoals` |
| Czat | ✓ | ✓ | nieprzeczytane OD ZNAJOMYCH | `peer_messages` `read=false`; od trenera zostaje na dzwonku |
| Ustawienia | — | ✓ (szósty, tylko własny) | brak | — |

- Radio wypadło z kolumny (nie było go tam — kolumna ma Czat; dźwięk gra tylko na radio.html).
- Sygnały TYLKO u siebie: Dziś w trybie zawodnika (nie `?from=trener`), Profil tylko własny.
- **Ikona na Dziś 40 px, nie 56** z projektu: kafel ma tam ~75 px wysokości (5 kafli obok hero 9:16). Profil: 56 px.
- Ikony `ikona-<slug>.png` (assets `05ab33e`): 3D matowe, **paleta bez pomarańczu** (grafit, kość słoniowa, piasek) —
  akcent motywu tylko w sygnale. `--card` jest jednakowe w 5 motywach, więc tło ikon bez szwu. Zapas offline:
  ikona-*.png → stary icon-*.webp (`data-ic-stary`) → emoji `_IC_ZAPAS`. `ikona-dzwonek.png` w assets, jeszcze NIE
  podpięty (dzwonek w topbarze to SVG — do A2c). Konwerter `tools/kadry/ikony-png.py`: kadr 78 %, tło → #0f0f14, ≤ 40 KB.
- Generacje G5: 9 (7 + druga próba Ciało i Ustawienia — odstawały stylem), ~0,30 $.

**WYZWANIA — jedno źródło (sb.js).** Do 31.10 listy, rotacja i postęp żyły w DWÓCH kopiach (wyzwania.html,
zawodnik.html) i liczyły km różnie; teraz obie strony i kafel biorą `WYZWANIA.aktywne/postep`. `buildCard`
(rysowanie karty) nadal w każdym pliku osobno.

| gdzie | km tygodnia | km miesiąca |
|---|---|---|
| zawodnik.html (stara kopia) | tylko biegi | tylko biegi |
| wyzwania.html (stara kopia) | wszystko | wszystko |
| `checkBadges` (przyznawanie) | tylko biegi | wszystko |
| **WYZWANIA.postep (teraz)** | **tylko biegi** | **wszystko** — jak przyznawanie |

**ZALEGŁOŚĆ (decyzja Filipa 31.10):** `checkBadges` — km MIESIĄCA tylko z biegów, jak tydzień; w tym samym commicie
`WYZWANIA.postep`, żeby pasek dalej mówił to, co zrobi odznaka. Osobny commit PO A2, z blizną.

**Karta treningu (A2a, następne):** główny przycisk „Zaloguj wynik" bez zmian; „Nie zrobiłem" tekstowy 44 px, a reguła
z 21.08 bez zmian — dotyczy tylko WCZORAJSZEGO planu (dzisiejszy trwa do północy). Dolny nav i środkowe kółko bez zmian.

## Podpisy v2 — z opisów obrazów (1.11.2026)

Podpisy `_SOLO_PODPISY` (zawodnik.html) w wersji 2 pisane są z **opisu obrazu**, nie z zamówionej sceny: przegląd
1.11 (gemini-3.5-flash-lite vision, prompt „co dokładnie widać…") pokazał podpisy mówiące o rzeczach nieobecnych na
kadrze (13 „Miasto jeszcze śpi" pod parkiem, 81 „zasiałeś zimą" pod wiosennym lasem, 73/77 miasto i asfalt pod parkiem).
Opisy wszystkich 89 kadrów: `tools/kadry/opisy-kadrow.json` — **podmiana kadru = nowy opis w tym samym commicie**,
inaczej test rozjazdów porównuje podpis ze starym obrazem. Przegląd do oglądania: `tools/kadry/podpisy-przeglad.html`.

Reguły (blizna-71): ≤ 8 słów, dokładnie jeden `*akcent*`, bez „wszyscy / każdy / zawsze / nigdy" i wykrzyknika,
bez duplikatów, 89 pozycji, a podpis nie wymienia rzeczy (śnieg, deszcz, mgła, noc, buty, dwójka, las, miasto),
której nie zna opis obrazu.

Kadry 17, 32, 73, 77 wygenerowane od nowa 1.11 (biegamy-assets 65d5af4) — pora z obrazu zgadza się z `sezonKadru`.
21 i 60 zostały stare (powtórki gorsze). 17: nowy kadr to kobieta i mężczyzna — podpis „Letnia alejka, *dwoje*, bez
pośpiechu." (decyzja Filipa; v2 miało „*dwóch*"). 72: „Latarnie między blokami. *Wracamy* po zmroku." (stary miał 9 słów).

`SCENA_Z_PODPISU` w generatorze: wyjątki 5, 22, 71, 75, 83, 88 zgadzają się z podpisami v2; **14** — scena
zmieniona za obrazem („asfaltowa droga w liściach, obok las i łąka, dwoje biegaczy", decyzja Filipa 1.11), bez
regeneracji kadru.

## Podpisy v3 — motywujące (1.11.2026)

Wg `podpisy-kadrow-v3.md` (Filip 14:09: „jeszcze lepsze, motywujące"). Ta sama metoda co v2 — podpis z OPISU OBRAZU
(`tools/kadry/opisy-kadrow.json`), inny głos: trener widzi, co jest na zdjęciu, i mówi jedno zdanie, po którym się
wychodzi. Reguły bez zmian (blizna-71: ≤ 8 słów, jeden `*akcent*`, bez wszyscy/każdy/zawsze/nigdy i „!", bez
duplikatów, 89 pozycji, zero rozjazdów podpis↔opis obrazu).

Zmienione 49 numerów; 39 oznaczonych „z" zostało z v2, w tym wszystkie z `SCENA_Z_PODPISU` (5, 14, 22, 71, 75, 83, 88).
**26:** v3 „Mokre pola, kręta droga. *We dwoje* do końca." wymieniało mokrą nawierzchnię, której opis obrazu nie zna
(zmierzch, piaszczysta zakrzywiona droga, dwie osoby) → rozjazd „deszcz"; decyzja Filipa: „Zmierzch nad polami. *We dwoje*
do końca drogi."

## Podpisy v3.1 — bez poleceń (1.11.2026)

Ton Filipa: podpis opisuje chwilę, nie wydaje polecenia. Pięć numerów, w których v3 instruowało („służy do rozciągania",
„potem rolka", „regeneracja zaczyna się w domu", „cierpliwość to też trening", „odpoczynek należy do planu"):
- **32** „Bieżnia, dwoje, przerwa. Następne *powtórzenie* za chwilę."
- **37** „Słońce, ławka, ostatnie metry. *Dobrze* było wyjść."
- **38** „Zmierzch w alejce, dwoje. *Dzień* kończy się dobrze."
- **39** „Mróz, śnieg, pusta ławka. *Ty* nie usiadłeś."
- **43** „Lód na zakrętach, las. Dziś *technika*, nie tempo."
blizna-71 6/6, rozjazdy podpis↔opis obrazu 0 (każde wymienione pojęcie — dwójka, śnieg, las, zmierzch — jest w opisie).

## Podpisy „razem" — opis strukturalny i zapadka (1.11.2026 wieczór)

Komenda Filipa 20:45. Kadr 02 → „Szary świt, kręta droga. *Każdy* swoim tempem." (wąski, opisany wyjątek od zakazu
„każdy" w blizna-71 — tylko ten podpis). Ponowny opis 89 kadrów z obrazu, STRUKTURALNIE (gemini-3.5-flash-lite vision,
responseSchema, temperature 0, miniatury z bieżących plików assets; koszt ~$0,06): `tools/kadry/opisy-kadrow.json →
struktura` (liczba_osob, relacja, kierunek, pora, pogoda, nawierzchnia, otoczenie). Rozkład: 44 kadry z dwiema osobami,
z czego 38 „daleko" (osobno) — sprawdzone na oko na 6 kadrach, vision trafia.
Reguła w blizna-71: słowa wspólnoty (razem, we dwóch/dwoje/troje, ramię w ramię, dwoje, dwóch, troje, trzech, grupa,
umówili, rozmowa) tylko przy relacji obok_siebie/blisko; liczebnik osób = liczba_osob („Za trzy, dwa, start" to
odliczanie, nie liczba). Rozjazdy: 8, 9, 18, 20, 21, 26, 30, 38, 41, 46, 50 — ZAPADKA `ZNANE_ROZJAZDY_RAZEM`
(podpisy pisze Filip; arkusze Downloads\podpisy-do-poprawy-1.png i -2.png). 38 to podpis z v3.1 („dwoje").

## Podpisy „razem" — 11 tekstów Filipa (2.11.2026)

8, 9, 18, 20, 21, 26, 30, 38, 41, 46, 50 — napisane z opisów strukturalnych, bez słów wspólnoty. `ZNANE_ROZJAZDY_RAZEM`
w blizna-71 PUSTE; jedyny wyjątek reguł to kadr 02 („*Każdy* swoim tempem", zakaz „każdy"). Sprawdzenie z opisem
strukturalnym (pora, pogoda, nawierzchnia, otoczenie): 10/11 zgodne; 41 „przez pola" — struktura ma otoczenie „las",
opis obrazu „droga otoczona lasem i polami" (pola częściowo) — zgłoszone Filipowi, tekst bez zmian.
