# Wykładnik Riegela — zwiad i ujednolicenie (3.11.2026; wartość do decyzji Filipa)

Niespójność zgłoszona przez Filipa: projekt W1 mówił „1,091 jak w aplikacji”, a `wyniki-lista.mjs` ma 1,06. Zwiad pokazał, że
**aplikacja wszędzie używa 1,06**; 1,091 to tylko ZMIERZONA mediana z par PB zawodników (16.08.2026), nigdy nieużyta w kodzie
(wykładnik indywidualny odrzucony — opis niżej). Błąd był w projekcie, nie w kodzie. Poprawiony.

## Gdzie który wykładnik był dziś (przed ujednoliceniem)

| miejsce | wartość | co pokazuje / do czego służy | kto to widzi |
|---|---|---|---|
| `zawodnik.html` `_renderPredykcje`, `K_DOLNA = 1.06` | 1,06 | predyktor czasów w karcie Forma: z najbliższego dystansem PB liczy czasy na 5/10/21/42 km, korekta o TSB; 1,06 to DOLNA krawędź pasma (pasmo 1,06–1,15 = niepewność) | zawodnik |
| `js/generator-planu.js` `RIEGEL = 1.06` | 1,06 | kotwica planu: przeliczenie PB między dystansami do ustalenia temp w planie (kotwica = najbliższe PB przez VDOT, Riegel do porównań) | generator planu (zawodnicy bez trenera) |
| `js/wyniki-lista.mjs` `RIEGEL = 1.06` | 1,06 | „wyniki jak manager”: każdy start klasyczny → ekwiwalent 10 km → trend formy (bez prognoz) | wyniki.html (zawodnik, trener) |
| `tests/predykcje.test.js` | 1,06 pilnowane | „JEDYNYM wykładnikiem w karcie ma być 1,06” — test, żeby indywidualny nie wrócił bocznymi drzwiami | CI |
| `tests/blizna-110` | 1,06 pilnowane | `BM_WYNIKI.RIEGEL === 1.06` | CI |
| `tests/blizna-24` | 1,06 vs 1,091 | tylko sprawdza, że rozrzut między nimi > 1 pkt proc. (próg zdania w generatorze) | CI |
| komentarze (zawodnik, generator, sb.js, migracje PB) | 1,091 | zmierzona mediana u nas — ZALEGŁOŚĆ „wykładnik indywidualny”, ODRZUCONA 16.08 | — |

## Dlaczego 1,091 nie weszło (16.08.2026, pamięć projektu)

Wykładnik z dwóch PB opisuje krzywą człowieka tylko, gdy oba PB są z tego samego okresu formy — 94 % par PB jest niedatowalnych.
Na 30 przypadkach: w GÓRĘ (z 10 km na maraton) wyższy wykładnik pomaga, w DÓŁ szkodzi 0/30. Decyzja: jeden wykładnik literaturowy
1,06, pasmo niepewności 1,06–1,15 w karcie, „indywidualny” nie wraca. Warunek powrotu: pary PB z datami (kolumny `pb_*_year` od
16.08 — „PB rok zamiast daty”).

## Co zrobiono 3.11

- `js/riegel.js` = jedyne źródło: `BM_RIEGEL.WYKLADNIK`, `przelicz(czas, zKm, naKm)`, `ekwiwalent10`. Działa jako `<script src>`,
  `require()` (testy generatora) i `import` (EF, przyszłe W1).
- Konsumenci przepięci: generator (`RIEGEL` z modułu), wyniki-lista (`RIEGEL` z modułu, nadal eksportuje `BM_WYNIKI.RIEGEL` dla blizny-110),
  zawodnik.html (`K_DOLNA` z modułu). Strony ładują `js/riegel.js` przed tymi skryptami; `tests/_srodowisko.js` tak samo.
- Blizna-123: w repo jest dokładnie JEDEN literał wykładnika (w `js/riegel.js`); każdy `Math.pow` z Rieglem korzysta z modułu;
  wartość 1,06 nietknięta.

## Decyzja Filipa (do podjęcia)

Wartość zostaje 1,06 (dzisiejsze zachowanie) — albo inna, wtedy zmiana jednej linii w `js/riegel.js` i aktualizacja asercji
w `tests/predykcje.test.js` / `blizna-110` (pilnują liczby świadomie). W1 (prognoza startu w okienku) użyje `BM_RIEGEL.przelicz`
i pokaże ZAKRES z pasmem 1,06–1,15 jak karta Forma, nie jedną liczbę.
