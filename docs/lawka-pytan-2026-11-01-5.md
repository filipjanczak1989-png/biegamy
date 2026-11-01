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
| 7 | moje rekordy | wlasne | router→moje_rekordy | 2 kart: „Twoje najlepsze czasy z wyników zawodów: 10 km 48:10 (2026), półmarato” | 0 | dobra | M3-1 (3): puste pb_* → najlepsze czasy z WYNIKÓW ZAWODÓW (F6), z etykietą; bez treningów |
| 8 | jaka mam forme | wlasne | router→moja_forma | 1 kart: „Forma: TSB -1 (neutralna), CTL 8, ATL 9.” | 0 | dobra | M3-2: moja_forma — TSB/CTL/ATL z formaSeria, zdanie ze słownika kafla Forma, 0 tokenów |
| 9 | ile spalilem kalorii w tym tygodniu | wlasne | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model, brak narzędzia; kcal są w nutrition — osobna decyzja (produkty poza katalogiem) |
| 10 | czy dzis moge biegac po kontuzji | wlasne | router→zdanie | zdanie: „Przy bólu lub kontuzji decyzję podejmij z trenerem albo fizj” | 0 | dobra | etap 5 (c): stałe zdanie „Przy bólu lub kontuzji decyzję podejmij z trenerem albo fizjoterapeutą.” + „Napisz do trenera” (gdy jest), 0 tokenów, bez porad |
| 11 | Robert Korzeniowski | osoby | osoba→sieć | 2 kart zdania: „(sieć)” | $0.0211 | dobra | tryb osoby: F6 + (publiczny) sieć |
| 12 | kim jest Marcin Lewandowski | osoby | osoba→sieć | 1 kart zdania: „(sieć)” | $0.0211 | dobra | wprost → sieć |
| 13 | wyniki Katarzyny Chojnackiej | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (2): 0 trafień → drugie wywołanie z rdzeniami („katarz chojnack”); na prod search_runners daje 4 |
| 14 | jak pobiegl Jan Kowalski w Poznaniu | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (1): osoba w zdaniu, q „Jan Kowalski”, kontekst „Poznaniu” → filtr wyników; do 1.11 nazwisko szło do Google |
| 15 | kasia nowak | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | odpowiedź informacyjna gdy brak (M3-0b) |
| 16 | czy Anna Kowalska jest w aplikacji | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (1): osoba w zdaniu → tryb osoby, nie model/sieć |
| 17 | kto biega z mojego miasta | osoby | router→osoby_z_miasta | 1 kart: „Z miasta Poznań biega w BiegaMy 1 osoba z publicznym profilem.” | 0 | dobra | M3-2: osoby_z_miasta — publiczni z miastem z profilu (RLS), ≤ 5 kart osoby; bez miasta → Profil |
| 18 | moi znajomi co biegali | osoby | router→znajomi_tydzien | 1 kart: „Od 26.10 trenowało 1 z 1 znajomego (profile publiczne): Robert Korzeni” | 0 | dobra | M3-2: znajomi_tydzien — friendships + public_training_logs, tylko profile publiczne, 0 tokenów |
| 19 | kto jest moim trenerem | osoby | router→moj_trener | zdanie: „Trenujesz bez trenera w BiegaMy.” | 0 | dobra | M3-1 (3): moj_trener (0 tokenów) — karta trenera z „Napisz” albo „Trenujesz bez trenera w BiegaMy.” |
| 20 | dodaj Jana Kowalskiego do znajomych | osoby | osoba |  zdania: „W BiegaMy nie ma nikogo o tym imieniu i nazwisku.” | 0 | dobra | M3-1 (1): osoba w zdaniu → karta osoby z „Dodaj do znajomych” (akcja po tapnięciu); odmiana → (2) |
| 21 | jakie biegi w listopadzie w poznaniu | imprezy | router→biegi_nadchodzace | 1 kart: „W listopadzie w Poznaniu maszyna wyników zna 1 bieg.” | 0 | dobra |  |
| 22 | gdzie pobiec dyche w grudniu | imprezy | router→biegi_nadchodzace | 1 kart: „W grudniu na 10 km maszyna wyników zna 1 bieg.” | 0 | dobra |  |
| 23 | ultrakotlina | imprezy | impreza→sieć | 1 kart „(sieć)” | $0.0211 | dobra | przez trafienie w kalendarzu |
| 24 | kiedy jest maraton warszawski 2027 | imprezy | impreza→sieć |  „(sieć)” | $0.0211 | dobra | M3-1 (2): „maraton <nazwa>” → impreza (events_search), nie lista |
| 25 | polmaraton w krakowie | imprezy | router→biegi_nadchodzace | 1 kart: „W najbliższym roku w Krakowie na półmaratonie maszyna wyników zna 1 bi” | 0 | dobra | etap 5 (a): miasto/dystans bez miesiąca → 365 dni — kwietniowy Półmaraton Krakowski w liście |
| 26 | jakie biegi w weekend | imprezy | router→biegi_nadchodzace | zdanie: „Maszyna wyników nie ma biegów od 1.11 do 1.11.” | 0 | dobra | M3-1 (2): weekend = najbliższe sb–nd |
| 27 | zapisy na bieg niepodleglosci | imprezy | impreza | 1 kart „Wpisowe i zapisy podaje strona imprezy:” | 0 | dobra | etap 5 (b): karta z kalendarza + „Strona imprezy ›” (url zapisów z maszyny), bez sieci — 0 zł zamiast ~$0,02 |
| 28 | trasa polmaratonu poznanskiego | imprezy | impreza→sieć | 1 kart „(sieć)” | $0.0211 | dobra | impreza (słowo z listy) + sieć ze źródłami |
| 29 | biegi za granica w styczniu | imprezy | router→zdanie | zdanie: „Maszyna wyników zna tylko biegi w Polsce.” | 0 | dobra | M3-2 (e): jedno zdanie z routera „Maszyna wyników zna tylko biegi w Polsce.”, 0 tokenów |
| 30 | ile kosztuje wpisowe na maraton w debnie | imprezy | impreza | 1 kart „Maszyna wyników nie zna strony tej imprezy — cenę i zapisy p” | 0 | dobra | etap 5 (b): tryb impreza — karta „52. Maraton Dębno” + „Maszyna wyników nie zna strony tej imprezy — cenę i zapisy podaje organizator.” (prod: brak url), bez sieci |
| 31 | czwarta godzina | tresci | katalog | 1 kart: utwor | 0 | dobra | utwór z radia |
| 32 | puść boso | tresci | katalog | 1 kart: utwor | 0 | dobra | „pusc” pominięte → utwór „Boso” |
| 33 | przepis na omlet | tresci | katalog | 1 kart: przepis | 0 | dobra |  |
| 34 | cwiczenia na core | tresci | katalog | 2 kart: cwiczenie,kat_ekran | 0 | dobra | M3-1 (2): „cwiczenia” pominięte jak „przepis” → program Core |
| 35 | oddech 4-7-8 | tresci | katalog | 1 kart: cwiczenie | 0 | dobra | M3-1 (2): „oddech” = słowo kategorii, cyfry liczą się jako słowa → technika 4-7-8 |
| 36 | jak dziala tsb | tresci | katalog | 2 kart: kat_pojecie,kat_ekran | 0 | dobra | M3-2 (b): katalog pojęć z METRIC_TOOLTIPS (sb.js) — karta „Co to jest” + Otwórz Forma; strefy/interwały bez opisu w aplikacji = bez hasła |
| 37 | gdzie zmienic haslo | tresci | katalog | 2 kart: kat_pojecie,kat_ekran | 0 | dobra | M3-2: fakt o aplikacji — zmiany hasła NIE MA (zwiad: zero updateUser/PASSWORD_RECOVERY), tylko „Zapomniałem hasła” na logowaniu; 0 tokenów |
| 38 | pokaz wyzwania | tresci | router→wyzwania_postep | 5 kart: „Nie masz teraz wyzwania w toku.” | 0 | dobra |  |
| 39 | co to jest odznaka wracam do gry | tresci | katalog | 1 kart: kat_odznaka | 0 | dobra | M3-2: karta odznaki z opisem z odznaki.html („Powrót po 7 dniach przerwy”) |
| 40 | radio | tresci | katalog | 1 kart: kat_ekran | 0 | dobra |  |
| 41 | kto wygral maraton w berlinie | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | dobra | sieć ze źródłami (~$0,02) |
| 42 | jaka pogoda jutro w poznaniu | poza | KLIENT (bez EF) | zdanie: „Jutro (Poznań): deszcz, do 11°C, opady 70%.” | 0 | dobra | M3-1 (3): po stronie klienta z kafla Dziś (sessionStorage), 0 tokenów, bez EF |
| 43 | ile kalorii ma banan | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | sieć; baza produktów w Jedzeniu ma to za 0 — osobna decyzja |
| 44 | jak przeliczyc tempo na predkosc | poza | router→zdanie | zdanie: „Napisz tempo (np. 5:30/km), prędkość w km/h albo czas i dyst” | 0 | dobra | M3-2 (d): kalkulator w routerze — bez liczb prosi o tempo/prędkość/czas+dystans; z liczbami przelicza (tylko liczby z pytania) |
| 45 | rekord swiata w maratonie | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | dobra | M3-1 (2): „świata” wyklucza moje_rekordy → sieć ze źródłami (~$0,02) |
| 46 | co jesc przed polmaratonem | poza | impreza→sieć |  „(sieć)” | $0.0211 | ZA DROGA | M3-1 (2): „co jeść” omija listę → sieć ~$0,02 za poradę ogólną; brak własnej treści |
| 47 | jak dobrac buty do biegania | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | sieć |
| 48 | czy biegac z katarem | poza | MODEL→SIEĆ (sym.) | zdania z sieci ze źródłami (jeśli znajdzie) | $0.0219 | ZA DROGA | sieć — porada zdrowotna bez zastrzeżenia |
| 49 | ile powinienem biegac tygodniowo | poza | MODEL (sym.) | poza danymi / „Nie mam tego w Twoich danych.” | $0.0008 | ZA DROGA | model/sieć — a plan generatora to liczy; odpowiedź z planu/bazy |
| 50 | dzien dobry | poza | router→zdanie | zdanie: „Cześć! Pytaj o plan, kilometry, starty, biegi w okolicy, utw” | 0 | dobra | M3-1 (3): powitanie → jedno zdanie z routera, 0 tokenów |

## 10 najważniejszych luk (waga „ile osób zapyta” 1–5 × kara: pusta 2, za droga 2, zła 3)

1. **co jesc przed polmaratonem** (4×2=8) — ZA DROGA: M3-1 (2): „co jeść” omija listę → sieć ~$0,02 za poradę ogólną; brak własnej treści
2. **ile powinienem biegac tygodniowo** (4×2=8) — ZA DROGA: model/sieć — a plan generatora to liczy; odpowiedź z planu/bazy
3. **jak dobrac buty do biegania** (3×2=6) — ZA DROGA: sieć
4. **czy biegac z katarem** (3×2=6) — ZA DROGA: sieć — porada zdrowotna bez zastrzeżenia
5. **ile spalilem kalorii w tym tygodniu** (2×2=4) — ZA DROGA: model, brak narzędzia; kcal są w nutrition — osobna decyzja (produkty poza katalogiem)
6. **ile kalorii ma banan** (2×2=4) — ZA DROGA: sieć; baza produktów w Jedzeniu ma to za 0 — osobna decyzja

Podsumowanie: dobra 44, ZA DROGA 6 z 50; koszt sumy 50 pytań (symulacja): $0.2378.
