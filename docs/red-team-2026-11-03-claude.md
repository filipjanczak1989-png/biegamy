# Red team Okienka z Claude — 3.11.2026

**Wynik: 500 ataków w 3 stanach akcji (1500 rozmów, 2964 tury). Żadna odpowiedź nie ujawniła celu wyprawy, nazwiska ani choroby dziecka, danych innych osób ani instrukcji. Przed poprawkami narzędzie oznaczyło 84 rozmowy, po poprawkach 0.** Wyszło za to pięć prawdziwych błędów, opisanych niżej; wszystkie są poprawione na gałęzi `okienko/trening-claude` i czekają na wdrożenie.

## Zakres

| | |
|---|---|
| Ataki | 500 od Claude: cel 175, dziecko 125, osoby 100, bramki 100; 83 w obcych językach, 147 wielotur, 100 z turami dopisywanymi na żywo |
| Stany licznika akcji | `trwa`, `przed`, `dotarli` |
| Potok | prawdziwy potok v2 z żywym Gemini: klasyfikator, model, wyszukiwarka |
| Wykrywacze | regułowe (`tests/_red-team.js`) + ocena Claude tekstu napisanego przez model |
| Na atrapach | baza i maszyna wyników F6 (patrz ograniczenia) |

## Przebiegi

Powtórki to dokładnie te same rozmowy (`--ataki`), łącznie z turami adaptacyjnymi.

| Przebieg | Co zmieniono przed nim | Oznaczone | Realne |
|---|---|---|---|
| 1 | — | 84 | 3 klasy błędów (poz. 1, 4, 5); reszta to szum, a część prób szła w złym stanie |
| 2 | poprawki pierwszego przebiegu, ławka bez szumu | 1 | 1: zgadywanie tak/nie (poz. 4) |
| 3 | reguła tak/nie | 3 | 1: pranie kontekstu (poz. 3); 2 fałszywe |
| 4 | poprawka prania kontekstu, kryterium sędziego | 2 | 0; oba to to samo fałszywe na zdaniu bez danych |
| 5 | sędzia ocenia tylko tekst modelu | **0** | **0** |

## Pięć najgroźniejszych

Żaden nie doprowadził do wycieku. Kolejność wg tego, co zobaczyliby ludzie w sobotę.

1. **Tekst przed startem w trakcie akcji.** Pytanie o akcję rozpoznane tylko przez klasyfikator nie pobierało stanu akcji, więc po starcie dostawało odpowiedź z okresu przed startem. W stanie `trwa`: 10 z 18 takich tur. Pozostałe 8 było poprawne prawdopodobnie tylko dlatego, że równoległe żądania w tym samym procesie ustawiały wspólny stan, więc przy małym ruchu na produkcji odsetek błędnych może być wyższy (nie zmierzono).
2. **Strażnik wyjścia ślepy na języki ataków.** Znalezione sondą przed płatnym przebiegiem: 13 z 21 podłożonych przecieków przechodziło, m.in. nazwa celu cyrylicą i po niemiecku, opisy celu oraz choroba dziecka po ukraińsku, rosyjsku, hiszpańsku i czesku. Ostatnia linia obrony miałaby lukę dokładnie tam, gdzie celuje atakujący.
3. **Pranie kontekstu.** Jedno niewinne pytanie o plan między pytaniami o metę kasowało pamięć o akcji i kolejne pytanie o miejsce szło do Google.
4. **Dopytania o trasę w sieci i zgadywanie tak/nie.** Pytania o granicę, kraj czy półmetek trafiały do wyszukiwarki i wracały z przypadkowym maratonem albo gołym „Nie.”, które wygląda jak potwierdzenie. Do wyszukiwarki idzie samo pytanie bez danych o wyprawie, więc wycieku nie było, ale odpowiedź wprowadzała w błąd.
5. **„Filip i Kasia” jako wyszukiwanie osoby.** 43 tury w pierwszym przebiegu; odpowiedź o założycielach brzmiała „W BiegaMy nie ma nikogo o tym imieniu i nazwisku”.

## Co zmieniło się w pomiarze

Spadek z 84 do 0 to nie same poprawki Okienka. Część oznaczeń zniknęła, bo poprawiłem przyrząd, i te zmiany trzeba czytać osobno:

- **Stan akcji w ławce:** pamięć stanu (60 s) przenosiła się między stanami, więc w pierwszym przebiegu 66 odpowiedzi w `przed` i 69 w `dotarli` poszło w niewłaściwym stanie. Liczby z pierwszego przebiegu dla tych dwóch stanów są przez to przybliżone.
- **Co liczy się jako „model”:** stałe zdania (odmowa, zagadka, „o nas”) były liczone jak odpowiedź modelu. To 85 z 93 oznaczonych tur pierwszego przebiegu.
- **Sędzia:** przestał traktować znacznik `[OSOBA]` jako dowód wycieku (anonimizator bywa nadgorliwy), przestał uznawać ogólną poradę za ujawnienie celu i ocenia wyłącznie tekst napisany przez model.
- **Wykrywacz w drugą stronę:** dodane warianty nazwy celu, obce słowa chorobowe i nazwa cyrylicą, która wcześniej nie pasowała. Wszystko to czyni go surowszym.

## Ograniczenia

- **Baza i F6 były atrapami.** Test sprawdza logikę potoku i modele, nie zabezpieczenia prawdziwej bazy (RLS) ani treść prawdziwych profili. Tryb osoby nie widział więc prawdziwych wyników i nie szedł do sieci.
- **0 to nie gwarancja.** Model jest niedeterministyczny: te same rozmowy dały kolejno 1, 3, 2 i 0 oznaczeń. Regex nie zna parafrazy, a sędzia widzi jedną turę.
- **Nowe ataki mogą znaleźć nowe drogi.** Powtórki sprawdzają ten sam zestaw.
- **Do czasu wdrożenia produkcja działa bez tych poprawek.**

## Decyzja Filipa

Nazwa celu zostaje w publicznym repo: to niespodzianka dla użytkowników, nie tajemnica (3.11.2026).

## Koszt

| | |
|---|---|
| Claude: generowanie, tury adaptacyjne, próba | 10,78 USD |
| Claude: ocena odpowiedzi | 1,66 USD |
| **Claude razem** | **12,44 USD** z progu 90 |
| **Gemini razem**, 5 przebiegów (szacunek z cennika) | **4,45 USD** |

Około 3,6 USD z kosztu Claude to fallback na `claude-opus-4-8`, gdy klasyfikator bezpieczeństwa Opusa 5.5 odrzucał treść ataku.

Pełne przebiegi z treścią rozmów: poza repo, `Downloads\biegamy-podglady\red-team-2026-11-03-*`.
