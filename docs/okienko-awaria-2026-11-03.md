# Okienko — awaria po przepięciu (3.11.2026, 19:36–19:45), gałąź okienko/awaria-2026-11-03

Zgłoszenie Filipa: po merge (okienko/przepiecie + wyniki/poprawki) i wdrożeniu `okienko`, `okienko-v2`, `okladki-imprez`
Okienko na każde pytanie odpowiadało „Nie dam rady teraz odpowiedzieć. Spróbuj za chwilę.” Przepięcie cofnięte
(`v2_dla_wszystkich = false`, 19:45:02).

## Przebieg (czas warszawski)

| kiedy | co |
|---|---|
| 19:08:50 | ostatni wpis w `okienko_v2_log` (tryb osoba, ok) |
| 19:12, 19:20 | commity `3a1b519` (przepięcie), `5ebb2c2` (wyniki, okładki) |
| 19:36 | wdrożone: `okienko` v44, `okienko-v2` v15, `okladki-imprez` v7 |
| 19:36–19:45 | v2 dla wszystkich, każde pytanie → „Nie dam rady” |
| 19:39–19:41 | automat okładek: 7 obrazów na tym samym kluczu Gemini |
| 19:45:02 | `v2_dla_wszystkich = false` |
| do 20:01 | **zero** wierszy w `okienko_v2_log` i `okienko_log` od 19:08:50; `client_errors` — ostatni wpis 16:00 |

„Nie dam rady” klient pokazuje przy KAŻDYM statusie innym niż 200 (poza 429 i offline) albo przy braku odpowiedzi.

## Sprawdzone i wykluczone

- **Kod na serwerze = repo.** `okienko-v2` v15 pobrana z serwera jest identyczna z `3a1b519` + `5ebb2c2`.
- **Brak pliku w paczce / zły import.** Funkcje startują: POST bez sesji → 401 z kodu funkcji (`{"blad":"brak sesji","wersja":"v2"}`,
  CORS, `x-okienko-wersja: v2`). W grafie modułów nie ma importów dynamicznych, więc błąd importu wywaliłby też tę ścieżkę.
- **Weryfikacja JWT na bramce.** `verify_jwt = true` na `okienko` i `okienko-v2` — tak samo jak na `intervals-sync` i
  `intervals-status` (wdrożone 17:18, działają) i tak samo jak w v14, która o 19:02–19:08 odpowiadała. Bramka odrzuca podrobiony
  token ES256 (`UNAUTHORIZED_ASYMMETRIC_JWT`), prawdziwe przepuszcza. **Sprostowanie** mojego wcześniejszego „verify_jwt
  faktycznie wyłączone”: bramka przepuszcza zapytanie z samym kluczem publikowalnym (bez `Authorization`), dlatego 401 przyszło z kodu.
- **CPU / wzorce.** Router + „o nas” ≤ 5 ms na pytanie (także złośliwe ciągi), import modułów 124 ms.
- **supabase-js `@2` z esm.sh.** Rozwiązuje się do 2.118.0 (15.10) — ta sama wersja co we wdrożeniach 17:18.
- **Lokalnie.** Pełny potok po merge na atrapach i z żywym Gemini — bez wyjątków; testy zielone.

## Czego nie da się ustalić bez logów EF

Która z „cichych” ścieżek zadziałała. Przed tą poprawką ŻADNA z nich nie zostawiała śladu:

1. **Gemini bez limitu czasu** (`okienko/model.mjs`, `okienko/siec.mjs`): wiszące wywołanie (równolegle szedł automat okładek
   na tym samym kluczu) → klient przerywa po 20 s → EF nie zdąża zapisać logu.
2. **Wczesne powroty bez wpisu**: 503 „limity”, 503 „narzędzie”, 502 „model niedostępny”, 400 „argumenty”.
3. **Wyjątek poza try** → Deno oddaje 500 **bez CORS** → przeglądarka widzi tylko błąd sieci.
4. **Odrzucenie przed funkcją** (bramka, sieć) — klient niczego nie zgłaszał.

Jeśli zawodziły też pytania bez modelu („pokaż plan”, „kim jest Filip”), to raczej 2–4 niż 1.

**Prośba do Filipa:** Dashboard → Edge Functions → `okienko-v2` → Logs i Invocations, 19:36–19:45 (statusy i komunikaty),
oraz jakie pytania padły.

## Poprawka (blizna-136)

| gdzie | co |
|---|---|
| `okienko/model.mjs`, `okienko/siec.mjs` | limit czasu na KAŻDE wywołanie Gemini (8 s, AbortController) → `BladModelu("timeout …")` / „sieć timeout” → wpis `blad`; sieć nie ponawia, gdy pierwsze wyszukanie zjadło ponad połowę limitu |
| `okienko/straz-http.mjs` (nowy, wspólny) | `zTerminem` (16 s < 20 s klienta), `opisBledu` (nazwa, komunikat, ramka stosu, bez długich tokenów) |
| `okienko/index.ts`, `okienko-v2/index.ts` | cała obsługa w `zTerminem` + `catch`: wpis `blad` („termin EF” / „wyjątek EF: …”), `console.error`, odpowiedź 504/500 **z CORS** |
| `okienko-v2/potok.mjs`, `okienko/index.ts` | każdy wczesny powrót ≠ 200 zostawia wpis `blad` z powodem; błąd zapisu logu nie psuje odpowiedzi |
| `js/okienko.js` | każda odpowiedź ≠ 200/429/offline → `client_errors` (kind `okienko`: wersja, status, kod błędu, czas — **nigdy treść pytania**, ≤ 5 na stronę); v2 z 500, 404 albo bez odpowiedzi (CORS/sieć) → to samo pytanie raz w v1 i v1 do końca sesji strony |

## Wdrożenie (Filip)

```
git push origin okienko/awaria-2026-11-03     # albo merge do main — js/okienko.js idzie przez Pages
supabase functions deploy okienko --use-api
supabase functions deploy okienko-v2 --use-api
```

Bez migracji. Kolejność: najpierw `okienko` (na nie klient przełącza się przy awarii v2), potem `okienko-v2`.

## Próba przed ponownym przepięciem (konto Filipa jest na liście v2)

1. Pięć pytań różnego rodzaju: „pokaż plan”, „kim jest Filip”, „ile przebiegłem w tym tygodniu”, „rekord świata w maratonie”,
   „jak zacząć biegać”.
2. Kontrola:
   ```sql
   select kiedy at time zone 'Europe/Warsaw' kiedy, tryb, ok, ms, left(powod_odrzucenia, 120) powod
   from okienko_v2_log where kiedy > now() - interval '15 minutes' order by kiedy desc;
   select created_at at time zone 'Europe/Warsaw' kiedy, source, message
   from client_errors where kind = 'okienko' order by created_at desc limit 20;
   ```
   Każde pytanie ma wpis; `blad` mówi, co padło; awaria przed funkcją widać w `client_errors` (np. `http 401 · UNAUTHORIZED_…`).
3. Pięć odpowiedzi i pięć wpisów → przepięcie (`docs/okienko-przepiecie-2026-11-03.md`):
   ```sql
   update public.okienko_ustawienia set wartosc = 'true', zmieniono = now() where klucz = 'v2_dla_wszystkich';
   ```
   15 minut obserwacji tych dwóch zapytań. Powrót:
   ```sql
   update public.okienko_ustawienia set wartosc = 'false', zmieniono = now() where klucz = 'v2_dla_wszystkich';
   ```
