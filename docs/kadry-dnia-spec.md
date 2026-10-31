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
