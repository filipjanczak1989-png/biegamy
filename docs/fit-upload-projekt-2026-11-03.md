# Koło zapasowe: ręczne wgranie pliku .FIT — zwiad + projekt (3.11.2026, budowa PO 8.11)

## Zwiad: czy już jest?

**Nie ma.** W repo nie istnieje żaden parser FIT ani wejście na plik treningu: jedyne `<input type="file">` przyjmują `image/*`
(avatar, zdjęcie w poście, zdjęcie w czacie). Jedyną „ręczną” drogą z zegarka jest **zrzut ekranu → OCR** (`ocr-training-screen`, Anthropic)
oraz ręczny zapis logu. Dziś gdy Garmin przestanie płynąć przez intervals, zawodnik ma tylko te dwie drogi — tekst ogniwa `garmin`
w kreatorze mówi o nich, a nie o „wgraj plik”, dopóki FIT nie wejdzie.

## Projekt (szacunek 2–3 dni)

**Gdzie:** Profil → sekcja zegarka (pod kreatorem, zawsze widoczne) i Log → „Dodaj z pliku”. Jeden komponent w `sb.js` (WATCH.fit) — SSOT.

**Parser:** w przeglądarce, bez biblioteki z CDN (bramka-cdn): własny minimalny dekoder FIT w `js/fit.mjs` (~300 linii): nagłówek,
rekordy definicji/danych, komunikaty `file_id` (0), `session` (18), `record` (20), `lap` (19), `activity` (34), `device_info` (23).
Z `session`: sport/sub_sport, start_time, total_elapsed/timer_time, total_distance, avg/max_heart_rate, total_ascent, total_calories,
avg_cadence; z `record`: strumienie (lat/lng, hr, altitude) co ≤ 1 pkt / 50 m jak w `slad.mjs`; z `device_info`: producent/produkt
(→ `urzadzenie`). Testy na 3–4 prawdziwych plikach (Filip: fenix, Forerunner, Coros) w `tests/_fit/` — bez danych osobowych (FIT zawiera
tylko numer seryjny urządzenia; GPS = trasa → pliki testowe z treningu poza domem albo z uciętymi `record`).

**Zapis:** `training_logs` z `external_source = 'fit'`, `external_id = sha1(pliku)` (dedup tego samego pliku), typ przez
`_shared/typ-aktywnosci.mjs` (ta sama mapa co intervals), kolizja z importem z intervals tego samego dnia przez `kolizja-importu.mjs`
(FIT nie wygrywa z intervals; gdy intervals później przyniesie tę samą aktywność — dedup po dacie+dystansie ±2%, jak dziś OCR).
Domknięcie planu jak przy imporcie (`domknij-plan.mjs`). Plik FIT NIE jest przechowywany (parsujemy w przeglądarce, do bazy idą liczby
i uproszczony ślad) — zero kosztu storage i mniej danych.

**Skąd wziąć FIT:** Garmin Connect (web) → aktywność → ⚙ → „Eksportuj oryginał” (zip z .fit); Coros/Suunto/Polar — eksport z aplikacji.
Krok w kreatorze przy ogniwie `garmin`: „Wgraj plik .FIT” + link do instrukcji producenta. Telefon: Garmin Connect mobile nie eksportuje
FIT — potrzebny komputer albo plik z Dysku; to ograniczenie wpisać w tekst.

**Prywatność:** trasa = adres domowy → ślad ukrywany jak w wyprawie (2 000 m od startu/końca) albo w ogóle nie zapisujemy śladu w v1
(rekomendacja: v1 bez śladu, tylko liczby).

**Blizna:** plik testowy → dokładnie jeden log, drugie wgranie tego samego pliku → 0; FIT + intervals tego samego treningu → jeden log.

**Kolejność:** po Garminie bezpośrednio (docs/zwiad-garmin-api-2026-11-03.md) albo przed nim, jeśli intervals odetnie Garmina wcześniej
— wtedy FIT jest jedyną drogą dla ~połowy zawodników i staje się pilny.
