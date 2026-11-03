# Okienko — lista na później (zaległości z raportów i przeglądów)

Każdy punkt: co, dowód, propozycja, termin. Zamknięty punkt → przenieść do dokumentu etapu z commitem i blizną.

## Otwarte

1. **dopelnijOkres: tydzień zaczynający się 1. dnia miesiąca** (zgłoszone 3.11 jako „w lutym 2027 → tydzień zamiast miesiąca”).
   Sprawdzone 3.11: „w lutym 2027” (od 1.02.2027, poniedziałek) daje POPRAWNIE cały luty. Błąd jest odwrotny: „przyszły tydzień”
   z od = poniedziałek 1.02.2027 też daje cały luty (`{od: 2027-02-01, do: 2027-02-28}`), bo reguła „1. dzień miesiąca = miesiąc” wygrywa
   z zakresem tygodnia. Propozycja: rozstrzygać po TEKŚCIE pytania (słowo „tydzień/tygodniu” → +6; nazwa miesiąca → cały miesiąc), nie po
   dacie. Plik: `supabase/functions/okienko-v2/intencje.mjs` (nie zamrożony). Blizna: oba przypadki dla 1.02.2027 i 1.03.2027.
2. **Podwójne wysłanie pytania** (raport lokalny 3.11): „Jak zacząć biegać” poszło dwa razy, drugie wysłanie 1,75 s po pierwszym, gdy
   pierwsze jeszcze trwało → dwa zapytania do sieci, drugie przed zapisem pamięci podręcznej. `js/okienko.js` `wyslij()` nie ma blokady
   na czas oczekiwania. Propozycja: flaga „w toku” + zablokowany przycisk do odpowiedzi. ⚠️ `js/okienko.js` zamrożony od piątku 6.11 18:00 →
   przed tym terminem albo po 8.11.
3. **„Ile osób korzysta z BiegaMy”** zadane 3 razy z rzędu (raport lokalny 3.11) → za każdym razem podpowiedź „Pytasz o BiegaMy? Napisz…”
   zamiast odpowiedzi. Propozycja: punkt w `_shared/o-nas.mjs` z liczbą — ⚠️ decyzja Filipa: podawać liczbę (stałą zatwierdzoną albo
   liczoną: zawodnicy z treningiem w 30 dni) czy nie.
4. **„pokaż profil Kasi”** → „Nie mam tego w Twoich danych.” (samosprawdzenie: odpowiedź nie nazywa osoby). Kasia to współtrenerka z pliku
   „o nas”. Propozycja: wzorzec w `o-nas.mjs` („profil Kasi/Filipa”) → tekst o nas + przejście do profilu, jeśli publiczny.
5. **„jak ma nazwisko Kasia”** → odmowa jak przy cudzych danych. Poprawne technicznie, ale to współtrenerka. ⚠️ decyzja Filipa: podać nazwisko
   Kasi w „o nas” czy zostawić odmowę (wtedy łagodniejszy tekst: „Kasia przedstawia się w aplikacji imieniem — napisz do niej przez czat”).
6. **„Ułóż mi plan treningowy” (literówka „Oloz”)** → pokazuje istniejący plan zamiast generatora, 3,4 s. Znana luka ławki (`uloz plan`,
   E2). Propozycja: intencja `generator` → karta „Ułóż plan” (dla zawodników bez trenera) albo zdanie „Plan układa Twój trener”.
7. **Anonimizacja: fałszywe [OSOBA]** — „Oloz mi plan” → „[OSOBA] mi plan”: zgadywanie odmiany imion („Ola”) złapało literówkę na początku
   zdania. Wycieku nie ma (błąd w bezpieczną stronę), ale raport traci sens pytania. Propozycja: bez zgadywania odmiany dla PIERWSZEGO
   słowa pytania (imiona na początku pytań przychodzą w mianowniku i łapie je słownik wprost). Plik: `_shared/anonimizuj.mjs` + blizna-125.
8. **Produkt: skrót „kal”** — „ile kal ma banan” działa tylko dzięki klasyfikatorowi (slot produkt); wzorzec awaryjny w `produkt.mjs`
   zna `kcal|kalori…`, nie zna „kal”. Propozycja: dopisać `kal` do SKŁADNIKA + wiersz ławki.
9. **Czas > 3 s w sieci** („Jak zacząć biegać” 4,2 s i 3,9 s; plan 3,4 s). Cel p90 < 2 s (W3) — sieć raportowana osobno, ale 3,4 s
   dla planu (bez sieci) to klasyfikator + narzędzie; pomiar po wdrożeniu prompt cachingu (stały prefiks, zwiad narzędzi pkt 5).

## Zamknięte (dla porządku)

- „Kim jest Filip” → osoba-bez-nazwiska (14:21 UTC 3.11) — zamknięte plikiem „o nas” (wdrożone 14:49 UTC, potwierdzone 14:59).
- „Ile kal ma banan” → porada (14:22 UTC) — zamknięte narzędziem produkt (potwierdzone 14:59).
