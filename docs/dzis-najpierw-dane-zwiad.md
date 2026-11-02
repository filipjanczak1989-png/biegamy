# Zwiad: „Dziś — najpierw dane” (2.11.2026)

> **Status:** zwiad, ZERO kodu. Osobny projekt, startuje PO akcji F.
> Liczby z produkcji z 2.11.2026 (tylko SELECT-y, zbiorczo, bez danych osób), oznaczone „(zmierzone)".
> Rzeczy przyjęte z cudzych źródeł albo wywnioskowane są oznaczone wprost.

## 0. Najpierw to, co blokuje: decyzja z 24.08

**24.08.2026 Filip odrzucił mapki/trasy** (kod `e57a6c3` napisany, otestowany, cofnięty przez `e11aa1a`,
przywracalny jednym `git revert e11aa1a`). Warunek powrotu: **udział aktywności ze śladem > 50%**
(wtedy podane 37%, niezmierzone — nie było czym).

Ten zwiad nie zmienia decyzji. Mówi tylko, że:
- warunek **nadal nie jest policzalny wprost** — nie zapisujemy, czy aktywność miała GPS;
- pośredni sygnał (typ aktywności z zegarka, zapisywany od 6.10) wskazuje **wyraźnie powyżej 50%** — patrz §2;
- najtańsza droga do twardej liczby to **jedno pole z API, które już dostajemy i wyrzucamy**: `Activity.stream_types`
  (zawiera `latlng`, gdy był GPS) i `Activity.trainer` (bieżnia/trenażer). Zero dodatkowych zapytań — patrz §1.4.

Rekomendacja kolejności: **K0 = zapisywać `stream_types`/`trainer` w syncu i webhooku → po 2–3 tygodniach liczba →
decyzja Filipa o powrocie trasy**. Dopiero potem układ Dziś z trasą. Układ Dziś „najpierw dane" BEZ trasy (§5) da się
robić niezależnie.

## 1. intervals.icu — co pobieramy, co API daje dodatkowo

Źródło: OpenAPI z `GET https://intervals.icu/api/v1/docs` (pobrane 2.11, 254 kB; `Activity` ma dziś **184 pola**,
w sierpniu 183).

### 1.1 Co pobieramy dziś

| funkcja Edge | wywołanie | co z tego zostaje |
|---|---|---|
| `intervals-sync` (ręczny/onboarding, 90 dni lub 8 lat) | `GET /athlete/{id}/activities` | `training_logs`: dystans, czas, tempo, śr. HR, przewyższenie, kalorie, nazwa, data, `external_type` (od 6.10), `icu_load`, kadencja, GAP, `icu_intensity` |
| `intervals-sync` | `GET /athlete/{id}/wellness` (7 dni, tylko `intervals_can_wellness`) | `wellness` (RHR/HRV/sen/waga) |
| `intervals-webhook` (`ACTIVITY_UPLOADED`) | aktywność z payloadu, awaryjnie `GET /activity/{id}` | to samo co sync (świadomy duplikat mapowania) |
| `intervals-activity-detail` (na żądanie, karta treningu) | `GET /activity/{id}/streams?types=time,distance,heartrate,velocity_smooth,altitude,cadence,temp,respiration` + `GET /activity/{id}` | cache `intervals_activities.raw_data` (`PAYLOAD_V=3`): seria próbkowana, **splity co 1 km liczone u nas**, strefy HR (`icu_hr_zone_times`), statystyki (GAP, kadencja, krok, przewyższenia ±, min/max wysokość, temperatura, max HR, load) |
| `intervals-hr-aggregate` | `GET /athlete/{id}/activities` | agregaty HR |
| `intervals-push` | `/athlete/0/events` (+ bulk) | wysyłka planu na zegarek (`CALENDAR:WRITE`) |
| `intervals-oauth` | wymiana kodu + sondy wellness/activities | token, flagi `intervals_can_write`, `intervals_can_wellness` |

Cache szczegółów (zmierzone): **786 wierszy**, wszystkie `v=3`, **1,75 MB** łącznie; 781 ze splitami, 694 ze strefami HR,
754 z wysokością. **0 wierszy ze śladem** — revert z sierpnia nie zostawił w bazie żadnej trasy.

### 1.2 Co API daje, a czego nie bierzemy (dla „Dziś")

| rzecz | skąd | uwagi |
|---|---|---|
| **ślad GPS** | `GET /activity/{id}/map` → `MapData { bounds, latlngs, route, weather }` | jedyne udokumentowane źródło; **nie ma go** w obiekcie aktywności (brak `polyline`, `map`, `start_latlng`). Strumień `latlng` w `/streams` istnieje u Garmina (zwiad 07.2026), ale spec nie podaje jego nazwy — nie zgadujemy, bierzemy `/map` |
| czy jest GPS | `Activity.stream_types[]`, `Activity.trainer` | **już przychodzi** w liście aktywności, wyrzucamy przy mapowaniu |
| splity/okrążenia | `GET /activity/{id}/intervals` (`icu_intervals`, `icu_groups`), `GET /activity/{id}/interval-stats` | gotowa detekcja WORK/RECOVERY z HR/tempem; dziś robimy własne splity co 1 km ze strumieni |
| najlepsze odcinki | `GET /activity/{id}/best-efforts`, `GET /athlete/{id}/activity-pace-curves` | „najszybszy km / 5 km w tym biegu" — dobre na kartę „ostatni bieg" |
| tętno w czasie | `/streams` `heartrate` — **już pobieramy** | brak bez pasa/HR z nadgarstka (`series.hr:null`) |
| przewyższenia | skalary + `altitude` w `/streams` — **już pobieramy** | |
| strefy | `icu_hr_zone_times` — **już pobieramy**; strefy tempa w obiekcie aktywności (do potwierdzenia nazwy pola w spec) | |
| pliki | `/activity/{id}/gpx-file`, `/fit-file` | nie potrzebne; GPX = surowy ślad, odpada z powodów prywatności |
| zawody | `Activity.race`, `sub_type: RACE`, `Event.category RACE_A/B/C` | poza zakresem, ale dotyka zaległości „nie ma czym oznaczyć zawodów" |

### 1.3 Zgody (scope) i flagi `intervals_can_*`

- Dziś prosimy o `ACTIVITY:READ,CALENDAR:WRITE,WELLNESS:READ` (`sb.js`, adres autoryzacji).
- Oficjalnej listy scope'ów intervals nie publikuje. Według dokumentacji zewnętrznej biblioteki
  ([ueberauth_intervals_icu](https://readme.hex.pm/ueberauth_intervals_icu/0.1.0)) `ACTIVITY` obejmuje aktywności,
  interwały i strumienie; brak scope'u daje 403. **Wniosek (niepotwierdzony): `/map`, `/intervals`, `/best-efforts`
  mieszczą się w `ACTIVITY:READ` → nowa zgoda i nowa flaga `intervals_can_*` NIE są potrzebne.**
- ⚠️ Do potwierdzenia jedną sondą na koncie-personie Filipa (`GET /activity/{id}/map` → 200 czy 403) przed
  jakimkolwiek kodem. Commit `e57a6c3` żył kilka godzin — nie wiemy, czy `/map` zadziałało na produkcyjnym tokenie.
- Gdyby `/map` wymagało innego scope'u: wzorzec jest gotowy (wellness, E3): nowa flaga ustawiana **wyłącznie z sondy**
  (nie z `tok.scope`, które milczy o części zakresów) + CTA ponownej autoryzacji. Uwaga z forum: najnowsze nadane
  zakresy obowiązują dla wszystkich tokenów osoby.
- `MapData.weather` jest prawdopodobnie za progiem Supporter (zwiad 24.08: „za progiem jest tylko pogoda") — nie
  polegać na nim.

Stan zgód (zmierzone): **37 osób z intervals**, **38 tokenów OAuth**, **0 kluczy wklejanych**, **0 martwych tokenów**,
`intervals_can_write` 33, `intervals_can_wellness` 29. (38 tokenów vs 37 profili z `intervals_athlete_id` — jeden
wiersz `intervals_credentials` bez połączonego profilu; drobiazg do sprawdzenia przy okazji, nie bloker.)

### 1.4 Limity zapytań

Spec limitów nie podaje. Z wątków dewelopera na forum
([API access](https://forum.intervals.icu/t/api-access-to-intervals-icu/609/716),
[str. 36](https://forum.intervals.icu/t/api-access-to-intervals-icu/609?page=36),
[OAuth support](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759/35)):
- ~10 zapytań/s na IP (przed serwerami; „hojny, łapie błędy klientów");
- aplikacje OAuth: limit kroczący 15 min + dzienny (reset o północy UTC); liczby w postach się różnią
  (min. 2500/15 min vs domyślnie 100/użytkownika/dzień, min. 5000) — **przyjmować najostrzejszą wersję**;
- przekroczenie = 429 z `Retry-After`.

Nasza skala: 22 osoby z importem w ostatnich 30 dniach, ~10 biegów/osobę/mies. Pobranie śladu **raz na nowy bieg**
(webhook) to rząd **~250 wywołań/mies.**, na żądanie — jedno na otwarcie karty. Daleko od każdej z wersji limitu.
Wszystkie wywołania idą z IP Supabase Edge (wspólny adres) — przy 10/s bez znaczenia.

## 2. Ilu ma intervals i ile biegów ma GPS (zmierzone, zbiorczo)

| | liczba |
|---|---|
| profile w `athletes` (z trenerami i personami) | 89 |
| aktywni (≥1 wpis w dzienniczku w 30 dni) | **33** (w 14 dni: 26) |
| aktywni z podłączonym intervals | **24 z 33** |
| z importem z intervals w ostatnich 30 dniach | 22 |
| profile publiczne | 42 |

GPS — tylko pośrednio. Typ z zegarka (`external_type`) zapisujemy od **6.10.2026**:

| typ | aktywności | osób | przewyższenie > 0 |
|---|---|---|---|
| Run | 208 | 20 | 200 |
| VirtualRun (bieżnia/Zwift) | 20 | 6 | 0 |
| Walk | 98 | 12 | 94 |
| Hike | 3 | 2 | 3 |
| reszta (siłownia, rower, pływanie…) | 49 | — | — |

- Biegi „na zewnątrz": **208 z 228 = 91%**; wszystkie aktywności typu terenowego (Run/Walk/Hike/Ride/Other):
  **314 z 378 = 83%**. 14 z 20 biegających nie ma żadnej bieżni, 6 mieszanych, 0 wyłącznie bieżniowych.
- ⚠️ **To GÓRNA granica, nie pomiar GPS.** „Run" bywa bieżnią bez flagi, przewyższenie daje też barometr, a zegarek
  bez GPS (telefon w kieszeni) zapisze „Run" z dystansem z akcelerometru. Różnica z 37% z sierpnia wynika
  prawdopodobnie z innego mianownika (wszystkie wpisy, także ręczne i sprzed zegarka) — nie da się tego dziś rozstrzygnąć.
- Twarda liczba wymaga K0 (§0): `stream_types` zawiera `latlng` ⇔ ślad istnieje. Dla historii (8 lat) wystarczy
  jednorazowy przebieg syncu z zapisem tylko tego pola — te same wywołania listy, zero `/map`.

## 3. Prywatność

### 3.1 Krańce śladu pod domem

Ślad zaczyna się i kończy zwykle pod drzwiami. Propozycja: **przycinać na serwerze, przed zapisem i przed wysłaniem**
— klient nigdy nie dostaje surowych krańców.

⚠️ **Pułapka okręgu.** Prosty wariant „usuń punkty w promieniu R od startu" przy wielu biegach rysuje widoczne
krańce na okręgu o środku dokładnie w domu — środek okręgu z kilku tras to adres. Dlatego:
1. **cięcie wzdłuż trasy, nie promieniem**: usuń pierwsze i ostatnie **L metrów dystansu**, gdzie L ∈ [300, 500] m
   wybierane **deterministycznie z id aktywności** (stałe dla danego biegu — odświeżenie nie odsłania innego kawałka,
   różne między biegami — krańce nie układają się w okrąg);
2. **dodatkowo** usuń wszystkie punkty bliżej niż **200 m od punktu startu i od punktu końca** (pętle wracające pod dom
   w środku biegu, start i meta w różnych miejscach);
3. ślad krótszy niż ~2 km po przycięciu → nie pokazujemy wcale (z 3 km biegu zostałyby strzępy, które i tak wskazują okolicę);
4. „Strefy prywatności" Strava/Garmin nie przechodzą do intervals w sposób, na którym można polegać —
   **nie zakładać, że zegarek już przyciął** (do potwierdzenia na jednym realnym śladzie).

### 3.2 Kto widzi

- **Tylko właściciel i jego aktualny trener** — `canSeeTrasa = isOwner || isCoach`, bez furtki `is_public` i **bez
  przełącznika „pokaż publicznie"** (HR ma `hr_public`, bo jest krępujące; adres jest niebezpieczny — przełącznik,
  którego nikt świadomie nie ustawi, to tylko ryzyko). Decyzja z 24.08 — zostaje.
- **Nigdy:** publiczny profil (42 publiczne), Społeczność, porównania, okienko (EF `okienko` nie może czytać pola
  śladu — strażnik testem jak blizny okienka), raporty AI i ich wsad, karty udostępniania (zamrożone pliki w Storage —
  raz wygenerowany obraz z trasą żyje wiecznie pod linkiem), powiadomienia push, eksport do `client_errors`.
- Trener: tylko póki jest trenerem. Ślad pobierany na żądanie przez EF ze sprawdzeniem relacji w chwili zapytania —
  odpięcie trenera odcina dostęp od razu (inaczej niż kopia, która by została).
- RLS dziś (migawka `supabase/schema/rls/intervals_activities.txt`): `authenticated` ma SELECT, polityka tylko
  „własne wiersze"; trener dostaje dane przez EF (service role). ⚠️ Jeśli ślad trafi do `raw_data`, **każda przyszła
  polityka „trener czyta intervals_activities" otworzy też trasę** — dlatego osobna kolumna/tabela i test, który to pilnuje.

### 3.3 Przechowywać czy pobierać na żądanie

| | trzymamy u nas | pobieramy na żądanie |
|---|---|---|
| koszt bazy | ~730 B/bieg (200 pkt, polyline precyzji 5) → ~1,1 MB na całą historię; baza ~39 MB z 500 MB (stan z 08.2026) | 0 |
| szybkość „Dziś" | natychmiast, działa offline (`DzisOffline`) | +1 runda do intervals przy każdym otwarciu, offline brak |
| prywatność | kopia adresu u nas (wyciek bazy = trasy) | nic u nas; ale EF i tak cachuje szczegóły w `raw_data` |
| usunięcie konta | trzeba dopisać do `delete_my_account` | nic |
| zmiana zdania osoby (odłączenie intervals) | trzeba kasować | znika samo |

Rekomendacja: **trzymać tylko wersję przyciętą i spróbkowaną** (200 pkt, ≤ 1 kB) dla **ostatnich N biegów** (np. 10)
w osobnej kolumnie, pobieraną z webhooka po `ACTIVITY_UPLOADED`. Starsze — na żądanie, bez zapisu. Surowe `latlngs`
nigdy nie trafiają do bazy ani do klienta. Kasowanie razem z odłączeniem intervals i z kontem.

## 4. Rysowanie: SVG bez map vs mapa z kaflami

| | SVG z polyline (bez podkładu) | mapa z kaflami (Leaflet/MapLibre + OSM/inne) |
|---|---|---|
| biblioteka | 0 kB (projekcja: długość × cos(szer.), inaczej +62% w poziomie) | ~40–140 kB JS + CSS |
| obcy origin | brak | serwer kafli przy **każdym** otwarciu; zasady OSM zabraniają intensywnego użycia `tile.openstreetmap.org` w aplikacjach → realnie płatny dostawca (MapTiler/Stadia/Mapbox) i klucz w przeglądarce |
| prywatność | nikt poza nami nie wie, gdzie biegałeś | **zapytania o kafle zdradzają dostawcy obszar i IP** — kafle wokół krańców to okolica domu, nawet jeśli ślad przycięliśmy |
| offline / SW | działa, przechodzi przez Service Workera | kafle poza cache albo puchnący cache |
| CSP | nie dotyczy | dziś **nie mamy żadnego CSP** (0 stron) — kafle nic nie zablokuje, ale przyszłe CSP musi je wpuścić w `img-src`/`connect-src` |
| czytelność | kształt, bez ulic: „to ta pętla w parku", nie „gdzie skręciłem" | pełna mapa |
| zgodność z decyzjami | to jest dokładnie kod z `e57a6c3` | sprzeczne z decyzją o self-hostingu zasobów (supabase-js, D4) |

Rekomendacja: **SVG**. Na „Dziś" wystarczy miniatura kształtu (np. 96×96 obok liczb), pełna wersja w karcie treningu.
Kafle wracają do rozmowy tylko, gdyby ktoś realnie zgłosił potrzebę nawigacji — i wtedy z własnym proxy kafli.

## 5. Szkic układu „Dziś — najpierw dane" (opis, bez kodu)

Dziś od góry (`zawodnik.html`): hero z kadrem dnia (`#today-hero`, 3 kadry SOLO) → karta planu (`#today-card`) →
pasek tygodnia (`#week-strip`, `#week-km-bar-wrap`) → reszta. Propozycja odwraca proporcję: najpierw to, po co się
otwiera aplikację rano.

1. **Plan dnia** (na górze, kompaktowo): typ + dystans/czas + jedno zdanie opisu, przycisk „Zrobione"/„Nie zrobiłem",
   baner typu jako mała miniatura. Dzień wolny = jedna linia, nie pusta karta. Gotowość dnia (wellness) jako
   jedna kropka/etykieta przy planie, nie osobny panel.
2. **Ostatni bieg** (nowa karta): data, dystans, tempo, śr. HR, przewyższenie; obok **miniatura kształtu śladu**
   (tylko właściciel; przycięta). Bez śladu (bieżnia, brak GPS, brak intervals, warunek 50% niespełniony) —
   ta sama karta bez miniatury, z najlepszym odcinkiem albo splitami zamiast niej. Dotknięcie → karta treningu.
   Dla 9 z 33 aktywnych bez intervals: ostatni wpis z dzienniczka, bez śladu, bez CTA „podłącz" częściej niż raz w tygodniu.
3. **Postęp tygodnia**: km zrobione / planowane, pasek dni pn–nd (Warszawa, `_tydzienWaw`), liczba jednostek.
   Jedna linia + pasek, nie wykres.
4. **Kadr AI niżej**: hero przestaje być pierwszym ekranem; zostaje jako pas/karta z cytatem i kadrem dnia pod danymi
   (zachowuje logikę pory roku/pogody, okładkę zawodów w dniu startu — wtedy może wrócić na górę jako wyjątek).
5. Reszta bez zmian (forma, wyzwania, społeczność).

Zasady:
- pierwszy ekran telefonu (≈ 640 px wysokości) mieści 1–3 bez przewijania;
- offline: wszystkie trzy karty z `DzisOffline` (ślad tylko jeśli przechowywany — argument za §3.3);
- trener w podglądzie zawodnika (`?from=trener`) widzi ten sam układ, ze śladem;
- test-blizna przed wdrożeniem: ślad nie pojawia się w żadnym widoku nie-właściciela/nie-trenera ani w wsadzie okienka/raportów.

## 6. Kroki, gdy projekt ruszy (po akcji F)

| krok | co | zależy od |
|---|---|---|
| K0 | sync + webhook zapisują `stream_types` (lub boolean `has_gps`) i `trainer`; jednorazowe uzupełnienie historii | — |
| K1 | po 2–3 tyg.: twardy udział biegów z GPS → Filip rozstrzyga powrót trasy (warunek 50%) | K0 |
| K2 | sonda `/map` na personie: scope, kształt `latlngs`, czy zegarek już przyciął krańce | — |
| K3 | układ „najpierw dane" bez śladu (plan, ostatni bieg, tydzień, kadr niżej) | — |
| K4 | ślad: przycięcie wzdłuż trasy + 200 m od krańców, 200 pkt, osobna kolumna, ostatnie N, strażnicy prywatności | K1 (decyzja), K2 |

## Źródła

- OpenAPI intervals.icu: `https://intervals.icu/api/v1/docs` (pobrane 2.11.2026)
- Limity: [forum, API access #716](https://forum.intervals.icu/t/api-access-to-intervals-icu/609/716),
  [forum, str. 36](https://forum.intervals.icu/t/api-access-to-intervals-icu/609?page=36),
  [forum, OAuth support #35](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759/35)
- Scope'y (źródło nieoficjalne): [ueberauth_intervals_icu](https://readme.hex.pm/ueberauth_intervals_icu/0.1.0)
- Wcześniejsze decyzje: `e57a6c3` (trasa SVG), `e11aa1a` (revert), zwiad API z 24.08.2026
