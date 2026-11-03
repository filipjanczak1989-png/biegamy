# Okienko 2.0 — projekt (3.11.2026, krótki, do OK Filipa 4.11; STOP przed kodem)

Rozszerza `docs/projekt-okienko-superinteligentne-2026-11-02.md` (decyzje z 2.11 zostają: katar = stałe teksty, porady =
model bez sieci, słownik PESEL + TERYT, „Który X?” do 5, budżet bez zmian + raport tygodniowy, cel ławki ≥ 95 %).
Nowe od Filipa 3.11: **osobna funkcja Edge `okienko-v2`**, stare okienko bez zmian (poza a–d z blizny-112, wdrożone 3.11),
**front wybiera v2 tylko dla kont z listy w bazie**, przełączenie wszystkich po 8.11 przy ławce ≥ 95 % i OK, powrót jednym
przełącznikiem. Liczby z `okienko_log` (30 dni, 3.11): 74 pytania od 3 osób — router 30, flash 17 (śr. 3261/77 tok.),
sieć 13, osoba 12; 1.11 = 60 pytań (testy Filipa). Opóźnienia **nie mierzymy** — log nie ma kolumny czasu (v2 ją dostaje).

## 0. Zasady, które nie podlegają modelowi (twarde bramki, każda z blizną)

| # | bramka | gdzie dziś | w v2 |
|---|---|---|---|
| B1 | zagadka/karta akcji, fabian*, zbiórka, reakcje, zdrowie — PRZED modelem | `router.mjs` (`dopasuj`) | v2 importuje `../okienko/router.mjs` bez zmian, woła `dopasuj` jako pierwszy krok |
| B2 | tryb osoby tylko przy czymś, co wygląda na imię/nazwisko; prywatne nazwiska nigdy do sieci | `pamiec.mjs`, `osoba.mjs`, `siec.mjs` (`czyDoSieci`) | te same moduły; **klasyfikator nie może włączyć osoby ani sieci** — jego `intencja=osoba` bez trafienia B2 = chipy |
| B3 | dane tylko przez RLS (klient z JWT usera) i narzędzia tylko-odczyt | `narzedzia.mjs` (`wykonaj`), `index.ts` pkt 2 | te same; zapis kluczem service tylko do logu/pamięci (blizna-69 rozszerzona o `okienko_v2_*`) |
| B4 | limity 60/dobę, sieć 20/dobę, budżet miesięczny | `limity.mjs` | te same liczniki (wspólny `okienko_log` + nowy `okienko_v2_log` liczone razem); klasyfikator liczy się do 60 |
| B5 | liczby w zdaniach tylko z narzędzi | `straznik.mjs` | ten sam strażnik na każdym zdaniu, także składanym z 3 narzędzi |

Blizna „v2 nie kopiuje”: `supabase/functions/okienko-v2/` **nie zawiera** własnych regexów routera, własnej listy narzędzi
ani własnego strażnika — tylko importy z `../okienko/`. Poprawka w v1 (jak a–d) obowiązuje v2 automatycznie.

## 1. Architektura v2 (nowe pliki tylko w `supabase/functions/okienko-v2/`)

```
klient (js/okienko.js) ──RPC okienko_wersja()──► 'v1' | 'v2'  ──POST──► /functions/v1/okienko-v2
index.ts:  wymagajUsera → ustawStan akcji → [B1] dopasuj (router, 0 tok.) → trafienie? odpowiedź jak v1
           → rozumienie.mjs (flash-lite, JSON) → {intencja, sloty, pewnosc, dopytac}
           → pamiec-rozmowy.mjs (scalanie slotów z 3–5 tur)
           → pewnosc < 0,6 lub dopytac → chipy „Chodzi Ci o…?” (0 narzędzi)
           → plan.mjs (przepis ≤ 3 narzędzi, równolegle) → [B2–B4] → wykonaj
           → sklad.mjs (szablon deterministyczny; model-proza tylko dla przepisów złożonych) → [B5] strażnik
           → samosprawdzenie.mjs → OK: odpowiedź | NIE: „Nie mam tego w Twoich danych.” / „Nie wiem.”
           → okienko_v2_log (intencja, pewnosc, plan, ms, samosprawdzenie)
```

1. **Rozumienie przed narzędziem** (`rozumienie.mjs`): `gemini-3.5-flash-lite`, `responseSchema`, `maxOutputTokens 96`,
   `temperature 0`, timeout 1,5 s. Wejście: **tylko tekst pytania + 3 poprzednie (pytanie, intencja)** — zero danych
   użytkownika, zero narzędzi. Wyjście: `intencja` z zamkniętej listy (~22: moj_plan, moje_treningi, moja_forma,
   moje_starty, moje_rekordy, moje_wyniki, moj_trener, odznaki, znajomi, osoby_z_miasta, osoba_wyniki, porownaj_osoby,
   impreza_info, biegi_nadchodzace, katalog_pojecie, gotowosc_na_start, nawigacja, akcja, zdrowie, porada_ogolna,
   siec_ogolna, nie_wiem), `sloty` {osoba, data, okres, miejsce, dystans, impreza} (teksty ≤ 60 zn.), `pewnosc` 0–1,
   `dopytac` bool, `kandydaci` (2–3 intencje do chipów). Router zostaje szybką ścieżką (dziś 30/74 = 40 % pytań, 0 tok.).
2. **Pamięć rozmowy** (`pamiec-rozmowy.mjs`): po stronie serwera, tabela `okienko_v2_rozmowa(athlete_id, kiedy, intencja,
   sloty jsonb)`, ostatnie 5 tur ≤ 30 min, zapis kluczem service, **bez zmian w kliencie** (klient i tak śle `historia`
   3 tur — v2 ją ignoruje poza B1). Scalanie: „a w grudniu?” = poprzednia intencja + nowy slot okres; „a on?” / „porównaj
   z nim” = slot osoba z poprzedniej tury (nadal przez B2).
3. **Dopytywanie**: `pewnosc < 0,6` lub `dopytac` → zdanie stałe + 2–4 chipy z `kandydaci` mapowanych na **stałe etykiety
   i pytania** (`CHIPY_INTENCJI` w kodzie — model nigdy nie pisze treści chipa). Wiele osób → „Którego X?” do 5
   (`osoba.mjs`, bez zmian). Chipy klient już rysuje (`json.chipy`, blizna-112).
4. **Łączenie narzędzi** (`plan.mjs`): **przepisy w kodzie, nie plany modelu**: `gotowosc_na_start` = moje_starty +
   moja_forma + moje_treningi(14 dni) [+ moje_rekordy], `porownaj_osoby` = osoba_wyniki × 2, `impreza_info` =
   impreza + biegi_nadchodzace. Maks 3 wywołania, `Promise.all`, każde z `waliduj`. Składanie (`sklad.mjs`): szablony
   deterministyczne dla przepisów prostych; dla złożonych jedno wywołanie modelu z wynikami narzędzi (jak dziś M1),
   strażnik B5 na wyjściu. Karty — z `odpowiedz.mjs` (bez zmian).
5. **Samosprawdzenie** (`samosprawdzenie.mjs`), deterministyczne, 0 tok.: (a) użyte narzędzia ⊆ przepis intencji,
   (b) strażnik cyfr przeszedł, (c) zdania niepuste i bez „nie wiem” + liczb jednocześnie, (d) intencja osobowa →
   odpowiedź nazywa rozstrzygniętą osobę, (e) intencja o okresie → wynik narzędzia obejmuje ten okres. Każde NIE →
   uczciwe `NIE_MAM` / „Nie wiem.” + chipy. Sędzia-model **tylko na ławce** (nie na prod — koszt i czas).
6. **Pętla uczenia**: kciuk 👍/👎 pod odpowiedzią → RPC `okienko_ocena(log_id, ocena)` (user pisze tylko własny wpis;
   zmiana w `js/okienko.js` → **po 8.11**), reakcje meta już logowane (`feedback: <poprzednie>`). Nocny raport:
   funkcja SQL `okienko_raport_nocny()` (pg_cron 03:30) agreguje do `okienko_v2_raport(dzien, n, zle, wg_intencji jsonb,
   przyklady text[])` — `przyklady` z maskowaniem imion/nazwisk słownikami (`_shared/imiona.mjs`, PESEL), bez athlete_id.
   `tools/okienko-raport.js` drukuje tydzień → kandydaci na blizny (ręcznie, jak dziś).
7. **Ewaluacja** (`tests/_lawka-v2.js`): 200 pytań = 96 z `_lawka-pytan.js` + ~60 realnych z `okienko_log`
   (zanonimizowane: nazwiska → słownikowe zamienniki, Filip przegląda listę PRZED commitem — blizna-101) + ~44 pułapki
   (zaimki po turze, dwie intencje w jednym, literówki, skróty, pytania o cudze dane). Każdy wiersz: `oczekiwane`
   {intencja, narzedzia, siec:false|true, maks_usd, maks_ms}. Dwa tryby: **atrapa** (nagrane odpowiedzi modelu w
   `tests/_nagrania-v2.json`, CI, 0 $) i **żywy** (ręcznie, budżet ≤ $1 na przebieg, z czasem). Próbka 30 do oceny Filipa.

## 2. Przełącznik (migracja `20261105_okienko_v2_przelacznik.sql`, do wykonania przez Filipa)

- `okienko_v2_konta(athlete_id uuid pk → athletes, od timestamptz, kto text)` — lista (Filip + konto testowe).
- `okienko_ustawienia(klucz text pk, wartosc text)` z wierszami `v2_wlaczone='true'`, `v2_dla_wszystkich='false'`.
- RPC `okienko_wersja() returns text` SECURITY DEFINER: `'v2'` gdy `v2_wlaczone` i (`v2_dla_wszystkich` lub athlete
  z `auth.uid()` na liście), inaczej `'v1'`; `revoke all from public, anon`, `grant execute to authenticated`; obie tabele
  bez grantów dla użytkowników (czyta tylko RPC). Asercje `do $$` + WYCOFANIE.
- **Powrót jednym przełącznikiem**: `update okienko_ustawienia set wartosc='false' where klucz='v2_wlaczone'` → wszyscy
  na v1 od następnego otwarcia okienka (klient pyta RPC raz przy otwarciu arkusza; błąd RPC = v1).
- Klient (`js/okienko.js`, ~8 linii): `wersja = await rpc('okienko_wersja')` → URL `/functions/v1/okienko` lub
  `/functions/v1/okienko-v2`; kształt odpowiedzi identyczny, reszta kodu bez zmian. **Jedyna decyzja terminowa**: ta
  zmiana musi wejść **przed czwartkiem 6.11 18:00** (z blizną) albo **po 8.11** — bez niej v2 nie da się włączyć z telefonu.

## 3. Koszt i opóźnienie (flash-lite 0,30 / 2,50 USD za 1 M tok., ceny z `model.mjs`)

| ścieżka | tokeny | USD/pytanie | czas (szac.) |
|---|---|---|---|
| router (B1, ~40 % pytań) | 0 | 0 | 0,1–0,3 s |
| klasyfikator + szablon (proste „o mnie”, ~35 %) | ~600/60 | **$0,0003** | 0,6–1,2 s |
| klasyfikator + model-proza (złożone, ~15 %) | ~600/60 + ~2000/100 | **$0,0012** | 1,5–2,3 s |
| sieć (≤ 20/dobę, bez zmian) | + grounding | $0,021 | 2–4 s |
| dziś (v1, flash) | 3261/77 | $0,0012 | niemierzone |

Miesięcznie (10 pytań/os./mies., 10 % sieci): **100 użytkowników ≈ $1 + $2 sieci ≈ $3; 500 ≈ $15**. Cel opóźnienia
**< 2 s dla 90 % pytań**: router + proste = ~75 % pytań poniżej 1,2 s; złożone na granicy — dlatego proza modelu tylko
dla przepisów złożonych, narzędzia równolegle, timeout klasyfikatora 1,5 s. Mierzymy kolumną `ms` od E2.

## 4. Awaria modelu / co wyłączamy

- Klasyfikator błąd/timeout → **ścieżka v1** (router → osoba → impreza → katalog → pamięć sieci) bez modelu; brak trafienia
  → chipy „Chodzi Ci o…?”. Log `tryb='v2-awaria'`.
- Trzy awarie z rzędu w 5 min → v2 sama zwraca `nagłówek X-Okienko-Wersja: v1` i klient do końca sesji woła v1
  (bez zapisu w bazie); globalnie: `v2_wlaczone=false`.
- Budżet 80 % → jak dziś (`budzet80`); 100 % → klasyfikator wyłączony, zostaje router + chipy.

## 5. Etapy (każdy: jeden commit, blizna, miara na ławce; v2 nie dotyka plików wspólnych 6.11 18:00–8.11)

| etap | co | miara „zrobione” |
|---|---|---|
| E0 (4–6.11, przed 18:00 albo po 8.11) | migracja przełącznika + RPC; `js/okienko.js` przełącznik; EF `okienko-v2` = ta sama ścieżka co v1 (import, bez nowej logiki) | Filip i konto testowe dostają z v2 odpowiedzi identyczne jak v1 (10 pytań), log w `okienko_v2_log` z `ms`; reszta kont na v1 |
| E1 (9.11) | ławka 200 + ocena obiektywna + atrapa nagrań | ławka chodzi w CI 0 $, raport dobra/zła/za droga per kategoria |
| E2 | `rozumienie.mjs` + log intencji | trafność intencji ≥ 90 % na ławce, p90 klasyfikatora < 1 s, $/pytanie ≤ $0,0005 |
| E3 | dopytywanie (pewność, chipy, „Którego X?”) | 0 odpowiedzi „z czapy” na pułapkach; każde niepewne → chipy |
| E4 | pamięć rozmowy (5 tur) | „a w grudniu?”, „a on?”, „porównaj z nim” — 20 par na ławce ≥ 90 % |
| E5 | przepisy ≤ 3 narzędzi + składanie | `gotowosc_na_start`, `porownaj_osoby`, `impreza_info` ≥ 90 %, p90 < 2,3 s |
| E6 | samosprawdzenie | 100 % niezgodnych odpowiedzi atrapy kończy się `NIE_MAM`, 0 fałszywych blokad na „dobrych” |
| E7 | kciuki + raport nocny + maskowanie | raport bez ani jednego nazwiska (test na słowniku), kciuki w logu |
| E8 (po 8.11, ławka ≥ 95 %, OK Filipa) | `v2_dla_wszystkich=true`, tydzień obserwacji, potem decyzja o kasacji v1 | 7 dni: 👎 ≤ 5 %, koszt w budżecie, p90 < 2 s |

## 6. Ryzyka

1. **Rozjazd v1/v2** — bramka „v2 nie kopiuje” + wspólne moduły; poprawki v1 wchodzą do v2 bez pracy.
2. **Klasyfikator „widzi” osobę tam, gdzie jej nie ma** — B2 jest niezależna od intencji; `intencja=osoba` bez
   trafienia B2 = chipy. Odwrotnie (nazwisko, a intencja inna) — B2 i tak blokuje sieć.
3. **Opóźnienie** — dwa wywołania modelu w jednym pytaniu tylko dla złożonych; szablony dla reszty.
4. **Koszt klasyfikatora przy spamie** — liczy się do 60/dobę; bramka „bez liter”/1 słowo (blizna-112) przed nim.
5. **Zamrożenie** — E0 albo przed czwartkiem 18:00, albo po 8.11; v2 w zamrożeniu rozwija tylko `okienko-v2/`, testy, docs.
6. **Dane osobowe w ławce** — realne pytania wchodzą do repo dopiero po maskowaniu i przeglądzie Filipa (blizna-101).

## Pytania do Filipa (OK = start E0)

1. E0 (przełącznik w `js/okienko.js`, ~8 linii + migracja) — **przed czwartkiem 18:00** (proponuję: środa 5.11) czy po 8.11?
2. Konto testowe na liście v2 — to z tokenu z 2.11 (dzień 6)? Podaj `athlete_id` albo e-mail, wpiszę do migracji jako insert.
3. Kciuki 👍/👎 — zmiana klienta po 8.11 (E7), zgoda?
4. Raport nocny: tabela + `tools/okienko-raport.js` (czytasz na żądanie) czy dodatkowo mail przez Resend?
5. Próg pewności 0,6 i limit 3 narzędzi w przepisie — zostawiamy, dostrajamy po E2 na ławce?

## Decyzje Filipa 3.11.2026 (noc) — projekt PRZYJĘTY, budowa od razu

- **E0 w środę 5.11, przed zamrożeniem** (migracja przełącznika + ~8 linii w `js/okienko.js` + EF `okienko-v2`, blizna-113) —
  Filip testuje v2 na swoim koncie w trakcie tygodnia; **konto testowe też na liście** (`okienko_v2_konta`: `56092926…` Filip,
  `9c2df65c…` konto testowe).
- **Kciuki 👍/👎 — po 8.11** (E7, zmiana klienta). Do tego czasu „złe” = reakcje meta z logu + samosprawdzenie.
- **Raport nocny złych odpowiedzi — tak, bez danych osobowych** (maskowanie słownikami imion/nazwisk, bez athlete_id).
- Progi i pozostałe: **wg rekomendacji z projektu** — pewność 0,6; ≤ 3 narzędzia w przepisie; raport = tabela
  `okienko_v2_raport` + `tools/okienko-raport.js` (mail nie); klasyfikator liczy się do 60/dobę; limity dzienne z
  `okienko_v2_log`, budżet miesięczny v1 + v2.
- **Etapy E1+ budowane od razu w `okienko-v2/`** (poza zamrożonymi plikami, bez zmian w `../okienko/` 6.11 18:00–8.11), **ławka po
  każdym etapie**; przełączenie wszystkich (`v2_dla_wszystkich`) po 8.11 przy ławce ≥ 95 % i OK Filipa; powrót jednym przełącznikiem.

Stan 3.11 (noc): E0 zbudowane lokalnie — migracja `20261105_okienko_v2_przelacznik.sql` (test po skutku `tools/okienko-v2-test.sh`,
z `OV2_Z_MIGRACJA=1` przechodzi na prod w transakcji z rollbackiem), EF `okienko-v2` **wdrożona** (nikt do niej nie trafia, dopóki
migracja nie wejdzie), `js/okienko.js` z przełącznikiem. Wykonanie migracji i push — Filip w środę 5.11.

## Stan budowy 4.11.2026 (noc z 3 na 4) — E0, E1, E2 zbudowane lokalnie

| etap | commit | co | miara |
|---|---|---|---|
| E0 | `eb4b049` | migracja przełącznika `20261105_okienko_v2_przelacznik.sql` (+WYCOFANIE, `tools/okienko-v2-test.sh`: 16/16 na prod w transakcji z rollbackiem), EF `okienko-v2` (ścieżka v1 z importów, log z `ms`), `js/okienko.js` wybiera wersję przez RPC, blizna-113 | identyczne odpowiedzi jak v1 dla kont z listy; **do wykonania przez Filipa 5.11**: migracja, push, deploy |
| E1 | `709e075` | `potok.mjs` (orkiestracja bez HTTP, zależności podmienialne), ławka v2 241 pytań z oczekiwanym śladem (`tests/_lawka-v2-pytania.js`), test CI `tests/lawka-v2.test.js` (regresja = czerwono, zamknięta luka bez zdjęcia znacznika = czerwono, prywatna para nigdy w sieci/modelu) | 176/241 = 73 %, 65 luk, 0 regresji; przy okazji 6 poprawek routera/osoby v1 („adres Jana Kowalskiego” szło do Google) |
| E2 | (ten commit) | `gemini.mjs` (jedno wywołanie JSON, timeout), `rozumienie.mjs` (28 intencji, sloty, pewność, kandydaci; model widzi tylko tekst + 3 poprzednie pytania z intencją), `intencje.mjs` (intencja → narzędzie v1 / stałe zdanie / katalog / impreza / osoba z B2 / porada bez sieci + dopisek / chipy z kodu), potok: limity → rozumienie → (fakt → sieć bez modelu) → model v1 jako awaria; katar/choroba = stały tekst w routerze (SZKIC do akceptacji), blizna-114 | **215/241 = 89,2 %**, 26 luk (E2: 8 — wszystkie „router chwyta przed klasyfikatorem”, E4: 7, E5: 11), 0 regresji |

⚠️ Uczciwie o liczbie 89 %: nagrania klasyfikatora (`tests/_nagrania-v2.json`, 55 pytań) są **napisane ręcznie** jako oczekiwany wynik
modelu — ławka w CI sprawdza, czy potok robi z intencją to, co trzeba (0 $), a NIE czy flash-lite tak klasyfikuje. Prawdziwą trafność
mierzy `node tests/_lawka-v2.js --zywy` z `GEMINI_API_KEY` w env (~55 wywołań ≈ $0,02): nadpisuje nagrania prawdziwymi odpowiedziami
i wtedy ławka pokazuje rozjazdy modelu. Do zrobienia przez Filipa (klucz jest tylko w sekretach Supabase) albo po 8.11 przez EF testową.

Pozostałe luki E2 (8) to pytania, które router v1 łapie zbyt szeroko PRZED klasyfikatorem („ile km ma maraton” → MOJE treningi,
„co na śniadanie przed biegiem” → biegi w mieście „Sniadanie”, „kiedy ostatnio biegałem” → biegi nadchodzące) — naprawa w routerze
v1, po zamrożeniu (8.11), albo w v2 przez odwrócenie kolejności dla wąskiej listy wzorców.

## Backlog PO 8.11 — etap „dostawcy” (Filip 4.11)

Warstwa dostawcy modelu w `okienko-v2` (`gemini` | `anthropic`), wybór **per rola** (rozumienie / odpowiedź / sieć) z tabeli
`okienko_ustawienia` (klucze `dostawca_rozumienie`, `dostawca_odpowiedz`, `dostawca_siec`), nie z kodu. Anthropic: Haiku, klucz
`ANTHROPIC_API_KEY` w secrets (ustawia Filip). Ławka `--zywy` na obu dostawcach: trafność intencji, % „z czapy”, czas p90, koszt na
pytanie i miesięcznie przy 100/500 osobach → tabela porównawcza do decyzji Filipa. Twarde bramki prywatności identyczne dla obu
(blizna: żaden dostawca nie dostaje prywatnego nazwiska — B2 jest NAD dostawcą). Sieć na żywo zostaje na Gemini + Google, chyba że
ławka pokaże inaczej. Punkt zaczepienia: `gemini.mjs` → `dostawca.mjs` z tym samym kontraktem `generujJson({system, contents, schema})`.

## Stan 4.11.2026 — E4, E5, E6 zbudowane (po push/migracji/deployu E0 przez Filipa)

| etap | co | miara |
|---|---|---|
| E4 | `rozmowa.mjs`: pamięć rozmowy w `okienko_v2_rozmowa` (TYLKO intencja + sloty, ≤ 5 tur ≤ 30 min; pisze/czyta EF); tura po routerze (narzędzie → intencja/sloty), po osobie, imprezie i po udanej odpowiedzi v2 (nie po dopytaniu); kontynuacja („a w grudniu?”, „a on?”, „porównaj z nim”) omija bramkę „niepewne”, klasyfikator dostaje kontekst z intencji/slotów (nie z treści), brakujące sloty dziedziczą (okres nigdy) | 6/7 zaimków po turze na ławce (zostaje „a on?” po liście znajomych — pamięć nie zna, o którego znajomego chodzi) |
| E5 | `przepisy.mjs`: przepisy W KODZIE — gotowosc (starty + forma + 14 dni + rekord, równolegle; także z routera „jakie szanse na życiówkę”, 0 tokenów), najdluzszy (maksimum z listy 90 dni), porownaj (osoba z pamięci rozmowy, B2 nadal, + moje_wyniki); zdania składane z odpowiedzi narzędzi, model nie pisze prozy | 4 wiersze E5 zamknięte; zostaje 6 (kalorie/produkt — brak narzędzia; rywal; dwie intencje w jednym; wyniki imprezy z F6) |
| E6 | `samosprawdzenie.mjs`: narzędzia ⊆ intencji, zdania niepuste, liczby tylko z narzędzi (strażnik v1), okres/dzień objęty argumentami, osoba nazwana w odpowiedzi; NIE → „Nie mam tego w Twoich danych.” + chipy, `okienko_v2_log.samosprawdzenie=false` z powodem | każda odpowiedź v2 z narzędzi przechodzi przez sprawdzenie (blizna-115); pierwszy złapany błąd: „Ostatnie 14 dni” w zdaniu przepisu — 14 nie było w wynikach → zdanie przepisane na datę z narzędzia |

Ławka v2: **225/241 = 93,4 %**, 16 znanych luk (E2: 8 — router v1 za szeroki, naprawa po 8.11; E4: 1; E5: 6; reszta: brak narzędzi),
0 regresji. Do 95 % brakuje 4 pytań — najtańsze: 8 wierszy „router za szeroki” (zmiana wzorców `ile km`, `kiedy ostatnio`, `co na
śniadanie` w `router.mjs` po zamrożeniu). ⚠️ nagrania klasyfikatora nadal ręczne (`--zywy` do zmierzenia prawdziwej trafności).

## KOREKTA KURSU — 3.11 15:25 (Filip: „z sesji na sesję się cofamy; googlowskie było najbardziej doinformowane”)

Przykłady: „kim jest Filip” → nic; „ile kcal ma banan” → nic; porada → „słuchaj swojego ciała”. Decyzje i stan (blizna-122):

1. **Wiedza ogólna z sieci** — COFNIĘTE „porada = model bez sieci” (E2). Intencje `porada` / `fakt` / `zywienie` / `sprzet` → Gemini
   z googleSearch (ten sam `../okienko/siec.mjs`, teraz z opcjonalnym promptem i limitem tokenów; v1 woła bez nich — bez zmian) z promptem
   NA KONKRET (`okienko-v2/wiedza.mjs`): liczby, zakresy, kroki; 3–5 zdań; źródła. Bramka prywatności (`blokadaSieci`, odmowa, fabian*)
   BEZ ZMIAN — nazwisko w pytaniu nadal idzie ścieżką v1, nigdy do Google.
2. **„O nas”** — `_shared/o-nas.mjs` (⚠️ SZKIC do zatwierdzenia przez Filipa; tylko jego słowa z 3.11 + fakty z kodu): Filip (założyciel,
   trener, reprezentant Polski na 100 km IAU), Kasia (współtrenerka, ultraska), czym jest BiegaMy, funkcje i gdzie są, Radio, jak zostać
   podopiecznym. „kim jest Filip/Kasia/twórca”, „co to biegamy”, „kto stoi za aplikacją” → odpowiedź z pliku, 0 tokenów, w potoku PRZED
   bramką osób. Pojedyncze słowo („filip”, „kasia”) i „gdzie jest radio” zostają w dotychczasowych ścieżkach (chipy / katalog).
3. **Produkt / kalorie** — `okienko-v2/produkt.mjs`: „ile kcal ma banan” → `food_database` (Jedzenie; dokładna nazwa → początek →
   gdziekolwiek, odmiana → rdzeń) → „Banan: 100 g to 89 kcal — białko 1,1 g, węglowodany 22,8 g, tłuszcz 0,3 g.” 0 tokenów, przed siecią,
   także gdy klasyfikator powie „fakt”. Brak w bazie → sieć.
4. **Strażnik ogólników** — odpowiedź z sieci bez konkretu (ani liczby, ani kroków) → JEDNO ponowienie z instrukcją „podaj liczby/kroki”;
   nadal ogólnik → zdania-wytrychy („słuchaj swojego ciała”, „każdy organizm jest inny”, „to zależy od wielu czynników”…) wycięte, krócej,
   źródła zostają; log `ok=false` z powodem. Tylko porada/żywienie/sprzęt (fakt bez strażnika: „wygrał X” bez cyfr to nie ogólnik).
   Zdrowie (choroba, kontuzja) bez zmian — stałe teksty.
5. **Test A/B** — `tools/okienko-ab.mjs` + `tools/okienko-ab-pytania.json` (30: 12 Filipa z logu + 18 typowych). Uruchamia FILIP własną sesją:
   `OKIENKO_EMAIL=… OKIENKO_HASLO=… node tools/okienko-ab.mjs` → `Downloads\biegamy-podglady\okienko-ab-<data>.html` (v1 i v2 obok siebie,
   wybór przy każdym, podsumowanie + wycieki = pytanie o osobę prywatną z odpowiedzią z sieci). Limit sieci 20/dobę na wersję — drugi
   przebieg nazajutrz scala (`--wersja v2`). v2 dla wszystkich dopiero przy ≥ 80 % i 0 wycieków.

Ławka po korekcie: 240/255 = 94,1 % (cel 95 %), 15 luk, 0 regresji. Nowe intencje klasyfikatora: `zywienie`, `sprzet`, `o_nas`; slot `produkt`.
Nagrania ręczne (nie z modelu) w `_nagrania-v2.json`: klucz `_recznie_3_11`. Wdrożenie: tylko `okienko-v2` (stare okienko bez zmian;
`siec.mjs` ma nowe parametry opcjonalne, v1 bez redeployu zachowuje się tak samo).
