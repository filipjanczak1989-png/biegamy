# Zwiad: narzędzia do trenowania Okienka (3.11.2026) — rekomendacja, budowa po OK Filipa

Kontekst: mamy własną ławkę (`tests/_lawka-v2.js`, 255 pytań z oczekiwaną ŚCIEŻKĄ, atrapy w CI, `--zywy` z kluczem), noc w Actions
(`okienko-noc`: ławka na żywo + prawdziwe pytania + sędzia + anonimizacja), kciuki w logu, raport dnia/tygodnia. Pytanie: co z gotowych
narzędzi dołożyć, a czego nie. Liczby z sieci 3.11 (źródła na końcu; cenniki sprawdzić na stronach dostawców przed decyzją).

## 1. promptfoo — ocena promptów i modeli (open source, CLI + GitHub Action)

Co daje: plik YAML z pytaniami i asercjami, uruchomienie tej samej listy na kilku dostawcach naraz (Gemini i Anthropic obok siebie),
sędzia `llm-rubric` (model ocenia wg rubryki; temperatura 0, bo inaczej „flapuje”), asercje kosztu i opóźnienia, Action z komentarzem
w PR „regresja vs gałąź bazowa”, HTML z porównaniem. Darmowe (narzędzie), płacimy tylko za tokeny.

Co zyskujemy względem naszej ławki: (a) porównanie **dostawców i wariantów promptu** w jednej tabeli — tego nasza ławka nie ma (mierzy
ścieżkę potoku, nie treść); (b) gotowy sędzia z rubryką i raport HTML; (c) tryb „red team” (wstrzyknięcia, wycieki) z gotowych szablonów.
Co tracimy / czego promptfoo nie umie: naszej ławki NIE zastąpi — ona ocenia **deterministyczną ścieżkę** (router → osoba → sieć → przepis)
na atrapach za 0 $, a promptfoo ocenia **odpowiedź tekstową** z modelu; nasz potok to funkcja z zależnościami (sb, F6, narzędzia), więc
promptfoo musiałby wołać EF przez HTTP (provider `http`) z sesją — wtedy testuje prod, nie kod. Koszt: tokeny jak przy `--zywy` + sędzia
(flash) ≈ 0,05–0,2 USD na przebieg 50 pytań.

Rekomendacja: **TAK, ale wąsko** — osobny plik `promptfoo/okienko.yaml` z 30–50 pytaniami WIEDZY (porada/żywienie/sprzęt/fakt), gdzie
porównujemy: prompt wiedzy v2 (Gemini + googleSearch) vs ten sam prompt na Anthropic (bez wyszukiwania → spodziewana przegrana na
faktach, ciekawa na poradach) vs warianty promptu; sędzia `llm-rubric` z naszymi 5 kryteriami. Nocą w Actions raz w tygodniu, nie
codziennie (koszt). Ławka v2 zostaje źródłem prawdy o ścieżce.

## 2. Langfuse — śledzenie rozmów (traces, koszty, oceny, zbiory testowe)

Co daje: każde pytanie jako trace z krokami (klasyfikator → narzędzia → model → strażnik), czasy i tokeny per krok, koszt, 👍/👎 jako
„scores”, budowanie datasetu z nieudanych rozmów jednym kliknięciem, porównanie wersji promptu. Cloud: region **EU** dostępny; plan Hobby
darmowy (ok. 50 k jednostek/mies.), ale wg źródeł **bez DPA** na Hobby — DPA od planu Core (~29 USD/mies.). Self-host: MIT (poza `ee/`),
od 2026 pod ClickHouse Inc.; potrzebuje Postgres + ClickHouse + Redis + S3 — to osobny serwer do utrzymania.
Warunek Filipa (żadnych danych osobowych innych osób): do trace’a wchodziłoby pytanie i odpowiedź → trzeba anonimizować PRZED wysłaniem
(`tools/_anonimizuj.mjs` działa w EF? tak, to czysty ESM — ale anonimizacja w locie kosztuje czas i może zamazać to, co chcemy debugować).

Rekomendacja: **NIE TERAZ.** Mamy już własne trace’y w `okienko_v2_log` (ścieżka, tokeny, ms, samosprawdzenie, ocena, komentarz,
odpowiedź) i raport dnia, który z nich czyta. Langfuse dałby ładny UI i datasety, ale kosztem: DPA/plan płatny albo self-host, wysyłka
treści na zewnątrz, kolejny system. Wracamy po przełączeniu wszystkich na v2, gdy ręczne czytanie raportu przestanie się skalować
(> ~50 wpisów do przejrzenia dziennie). Do tego czasu: brakujące „datasety z błędów” robi sekcja „kandydat do ławki” w raporcie.

## 3. Batch API (Gemini / Anthropic) dla nocnych testów

Gemini: Batch API = **50 % ceny**, kolejka w tle, cel 24 h, przeterminowanie po 48 h; łączy się z cache. Anthropic: Message Batches —
również 50 % (wg dokumentacji Anthropic, do sprawdzenia), do 24 h. Nasza noc: ławka --zywy ≈ 255 wywołań klasyfikatora (~0,13 USD)
+ sędzia (~0,03 USD). Oszczędność ≈ 0,08 USD/noc ≈ 2,5 USD/mies. Koszt wdrożenia: inny kształt wywołania (zlecenie → odpytanie →
pobranie), nagrania klasyfikatora dostajemy z opóźnieniem — raport o 02:00 nie ma wyniku; trzeba by zlecać o 20:00 i czytać rano.

Rekomendacja: **NIE** przy obecnej skali (zysk 2–3 USD/mies. za dodatkową złożoność). Wraca, gdy ławka urośnie do ~2 000 pytań albo
benchmark W4 pójdzie codziennie.

## 4. Generator wariantów pytań (u nas)

Z prawdziwych pytań (raport dnia, `okienko_v2_log`) model robi 10 wariantów: literówki, skróty, potoczne, bez polskich znaków, z emoji,
dwa pytania w jednym, zaimki po poprzedniej turze. Wynik: kandydaci do ławki z tą samą OCZEKIWANĄ ścieżką co pytanie-matka (ścieżka
jest znana z logu), do przeglądu Filipa — nigdy automatycznie w kodzie. Koszt: 1 wywołanie flash-lite na pytanie-matkę ≈ 0,0005 USD;
20 pytań/noc → 0,01 USD. Łatwe: `tools/okienko-warianty.mjs` (reużywa `generujJson`), sekcja w raporcie nocy.

Rekomendacja: **TAK, najtaniej i najszybciej** (pół dnia) — to bezpośrednio karmi ławkę pytaniami, których ludzie naprawdę używają,
w pisowni, której nie wymyślimy przy biurku. Warunek: warianty ze słowami z pytania-matki po anonimizacji (nazwiska → nigdy).

## 5. Prompt caching dla stałych instrukcji

Gemini: cache (implicit dla 2.5+/3.x automatycznie; explicit z TTL) = **90 % taniej** za tokeny z cache + opłata za przechowywanie;
Anthropic: cache read 90 % taniej, zapis +25 %, TTL 5 min (1 h za dopłatą), minimum 1 024–2 048 tokenów promptu. Nasze stałe
instrukcje: klasyfikator ~1 000 tokenów, wiedza ~400, przyszła rozmowa ~500 — na granicy minimum; implicit cache Gemini działa sam,
jeśli prefiks promptu jest identyczny (u nas: system prompt + lista intencji — tak; data w prompcie klasyfikatora („Dziś jest …”) psuje
prefiks → przenieść datę NA KONIEC promptu albo do wiadomości użytkownika). Wpływ na czas: mniejszy (cache skraca głównie koszt wejścia,
opóźnienie p90 zależy od wyjścia i sieci); na koszt: klasyfikator to ~60 % tokenów wejścia Okienka → realnie −30–40 % kosztu wejścia.

Rekomendacja: **TAK, jedna zmiana bez ryzyka**: prefiks promptów stały (data na końcu), potem pomiar w logu (`tok_we` spada?).
Explicit cache i Anthropic — razem z etapem „dostawcy” po 8.11.

## Kolejność (propozycja)

1. **Prompt caching przez stały prefiks** (1 h roboty + pomiar tydzień) — od razu po R2.
2. **Generator wariantów** do raportu nocy (0,5 dnia) — po R3.
3. **promptfoo** dla porównania dostawców i promptów wiedzy (1 dzień) — razem z etapem „dostawcy” po 8.11, co tydzień w Actions.
4. Langfuse — po przełączeniu wszystkich na v2, jeśli raport dzienny przestanie wystarczać.
5. Batch API — nie, dopóki noc kosztuje < 1 USD.

## Źródła

- promptfoo: https://timdeschryver.dev/blog/testing-ai-prompts-and-comparing-models-with-promptfoo.md ; https://noqta.tn/tutorials/promptfoo-llm-evals-testing-ai-apps-2026 ; https://www.promptfoo.dev (dokumentacja — zweryfikować nazwy wejść Action)
- Langfuse: https://langfuse.com/pricing ; https://www.zenml.io/blog/langfuse-pricing ; https://dev.to/beton/langfuse-pricing-teardown-2026-2pi9 ; https://www.activepieces.com/blog/langfuse-pricing-plans-and-what-you-pay-in-2026.md
- Gemini batch i cache: https://ai.google.dev/gemini-api/docs/optimization ; https://deploybase.ai/articles/gemini-api-pricing-2026 ; https://www.developersdigest.tech/models/cost-levers/google
- Anthropic batch/caching: dokumentacja Anthropic (Message Batches, Prompt caching) — liczby z pamięci, do potwierdzenia przy etapie „dostawcy”
