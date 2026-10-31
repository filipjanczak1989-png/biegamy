# Okładki zawodów — EF `race-image`

> **Status na 2026-10-31.** Dokument opisuje stan faktyczny, nie pierwotny pomysł:
> gdzie decyzja zmieniła się w trakcie budowy, jest tu wersja obowiązująca.
> Liczby zweryfikowane pomiarem są oznaczone „(zmierzone)".

## Zasada nadrzędna

Okładka to **ozdoba, nie dane**. Zatwierdzenie i dodanie zawodów nigdy na nią nie czeka i nigdy od niej nie zależy: front woła EF fire-and-forget, a każdy błąd kończy się brakiem okładki, nie błędem zapisu zawodów. Bieg bez okładki nie dostaje placeholdera.

## Gdzie żyje

| warstwa | co | commit |
|---|---|---|
| baza | `races.cover_url text` + bucket `race-covers` (`20261101_race_cover.sql`, wycofanie `20261101_WYCOFANIE_race_cover.sql`) | `73ebfe7` |
| EF | `supabase/functions/race-image/index.ts`, `verify_jwt = true` w `config.toml` | `73ebfe7`, `37e9eb5`, `80fb926` |
| front | `races.html`: okładka w `#race-modal`, przycisk „Nowa okładka”, pasek 21:9 na liście startów | `73ebfe7`, `37e9eb5` |
| helper | `sb.js` → `window.safeCssUrl` (tło CSS), lista startów używa `safeUrlAttr` (`<img src>`) | `73ebfe7` |

**Kto woła EF (wszystko z `races.html`, jedną drogą `fetch(SB_FN_URL + '/race-image')` z `Bearer access_token` — wzorzec `pobierzKarte` z `sb.js`):**

| skąd | `force` | czeka na wynik? |
|---|---|---|
| `approveRace()` po udanym `update status='approved'` | nie | nie |
| insert trenera (`status='approved'`), po **obu** ścieżkach insertu (także po ponowieniu z `region`) | nie | nie |
| przycisk „🖼 Nowa okładka” w `#race-modal` (tylko trener, tylko approved) | **tak** | tak — toast z wynikiem |

**Edycja zawodów okładki NIE odświeża** (decyzja 31.10). Od tego jest „Nowa okładka”.

## API

```
POST /functions/v1/race-image
Authorization: Bearer <JWT sesji trenera>
{ "race_id": "<uuid>", "force": false, "wariant": "21x9" | "9x16" }        ← wariant domyślnie "21x9"
→ 200 { "wariant", "url": "https://…/race-covers/race-<id>[-9x16]?v=<ms>", "wygenerowano": true|false }
        + "cover_url" (= url) tylko przy 21x9 — front sprzed wariantów czyta wyłącznie cover_url
```

### Bramki — w tej kolejności

| kod | warunek | kto odmawia |
|---|---|---|
| 401 `UNAUTHORIZED_NO_AUTH_HEADER` | brak nagłówka `Authorization` | bramka Supabase (`verify_jwt`) |
| 401 `brak sesji` | `wymagajUsera(req)` → `null` (zły token, sam klucz publikowalny, awaria GoTrue) | EF |
| 403 `tylko trener` | `user.id` nie ma wiersza w `coaches` (`coaches.id = auth.uid()`) | EF |
| 400 `race_id` | nie pasuje do `^[A-Za-z0-9-]{1,64}$` | EF |
| 400 `wariant` | spoza `21x9` / `9x16` | EF |
| 404 `brak zawodów` | brak wiersza w `races` | EF |
| 409 `zawody niezatwierdzone` | `status ≠ 'approved'` | EF |
| 503 `brak klucza Gemini` | pusty sekret `GEMINI_API_KEY` | EF |
| 502 | Gemini ≠ 200, odpowiedź bez obrazu, mime spoza png/jpeg/webp | EF |

**(zmierzone 31.10)** Bez nagłówka → 401 z bramki; z samym kluczem publikowalnym → 401 `brak sesji` **z kodu EF**. Wniosek: przy kluczach `sb_publishable_…` bramka Supabase przepuszcza żądanie do kodu — **prawdziwą bramką jest `wymagajUsera`**, nie `verify_jwt`. 403 NIE zostało zmierzone (patrz zaległości).

Sprawdzenie trenera stoi **przed** odczytem biegu i przed Gemini — zawodnik nie wygeneruje (i nie zapłaci) żadnego obrazu.

### Warianty

| wariant | kolumna | obiekt | aspect | image_size | skalowanie | gdzie widać |
|---|---|---|---|---|---|---|
| `21x9` | `cover_url` | `race-<id>` | 21:9 | 1K | szerokość > 1200 → 1200 | lista startów, `#race-modal` |
| `9x16` | `cover_9x16_url` | `race-<id>-9x16` | 9:16 | **2K** | dłuższy bok > 1600 → 1600 | hero „Dziś” w dniu startu; miniatura w `#race-modal` (tylko trener) |

**Dlaczego 9x16 w 2K:** 1K w 9:16 ma **768 px** szerokości (zmierzone 31.10: 768×1376), a kafel hero przy ekranie 430 px ma 300 CSS px, czyli **~900 px przy DPR 3** — obraz 1K byłby powiększany. 2K skalujemy do 1600 px dłuższego boku. ⚠️ Wymiary i cena 2K w 9:16 NIEZMIERZONE — pierwszy klik „Nowa okładka” je pokaże; stawka $0.034 dotyczy 1K.

Wariant 9x16 dostaje w prompcie „Pionowa okładka…” zamiast „Szeroka okładka…” i jedno zdanie kompozycji (patrz Prompt). Kolumna `cover_9x16_url` z migracji `20261101_race_cover_9x16.sql` (wycofanie `20261101_WYCOFANIE_race_cover_9x16.sql`), bez grantu kolumnowego — jak `cover_url`.

### Idempotencja i `force`

- **Bez `force`:** gdy kolumna **danego wariantu** już ma URL, EF zwraca go z `wygenerowano: false` — bez Gemini, bez kosztu. Dlatego `approveRace` i insert mogą wołać bez sprawdzania: drugie wywołanie jest darmowe.
- **`force: true`:** ten sam prompt, nowe losowanie. Wejście **nie niesie niczego do promptu** — nie ma parametru stylu (usunięty przed wdrożeniem).

## Storage: jeden obiekt na bieg

- Bucket `race-covers`: publiczny odczyt, limit 5 MB, `allowed_mime_types = {image/png, image/jpeg, image/webp}`.
- **Zero polityk zapisu na `storage.objects`** — pisze wyłącznie EF przez `service_role`, który omija RLS (wzorzec `share-cards`). Migracja ma asercję: przerywa się, gdy istnieje polityka zapisu wymieniająca `race-covers` albo gdy `anon` ma grant na `races` / `cover_url`.
- Ścieżka **`race-<id>` / `race-<id>-9x16` bez rozszerzenia**, `contentType` z odpowiedzi, `upsert: true`, `cacheControl: 31536000`. Zmiana formatu (png→jpg) nadpisuje ten sam obiekt zamiast zostawiać sierotę.
- `races.cover_url` — brak GRANT-u kolumnowego, bo `authenticated` ma SELECT na całej tabeli. Zapis z frontu tylko trener (`races_coach_all`); EF pisze `service_role`.

### `cover_url` ZAWSZE z `?v=<Date.now()>`

`sw.js` obsługuje `/storage/v1/object/public/` strategią **cache-first** (`isStorageAsset`), a `cache.match` porównuje pełny URL razem z query. Nadpisany plik pod tą samą ścieżką **bez nowego `?v=`** zostałby u ludzi w starej wersji do następnego deployu. `?v=` to nie ozdoba, to jedyny mechanizm odświeżenia.

Okładki trafiają do `${CACHE_VERSION}-storage` — **bez limitu**, ale kasowanego przy każdym deployu (nazwa zawiera wersję). Stary wpis po „Nowej okładce” żyje do najbliższego deployu. Przy ~200 KB na plik i ~6 widocznych biegach na liście to ~1,4 MB — świadomie bez limitu.

## Skalowanie i JPEG q80 (**zmierzone**)

Gemini oddaje JPEG **1584×672, ~1,2 MB** (21:9) albo **768×1376, ~780 KB** (9:16). EF: `decode` → bilinear w JS do limitu wariantu → `encode` q80. **Bez zmniejszania, ale plik > 400 KB → przekodowanie q80 w tym samym wymiarze.**

| | zmierzone |
|---|---|
| lokalnie, obraz testowy | 1186 KB → **230 KB (−81%)**; dekod ~140 ms + bilinear ~75 ms + enkod ~90 ms ≈ **0,3 s** |
| prod, Świdnica (EF v2) | 1 238 542 B → **210 845 B**, 1200×509 |
| prod, 6 biegów (backfill 31.10) | 180–245 KB każdy |
| lokalnie, 9:16 Nocny Nyski | 768×1376: 798 847 B → **175 110 B** (bez zmniejszania — dłuższy bok 1376 < 1600; samo q80) |

- Enkoder i dekoder z **jednego** wąskiego importu `imagescript@1.2.15/utils/wasm/jpeg.js` (jpeg.wasm **90 KB**) — ten sam co `share-card`, nie `mod.ts` z 1,7 MB wasm-ów.
- **Skalowanie dekodera (DCT 1/2, 1/4, 1/8) nie wystarcza:** połowa z 1584 to 792 < 1200. Stąd bilinear w JS.
- **Bez skalowania, oryginał:** PNG/WebP (wymagałyby drugiego wasm-a), JPEG o liczbie kanałów ≠ 1 i ≠ 3 (CMYK), wymiar w limicie **i** plik ≤ 400 KB. **Wyjątek dekodera → oryginał**, nie błąd — okładka nie przepada przez optymalizację.
- Koszt cold startu: **+90 KB wasm**, ~0,3 s obróbki przy generowaniu trwającym 19–30 s (zmierzone na 6 wywołaniach).

## Prompt

### Reguły scenerii (z `distance_km` i `name`, nic z wejścia)

| sceneria | warunek (na `name.toLowerCase()`) | tekst w prompcie |
|---|---|---|
| `trail` | `trail\|ultra\|górsk\|gorsk\|le[sś]n` **lub** słowo „las” **lub** `distance_km > 42,5` | leśna lub górska ścieżka, naturalny teren |
| `park` | `park` | alejki parku miejskiego, drzewa |
| `miasto` | reszta | ulice miasta, zabudowa w tle |

**„las” jako SŁOWO, nie podciąg:** `/(?<!\p{L})las(u|ek|ku|ie)?(?!\p{L})/u`. Granica przez `\p{L}`, **nie `\b`** — w JS `\b` zna tylko `[A-Za-z0-9_]`, więc „ł”/„ś” przed „las” liczyłoby się jako granica słowa. Sprawdzone: „Klasyczny”, „Kłas Run”, „Wlasny” → miasto; „Puchar Lasu”, „Lasek Bielański” → trail.

**Noc:** `/nocn|night/` w nazwie → linia nocna zamiast dziennej.

**Pora roku** z miesiąca `date`: XII–II zima, III–V wiosna, VI–VIII lato, IX–XI jesień.

**Na 80 biegach w bazie (31.10):** miasto 72, trail 5, noc 3.

### Prompt v2 — w całości

Szablon (`zbudujPrompt`):
```
{forma} okładka wydarzenia biegowego: {dystans}[ w miejscowości {city≤60}] ({name≤80}), pora roku: {pora}.
Sceneria: {SCENERIE[sceneria]}.
{noc ? "Realistyczna fotografia reportażowa nocą: ciemne niebo, światło latarni i czołówek biegaczy."
     : "Realistyczna fotografia reportażowa, naturalne światło dzienne."}
Kadr: jeden albo dwóch biegaczy, widzianych z dystansu i od tyłu, daleko od siebie, na pustym odcinku trasy.
Żadnego tłumu, żadnej grupy biegaczy, żadnego peletonu ani startu masowego.
Styl dokumentalny: obiektyw 35 mm, lekkie poruszenie sylwetek w ruchu, zróżnicowane zwykłe stroje biegowe, niedoskonałe, nieustawiane światło.
[tylko 9x16:] Kompozycja pionowa: biegacz w górnej lub środkowej części kadru, dolna jedna trzecia spokojna — pusta nawierzchnia, cień, bez ważnych szczegółów.
Bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów.
```
`{forma}`: „Szeroka” (21x9) / „Pionowa” (9x16). `{dystans}`: maraton (42,195 ±0,3), półmaraton (21,0975 ±0,3), „bieg ultra” (≥ 50), inaczej „bieg na N km”.

Przykład (Nocny Nyski, 5 km, Nysa, 2026-12-05):
```
Szeroka okładka wydarzenia biegowego: bieg na 5 km w miejscowości Nysa (VI Nocny Mikołajkowy Bieg Nyski), pora roku: zima. Sceneria: ulice miasta, zabudowa w tle. Realistyczna fotografia reportażowa nocą: ciemne niebo, światło latarni i czołówek biegaczy. Kadr: jeden albo dwóch biegaczy, widzianych z dystansu i od tyłu, daleko od siebie, na pustym odcinku trasy. Żadnego tłumu, żadnej grupy biegaczy, żadnego peletonu ani startu masowego. Styl dokumentalny: obiektyw 35 mm, lekkie poruszenie sylwetek w ruchu, zróżnicowane zwykłe stroje biegowe, niedoskonałe, nieustawiane światło. Bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów.
```

**Dlaczego v2:** prompt v1 („biegacze w ruchu, bez rozpoznawalnych twarzy”) dawał **tłum** — okładka Świdnicy z EF v2 to kilkadziesiąt osób na ulicy z barierkami (pierwszy test API, z jeszcze prostszym promptem, dał start masowy z bramą i twarzami). v2 zakazuje tłumu **wprost** i opisuje kadr pozytywnie (ilu, skąd, jak daleko).

**Czołówki:** w A/B 31.10 na żadnym z dwóch nocnych obrazów nie były wyraźnie widoczne — światło szło z latarni.

## Model

**`gemini-nano-banana-2.1`** (stała `MODEL` w EF). **Decyzja Filipa po A/B 31.10:** `gemini-3-pro-image` dał biegaczy bliżej i obok siebie oraz znaczki przypominające logo na plecakach; 2.1 lepiej trzyma prompt („z dystansu”, „daleko od siebie”, bez logotypów).

A/B 31.10 (prompt v2, Leśna Draka i Nocny Nyski, bez zapisu do bazy, 21:9, 1K):

| bieg | model | czas | surowy | tokeny obraz / myślenie | kadr |
|---|---|---|---|---|---|
| Leśna Draka | gemini-nano-banana-2.1 | 20,4 s | 1 306 KB | 1120 / 1232 | 2 biegaczy w osi, jeden blisko, drugi daleko we mgle |
| Leśna Draka | gemini-3-pro-image | 20,2 s | 1 431 KB | 1120 / 114 | 2 biegaczy obok siebie, średni plan |
| Nocny Nyski | gemini-nano-banana-2.1 | 20,7 s | 1 035 KB | 1120 / 1319 | 1 blisko (czapka Mikołaja) + 1 daleko, girlandy, barierki trasy |
| Nocny Nyski | gemini-3-pro-image | 18,0 s | 971 KB | 1120 / 267 | 2 blisko obok siebie, drobne znaczki przypominające logo na plecakach |

Oba modele przyjmują te same parametry Interactions API (`response_modalities: ["image"]`, `image_config: { aspect_ratio: "21:9", image_size: "1K" }`) i oddają JPEG 1584×672.

### Kształt odpowiedzi (zmierzone 31.10)

```
steps: [
  { type: "thought", signature: "<~3,7 MB>" },                          ← bez content
  { type: "model_output", content: [ { type: "image", mime_type: "image/jpeg", data: "<base64>" } ] }
]
```
Odpowiedź ma **~5,3 MB**, z czego 3,7 MB to podpis myślenia. `wyciagnijObraz` przechodzi wszystkie kroki i całe `content[]` — nie zakłada kolejności ani pozycji obrazu.

## Koszty

| model | cena za obraz 1K (1120 tokenów obrazu) |
|---|---|
| **gemini-nano-banana-2.1** (w użyciu) | **≈ $0.034** |
| gemini-3-pro-image | ≈ $0.134 (~4×) |

Stawki z cennika Gemini API podane przez Filipa 31.10. **Rząd wielkości roczny: 80 biegów × 2 warianty ≈ $5.50.** Regeneracje przyciskiem „Nowa okładka” liczą się osobno, po $0.034 za kadr.

Zmierzone tokeny na jedno wywołanie: wejście ~44 (tekst) / 160 (initial), wyjście obrazu **1120**, myślenie **114–1319** zależnie od modelu (tabela A/B). Generowanie tylko przy approve/insert trenera (raz na bieg) i na „Nowa okładka”. Backfill 31.10: 6 obrazów (tylko biegi przyszłe — 69 przeszłych bez okładki świadomie pominiętych, lista ich nie pokazuje).

**Klucz:** sekret `GEMINI_API_KEY` w Supabase. Do 31.10 projekt klucza był na Free Tier, gdzie ten model ma **limit 0 wywołań/dobę** (429 `too_many_requests`) — EF z takim kluczem nie wygeneruje nic. Billing włączony 31.10.

## Hero „Dziś” w dniu startu — ⏳ W DRZEWIE, NIE WDROŻONE

**Kafel `today-hero` (zmierzone 31.10, headless Chrome, prawdziwy CSS rzędu `#home-tiles-row`):** proporcję wyznacza `aspect-ratio: 9/16` kafla (`max-height: 60vh`, `min-height: 320px`), **nie** kolumna 5 kafli — kafle mają `flex:1` i rozciągają się do hero.

| ekran | hero | szer./wys. |
|---|---|---|
| 360×640 | 230×386 | 0,596 (sufit 60vh) |
| 360×800 | 230×407 | 0,565 |
| 390×844 | 260×461 | 0,564 |
| 412×915 | 282×500 | 0,564 |
| 430×932 | 300×532 | 0,564 |

Stąd wariant **9:16** (decyzja 31.10), nie 4:5 ani 3:4 — generowany w **2K**, bo 1K ma 768 px szerokości, a kafel 300 CSS px przy DPR 3 to ~900 px.

**Powiązanie Start→zawody:** wyłącznie `athletes.race_goals` przez `czytajRaceGoals`, cel z datą treningu i `race_id`. Dokładnie jeden → `races.cover_9x16_url`; zero, ≥ 2, brak okładki, błąd sieci → kadr SOLO bez zmian. Bez `race_id` w `trainings`.

**Kto pisze `#today-hero-bg`:** `_heroInit` **dwa razy** (z `initAuth` i zapasowo po DOMContentLoaded + 500 ms — przy jednym kadrze `_heroTimer` zostaje `null`, więc zapas odpala ZAWSZE) oraz asynchroniczna ścieżka „nie wczytał się” w `_heroZabezpiecz`. Kolejność względem `loadTodayTraining` **nie jest gwarantowana**, więc okładka żyje we fladze `window._heroOkladka = { dzien, url }`:
- `_okladkaStartu(dzien)` (z `loadTodayTraining` przy `type === 'Start'`) → `safeCssUrl` → próbny `Image()` → dopiero po `onload` ustawia flagę i tło;
- `_heroInit` bierze okładkę zamiast `_heroCards[0]`, gdy `flaga.dzien` = dziś (`_dzienWaw`), i wtedy nie woła `_heroZabezpiecz`;
- `_heroZabezpiecz` przy ustawionej fladze **nie nadpisuje** tła.

**Migawka offline (`hero`) NIE dostaje okładki** — trzyma kadr SOLO, okładka tylko na żywo. `demo.html` nie współdzieli kodu (brak `sb.js`, własny statyczny hero).

**Wyzwalacze:** approve i insert trenera → `zlecOkladki` = 21x9, **potem** 9x16 (sekwencyjnie, fire-and-forget). „Nowa okładka” regeneruje oba z tekstem „⏳ Generuję 2 kadry…”; toast mówi, który się nie udał. Miniatura 9:16 w `#race-modal` tylko dla trenera, obok paska 21:9, w tej samej wysokości (flex 336:81 — `aspect-ratio` przy rozciąganiu dawał miniaturze szerokość 0, zmierzone).

## Sprawdzone, NIE problem

### `Cache-Control: private, no-cache` — artefakt `curl -I`

HEAD na okładce pokazuje `private, no-cache`. **GET** pokazuje `public, max-age=31536000` i `CF-Cache-Status: HIT`; `storage.objects.metadata->>'cacheControl' = max-age=31536000`. Ta sama pułapka co w `karty-rodzaje-spec.md` („`curl -I` KŁAMIE o `Cache-Control` na Supabase Storage”). Nagłówki cache'u na Storage mierzy się GET-em.

## Zaległości

1. **jpeg.wasm z deno.land przy każdym cold starcie.** `jpeg.js` robi `fetch` pliku `.wasm` na najwyższym poziomie modułu, w runtime, nie przy deployu. Awaria deno.land = EF nie wstaje (dotyczy też `share-card`).
2. **Hero 9:16 — wdrożenie.** Zaprojektowane wyżej, w drzewie; czeka na migrację, deploy EF, front i backfill `WARIANT=9x16`.
3. **403 niezmierzone.** Brak tokenu zawodnika-nie-trenera. Do wykonania na koncie testowym: wywołanie z sesją zawodnika → oczekiwane 403 przed odczytem biegu.
4. **„Bieg w Lesie” → miasto.** Miejscownik od „las” to „lesie” — nie łapie go ani `le[sś]n`, ani `las…`. Dziś 0 takich nazw w bazie.
5. **Zmiana `contentType` przy `upsert` niezmierzona.** Wszystkie dotychczasowe okładki to JPEG — podmiana png↔jpeg na tym samym obiekcie nie wystąpiła.
6. **`generate-athlete-report:776`** wybiera z `races` kolumny `time`, `place`, `athlete_id`, których tabela nie ma — osobna sprawa, nie teraz.
