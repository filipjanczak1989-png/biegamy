# Wyniki i okładki — zwiad i poprawki (3.11.2026, gałąź wyniki/poprawki-2026-11-03, do OK Filipa)

## 1. „Otwórz wyniki” prowadziło do kalendarza — NAPRAWIONE (blizna-134)

Zwiad wszystkich linków do wyników (Okienko, Profil, kalendarz, karta imprezy, Dziś, trener):
- **jedyny zły**: karta wyników w Okienku (`js/okienko.js` `kartaWynikow`) — przycisk miał cel `EKRANY.starty` = `races.html` (kalendarz startów);
- `races.html` „Wyniki zawodników” → `wyniki.html` — dobrze; Profil, Dziś, kalendarz, trener — nie mają linków do Wyników;
- ekran imprezy w Wynikach (`#/impreza/<klucz>/<rok>`) jeszcze nie istnieje („etap 3, czeka na kolektor” w `wyniki.html`), więc nie ma czego linkować.

Format adresów w `wyniki.html` to `#/zawodnik/<klucz>` (nie `#osoba/…`) i `#/impreza/<klucz>/<rok>`. Poprawka: EF przekazuje klucz zawodnika
z maszyny do karty (`osoba.mjs` `podsumujWyniki` → `klucz`; „moje wyniki” z zapamiętanym `f6_runner_key`), Okienko otwiera
`wyniki.html#/zawodnik/<klucz zakodowany>`, bez klucza — wyszukiwarkę Wyników; `bezpiecznyCel` przepuszcza tylko ten kształt.
Blizna sprawdza każdy link „wyniki” w stronach i skryptach oraz to, że Wyniki parsują adres z Okienka do tego samego klucza.

## 2. Okładki Gemini nie generują się — PRZYCZYNA i poprawka (blizna-135)

| sprawdzone 3.11 ~19:30 | stan |
|---|---|
| EF `okladki-imprez` | wdrożona (v4, 12:17) |
| cron `okladki-imprez-noc` (02:40 UTC) | istnieje (jobid 34, aktywny), **ani jednego przebiegu** w `cron.job_run_details` — założony dziś po 02:40, pierwszy przebieg w nocy 3/4.11 |
| sekret `GEMINI_API_KEY` | jest |
| sekrety `F6_KONTO_EMAIL`, `F6_KONTO_HASLO` | **BRAK** (lista sekretów Supabase nie ma żadnego `F6_*`) |
| `okladki_log` | **0 wierszy** — nikt jeszcze nie generował; błąd przycisku trenera nie był logowany |
| okładki imprez z maszyny (`imprezy_okladki`) | **0** |
| nasze zawody z okładką (`races.cover_url`) | 7 z 80 |

Przyczyna: bez konta serwisowego F6 nocny automat skończy dziś w nocy błędem „brak konta F6” (wpis w `okladki_log`), a przycisk trenera
„Nowa okładka (Gemini)” dla imprezy z maszyny też szukał jej danych kontem serwisowym → 502 przy każdej imprezie (żadna nie ma jeszcze
wiersza w `imprezy_okladki`).

Poprawka w kodzie: przycisk trenera szuka imprezy w maszynie **własnym tokenem trenera** (maszyna przyjmuje każdy zalogowany token) —
działa bez konta serwisowego; błąd listy trafia do `okladki_log`. Przyciski na karcie imprezy (i naszych zawodów): **„✨ Wygeneruj okładkę”**
obok **„📷 Zmień zdjęcie”**. Jedna impreza na żądanie, limit 20 dziennie (wspólny z `race-image`), prompt z danych serwera: bez twarzy
(sylwetki z daleka, od tyłu), bez tekstu, numerów, logotypów, logo organizatora i nazwy wydarzenia na obrazie.

Do zrobienia przez Filipa (noc potrzebuje konta serwisowego):
1. Supabase → Edge Functions → Secrets: `F6_KONTO_EMAIL` = e-mail konta testowego, `F6_KONTO_HASLO` = jego hasło.
2. `supabase functions deploy okladki-imprez --use-api` (poprawka trenera).
3. Odpalenie nocy od razu, bez czekania do 02:40 (SQL, wykonuje to samo co cron):
   ```sql
   do $$ begin execute (select command from cron.job where jobname = 'okladki-imprez-noc'); end $$;
   ```
4. Po minucie kontrola:
   ```sql
   select kiedy, rodzaj, ok, blad from okladki_log order by kiedy desc limit 10;
   select count(*) from imprezy_okladki;
   ```

## 3–4. Karta zawodnika „jak manager” — co da się dziś zbudować z danych maszyny

`runner_results` daje: bieg, datę, miasto biegu, dystans, czas, miejsce open, miejsce w kategorii, kategorię, link do wyników, zakres
(prywatny/publiczny). `search_runners`: imię i nazwisko, rocznik, liczbę wyników, ostatni bieg i miasto ostatniego biegu.

| element karty (pkt 3–4) | dane | stan |
|---|---|---|
| nagłówek: imię, rocznik | search_runners | ✅ |
| klub, miasto zawodnika | ❌ maszyna nie oddaje (jest tylko miasto biegu) | wymaga kolumn w maszynie (kolektor) — do tego czasu „miasto: najczęstsze miasto startów” jako przybliżenie albo pomijamy |
| PB 5/10/21/42/ultra | runner_results (`BM_WYNIKI.rekordy`, ±3 %) | ✅ (ultra = najdłuższy > 42,2 km) |
| forma: 5 ostatnich startów jako kropki vs średnia | runner_results + ekwiwalent 10 km z `js/riegel.js` | ✅ |
| tabela startów sortowana kliknięciem (data, bieg, dystans, czas, miejsce open/kat.) | runner_results | ✅ (dziś jest tabela bez sortowania i bez kategorii) |
| wykres czasów na wybranym dystansie po latach | runner_results | ✅ (dziś trend tylko jako ekwiwalent 10 km) |
| ranking w mieście / województwie na dystansie | ❌ | wymaga RPC w maszynie (np. `ranking_dystansu(p_miasto|p_woj, p_km, p_rok)`) |
| avatar tylko, gdy osoba jest w BiegaMy i sama wgrała zdjęcie; inaczej inicjały | `athletes.f6_runner_key` (wybór zawodnika) + `avatar_url` + `is_public` | ✅ po naszej stronie (RPC: klucz → publiczny profil, bez danych prywatnych) |
| odznaki tylko przy publicznym profilu BiegaMy | jw. | ✅ |
| sezon: starty w roku, km startowe, podia, progres rok do roku na głównym dystansie | runner_results | ✅ |
| najbliższy start z „Wezmę udział” | tylko gdy osoba ma konto i publiczne starty (`race_signups`) | ✅ dla kont BiegaMy; dla reszty brak |
| head-to-head z oglądającym | `BM_WYNIKI.wspolneStarty` + klucz oglądającego (`f6_runner_key`) | ✅ |
| 3 rywale o najbliższych wynikach | ❌ | wymaga RPC w maszynie (wyszukanie po czasie na dystansie) |
| prognoza z `js/riegel.js` | rekordy | ✅ (zakres 1,06–1,15 jak karta Forma) |
| ulubiony bieg | najczęstsza impreza w runner_results | ✅ |
| wynik zgłoszony = niepotwierdzony | `wyniki_zgloszone` (już jest) | ✅ |

**Zrzut karty z danymi Damiana**: maszyna nie wpuszcza zapytań bez zalogowanej sesji (`401 Anonymous access is disabled`), a ja nie mam
sesji. Dlatego najpierw `tools/f6-zwiad.mjs` (uruchamia Filip): pobiera wyniki Damiana do pliku poza repo, z którego zrobię zrzut karty.

## 5. Wyszukiwanie i brakujące źródła — zwiad do OK

- **„Nie znalazłem <imię nazwisko>. Podobni: …”** — dziś Okienko pokazuje najlepsze dopasowanie `search_runners` jako trafienie, nawet przy
  innym imieniu (kandydaci „prawdopodobni”). Propozycja: trafienie tylko przy zgodnym imieniu i nazwisku (po normalizacji, z odmianą),
  inaczej zdanie „Nie znalazłem …” + lista podobnych jako chipy (do kliknięcia, nie jako odpowiedź).
- **Źródła wyników**: listę źródeł maszyny (firmy pomiaru czasu, strony wyników) i braki dla Mateusza Janczaka da `tools/f6-zwiad.mjs`
  (`erasure_preview` oddaje źródło każdego wyniku; `--biegi` sprawdza, czy maszyna w ogóle zna dane biegi). NIE szukamy nazwisk
  w zewnętrznych bazach.
- Propozycja do OK po zwiadzie: import CAŁYCH list wyników z brakujących źródeł (kolektor po stronie maszyny) + przycisk
  „Brakuje mojego biegu?” (nazwa albo link do wyników → kolejka w maszynie, jak `event_propose`, limit dzienny) + w privacy.html zdanie
  o źródłach wyników i link „usuń moje wyniki z BiegaMy” (ścieżka `usun-dane.html` już istnieje — erasure_preview + wniosek).

Komenda zwiadu (Filip):
```
OKIENKO_EMAIL=… OKIENKO_HASLO=… node tools/f6-zwiad.mjs --osoby "Damian Bolewski;Mateusz Janczak" --biegi "<biegi Mateusza, których brakuje>"
```
