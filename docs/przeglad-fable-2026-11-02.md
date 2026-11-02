# Przegląd Fable — 2.11.2026 (tylko odczyt; zero zmian w kodzie do 8.11)

Dwa raporty „świeżego oka” (agenci bez kontekstu dnia) + weryfikacja najmocniejszych tez przez prowadzącego sesję.
Nic w kodzie produkcyjnym nie ruszone. Zmienione tylko: `tests/_lawka-pytan.js` (+20 pytań) i pliki w `docs/`.

- **A. Okienko „Zapytaj”** → `przeglad-fable-2026-11-02-A-okienko.md` (+ wynik ławki `lawka-pytan-2026-11-02-fable-A.md`, `lawka-pytan-2026-11-02.md`)
- **B. Kalendarz — jedna lista** → `przeglad-fable-2026-11-02-B-kalendarz.md`

## A. Okienko — co grozi wyciekiem albo błędem W CZASIE AKCJI (kandydaci na „przed 8.11” — decyzja Filipa)

Ławka: przed 53 pytania (47 dobrych, 6 za drogich, 0 złych) → po dopisaniu 20 trudnych: 73 (58 / 9 / **6 złych**). Testy okienka 51/51 zielone.
⚠️ „do Google” poniżej = wynik ławki z **atrapą** modelu; żywy Gemini może odpowiedzieć inaczej, ale **ścieżka jest otwarta** — nic jej nie zamyka.

| # | Problem | Przykład | Propozycja | Ryzyko | Kiedy |
|---|---|---|---|---|---|
| 1 | **Pułapka daty** — `7.11`/`8.11` w `ZAGADKA_ZAWSZE` bez bramki `ZAGADKA_NIE` (zweryfikowane w routerze) | „plan na 7.11”, „co mam 8.11”, „trening 8.11” → zagadka zamiast planu | wzorzec daty tylko gdy brak słów o własnych danych (`plan`, `trening`, `mam`) | w dniu startu ludzie pytają o plan na 7.11 i dostają zagadkę | **przed 8.11** (błąd w czasie akcji, 1 linia + blizna-93) |
| 2 | **Słowo „akcja/zbiórka” poza wzorcem omija zagadkę** (zweryfikowane: router → null → dalsze warstwy) | „kiedy rusza akcja”, „jaki jest cel akcji”, „ile km ma akcja”, „na co zbieramy”; „kiedy start akcji” → *moje_starty*; „link do zbiórki” → „Nie mam tego…” także po starcie | `akcj\w*`/`zbiork\w*` bez słów o własnych danych → zagadka/karta; „link do zbiórki” po starcie → karta akcji | przed startem pytanie o akcję idzie do modelu/sieci i może wrócić z opisem zbiórki z Google (nazwisko w linku siepomaga jest publiczne) | **przed 8.11** |
| 3 | **Nazwisko + słowo biegowe → tryb imprezy → sieć** (`impreza.mjs:82` — `wygladaNaOsobe` wyłącza się przy słowie biegowym) | „Jan Kowalski parkrun”, „kasia nowak ultra”, „Kowalski trail” | w trybie imprezy: gdy w pytaniu jest para Imię Nazwisko ze słownika → nie do sieci (odpowiedź „sprawdź w Wynikach”) | prywatne nazwisko w zapytaniu do Google | **przed 8.11** (wyciek) |
| 4 | **Samo nazwisko mija oba detektory** (strażnik wymaga pary słów) | „wyniki Nowaka”, „jak pobiegł Kowalski w Dębnie”, „kim jest Kowalski” | „wyniki X” / „jak pobiegł X” → narzędzie wyników, nie model; pojedyncze słowo z dużej litery + czasownik osobowy → strażnik | j.w. | **przed 8.11** (wyciek) |
| 5 | **„Pytanie wprost” wysyła prywatne nazwisko do Google** — zgodne ze spec M2b, niezgodne z regułą „nigdy do Google” | „kim jest Marek Nowak z naszego klubu”, „wygoogluj …” | decyzja: albo reguła publiczności także przy „wprost”, albo zostaje jak w spec | j.w. | **decyzja Filipa** |
| 6 | Stan akcji w izolacie — bezpieczny (ustawStan→dopasuj bez await), ale kruchy | — | stan jawny per żądanie (parametr), nie moduł | przyszły refaktor może go złamać | po 8.11 |
| 7 | Po zamknięciu akcji okienko dalej mówi „Akcja trwa” | „co to za akcja” po `koniec` | tekst PO_ZAMKNIECIU w `odpowiedzZagadki` | zły komunikat przez 7 dni po zamknięciu | po 8.11 (akcja potrwa miesiące) |
| 8 | Po starcie karta okienka bez „Twój wkład” | „ile już km” | dołożyć `akcja_moj_wklad` do karty | brak | po 8.11 |
| 9 | Tryb imprezy łapie porady; „ile już km” bez okresu, emoji, „12”, „???” → model + sieć za nic | „co jeść przed półmaratonem” | lista słów-porad → katalog/odmowa; puste → „Zapytaj o…” | koszt | po 8.11 |
| 10 | „…ani w sieci” mówione, gdy sieci nie pytano | — | tekst zależny od tego, czy sieć była | zaufanie | po 8.11 |
| 11 | Koszty/limity: typowo $0,02/pytanie z siecią, pesymistycznie ~$0,1; limit 60/dobę modelu + 20 sieci (tryb siec nie liczy się do 60 → realnie 60+20); budżet miesięczny tylko na ścieżce modelu; brak klucza → 502 bez logu; `OKIENKO_BUDZET_USD` na prod — nie do ustalenia z repo | — | sprawdzić env prod; log przy 502 | przy naporze 7.11 koszt rośnie z osobami, nie z ruchem | sprawdzić env przed 7.11, reszta po |

**Szczelne (sprawdzone):** `fabian*` i zagadka w obu stanach (11 wariantów), zagadki nie zdradzają nic poza datą, `akcja_licznik` przed startem bez nazwy/linku, do `googleSearch` idzie wyłącznie tekst + data, strażnik cyfr, narzędzia tylko odczyt z RLS, znajomi tylko z `public_training_logs`, klient `escapeHtml` + biała lista celów + `safeExternalHref`, log przez service_role (300 znaków, 30 dni), `verify_jwt = true`.

## B. Kalendarz — jedna lista (wdrożenie PO 8.11)

Zweryfikowane przez prowadzącego: wyścig `imprezyStart()` przed `await loadRaces()` (`races.html:702/704`) — prawda; SW bez `.webp` w regexie (`sw.js:257`) — prawda.

Najważniejsze:
1. **Projekt „zero kodu” jest nieaktualny** — `tools/kalendarz/generuj-zaslepki.mjs` wszedł 2.11; wyścig dedupu to jedna linia.
2. **Okładki Gemini z kolejki klienta (L3/L4)** odwracają zasadę race-image „wejście nie niesie nic do promptu”: nazwę/miasto do promptu dałby zalogowany użytkownik; zgłoszenia `zgloszona` dostałyby okładkę z czyjejś nazwy. Propozycja: hurtowo lokalnie (manifest w assets, tylko potwierdzone, prompt bez nazwy), po pomiarze, czy ktoś w ogóle przewija poza nasze karty.
3. **Dedup**: klucz bez roku nie scali „12.” z „13.” Biegiem Niepodległości; sb.js nie wycina liczebników rzymskich (okienko wycina); „zawieranie ≥ 10 liter” ryzykowne 11.11. Docelowo `races.impreza_klucz` zamiast heurystyki.
4. **Luki**: wiele dystansów (scalenie gubi `dystanse[]`), festiwale 2-dniowe scalane przez ±1 dzień, przeniesiony termin = dubel, „dziś” UTC w `loadRaces` vs lokalnie w `IMPREZY`, po `events_search` ginie dokładność miesiąca, brak „Ustaw jako cel” na karcie maszyny (K5 to umie).
5. **Zaślepki** pod własnym origin: nie w cache SW (`.webp`), `safeUrlAttr` do sprawdzenia → `biegamy-assets` przez `assetUrl()`.
6. **Filtry** nie przeżywają odświeżenia; limit 300 przy oknie 12 mies. utnie sezon — domyślnie 90 dni; szukać po stronie klienta na scalonej tablicy.
7. **Koszty**: Gemini $7,3 + $1,7/rok OK, ale 263 okładek × ~200 KB = ~50 MB na przewinięcie; 30 obrazów w jednym EF (10–15 min) przekroczy limit czasu; brak licznika prób przy odmowie; `in(263 kluczy)` w URL ~16 KB.
8. **Uprościć**: jedna reguła typu (dziś 3 kopie: race-image, zaślepki, projekt), równość+miasto w dedupie, „N bez województwa” zamiast mapy w v1.

**Kolejność po 8.11:** (1) moduł + wyścig + testy → (2) jedna lista + zaślepki + filtry + „Ustaw cel” → (3) województwo + „Dodaj do naszych” z `impreza_klucz` → (4) okładki hurtem lokalnie po obserwacji → (5) automatyzacja tylko jeśli 4 się przyjmie. Drobiazgi: `_shared/zrodla-wynikow.mjs` bez `superczas.pl`; notatka „hero 4:5” — repo ma 9:16.
