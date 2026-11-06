# Ulica Fabianka: scena 2D (Filip 4.11.2026)

Pełna scena tylko na `dla-fabianka.html` (`js/ulica-scena.mjs`). Karty na Dziś i w Okienku dostają nieruchomą miniaturę z `js/ulica.mjs` z linkiem do pełnej ulicy. Awaria sceny albo brak pliku: miniatura; awaria miniatury: sekcji nie ma, reszta strony bez zmian.

**Wyjątek (Filip 6.11):** gotowa ulica gra dżingiel z pliku `assets/gra/dzwieki/ul_fanfara.mp3`, pobierany dopiero wtedy, a przy błędzie ten sam dźwięk z kodu.

**Dźwięki są generowane w kodzie** (WebAudio: oscylatory i szum w `js/ulica-scena.mjs`). Nie ma plików dźwiękowych, więc nie ma cudzych źródeł ani licencji do pilnowania. Domyślnie wyciszone; `AudioContext` powstaje dopiero po geście, stan głośnika tylko w `localStorage` (`bm_ulica_dzwiek`).

**Grafiki:** `assets/ulica/*.webp` i `szyldy.json` robi `tools/ulica-grafiki.py` z PNG Filipa. Rozmiar pliku = 2 x wyświetlanie w scenie (stała `ROZMIARY`). Przy zmianie `szyldy.json` zaktualizuj stałą `SZYLDY` w `js/ulica.mjs` (pilnuje blizna-151).

**Dane:** `suma_km`, `imie`, `nazwa`, `cel_km`, `firmy` z `akcja_licznik`; cegiełki i elementy z progów z pola `akcja_licznik.ulica` (migracja `20261104_akcja_ulica_licznik.sql`). Brak pola = bez tych elementów. Przed startem bez liczb. Pól podróży moduły nie czytają.

**Licznik na żywo:** co 30 s przy widocznej karcie, przez EF `akcja-licznik`. Pamięć izolatu EF (60 s) i nagłówek `max-age=60` to ochrona bazy przy naporze i zostają, więc nowa wartość dochodzi z opóźnieniem do ok. 2,5 min. Świętuje tylko wzrost w trakcie oglądania; zaległości po wejściu na stronę się nie odtwarzają.

**Pora dnia:** `poraDnia(data)` w `js/ulica.mjs`: strefa Europe/Warsaw przez `Intl`, wschód i zachód z przybliżenia dla środka Polski wg dnia roku, bez sieci. Świt: od godziny przed wschodem do pół godziny po. Zmierzch: od pół godziny przed zachodem do godziny po.
