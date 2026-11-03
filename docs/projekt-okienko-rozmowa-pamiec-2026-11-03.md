# Okienko 2.0 — ROZMOWA I PAMIĘĆ: zwiad + projekt (3.11.2026, do OK Filipa — STOP przed budową)

Filip 16:00: „teraz dużo lepsze; ma mieć pamięć i umieć gadać”. Budowa tylko w okienko-v2 (konto Filipa + testowe), v1 bez zmian.

## 0. Zwiad — co już jest

| jest | gdzie | co trzyma | czego NIE ma |
|---|---|---|---|
| pamięć rozmowy E4 | `okienko-v2/rozmowa.mjs`, tabela `okienko_v2_rozmowa` (service-only, RLS zero, cron 03:31 kasuje > 1 dzień) | intencja + sloty ostatnich 5 tur ≤ 30 min | treści pytań i odpowiedzi; dopytania „a dlaczego?” nie mają do czego sięgnąć |
| historia po stronie klienta | `js/okienko.js` wysyła `historia.slice(-3)` {q, a} | 3 ostatnie pary w pamięci karty | serwer używa ich tylko jako kontekstu klasyfikatora, nie do rozmowy |
| strażnik liczb | `okienko/straznik.mjs` + E6 `samosprawdzenie.mjs` | każda liczba w zdaniu musi być w wynikach narzędzi / źródłach | — (zostaje bez zmian) |
| strażnik ogólników | `okienko-v2/wiedza.mjs` (3.11) | fraza-wytrych bez konkretu → ponowienie → krócej | działa tylko w trybie sieci |
| limity | `okienko/limity.mjs`: 60/dobę model, 20/dobę sieć, budżet miesięczny v1+v2 | — | osobnego limitu rozmów |
| model | `gemini-3.5-flash-lite`, 0,30 / 2,50 USD za 1 M tokenów (we / wy) | — | — |

Wniosek: pamięć krótka ISTNIEJE jako szkielet (tabela, TTL, 5 tur, service-only, cron) — brakuje w niej treści. Nie budujemy drugiej tabeli;
rozszerzamy `okienko_v2_rozmowa` o dwie kolumny. Pamięć długa nie istnieje w ogóle.

## 1. Pamięć krótka → tryb ROZMOWA

- Migracja: `okienko_v2_rozmowa` + `pytanie text ≤ 300` + `odpowiedz text ≤ 400` (skrót: zdania bez kart, bez źródeł). RLS zero bez zmian,
  cron 1 dzień bez zmian, `on delete cascade` bez zmian. Czyta/pisze tylko EF.
- Detektor dopytania (kod, 0 tokenów, w `rozmowa.mjs`): świeża rozmowa (≤ 30 min) **i** pytanie z listy wzorców: „a dlaczego”, „dlaczego
  tak/taki”, „wyjaśnij (prościej|inaczej)”, „a dla mnie”, „jak to zrobić (w praktyce)”, „a jeszcze”, „co jeszcze”, „a co z…”, „rozwiń”,
  „a jak mam (zmęczenie|kontuzję|…)”, „to znaczy”, „nie rozumiem” — albo pytanie ≤ 3 słów zaczynające się od „a”. Klasyfikator dostaje
  też intencję `rozmowa` (dla zdań, których regex nie łapie), ale regex ma pierwszeństwo i jest tańszy.
- Tryb ROZMOWA (nowy moduł `okienko-v2/rozmowa-model.mjs`): JEDNO wywołanie modelu z: (a) charakterem (§3), (b) ostatnimi ≤ 5 wymianami
  (pytanie + skrót odpowiedzi), (c) danymi narzędzi, które były użyte w poprzedniej turze (odtwarzane ponownie z narzędzi v1 — nie z
  tekstu odpowiedzi), (d) pasującymi faktami z pamięci długiej (§2). Odpowiedź tekstem → strażnik liczb na wynikach (c) i źródłach z
  poprzedniej tury (jak E6) → strażnik ogólników (jak w sieci: jedno ponowienie, potem krócej). Liczba spoza narzędzi → zdanie wycięte;
  pusto → „Nie mam tego w Twoich danych” + chipy.
- Twarde bramki bez zmian: zagadka/fabian*/odmowa w routerze przed wszystkim; nazwiska prywatne nigdy do sieci; dopytanie po pytaniu
  o osobę nie uruchamia sieci. Zdrowie: dopytanie po `zdrowie` dostaje stałe teksty, nie model.
- Log: `tryb='rozmowa'`, liczony do 60/dobę; osobny limit **20 tur rozmowy / dobę** (zawodnik może dopytywać, ale nie w nieskończoność).

## 2. Pamięć długa — `okienko_pamiec`

- Tabela: `id, athlete_id → athletes (cascade), fakt text ≤ 200, kategoria check in ('cel','preferencje','sprzet','rytm','zdrowie','inne'),
  utworzono timestamptz, potwierdzono timestamptz, zrodlo text ('okienko'|'profil')`. RLS: **tylko właściciel** (select/update/delete po
  `athletes.user_id = auth.uid()`), trener NIE; insert wyłącznie EF (service) po potwierdzeniu — z przeglądarki właściciel może
  dodać/edytować tylko przez ekran Profilu (polityka insert dla właściciela z `zrodlo='profil'`). Limit 30 faktów/osobę. Bez crona.
- Przepływ zapisu: zdanie zawodnika wygląda na fakt o nim („zapamiętaj, że…”, „biegam rano”, „mam Garmina”, „celuję w 3:30 w maratonie”,
  „nie lubię interwałów”) → kod (regex + klasyfikator: intencja `zapamietaj`, slot `fakt`, slot `kategoria`) → Okienko ODPOWIADA:
  „Zapamiętać, że biegasz rano? [Tak] [Nie]” (chipy; odpowiedź „Tak” to zwykłe pytanie, które router rozpoznaje jako potwierdzenie
  OSTATNIEJ propozycji z `okienko_v2_rozmowa`, ≤ 10 min). Zapis dopiero po „Tak”. 0 zapisów bez potwierdzenia — ławka to sprawdza.
- Zdrowie: kategoria `zdrowie` (kontuzja, choroba, leki, ciąża…) — domyślnie NIE proponujemy zapisu. Wyłącznie gdy zawodnik sam prosi
  „zapamiętaj, że mam …” i dotyczy zdrowia → osobne pytanie: „To dane o zdrowiu. Zapisać je w pamięci Okienka? Możesz usunąć je w każdej
  chwili w Profilu. [Tak, zapisz] [Nie]” — zgoda osobna, zalogowana (`potwierdzono` + `zrodlo='okienko-zdrowie'`).
- Użycie: do kontekstu modelu trafiają tylko fakty pasujące do pytania (kategoria ↔ intencja: cel → gotowosc/plan/starty; rytm → plan;
  sprzęt → sprzet; preferencje → porada/plan; zdrowie → tylko intencja zdrowie/porada i tylko ze zgodą). Dopasowanie w kodzie, nie w modelu.
  Pamięć nigdy nie trafia do sieci (googleSearch) ani do klasyfikatora.
- Profil → „Co Okienko o mnie wie”: lista (fakt, kategoria, data), edycja w miejscu, usuń, „usuń wszystko” (jedno potwierdzenie). Czyta
  przeglądarka przez RLS właściciela. `delete_my_account`: cascade, bez zmiany funkcji.

## 3. Charakter

System prompt trybu ROZMOWA (jedno źródło, `rozmowa-model.mjs`): „Jesteś Okienkiem — asystentem trenera w BiegaMy. Mówisz do biegacza
na „Ty”, ciepło i konkretnie, 2–4 krótkie zdania, bez emoji, bez list. Nie mówisz o sobie „jako AI”. Nie wymyślasz liczb — używasz tylko
tych z danych. Jeśli nie wiesz, mówisz to wprost i proponujesz, o co zapytać. Nie udzielasz porad medycznych.” + zakaz fraz-wytrychów
(lista z `wiedza.mjs`, jedno źródło). Strażnik ogólników działa też tu.

## 4. Ławka rozmów

`tests/_lawka-rozmowy.js` + `lawka-rozmowy.test.js` (CI, atrapy, 0 $): 30 scenariuszy 2–4 tur, np. plan → „a dlaczego taki?” → „a jak mam
zmęczenie?”; porada (sieć) → „a dla mnie?” (dane z moje_treningi); „zapamiętaj, że biegam rano” → „Tak” → nazajutrz „kiedy mam biegać?”;
„mam kontuzję kolana, zapamiętaj” → osobne pytanie o zgodę → „Nie” → 0 wierszy; „zapamiętaj, że Jan Kowalski…” → odmowa (cudze dane);
dopytanie po osobie → bez sieci. Ocena na każdym scenariuszu: kontekst trzymany (odpowiedź odnosi się do poprzedniej tury — sprawdzane
po słowach-kluczach z atrapy), 0 wymyślonych liczb (strażnik), 0 zapisów pamięci bez potwierdzenia, 0 danych zdrowia bez zgody. Nagrania
modelu jak w ławce v2 (atrapa + `--zywy`).

## 5. Koszt i limity (flash-lite 0,30 / 2,50 USD za 1 M)

| element | tokeny we / wy | USD |
|---|---|---|
| klasyfikator (jak dziś) | ~1 000 / 60 | 0,00045 |
| tura ROZMOWY: charakter 500 + 5 wymian 600 + dane narzędzi 400 + pamięć 100 = ~1 600 / 120 | | 0,00078 |
| ponowienie przy ogólniku (co ~4. tura) | +1 600 / 120 | +0,0002 średnio |
| **razem tura rozmowy** | | **≈ 0,0015** |

Miesięcznie (10 pytań/os./mies., z czego 40 % to dopytania): 100 osób → 400 tur → **≈ 0,6 USD**; 500 osób → 2 000 tur → **≈ 3 USD**
(plus dotychczasowe koszty klasyfikatora i sieci: §1.8 projektu v2 — 100 ≈ 3 USD, 500 ≈ 15 USD). Limity: 20 tur rozmowy/dobę/osobę,
w ramach 60/dobę; pamięć długa 30 faktów/osobę; żadnych nowych kosztów bazy (wiersze kasowane po 1 dniu).

## 6. Polityka prywatności — proponowany dopisek (PL; EN 1:1 po OK)

§2, nowy punkt: **„Asystent „Okienko”** — Twoje pytania i skróty odpowiedzi z ostatnich 30 minut rozmowy (kasowane automatycznie po
jednym dniu) oraz — tylko gdy to potwierdzisz — fakty, które poprosisz zapamiętać (np. „biegam rano”, cel startowy, sprzęt). Cel: żeby
asystent rozumiał dopytania i Twój kontekst.”
§7, dopisek: „Rozmowa z Okienkiem jest kasowana po jednym dniu. Zapamiętane fakty trzymamy, dopóki ich nie usuniesz (Profil → „Co
Okienko o mnie wie”) albo nie usuniesz konta.”
§4 (zdrowie), dopisek: „Faktów o zdrowiu Okienko nie zapamiętuje samo; zapisuje je wyłącznie, gdy o to poprosisz i osobno to potwierdzisz.”
§9, dopisek do listy usuwanych: „…pamięć Okienka (rozmowy i zapamiętane fakty)…”.

## 7. Etapy (po OK) i co do mojego OK

R1 migracja (2 kolumny + `okienko_pamiec` + RLS + testy) · R2 tryb ROZMOWA + charakter + strażniki · R3 „zapamiętaj” + potwierdzenie +
zdrowie · R4 Profil „Co Okienko o mnie wie” · R5 ławka rozmów 30 · R6 privacy PL+EN. Szacunek 2–3 dni. Migrację i EF pokazuję, Filip odpala.

Decyzje do Twojego OK: (a) rozszerzenie istniejącej tabeli rozmowy zamiast nowej; (b) limit 20 tur rozmowy/dobę i 30 faktów;
(c) właściciel może dodawać fakty także ręcznie z Profilu; (d) kategoria zdrowie z osobną zgodą jak wyżej; (e) tekst dopisku do polityki.

## 8. „EFEKT WOW” — po pamięci (Filip 3.11, pkt 6); kolejność W1 → W4

Zasada wspólna: wszystko z DANYCH (narzędzia v1 + maszyna wyników F6 przez `okienko/f6.mjs`, pamięć 10 min, ≤ 500 wpisów), liczby tylko
przez strażnik, zero zdań modelu bez pokrycia. Model pisze prozę dopiero na końcu, gdy fakty są już policzone w kodzie.

**W1 — przewaga danych: pytania łączące moją formę/treningi z wynikami z maszyny** (przepisy E5 w kodzie, ≤ 4 narzędzia równolegle):
- `prognoza_startu` — „jaki czas zrobię na Biegu X?”: cel/start z `moje_starty` → rekordy (`moje_rekordy`, Riegel z `sb.js` — jedna kopia,
  wykładnik 1,091 jak w aplikacji) → forma dziś (`moja_forma`, TSB) → 14 dni treningu → zdanie: „Z rekordu 10 km 45:10 i obecnej formy
  wychodzi 1:40–1:43 na półmaraton; w ostatnich 14 dniach 62 km.” Zakres, nie jedna liczba (lekcja: kotwica, odrzucone warianty VDOT).
- `porownanie_z_kategoria` — „jak wypadam w swojej kategorii?”: rocznik + płeć z `athletes` → kategoria (M40 itd., jak kolektor) → wyniki
  z maszyny dla tej imprezy/dystansu (`upcoming_races`/wyniki F6: mediana kategorii, miejsce zawodnika) → „W M40 na tym biegu mediana to
  1:52; Twój rekord 1:43 dałby ok. 8. miejsce na 61.”
- `rekord_trasy` — „jaki jest rekord trasy X?”: wyniki F6 po nazwie imprezy (klucz nazwy jak `klucz_nazwy_imprezy`) → najlepszy czas
  w historii + rok + nazwisko (publiczny wynik sportowy — dozwolone jak dziś w trybie imprezy).
- `rywale` — „kto jest moim rywalem?” (intencja `rywal` dziś bez obsługi): osoby z wyników F6 o czasach ±3 % od mojego rekordu na tym samym
  dystansie w ostatnich 12 mies., tylko z publicznych wyników; prezentacja jak tryb osoby (B2: karta publiczna, nigdy sieć). Wymaga
  `f6_runner_key` zawodnika (jak dziś przy „moje wyniki”).
- Ławka: 20 pytań, każde z oczekiwanym zestawem narzędzi i zakresem liczb; `--zywy` tylko na maszynie testowej.

**W2 — jedna proaktywna uwaga na Dziś dziennie** (kafel pod planem, nie push):
- Źródło: wyłącznie przepisy W1 + dane własne; lista kandydatów w kodzie z progiem pewności (np. „do startu 12 dni, TSB −18: ostatni
  mocny akcent powinien być do piątku” — tylko gdy start w `race_goals` i TSB z ≥ 14 dni danych; „nowy rekord trasy w Twojej kategorii na
  biegu, na który jesteś zapisany”; „w tym tygodniu 0 km, a plan ma 3 treningi” — tylko gdy plan istnieje). Każdy kandydat ma warunek
  danych i wagę; dzień bez kandydata ≥ próg = brak uwagi (cisza lepsza niż ogólnik).
- Jedna na dobę, liczona raz (cron 05:00 Warszawa, EF `okienko-uwaga`, tabela `okienko_uwaga_dnia` (athlete_id, data, tekst, powod,
  pewnosc, pokazana, zamknieta) — RLS właściciel czyta; wyłączenie w Profilu (`okienko_ustawienia`/athletes flaga `uwaga_dnia=false`,
  domyślnie ON tylko dla kont v2). Model NIE pisze uwagi — zdania z kodu (jak przepisy), 0 tokenów.
- Ocena: tydzień na kontach v2 → ile pokazanych, ile zamkniętych, ile kliknięć; cel: < 20 % zamknięć bez kliknięcia.

**W3 — czas p90 < 2 s** (`okienko_v2_log.ms` już jest):
- Pomiar: raport z logu (p50/p90 per tryb) w `tools/okienko-czas.sql`; dziś klasyfikator ma timeout 3 s — więc p90 < 2 s wymaga:
  (1) równoległe: klasyfikator i tanie narzędzia startują razem (narzędzie wg routera/regex nie czeka na model); (2) pamięć 24 h dla
  sieci jak dziś + pamięć 10 min F6 jak dziś; (3) rozmowa: jedno wywołanie, maks 160 tokenów wyjścia; (4) sieć (2–4 s) wyłączona z celu
  p90 — raportowana osobno, bo to Google, nie my; (5) region EF: sprawdzić, czy funkcje chodzą w eu-central (opóźnienie do Gemini z EU).
- Cel mierzony na ławce `--zywy` i w logu prod po tygodniu; brak celu = nie przełączamy wszystkich (razem z ≥ 95 % ławki).

**W4 — benchmark 50 pytań: Okienko vs ChatGPT/Gemini bez naszych danych** (ocena Filipa):
- `tools/okienko-benchmark-pytania.json`: 20 osobistych („jaka mam formę”, „prognoza na mój start”, „ile km w październiku”), 15 o polską
  scenę („rekord trasy Biegu X”, „kto wygrał Y 2026”, „ile kosztuje Z”, „kto z Poznania biega 10 km w 40 min” — tylko publiczne wyniki),
  15 wiedzy ogólnej (żywienie, sprzęt, trening). Narzędzie jak A/B (`tools/okienko-benchmark.mjs`): Okienko przez EF z sesją Filipa;
  odpowiedzi ChatGPT/Gemini wkleja Filip ręcznie do JSON (albo kolumna „zwykły model” przez API Gemini bez narzędzi — ten sam klucz,
  0 danych); HTML obok siebie, wybór, podsumowanie per kategoria.
- Kryterium: osobiste i polska scena **100 %** dla Okienka (zwykły model nie ma danych — każda remis/przegrana = błąd po naszej stronie
  do naprawy, nie „trudne pytanie”); wiedza ogólna — ≥ 50 % (tu konkurujemy jakością promptu i źródłami).
- Po benchmarku: lista przegranych → zaległości z priorytetem; powtórka benchmarku po każdej paczce.

Koszt W1–W4: W1 i W2 bez modelu (0 tokenów, F6 w limicie 500/10 min); W3 to inżynieria; W4 ≈ 50 pytań × 2 wersje ≈ 0,1 USD.
Szacunek: W1 2–3 dni (najwięcej: prognoza i kategoria, bo potrzebują wyników F6 dla imprezy), W2 1–2 dni, W3 1 dzień + pomiar tydzień,
W4 0,5 dnia narzędzie + ocena Filipa. Wszystko po R1–R6 (pamięć), zgodnie z kolejnością Filipa.
