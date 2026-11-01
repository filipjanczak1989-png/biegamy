# Okienko „Zapytaj" — spec

Stan na 1.11.2026. Pełny kontrakt (EF, narzędzia, router, strażniki, limity, koszty z logu po pierwszym dniu) dopisujemy
razem z commitem zdejmującym włącznik `?zapytaj=1`. Ten plik zaczyna od kolejki, żeby ustalenia z testów nie ginęły.

## Poprawki z testu Filipa 1.11 („jakie szanse na rekordy", konto testowe) — ZROBIONE

1. **Karta odznaki pokazywała slug** (`pierwszy_start`). `odznaki_moje` zwraca teraz `nazwa` z katalogu `BADGES`
   w `odznaki.html` (to samo źródło co ekran Odznaki); slug zostaje tylko w `id`. Kopia dla Deno:
   `supabase/functions/_shared/odznaki-nazwy.mjs`, pilnowana przez blizna-64 (równość z katalogiem + brak `_`
   w nazwach kart). Id spoza katalogu → „Odznaka", nigdy slug.
2. **Zdanie zastępcze zależne od narzędzi.** Gdy po strażniku nie zostało żadne zdanie, a są karty: jedno narzędzie →
   „Oto Twój plan." / „Oto Twoje treningi." / „Oto Twoje starty." / „Oto Twoje wyzwania." / „Oto Twoje odznaki.";
   kilka → „Oto, co znalazłem."; bez kart → „Nie mam tego w Twoich danych.".
3. **Powód w logu.** Odpowiedź ze zdaniem zastępczym ma `ok=false` i `powod_odrzucenia`: odrzucone zdania modelu
   („liczba X: zdanie") albo „model: brak zdań" / „model: brak JSON-u". Wpis z 1.11 04:43 („jakie szanse na rekordy",
   `ok=true`, powód pusty) to właśnie ten przypadek — dotąd niewidoczny.

## Kolejka: M2e — rekordy

**Narzędzie `moje_rekordy`** (read-only, filtr na wołającego jak pozostałe):
PB na 5 / 10 / 21,1 / 42,2 km.

⚠️ **Źródło danych — sprostowanie do polecenia „z logiki prs.html, z datą i biegiem":** `prs.html` nie ma logiki
rekordów — to ekran gratulacji z parametrami URL (`dist`, `pace`, `time`); silnik `window.PRS` w `sb.js` też jest tylko
nakładką-animacją. Rekordy, które widzi zawodnik, siedzą w `athletes.pb_5k`, `pb_10k`, `pb_half`, `pb_marathon`
+ `pb_*_year`. Baza zna **rok, nie datę**, i **nie zna nazwy biegu** (por. pamięć: 94% par PB niedatowalnych;
`race_results` nie istnieje). Do decyzji przed kodem:
- (a) narzędzie zwraca to, co jest: czas + rok, bez biegu — karta „5 km · 22:41 · 2025";
- (b) dobieramy datę i bieg z `training_logs` (bieg o dystansie ±2% z czasem równym PB) — tylko gdy jedno trafienie,
  inaczej pole puste („nie wiem ≠ nic"); wymaga pomiaru, ilu osobom to coś da.
Rekomendacja: (a) teraz, (b) dopiero po pomiarze.

Czas parsowany przez `window._parseTimeToSecs` (SSOT w `sb.js`) — w EF potrzebna kopia z testem równoważności
(wzorzec `_shared/wyzwania.mjs`).

**Router:** `rekord|pb|życiówk|zyciowk|najlepszy czas` → `moje_rekordy`.

**Karta rekordu:** typ `rekord` — dystans, czas, rok (data i bieg tylko gdy są); brak pola = brak elementu.
Strażnik cyfr bez zmian: czasy i lata z wyniku narzędzia są dozwolone.

**„Szanse na rekordy"** = `moje_rekordy` + `moje_starty` (najbliższy start), **bez prognoz czasu**. Prompt:
zakaz liczenia i podawania przewidywanego wyniku; strażnik i tak wytnie liczbę spoza wyników. Router:
`szans\w* .*rekord` → oba narzędzia, zdanie z szablonu, np. „Najbliższy start: X za N dni. Twój rekord na tym
dystansie: 1:45:10 (2024)." — rekord tylko gdy dystans startu pasuje do jednego z czterech.

Testy: blizna-64 (narzędzie: filtr na wołającego, brak pól spoza listy; router: 5 fraz; „szanse" bez liczby spoza
wyników), blizna-65 (karta rekordu bez `undefined`).
