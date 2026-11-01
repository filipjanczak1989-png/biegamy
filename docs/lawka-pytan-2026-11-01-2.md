# Ławka pytań okienka — 2026-11-01

Ścieżki lokalne na atrapach (kształt konta testowego); MODEL/SIEĆ symulowane (koszt ze średnich okienko_log 1.11).

| # | pytanie | kat. | ścieżka | odpowiedź | koszt | ocena | co trzeba |
|---|---|---|---|---|---|---|---|
| 1 | co mam dzis | wlasne | router→moj_plan | 1 kart: „Nie masz jeszcze planu na dziś. Mogę go ułożyć — trzy pytania.” | 0 | dobra |  |
| 2 | plan na jutro | wlasne | router→moj_plan | 1 kart: „Nie masz jeszcze planu na jutro. Mogę go ułożyć — trzy pytania.” | 0 | dobra | konto testowe bez trenera i planu → karta „Ułóż plan” (M3b) |
| 3 | ile przebieglam w pazdzierniku | wlasne | router→moje_treningi | 1 kart: „Od 1.10 do 31.10: 10,2 km biegu, 1 trening.” | 0 | dobra |  |
| 4 | ile km w tym tygodniu | wlasne | router→moje_treningi | 1 kart: „Od 26.10 do 1.11: 10,2 km biegu, 1 trening.” | 0 | dobra |  |
| 5 | kiedy mam nastepny start | wlasne | router→moje_starty | 1 kart: „Najbliższy start: Bieg Niepodległości, za 10 dni (11.11).” | 0 | dobra |  |
| 6 | jakie mam odznaki | wlasne | router→odznaki_moje | 5 kart: „Masz 44 odznaki.” | 0 | dobra |  |
| 7 | moje rekordy | wlasne | router→moje_rekordy | zdanie: „Nie masz jeszcze wpisanych rekordów — uzupełnisz je w Profilu.” | 0 | PUSTA | konto bez pb_* → „uzupełnisz w Profilu” — prawda, ale rekordy można by policzyć z logów (M2e wariant b) |
| 8 | jaka mam forme | wlasne | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | idzie do modelu bez narzędzia → „Nie mam tego w Twoich danych.” za ~$0,0008; M3e moja_forma |
| 9 | ile spalilem kalorii w tym tygodniu | wlasne | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model, brak narzędzia; kcal są w nutrition — osobna decyzja (produkty poza katalogiem) |
| 10 | czy dzis moge biegac po kontuzji | wlasne | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model bez narzędzia (kontuzje czyta tylko EF trenera) → pusto za ~$0,0008; zaległość „generator nie widzi kontuzji” |
| 11 | Robert Korzeniowski | osoby | osoba→sieć | 2 kart zdania: „(sieć)” | $0.0211 | dobra | tryb osoby: F6 + (publiczny) sieć |
| 12 | kim jest Marcin Lewandowski | osoby | osoba→sieć | 1 kart zdania: „(sieć)” | $0.0211 | dobra | wprost → sieć |
| 13 | wyniki Katarzyny Chojnackiej | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (2): 0 trafień → drugie wywołanie z rdzeniami („katarz chojnack”); na prod search_runners daje 4 |
| 14 | jak pobiegl Jan Kowalski w Poznaniu | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (1): osoba w zdaniu, q „Jan Kowalski”, kontekst „Poznaniu” → filtr wyników; do 1.11 nazwisko szło do Google |
| 15 | kasia nowak | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | odpowiedź informacyjna gdy brak (M3-0b) |
| 16 | czy Anna Kowalska jest w aplikacji | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (1): osoba w zdaniu → tryb osoby, nie model/sieć |
| 17 | kto biega z mojego miasta | osoby | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model bez narzędzia → pusto; brak narzędzia „znajomi/okolica” |
| 18 | moi znajomi co biegali | osoby | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model; M3e znajomi_tydzien |
| 19 | kto jest moim trenerem | osoby | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model bez narzędzia → „Nie mam tego…”; proste narzędzie moj_trener |
| 20 | dodaj Jana Kowalskiego do znajomych | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (1): osoba w zdaniu → karta osoby z „Dodaj do znajomych” (akcja po tapnięciu); odmiana → (2) |
| 21 | jakie biegi w listopadzie w poznaniu | imprezy | router→biegi_nadchodzace | 1 kart: „W listopadzie w Poznaniu maszyna wyników zna 1 bieg.” | 0 | dobra |  |
| 22 | gdzie pobiec dyche w grudniu | imprezy | router→biegi_nadchodzace | 1 kart: „W grudniu na 10 km maszyna wyników zna 1 bieg.” | 0 | dobra |  |
| 23 | ultrakotlina | imprezy | impreza→sieć | 1 kart „(sieć)” | $0.0211 | dobra | przez trafienie w kalendarzu |
| 24 | kiedy jest maraton warszawski 2027 | imprezy | impreza→sieć |  „(sieć)” | $0.0211 | dobra | M3-1 (2): „maraton <nazwa>” → impreza (events_search), nie lista |
| 25 | polmaraton w krakowie | imprezy | router→biegi_nadchodzace | zdanie: „Maszyna wyników nie ma biegów od 1.11 do 30.01 w Krakowie na półmarato” | 0 | PUSTA | lista 90 dni bez kwietniowego biegu; od M3-1 (2) zdanie mówi, jaki to zakres („od 1.11 do 30.01 w Krakowie na półmaratonie”) |
| 26 | jakie biegi w weekend | imprezy | router→biegi_nadchodzace | zdanie: „Maszyna wyników nie ma biegów od 1.11 do 1.11.” | 0 | dobra | M3-1 (2): weekend = najbliższe sb–nd |
| 27 | zapisy na bieg niepodleglosci | imprezy | impreza→sieć | 1 kart „(sieć)” | $0.0211 | dobra | impreza: karta z kalendarza + sieć ze źródłami (~$0,02); link zapisów wejdzie z K4/K5 |
| 28 | trasa polmaratonu poznanskiego | imprezy | impreza→sieć | 1 kart „(sieć)” | $0.0211 | dobra | impreza (słowo z listy) + sieć ze źródłami |
| 29 | biegi za granica w styczniu | imprezy | router→biegi_nadchodzace | zdanie: „Maszyna wyników nie ma biegów w styczniu.” | 0 | PUSTA | maszyna zna tylko Polskę → „nie ma biegów w tym zakresie” — prawda, ale bez wskazania |
| 30 | ile kosztuje wpisowe na maraton w debnie | imprezy | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | „ile” wyklucza imprezę i kalendarz → model → sieć ~$0,02; impreza + link do strony organizatora dałaby to za 0 |
| 31 | czwarta godzina | tresci | katalog | 1 kart: utwor | 0 | dobra | utwór z radia |
| 32 | puść boso | tresci | katalog | 1 kart: utwor | 0 | dobra | „pusc” pominięte → utwór „Boso” |
| 33 | przepis na omlet | tresci | katalog | 1 kart: przepis | 0 | dobra |  |
| 34 | cwiczenia na core | tresci | katalog | 1 kart: cwiczenie | 0 | dobra | M3-1 (2): „cwiczenia” pominięte jak „przepis” → program Core |
| 35 | oddech 4-7-8 | tresci | katalog | 1 kart: cwiczenie | 0 | dobra | M3-1 (2): „oddech” = słowo kategorii, cyfry liczą się jako słowa → technika 4-7-8 |
| 36 | jak dziala tsb | tresci | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | model → pusto; brak wpisu „pojęcia” w katalogu (TSB, CTL, strefy) |
| 37 | gdzie zmienic haslo | tresci | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | PUSTA | katalog ekranów nie zna „hasło” → model → pusto; słowa-klucze ekranów do rozszerzenia |
| 38 | pokaz wyzwania | tresci | router→wyzwania_postep | 5 kart: „Nie masz teraz wyzwania w toku.” | 0 | dobra |  |
| 39 | co to jest odznaka wracam do gry | tresci | katalog | 1 kart: kat_odznaka | 0 | PUSTA | M3-1 (2): „co to jest” omija router odznak → katalog daje kartę odznaki; opisu odznaki w karcie nadal nie ma |
| 40 | radio | tresci | katalog | 1 kart: kat_ekran | 0 | dobra |  |
| 41 | kto wygral maraton w berlinie | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | dobra | sieć ze źródłami (~$0,02) |
| 42 | jaka pogoda jutro w poznaniu | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | sieć ~$0,02, a pogodę aplikacja MA (weather w sessionStorage) — narzędzie pogoda za 0 |
| 43 | ile kalorii ma banan | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | sieć; baza produktów w Jedzeniu ma to za 0 — osobna decyzja |
| 44 | jak przeliczyc tempo na predkosc | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | model/sieć; kalkulator = 0 tokenów |
| 45 | rekord swiata w maratonie | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | dobra | M3-1 (2): „świata” wyklucza moje_rekordy → sieć ze źródłami (~$0,02) |
| 46 | co jesc przed polmaratonem | poza | impreza→sieć |  „(sieć)” | $0.0211 | ZA DROGA | M3-1 (2): „co jeść” omija listę → sieć ~$0,02 za poradę ogólną; brak własnej treści |
| 47 | jak dobrac buty do biegania | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | sieć |
| 48 | czy biegac z katarem | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | sieć — porada zdrowotna bez zastrzeżenia |
| 49 | ile powinienem biegac tygodniowo | poza | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model/sieć — a plan generatora to liczy; odpowiedź z planu/bazy |
| 50 | dzien dobry | poza | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | small talk → model → „Nie mam tego w Twoich danych.” za ~$0,0008 |

## 10 najważniejszych luk (waga „ile osób zapyta” 1–5 × kara: pusta 2, za droga 2, zła 3)

1. **moje rekordy** (4×2=8) — PUSTA: konto bez pb_* → „uzupełnisz w Profilu” — prawda, ale rekordy można by policzyć z logów (M2e wariant b)
2. **jaka mam forme** (4×2=8) — ZA DROGA: idzie do modelu bez narzędzia → „Nie mam tego w Twoich danych.” za ~$0,0008; M3e moja_forma
3. **kto jest moim trenerem** (4×2=8) — ZA DROGA: model bez narzędzia → „Nie mam tego…”; proste narzędzie moj_trener
4. **polmaraton w krakowie** (4×2=8) — PUSTA: lista 90 dni bez kwietniowego biegu; od M3-1 (2) zdanie mówi, jaki to zakres („od 1.11 do 30.01 w Krakowie na półmaratonie”)
5. **jaka pogoda jutro w poznaniu** (4×2=8) — ZA DROGA: sieć ~$0,02, a pogodę aplikacja MA (weather w sessionStorage) — narzędzie pogoda za 0
6. **co jesc przed polmaratonem** (4×2=8) — ZA DROGA: M3-1 (2): „co jeść” omija listę → sieć ~$0,02 za poradę ogólną; brak własnej treści
7. **ile powinienem biegac tygodniowo** (4×2=8) — ZA DROGA: model/sieć — a plan generatora to liczy; odpowiedź z planu/bazy
8. **czy dzis moge biegac po kontuzji** (3×2=6) — ZA DROGA: model bez narzędzia (kontuzje czyta tylko EF trenera) → pusto za ~$0,0008; zaległość „generator nie widzi kontuzji”
9. **kto biega z mojego miasta** (3×2=6) — ZA DROGA: model bez narzędzia → pusto; brak narzędzia „znajomi/okolica”
10. **moi znajomi co biegali** (3×2=6) — ZA DROGA: model; M3e znajomi_tydzien

Podsumowanie: dobra 29, PUSTA 5, ZA DROGA 16 z 50; koszt sumy 50 pytań (symulacja): $0.3732.
