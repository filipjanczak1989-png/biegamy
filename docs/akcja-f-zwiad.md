# Projekt F — zwiad dnia 1 i migracja akcji (2.11.2026)

> Spec: `F-dla-Fabianka-spec-v3.md` (+ `-v2-jeden-cel.md`, reszta obowiązuje). Plan dni: v3 pkt 8.
> Liczby z produkcji 2.11.2026, zbiorczo, bez danych osób. Migracje **NIE są wykonane na prod** — czekają na OK Filipa.

## 1. Ile to potrwa — bazowa suma km

| okno | km (wszystkie typy, bez `__badge__`) | wpisy | osoby | z zegarka |
|---|---|---|---|---|
| 30 dni | **3 670** | 502 | 33 | 2 778 |
| 90 dni | **14 150** | 1 939 | 49 | 9 903 |

- Tempo ~122 km/dobę ≈ **856 km/tydzień** → 12 500 km w **~102 dni** (połowa lutego 2027) przy dzisiejszej aktywności, bez
  napływu nowych ludzi. Zgodne z szacunkiem v2 („przy 30 aktywnych ok. 3 miesiące").
- Filip przy tym tempie: **~86 zł/tydzień** (856 km × 10 gr), łącznie 1 250 zł.
- Wszystkie typy 1:1 (v2): z 14 150 km w 90 dniach „Zastępczy" to 1 709, spacer 481, rower 428. Rower liczy się jak bieg — tak
  stanowi v2, odnotowuję tylko skalę.
- Limit **100 km/doba/osoba** (przeniesiony z licznika #100kmDlaKasi, patrz pkt 8): w 90 dniach ucina **0 km**, najdłuższa
  doba jednej osoby to 85,4 km. Chroni pulę przed literówką/złośliwością, prawdziwych danych nie dotyka.

## 2. Odznaki — katalog vs silnik

- Dwie listy `BADGES` o różnych rolach: katalog widoczny (`odznaki.html:135`) i lista silnika do pop-upu
  (`zawodnik.html:13938`); nazwy dla EF w `_shared/odznaki-nazwy.mjs`. `docs/odznaki-katalog-vs-silnik-spec.md`: katalog
  obiecuje, silnik wykonuje; `awardBadge` nie patrzy w katalog.
- **Tabeli definicji odznak nie ma.** Zdobyte: `public.achievements (athlete_id, badge_id, earned_at = now())`,
  UNIQUE(athlete_id, badge_id); authenticated: INSERT + SELECT własnych, insert **wprost z przeglądarki**.
- Silnik wyłącznie po stronie klienta: `checkBadges()` (`zawodnik.html:14383`) czyta całą historię, `_checkBadgeRules`, `awardBadge`,
  `_wyslijOdznaki` (upsert, ignoreDuplicates). Po stronie serwera nic nie przyznaje.
- ⚠️ **Błąd żywy dziś:** odznaki #100kmDlaKasi (`100km_wrzesien_2026`, `razem_wrzesien_2026`) **nadal się przyznają** — pętla
  `WYZWANIA` (`zawodnik.html:14476`) sprawdza tylko datę WPISU w oknie 15.08–20.09, nie dzień przyznania. Wpis wsteczny z 10.09
  dodany dziś = odznaka dziś, po zamknięciu akcji. Sprawdzone w kodzie.
- **Gdzie reguła okna (dzień 5):** (a) bramka w `awardBadge`/`_wyslijOdznaki` — odmowa, gdy dziś (Warszawa) poza oknem odznaki;
  (b) twardo: trigger BEFORE INSERT na `achievements` sprawdzający okno z tabeli akcji — jedyne, co zatrzyma insert z pominięciem
  frontu. Rekomendacja: oba (a = bez fałszywego pop-upu, b = prawda w bazie). Okno #100kmDlaKasi wtedy z tej samej reguły.
- Testy do pilnowania: blizna-40 (każda widoczna pozycja katalogu ma regułę), blizna-43 (stałe `SPOL_OKNO_*` i nagrobki muszą
  zostać; zakazane nazwy `community_km`, `hero-licznik`, `spol-pasek`…), `odznaki.test.js:240-248` (granice doby).

## 3. Gdzie akcja w aplikacji

- **Dziś:** kolejność `#today-hero` → `#today-card` → nagrobek #100kmDlaKasi (`zawodnik.html:1067`) → `#week-strip`. Karta
  akcji między `#today-card` a `#week-strip`, pod nazwą `#akcja-*`. Komentarz-nagrobek zostaje (blizna-43).
- **index.html:** stary licznik stał po `.hero-cta-wrap` (nagrobek `:649`); dziś index **nie woła żadnego RPC**. Pasek akcji w tym
  samym miejscu.
- **wyzwania.html:** hero → `#duels-section` → `#challenges-content`. Sekcja akcji jako nowy blok między hero a pojedynkami;
  blizna-60 zabrania własnych list wyzwań tygodnia/miesiąca (tylko `window.WYZWANIA`).
- **js/akcja-cytaty.mjs:** `ustawStan({ruszyla, zamknieta, zamknietaOd})` nikt jeszcze nie woła → `czyAkcjaRuszyla()` = false.
  Importują: `zawodnik.html`, `sw.js` (precache), `okienko/router.mjs`. Miejsce na kartę po starcie: `odpowiedzZagadki`
  (`akcja-cytaty.mjs:67`). `FILMY_PROMO` żyje w `zawodnik.html` (baner, blizna-88), nie w module.

## 4. Push i cron

- `send-push`: tryb `notification_id` albo `{athlete_id, title, body, url, type, tag}`; autoryzacja JWT albo `x-push-secret`.
- Rozgłoszenie do wszystkich: wzorzec `morning-brief-cron` (sekret w nagłówku, `athletes` z flagą powiadomień, pętla po send-push).
- `cron.job` na prod: `miesiac-karta` (1. dnia 04:00), `morning-brief-hourly` (co godzinę — **nie ma go w migracjach**, ustawiony
  ręcznie), `okienko-log-30d`, `okienko-siec-cache-24h`. GitHub Actions nie mają harmonogramów.
- **Brak ścieżki „push tylko do konta testowego"** — próba (v3 pkt 4) jej wymaga; do zrobienia w dniu 6 jako parametr EF.
- Niedzielny push i zamknięcie (`koniec` przez nocny cron) — dzień 6, ten sam mechanizm `net.http_post` co `miesiac-karta`.

## 5. Karta do udostępnienia

- `supabase/functions/share-card/index.ts`: wspólny `wyrenderuj()` (satori → PNG → Storage), rodzaje jako gałęzie ustawiające
  `plik / bohater / podpis / staty`; nieznany rodzaj = 422. Spec rodzajów: `docs/karty-rodzaje-spec.md`.
- ⚠️ **Zamrożenie:** upload `upsert:false` + `cacheControl` rok, a przed renderem `list({search: plik})` zwraca gotowy plik — nazwa
  pliku = klucz zamrożenia. Karta `akcja` z rosnącą sumą **musi mieć w nazwie km albo dzień**, inaczej pokaże starą liczbę na zawsze.

## 6. Migracja `20261102_akcje.sql` (+ `_WYCOFANIE_`)

| obiekt | co | dostęp |
|---|---|---|
| `akcje` | slug, nazwa, imie_zbiorki, url_zbiorki, start, koniec, cel_km, stawka_gr_filip, cap_km_doba, okno_startu_od/do, wystartowala_at, wizerunek_zgoda/url (CHECK: url tylko za zgodą), wyprawa_cel_km/dotarla_at/athlete_ids, testowa, konta_testowe | brak — tylko RPC |
| `akcja_startujacy` | (akcja_id, athlete_id); 2 wiersze: konto trenera Filipa dla obu akcji | brak — tylko RPC |
| `akcja_sponsorzy` | (akcja_id, athlete_id, stawka_gr 1–10 000) | SELECT własnego wiersza; zapis RPC-iem w dniu 5 |
| `akcja_licznik(slug)` | przed startem: `{wystartowala:false, start, cel_km, suma_km:null, pct:null}` — zero nazwy, imienia, linku; po starcie: suma, pct (przycięty), zamknięta, filip_gr/max, sponsorzy (suma + liczba), wyprawa, wizerunek tylko za zgodą | **anon** + authenticated |
| `akcja_moj_wklad(slug)` | km (null przed startem) + moja stawka, po `auth.uid()` | authenticated |
| `akcja_tydzien(slug, pon)` | km tygodnia, kwota teleskopowa (suma tygodni = floor(min(suma, cel) × stawka) ≤ 125 000 gr), `przycieta` | startujący |
| `akcja_start(slug, t)` | w oknie, raz; czas klienta przyjęty tylko w oknie i ≤ teraz + 2 min; drugi raz → ten sam stan | startujący |
| `akcja_proba_reset()` | zeruje start `proba` | startujący |
| `akcja_km_okna` | wewnętrzna suma: doba warszawska, start..min(koniec, dziś), wszystkie typy, bez `__badge__`, cap/doba, próba tylko konta testowe | nikt |

Wiersze: `dla-fabianka` (start 8.11, 12 500 km, 10 gr, okno guzika 8.11 06:00–23:59:59 Warszawa) i `proba` (testowa, start =
dzień naciśnięcia). **Puste do czasu, aż poda Filip:** `url_zbiorki`, `imie_zbiorki`, `nazwa` (zawiera formę imienia),
`konta_testowe` próby, uczestnicy i cel wyprawy.

**Testy:** `tools/akcje-test-transakcji.sh` — migracja + 42 asercje w **jednej transakcji, zawsze wycofanej** (blok kończy się
wyjątkiem także na zielono). Wynik 2.11: **42/42 zielone**, po teście w bazie 0 funkcji, 0 tabel, 0 wpisów testowych.
Pokrywa: anon i zwykły zawodnik → 42501 na wszystkim poza licznikiem i własnym wkładem; licznik anona przed startem bez
„fabian" i bez kluczy osobowych; dziś (2.11) start dla-fabianka poza oknem; doba warszawska (23:30 / 00:30), cap 100 km
na sumie doby, `__badge__` i przyszłość poza sumą, cudze konto poza próbą; progi 124,99 → 99,99 % otwarta / 125 → 100 %
zamknięta / 127,31 → filip_gr przycięty; tygodnie 1 200 + 50 = 1 250 gr z `przycieta`; guzik: czas z przyszłości → serwer,
offline w oknie → klient, spoza okna → serwer, przed oknem → odmowa, drugi raz bez zmiany; próba start/reset bez ruszania
dla-fabianka; wizerunek tylko za zgodą. Strażnik tekstu migracji: **blizna-94** (mutacje: LEFT JOIN, anon na wkładzie,
nazwa przed startem → czerwono).

⚠️ **Test złapał błąd przed prod:** `least(NULL, 100)` w Postgresie = **100** (least pomija NULL). Pierwsza wersja sumy z
LEFT JOIN dawała akcji bez jednego wpisu 100 km. Poprawione na JOIN; blizna-94 pilnuje.

## 7. Przy okazji: pomiar GPS (osobny commit)

`training_logs.icu_stream_types text[]` + `icu_trainer boolean` z listy aktywności, którą sync i webhook już pobierają
(zero dodatkowych zapytań, zero tras, bez UI); helpery we wspólnym `_shared/typ-aktywnosci.mjs`, wzbogacony wpis ręczny też
niesie pomiar; **blizna-95**. Zapis w `training_logs`, nie w `intervals_activities`: tamta tabela ma tylko otwarte karty
(786 wierszy z ~2,6 tys. aktywności z zegarka), więc pomiar z niej byłby skrzywiony. Migracja przetestowana w transakcji
wycofanej. ⚠️ **Kolejność: migracja na prod PRZED deployem obu EF**, inaczej insert z nieznaną kolumną wywraca import.

## 8. Do decyzji Filipa

| # | co | stan |
|---|---|---|
| 1 | **link do oficjalnej zbiórki + dokładna forma imienia** (i `nazwa`, bo ją zawiera) | puste w wierszu — dopiszę jednym UPDATE |
| 2 | **OK na obie migracje na prod** (`20261102_akcje`, `20261102_icu_stream_types`) i trailer bramki do commitów | gotowe, przetestowane |
| 3 | ⚠️ **prawo wykonania `akcja_licznik` dla roli anonimowej** — spec v2 pkt 5 to przewiduje, ale `tools/bramka-commit.js` traktuje nadanie uprawnień roli anonimowej jako blokadę **twardą** (trailer jej nie zdejmuje, CI czerwieni). Opcje: (a) świadomy wyjątek w bramce dla tej jednej funkcji; (b) bez uprawnień dla roli anonimowej: mała EF `akcja-licznik` (verify_jwt off, service role, cache 60 s w pamięci) — landing woła `fetch`, bez SDK, a cache chroni bazę przy naporze. **Rekomendacja: (b).** | do decyzji |
| 4 | konto testowe próby (`konta_testowe`) — które konto liczy się w `proba` | puste; bez niego próba liczy 0 km |
| 5 | limit 100 km/doba/osoba w sumie akcji (precedens #100kmDlaKasi, dziś ucina 0 km) | wpisany, zmiana = UPDATE `cap_km_doba` |
| 6 | wyprawa: dystans, dni, czyje konta (Filip, Kasia) | kolumny gotowe, puste (dzień 5) |
