# Projekt F — „Kilometry dla Fabianka" — start guzikiem

> Spec v3 (2.11.2026) przeniesiony do repo z `Downloads\F-dla-Fabianka-spec-v3.md` i zaktualizowany decyzjami Filipa z 2.11 —
> zmiany zebrane w **pkt 10**; tam, gdzie pkt 10 mówi inaczej niż reszta dokumentu, obowiązuje pkt 10.
> Stan wdrożenia i liczby: `docs/akcja-f-zwiad.md`.

Zastępuje v2 w punktach poniżej; **wszystko, czego tu nie zmieniono, obowiązuje z v2** (`F-dla-Fabianka-spec-v2-jeden-cel.md`: cel 12 500 km jednym celem, 10 gr/km Filipa = max 1 250 zł, **rozliczenie jednorazowe po zakończeniu akcji (pkt 10)**, sponsorzy kilometrów bez nazwisk, brak rankingu, odznaki kolekcjonerskie w oknie akcji, `akcja_licznik` jako jedyne źródło liczb, nazewnictwo `akcja_*`, aplikacja liczy — nie zbiera pieniędzy).

Na budowę: **2–7.11 (6 dni)**. 8.11 nic się nie wdraża — tylko naciśnięcie.

## 0. Co się zmieniło względem v2 (decyzje Filipa 1–2.11)

| co | v2 | v3 |
|---|---|---|
| start | 8.11 00:00 | **naciśnięcie guzika przez Fabianka**, 8.11, ok. 10–13 (godzina niepewna) |
| gdzie | — | pod domem Fabianka; Filip i Kasia dobiegają do niego, on naciska, od jego drzwi ruszają na Jasną Górę |
| urządzenie | — | **telefon Filipa**, zalogowany na konto trenera; Fabianek tylko naciska — bez konta, bez aplikacji |
| co liczy się do sumy | aktywności od 8.11 00:00 | **cały dzień 8.11** (Europe/Warsaw) — także poranny bieg przed naciśnięciem; licznik jest widoczny dopiero po starcie |
| kampania | — | 2–7.11 teaser (film w banerze, cytaty dnia, zagadka w okienku — już na prod); po naciśnięciu cała aplikacja przełącza się w tej samej chwili |
| wizerunek | „zero zdjęć" | **dwa warianty**: domyślny bez wizerunku (imię z oficjalnej zbiórki + link); z wizerunkiem (zdjęcie/film z naciśnięcia) tylko po **pisemnej zgodzie mamy** (wiadomość) — przełącznik w bazie, nie w kodzie |

## 1. Guzik — serce akcji

**Strona `start-akcji.html`** (nowa), widoczna i działająca **wyłącznie** dla konta z listy `akcja_startujacy` (jeden wpis: Filip; RPC sprawdza `auth.uid()`, nie rolę z `user_metadata` — LEKCJA z K5).

Stany (jeden ekran, telefon pionowo, bez paska nawigacji, bez niczego do przypadkowego tapnięcia):
1. **Rozbrojony** (przed 8.11 06:00 Europe/Warsaw): szary krąg, napis „8 listopada". Tap nic nie robi. Tryb próbny (pkt 4) działa zawsze.
2. **Uzbrojony** (8.11 od 06:00): duże pomarańczowe koło z logo BiegaMy (~70 % szerokości), pod nim jedno słowo **„START"**. Delikatny puls. Nic więcej na ekranie.
3. **Naciśnięty**: koło „wybucha" w iskry (te same pomarańczowe co w filmie), napis „Ruszamy. 12 500 km dla Fabianka." (zdanie z liczbą celu, nie nazwa akcji) — trwa do zapisu.
4. **Zapisane** (potwierdzenie z bazy): „Akcja ruszyła · HH:MM" + licznik 0 / 12 500 km. Drugie naciśnięcie nie robi nic (idempotentne).

**Ochrona przed przypadkiem**: przytrzymanie 1 s (z wypełniającym się pierścieniem — dziecko widzi, że „ładuje"), nie zwykły tap. Bez pytania „Czy na pewno?" — to by zepsuło moment.

**Brak zasięgu pod domem** (największe ryzyko dnia):
- naciśnięcie zapisuje **czas naciśnięcia** lokalnie (localStorage + IndexedDB w try/catch) i natychmiast pokazuje stan 3 → 4 „Akcja ruszyła · HH:MM · wysyłam…";
- wysyłka ponawia się co 5 s i przy powrocie sieci (`online`); po sukcesie „· zapisane ✓";
- serwer przyjmuje czas naciśnięcia z klienta tylko, gdy jest w oknie 8.11 06:00–23:59 i nie później niż „teraz" (+ 2 min tolerancji) — inaczej bierze czas serwera;
- do chwili zapisu w bazie reszta aplikacji jeszcze nie wie o starcie — to jest OK (kilka minut opóźnienia), ważne, że moment i nagranie są prawdziwe.

**RPC `akcja_start(slug, nacisnieto_at)`** — `security definer`: tylko `auth.uid()` z `akcja_startujacy`; tylko w oknie; ustawia `akcje.wystartowala_at` raz (drugi raz → zwraca istniejący, bez zmiany); zwraca stan licznika. Brak `UPDATE` z przeglądarki na `akcje`.

## 2. Co się dzieje w aplikacji w chwili startu

Jedno źródło prawdy: `akcje.wystartowala_at` (publiczny odczyt przez `akcja_licznik` — pole `wystartowala`). Klient sprawdza przy wejściu na stronę i przy powrocie karty (`visibilitychange`), bez odpytywania co sekundę.

- `czyAkcjaRuszyla()` w `js/akcja-cytaty.mjs` — **podpięcie tu** (dziś zwraca false): czyta `akcja_licznik('dla-fabianka').wystartowala` (cache 60 s, sessionStorage w try/catch). Brak sieci → false (zostaje teaser — bezpieczniej niż zdradzić za wcześnie… albo za późno, bez znaczenia).
- **Baner cytatu**: „Jedno kliknięcie zmieni wszystko." → „12 500 kilometrów. Jeden powód. Fabianek." (już zaimplementowane, czeka na podpięcie).
- **Film w banerze**: od startu `FILMY_PROMO` przełącza się na film akcji (Filip wrzuci; do tego czasu zostaje film-02). Gra raz po starcie u każdego, nawet jeśli dziś już grał teaser.
- **Karta akcji na Dziś** (v2 pkt 3.3) pojawia się od startu: pasek 0 → 12 500, suma, mój wkład, link do zbiórki, „Zostań sponsorem kilometrów".
- **Okienko**: zagadka → karta akcji (licznik + link) — miejsce już przygotowane (`odpowiedzZagadki`).
- **index.html i `dla-fabianka.html`**: przed startem — teaser bez nazwy dziecka („8.11"); po starcie — pełna strona v2.
- **Push** (jeden, do wszystkich z włączonymi powiadomieniami): w chwili zapisu startu — „Ruszyło. 12 500 km dla Fabianka. Każdy krok się liczy." (od 2.11 19:00; wcześniej „Każdy kilometr się liczy") Raz. Plus niedzielne podsumowania i jedna na zamknięcie (v2).

## 3. Wyprawa na Jasną Górę (Filip i Kasia)

Minimalnie, bo to dodatek do akcji, nie osobna aplikacja: na `dla-fabianka.html` i karcie Dziś sekcja **„Wyprawa"** — „Filip i Kasia: spod domu Fabianka na Jasną Górę · X km z Y" liczone z ich `training_logs` od startu do dnia dotarcia (oznaczonego przez Filipa jednym przyciskiem na `start-akcji.html` „Dotarliśmy"). Bez śledzenia GPS na żywo (prywatność, bateria, ryzyko). Ich kilometry liczą się też do 12 500 jak każde inne.

**Do decyzji Filipa (nie blokuje budowy):** dystans i liczba dni trasy (Y), czy biegną cały czas we dwoje.

## 4. Próba na sucho — obowiązkowa

- Akcja testowa `slug = 'proba'` z tym samym kodem: guzik działa w dowolnej chwili, tylko dla Filipa, liczy logi **wyłącznie konta testowego**, nie wysyła pusha do nikogo poza kontem testowym, nie zmienia cytatów u innych.
- **7.11 wieczorem**: Filip robi pełną próbę na telefonie, którego użyje 8.11: tryb samolotowy → przytrzymanie → stan „wysyłam…" → wyłączenie samolotu → „zapisane ✓" → konto testowe widzi zmianę cytatu, kartę akcji i push. Reset próby jednym RPC.
- 8.11 rano: telefon naładowany, zalogowany, `start-akcji.html` otwarta przed wyjściem (PWA na ekranie głównym — skrót „Start akcji").

## 5. Wizerunek Fabianka — dwa warianty

- `akcje.wizerunek_zgoda boolean default false` + `wizerunek_url` (zdjęcie/kadr przesłany przez Filipa do bucketu tylko do odczytu, zapis wyłącznie przez trenera z listy).
- `false` (domyślnie): wszędzie tylko imię w formie z oficjalnej zbiórki + link; zero zdjęć, zero opisu choroby.
- `true`: na `dla-fabianka.html` i w filmie akcji jedno zdjęcie/film z naciśnięcia; nadal zero opisu choroby (opowiada oficjalna zbiórka).
- Przełącza Filip RPC-iem po otrzymaniu zgody na piśmie; cofnięcie zgody = `false` i usunięcie pliku z bucketu tego samego dnia.
- Okienko, wyszukiwarka osób i sieć: „Fabian*" nigdy nie idzie do Google ani do trybu osoby — już na prod (blizna-93), zostaje do zamknięcia akcji.

## 6. Dane — zmiany względem v2

- `akcje`: + `wystartowala_at timestamptz null`, `okno_startu_od timestamptz` (8.11 06:00), `okno_startu_do timestamptz` (8.11 23:59), `wizerunek_zgoda`, `wizerunek_url`, `wyprawa_cel_km numeric null`, `wyprawa_dotarla_at timestamptz null`.
- `akcja_startujacy (akcja_id, athlete_id)` — RLS bez odczytu dla nikogo poza RPC.
- `akcja_licznik` zwraca dodatkowo `wystartowala` (bool), `wystartowala_at`, `wyprawa_km`, `wyprawa_cel_km`, `wizerunek` (url tylko gdy zgoda). Przed startem: `suma_km` = null (licznik niewidoczny, żeby nic nie zdradzić), `wystartowala` = false.
- Suma liczona od **8.11 00:00** (cały dzień startu), ale zwracana dopiero po starcie.
- RPC: `akcja_start`, `akcja_dotarlismy`, `akcja_wizerunek(zgoda, url)`, `akcja_proba_reset` — wszystkie `security definer`, tylko lista startujących, z asercjami w migracji (anon i zwykły zawodnik → 42501).

## 7. Testy (do blizn z v2)

- guzik: inne konto → 403; poza oknem → odmowa; drugie naciśnięcie → ten sam `wystartowala_at`; czas z klienta spoza okna lub z przyszłości → czas serwera;
- offline: naciśnięcie bez sieci → zapis lokalny → wysyłka po powrocie sieci → jeden start (nie dwa);
- przed startem `akcja_licznik` jako anon: `wystartowala=false`, `suma_km=null`, zero nazwy dziecka w odpowiedzi;
- po starcie: cytat, karta Dziś, okienko, index przełączają się bez przeładowania (przy `visibilitychange`);
- logi z 8.11 sprzed naciśnięcia liczą się do sumy;
- próba (`proba`) nie zmienia niczego u kont innych niż testowe;
- wizerunek: `zgoda=false` → url nigdy nie wychodzi z RPC.

## 8. Plan dni

| dzień | robota | Filip |
|---|---|---|
| **2.11 (pn)** | ZWIAD (v2 pkt 7 dzień 1: odznaki, wyzwania, miejsce na Dziś/index, push/cron, share-card, bazowa suma km 30/90 dni). Migracja `akcje` (+ v3 pola), `akcja_startujacy`, `akcja_sponsorzy`, RPC + testy. Wiersz `dla-fabianka` i `proba`. | link do oficjalnej zbiórki + dokładna forma imienia ze zbiórki |
| **3.11 (wt)** | `start-akcji.html` (4 stany, przytrzymanie, offline) + `akcja_start` + próba; podpięcie `czyAkcjaRuszyla`. | pierwsza próba guzika na swoim telefonie |
| **4.11 (śr)** | karta akcji na Dziś, `dla-fabianka.html`, index (teaser → pełna), okienko po starcie. | ogląda strony na koncie testowym |
| **5.11 (czw)** | odznaki akcji w oknie (+ okno wstecz dla #100kmDlaKasi), sponsorzy, wyprawa. | dystans/dni wyprawy |
| **6.11 (pt)** | share-card `akcja`, push startu + niedzielny + zamknięcia (cron), film akcji w `FILMY_PROMO` po starcie. | film akcji do Downloads; zgoda mamy (tak/nie) |
| **7.11 (sb)** | pełna ścieżka na koncie testowym (rejestracja → log → licznik → odznaka); Supabase przed naporem (limity maili, SMTP); **próba generalna guzika wieczorem** (pkt 4); reset próby. | próba generalna, telefon naładowany |
| **8.11 (nd)** | **nic się nie wdraża**. Filip naciska… Fabianek naciska. cc obserwuje logi i bazę, gotowy tylko do naprawy. | START |

## 9. Czego nie robimy (do v2 dochodzi)

- Bez śledzenia GPS na żywo wyprawy, bez mapy trasy do Częstochowy z punktem „gdzie są teraz".
- Bez transmisji na żywo w aplikacji — relacja idzie w social media, aplikacja liczy.
- Bez zdjęć dziecka bez pisemnej zgody; bez opisu choroby w żadnym wariancie.
- Bez drużyn, firm i rankingów klubów na start — ewentualnie po starcie, jeśli akcja się rozkręci (decyzja wtedy).

## 10. Zmiany 2.11.2026 (decyzje Filipa) — obowiązują przed resztą dokumentu

**Rozliczenie — jednorazowe, nie tygodniowe.** Filip wpłaca JEDEN raz, po zakończeniu akcji, na główną zbiórkę.
- UI: „Filip dokłada 10 gr za każdy kilometr · dotąd X zł z 1 250 zł" — X rośnie z licznikiem
  (`akcja_licznik.filip_gr`, przycięte do celu). Bez „wpłaty tygodnia", bez kwot do przelewu.
- Push niedzielny: tylko kilometry i % celu, bez kwot.
- `akcja_tydzien` zostaje jako raport dla Filipa (startujący), nie w UI.
- Z v2 nieaktualne: „rozliczenie tygodniowe… poniedziałek rano", „kwota w pushu = kwota rozliczenia tygodnia",
  „234 zł od Filipa" w pushu.

**Nazwa akcji: „Kilometry dla Fabianka"** (Filip 12:26) — wszędzie, gdzie pada nazwa (dla-fabianka.html, karta Dziś,
share-card, push, okienko po starcie, index). Cel 12 500 km zostaje liczbą na pasku i w tekstach, nie w nazwie.
Cytat dnia startu bez zmian: „12 500 kilometrów. Jeden powód. Fabianek."

**Dane zbiórki** (`akcje`, migracja `20261102_akcje_dane_zbiorki`): `url_zbiorki` = https://www.siepomaga.pl/fabian-borowczyk,
`imie_zbiorki` = „Fabianek" (w tekstach tylko to imię i odmiana „Fabianka"; **nigdy nazwisko ani nazwa choroby — nazwisko
wyłącznie w linku**), `nazwa` = „Kilometry dla Fabianka". Bez pola końca zbiórki i bez logiki końca zbiórki.

**Licznik publiczny** (wariant b): niezalogowani czytają `akcja_licznik` przez EF `akcja-licznik` (verify_jwt off, klucz
serwisowy tylko do tego RPC, cache 60 s, CORS biegamy.run + run.biegamy.app). Rola anonimowa nie ma żadnego uprawnienia
do `akcja_*` — v2 pkt 5 („EXECUTE dla anon") nieaktualny. Zalogowani: RPC wprost (authenticated).

**Konta:** startujący obu akcji = główne konto Filipa (w coaches, z zawodnikami); `konta_testowe` próby = konto testowe
(testy okienka). Rozpoznawane po faktach w bazie, nie po e-mailu — migawka `supabase/schema/akcje/startujacy.json`, blizna-97.

**Co się liczy (Filip 2.11 18:35):** tylko bieg i chód — jedna lista w bazie, `public.akcja_typ_liczy` (migracja `20261102_akcja_typy.sql`), używana przez licznik, wkład, wyprawę, push niedzielny, share-card i odznaki; rower, pływanie, siła i każdy nieznany typ — nie. Zwiad typów: `docs/akcja-f-typy-2026-11-02.md`. UI: „Liczy się bieg i spacer. Rower nie.”

**Plakat akcji (Filip 2.11 19:00–19:20):** plik w Storage pod losową nazwą (`share-assets/akcja/<32 hex>.jpg`, wgrany ręcznie 2.11 — nie w repo), adres w `akcje.plakat_url`. Licznik oddaje `plakat_url` WYŁĄCZNIE gdy **po starcie AND `wizerunek_zgoda = true`** (migracje `20261102_akcja_plakat_url`, `20261102_akcja_plakat_zgoda`). Zgoda mamy = `update akcje set wizerunek_zgoda = true where slug = 'dla-fabianka'` — dopiero gdy Filip napisze „zgoda mamy jest". Front: góra `dla-fabianka.html` (pełna szerokość, dotknięcie = pełny ekran) i miniatura w karcie Dziś, pod nimi „Wpłać na zbiórkę"; bez plakatu układ bez dziury. Blizna-106. ⚠️ Plakat ma napis „Liczy się każdy kilometr" — grafika, nie kod.

**Sponsor z zewnątrz:** `dla-fabianka.html` po starcie „Zostań sponsorem kilometrów" → `index.html#sponsor` (bez hero, logowanie/rejestracja) → `zawodnik.html#sponsor` → formularz sponsora otwarty i przewinięty. Blizna-106.

**Link zbiórki bez wdrożenia (zbiórka kończy się 27.11):** RPC `akcja_url_zbiorki(slug, url)` — tylko startujący, tylko `https://www.siepomaga.pl/…`; w `start-akcji.html` po starcie przycisk „⋯" → pole + „Zapisz link zbiórki". Tekst formularza sponsora: „Po zakończeniu akcji wpłacasz sam na zbiórkę <imię z bazy w dopełniaczu> — aktualny link będzie zawsze tutaj. Aplikacja tylko liczy."

**Audyt 2.11 wieczorem:** `docs/akcja-f-audyt-2026-11-02.md` — 6 poprawek bez migracji wdrożonych, 2 propozycje z migracją czekają na OK.

**Guzik:** logo z przezroczystym tłem wtopione w pomarańczowe koło; od 2.11 18:08 (Filip, wariant B — stare zlewało się z kołem) `assets/ui/logo-b-biale-alfa.webp`: B całe białe z delikatnym cieniem, pierścień biały 40%, generowane `tools/logo-guzika.py` z `logo-b-ring-alfa.png`.


**Odznaki akcji — finał zasad (Filip 2.11 15:16; zastępuje v2 pkt 4).** 6 odznak, kolejność w katalogu:
`akcja-1km` (Pierwszy kilometr) · `akcja-100` · `akcja-200` · `akcja-500` (km akcji jak w liczniku: cap/doba, doba warszawska) ·
`akcja-co-tydzien` („7 dni z rzędu") · `akcja-sponsor` (Sponsor kilometrów). **Usunięte:** `akcja-1000`, `akcja-razem`,
`akcja-dzien-startu` (bez grafiki, reguły i zaślepki).
- **Okno** przyznawania: dzień startu → dzień zamknięcia włącznie; poza oknem nigdy, przyznane zostają na zawsze. Katalog akcji
  widoczny dopiero po starcie. #100kmDlaKasi (15.08–20.09.2026): ta sama reguła — naprawiony błąd przyznawania za wpis wsteczny.
- **„7 dni z rzędu"**: 7 kolejnych dni kalendarzowych (Europe/Warsaw) z ≥ 1 biegiem albo chodem (`akcja_moje_dni`, lista `akcja_typ_liczy`; do 2.11 18:35 każdy typ), wszystkie
  w oknie (pierwszy możliwy dzień 8.11); raz, od razu po 7. dniu; przerwa zeruje serię, nowa seria może dać odznakę później.
  Grafika: płomień.
- **Sponsor**: przyznawana przy zapisie deklaracji w oknie (RPC `akcja_deklaruj`, ta sama transakcja); zostaje także po wycofaniu
  deklaracji. Formularz bez zmian: „Wpłacasz sam na oficjalną zbiórkę po zakończeniu akcji. Aplikacja tylko liczy."
- **Grafiki**: `assets/odznaki/<slug>.webp` (256) i `<slug>-512.webp`, robione z PNG Filipa (GPT) narzędziem
  `tools/odznaki-akcji-grafiki.py` — namalowana szachownica wycinana do koła (tło = jasny, bezbarwny i gładki piksel), krawędź
  wsuwana adaptacyjnie bez ścinania metalowych pierścieni. Brak pliku = zaślepka SVG w tym samym `<img>`; „nie mam" = filtr.
  Nazwy plików i slugi bez imienia dziecka (repo publiczne).
- **Twarda kontrola w bazie**: wyzwalacz `achievements_okno` (migracja `20261102_odznaki_okna`) — wdrażany po OK Filipa.

**Zmiana daty startu (Filip 2.11 16:22): SOBOTA 7.11.2026** (8.11 to niedziela) — zastępuje wszystkie „8.11" wyżej.
- **Data w jednym miejscu:** `akcje.start = 2026-11-07` (akcja i próba, migracja `20261102_akcja_start_7_11` z asercją);
  front publiczny (index, dla-fabianka) czyta datę z licznika (`start`), cytaty/okienko/guzik ze stałej
  `BM_AKCJA_CYTATY.DZIEN_STARTU` — dzień rotacji, okno guzika i zapis „7.11"/„7 listopada" są z niej liczone.
  Tytuł i opis udostępniania `dla-fabianka.html` bez daty.
- **Okno guzika:** 7.11 06:00–23:59:59 Europe/Warsaw. Cały dzień 7.11 liczy się do sumy. Okna odznak i seria „7 dni z rzędu"
  od 7.11 (seria od 6.11 = brak).
- **Cytaty:** teaser 2–5.11 bez zmian; 6.11 „Jutro wszystko stanie się jasne." (ostatni dzień teasera; „Peleryny… Jeszcze dwa
  dni." wypadło — liczyło do starego terminu); 7.11 przed naciśnięciem „Dziś. Jedno kliknięcie zmieni wszystko.", po
  naciśnięciu „12 500 kilometrów. Jeden powód. Fabianek."; od 8.11 rotacja. Zagadki okienka: „7.11".
- **Plan:** próba generalna (tryb samolotowy, pełna ścieżka na koncie testowym) w **czwartek 6.11 wieczorem**; **7.11 nic się nie
  wdraża** — start. Pierwszy push niedzielny 8.11 (2 dni akcji) jest OK.
- **Wyprawa:** km z kont Filipa i Kasi od naciśnięcia guzika do „Dotarliśmy" (licznik `wyprawa_km`); cel `wyprawa_cel_km` poda
  Filip. Konto Kasi z jej zawodnikami ma jej własne treningi z intervals (osobne konto intervals, 0 wspólnych aktywności
  z Filipem) — ⚠️ ostatni zsynchronizowany trening 6.10: przed 7.11 sprawdzić, czy aktywności Kasi dochodzą.
- Pushe start / niedziela / zamknięcie i „Dotarliśmy" — NA PROD 2.11 (migracja `20261102_akcja_dzien5`, EF `akcja-push`).
