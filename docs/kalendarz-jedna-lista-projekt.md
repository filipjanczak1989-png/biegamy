# Kalendarz startów — jedna lista z obu źródeł + grafiki dla imprez z maszyny (ZWIAD → PROJEKT, 2.11.2026)

> **Status:** projekt, ZERO kodu. Czeka na OK Filipa. Liczby: baza BiegaMy (2.11) i `Downloads\kalendarz-mapa.csv`
> (źródło `kalendarz_imprezy` na maszynie, załadowane 1.11). API maszyny (`api.biegamy.run`) wymaga tokena zalogowanego
> użytkownika (anonim → 401 `PGRST302`), więc pełnego wyniku `upcoming_races` nie pobrałem — liczby z maszyny to **dolna
> granica** (endpoint dokłada `race_events` i `calendar_races`).

## 1. Zwiad — jak jest dziś

**Dwie niezależne listy w `races.html`:**

| | nasze zawody | „W Polsce" (maszyna) |
|---|---|---|
| źródło | `races` (`loadRaces`, :712): `date >= dziś`, zawodnik tylko `approved` | `window.IMPREZY.szukaj` (sb.js:397) → `upcoming_races {p_from,p_to,lim:300}`, przy szukaniu od 3 znaków `events_search` (limit 20); cache sessionStorage 1 h |
| sortowanie | z zapytania (data rosnąco), `month-divider` po miesiącu | kolejność z API, bez scalania |
| karta | `.race-card` z okładką 21:9 (`cover_url`) | `.imprezy-wiersz` — sam tekst: nazwa, data · miasto · dystanse, „Strona imprezy ›" (https), trener „Ukryj" |
| filtry | województwo, miesiąc + zakres dat, chipy dystansu, szukajka | własne: okres 30/90/365 dni + szukajka (350 ms) |
| miejsce | `#races-list` | `#imprezy-sekcja` **pod** listą (:424) |

- **Dedup już istnieje**, ale tylko „ta sama edycja": sb.js:466 (data ±1, `tylkoLitery(nazwa)`), okienko `impreza.mjs:50`
  (`bezZnakow` — bez numerów edycji). Nasza wygrywa.
- ⚠️ **Błąd**: `imprezyStart()` (:708) rusza **przed** `await loadRaces()` — przy pierwszym wejściu `_allRaces` jest puste
  i dedup nic nie usuwa (para nasza/maszyna widoczna dwa razy).
- Maszyna **nie ma typu ani województwa** — tylko nazwa, data (`dokladnosc_daty` dzien|miesiac), miasto, dystanse (często brak),
  linki, `klucz` (stały identyfikator imprezy), `status`.

**Dane (okno 12 miesięcy od 2.11.2026):**

| | liczba |
|---|---|
| nasze przyszłe zawody (`races`) | 7 (wszystkie z okładką) |
| imprezy maszyny w mapie (`kalendarz_imprezy`) | **263** (dolna granica) |
| … z miastem / z datą dzienną | 263 / 263 |
| … **z dystansem** | **9 (3%)** |
| … z linkiem https organizatora | 0 (w mapie pusty — linki dochodzą z innych źródeł endpointu) |
| … z **poprzednią edycją** w mapie (nazwa bez numerów + miasto) | **212 (81%)** |
| unikalnych imprez (klucz bez roku) | 216 |
| duplikaty nasze ↔ maszyna (data ±1, nazwa bez numerów) | **2 z 7** |

**Typy z danych** (nazwa + dystans, reguła w pkt 3): ulica 201 · trail/góry 30 · ulica nocna 10 · ultra 9 · przełaj/las 8 ·
nordic/marsz 5 · bieżnia/stadion **0**. → **5 typów grafik** (bez bieżni; nordic — decyzja niżej).
⚠️ Reguła po nazwie myli się na nazwach serii: „Grand Prix CITY TRAIL" to biegi parkowe, nie górskie — potrzebna lista wyjątków.

## 2. Projekt: jedna lista chronologiczna

1. **Wspólny model** (nowy plik `js/kalendarz-lista.mjs`, bez import/export jak `js/akcja.mjs` — do testów i ewentualnie okienka):
   `{ zrodlo: 'nasze'|'maszyna', data, dokladnosc, nazwa, miasto, wojewodztwo|null, dystanse[], okladka|null, typ, klucz|null, race_id|null, linki }`.
2. **Ładowanie równoległe, render po obu** (naprawia wyścig z pkt 1): `Promise.all([loadRaces(), IMPREZY.szukaj(okres z filtra dat)])`;
   gdy maszyna nie odpowie (offline, 401, timeout 15 s) — lista naszych bez zmian + dyskretna linia „Kalendarz w Polsce chwilowo
   niedostępny".
3. **Scalanie duplikatów — nasza wygrywa**: data ±1 dzień i `BM_TEKST.bezZnakow(nazwa)` równe (albo zawieranie ≥ 10 liter),
   a gdy obie mają miasto — miasto zgodne. Z pary zostaje nasza karta, dostaje `klucz` maszyny (cel startowy, „Ukryj").
   Jedna reguła w module zamiast dwóch kopii (sb.js `szukaj` i okienko) — okienko może ją importować.
4. **Sortowanie**: data rosnąco, przy tej samej dacie nasze pierwsze; imprezy z `dokladnosc = miesiac` na końcu swojego miesiąca
   z podpisem „w listopadzie". `month-divider` jak dziś.
5. **Karta**: ta sama `.race-card` dla obu (okładka 21:9, nazwa, data · miasto, dystanse). Imprezy z maszyny: **dyskretne
   oznaczenie źródła** — mała szara etykieta „kalendarz biegów w Polsce" w stopce karty (bez koloru, bez ikony ostrzegawczej);
   „Strona imprezy ›" tylko https (`safeExternalHref`); trener: „Ukryj" jak dziś. Nasze karty bez zmian.
6. **Filtry jak teraz, na obu źródłach**:
   - szukajka i miesiąc/zakres dat — bez zmian, działają na obu;
   - **województwo** — maszyna nie ma województwa: dopasowanie po mieście jak dziś przy naszych (`voivodeship+region+city`),
     impreza z maszyny przechodzi, gdy wpisana fraza pasuje do miasta; wybrane województwo z listy → do decyzji (pkt 5);
   - **dystans** — 97% imprez maszyny bez dystansu: przy aktywnym chipie dystansu takie imprezy są ukryte, pod listą linia
     „N imprez bez podanego dystansu" (klik pokazuje je); bez chipów widoczne wszystkie;
   - osobne filtry sekcji „W Polsce" (30/90/365) **znikają** — okres maszyny = zakres dat z głównego filtra (domyślnie 12 mies.).
7. **Wydajność**: 263+ kart — render jak dziś (string), okładki `loading="lazy"`; limit `upcoming_races` 300 → przy flagodze
   `uciete` linia „pokazano pierwsze 300 — zawęź daty".

## 3. Grafiki dla imprez z maszyny — ten sam mechanizm Gemini

**Jak powstają dziś** (nasze zawody, EF `race-image`): model `gemini-nano-banana-2.1`, prompt z formy, dystansu, miasta, nazwy (80 znaków),
pory roku z miesiąca, scenerii trail/park/miasto i noc/dzień, stałe reguły kadru (1–2 biegaczy od tyłu, bez tłumu); warianty
**21:9 (1K, karta)** i 9:16 (2K, hero); bucket `race-covers`; uruchamiane po zatwierdzeniu zawodów; bez `force` zwraca istniejącą.
Koszt (docs/okladki-zawodow-spec.md): **~$0,034 za kadr 1K**, 19–30 s na kadr; cena 2K niezmierzona. Kolejki i limitu dziś brak.
**Nie pobieramy zdjęć ze stron organizatorów** (prawa autorskie) — wyłącznie generowane.

**Projekt:**
1. **Klucz bez roku** = `bezZnakow(nazwa) + '|' + normalizuj(miasto)` → ta sama impreza w kolejnych latach ma tę samą grafikę
   (81% imprez z okna ma poprzednią edycję). Tabela w BiegaMy: `imprezy_okladki (klucz_bez_roku pk, url, typ, wygenerowano_at,
   wymuszona_przez)`; odczyt dla zalogowanych, zapis wyłącznie EF.
2. **Kolejka bez blokowania listy**: klient po renderze zgłasza klucze bez okładki (`imprezy_okladki_kolejka`, insert przez RPC
   z dedupem, max 50 na wywołanie) — nie potrzeba poświadczeń do maszyny po stronie serwera. **Cron** (pg_cron jak `miesiac-karta`)
   raz na dobę woła EF `imprezy-okladki`: bierze najwyżej **N = 30** kluczy, generuje po kolei (limit Gemini), **tylko 21:9 1K**
   (karta; 9:16 dla imprez z maszyny niepotrzebne — hero mają nasze zawody), zapis `race-covers/impreza-<sha1(klucz)>`.
3. **Zaślepka wg typu do czasu grafiki**: 5 stałych grafik `assets/kalendarz/typ-{ulica,ulica-noc,trail,ultra,przelaj}.webp`
   (wygenerowane raz tym samym Gemini albo przez Filipa), dobierane regułą z pkt 1 (nazwa + dystans) z listą wyjątków.
   Karta wygląda tak samo z zaślepką i z okładką (ten sam `<img>`, te same proporcje).
4. **Podmiana**: trener „Nowa okładka" na karcie imprezy z maszyny (`force`, jak dziś przy naszych); w v2 — własny plik.
5. **Prompt**: ten sam `zbudujPrompt` z typem z reguły zamiast `distance_km` (dystansu zwykle brak); nazwa imprezy tylko jako
   inspiracja, **bez napisów na obrazie** (jak dziś).

**Liczby i koszt:**

| | liczba | koszt (21:9 1K, $0,034) |
|---|---|---|
| imprez bez grafiki w oknie 12 mies. (maszyna, dolna granica) | 263 | — |
| unikalnych (klucz bez roku) = do wygenerowania raz | **216** | **≈ $7,3** jednorazowo |
| nowych rocznie po ponownym użyciu (263 − 212) | ~51 | ≈ $1,7 / rok |
| zaślepki wg typu | 5 | ≈ $0,2 |
| gdyby dodać 9:16 2K | ×2 kadry | cena 2K niezmierzona — górna granica ok. $22 całości |

Przy limicie 30/dobę zaległość schodzi w **~8 dni**; do tego czasu zaślepki wg typu.

## 4. Kroki (po OK)

| krok | co | baza? |
|---|---|---|
| L1 | `js/kalendarz-lista.mjs` (model, dedup, sort, typ) + testy; naprawa wyścigu ładowania | nie |
| L2 | jedna lista w `races.html`, filtry na obu źródłach, etykieta źródła, zaślepki wg typu (5 grafik) | nie |
| L3 | `imprezy_okladki` + kolejka + RPC zgłoszenia (migracja z testami w transakcji, prod po OK) | **tak** |
| L4 | EF `imprezy-okladki` + cron (limit dzienny), „Nowa okładka" dla trenera | tak (cron) |

## 5. Do decyzji Filipa

1. OK na projekt (kroki L1–L4) i kolejność.
2. Nordic/marsz (5 imprez): pokazywać w kalendarzu czy pomijać (wyniki NW są poza bazą biegową)?
3. Filtr województwa dla imprez z maszyny: dopasowanie po mieście (część imprez „zniknie" z województwa) czy mapa miasto → województwo?
4. Okładki maszyny tylko 21:9 (≈ $7,3) czy też 9:16?
5. Limit dzienny generowania (proponuję 30).
6. Zaślepki wg typu: generuje Gemini (tym samym mechanizmem) czy Filip w GPT?

## 6. Decyzje Filipa 2.11.2026

- **L1–L4: OK.** **Wdrożenie PO 8.11** — do startu akcji pierwszeństwo ma plan F.
- **Nordic/marsz: pokazujemy.**
- **Województwo: mapa miasto → województwo** (nie dopasowanie samym miastem) — do zbudowania w L1/L2 (źródło mapy do ustalenia
  przy L1: TERYT/SIMC albo lista z `races.voivodeship` + uzupełnienia).
- **Tylko 21:9** (bez 9:16 dla imprez z maszyny) — ≈ $7,3 jednorazowo + ≈ $1,7/rok.
- **Limit 30 grafik/dobę.**
- **5 zaślepek według typu robi Gemini** (ten sam mechanizm co okładki), podgląd do `Downloads\biegamy-podglady` przed wdrożeniem.
