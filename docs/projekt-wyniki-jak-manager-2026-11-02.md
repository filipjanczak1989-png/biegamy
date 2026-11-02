# Wyniki „jak manager" (A) i wynik zgłoszony przez zawodnika (B) — ZWIAD → PROJEKT (2.11.2026)

> **Status:** projekt, ZERO kodu, STOP przed kodem. Czeka na OK Filipa. Wdrożenie **po 8.11** (pierwszeństwo ma plan F).
> **Źródło:** repo `biegamy` na `main` (`a1c0c59`, 2.11.2026), tylko odczyt. Maszyna wyników F6 (serwer `api.biegamy.run`,
> Caddy, PostgREST, funkcje SQL 012/017/018) i kolektory żyją w osobnym repo `biegamy-collector` — tu są wyłącznie ich
> odwołania (klient, EF okienka, spec, testy). Wszystko, czego nie widać z tego repo (kolumny tabel F6, limity serwera,
> wielkości, plan indeksów, treść Caddyfile), oznaczam **„nie do ustalenia z repo"**. Żadnej liczby z bazy ani serwera
> nie mierzyłem — bez połączeń z produkcją.

---

## 1. Co jest dziś

### 1.1 RPC maszyny wyników (F6) — wszystko, co widać z repo

Jedyny klient w przeglądarce: `js/wyniki-api.js` (`RPC_DOZWOLONE`, 11 nazw — ta sama lista ma być w Caddy
`caddy-f6-api.caddy @dozwolone` i w `f6.bramka`; pilnuje `tests/blizna-53-api-wynikow-za-flaga.test.js`). W EF: `supabase/functions/okienko/f6.mjs`
(pamięć izolatu) i `supabase/functions/impreza-zglos/zglos.mjs` (jedyny zapis do maszyny).

| RPC | argumenty (jak wołane w kodzie) | zwraca (kolumny, które kod czyta) | limity / uwagi | kto woła |
|---|---|---|---|---|
| `search_runners` | `{q}` (widżet, usun-dane), `{q, lim}` (okienko: 3 i 10) | `runner_key`, `display_name`, `yob`, `results_count`, `last_city`, `last_event`, `probable` | grupuje po `runner_key`; `probable=true` = część wyników dopięta po nazwisku i roczniku (reguła `name_yob_unique`); dopasowuje po tokenach (rdzenie „katarz chojnack" trafiają); SECURITY INVOKER, tylko `authenticated` (komentarz w widżecie). Domyślny `lim` bez argumentu: **nie do ustalenia z repo** | `wyszukiwarka-wynikow.js:113`, `usun-dane.js:265`, `osoba.mjs:143`, `moje.mjs:56` |
| `runner_results` | `{p_runner_key}` | `event_name`, `event_date`, `event_city`, `distance_km`, `time_seconds`, `position_total`, `position_category`, `category`, `result_url`, `scope` (`'private'` → „🔒 tylko Ty") | kolejność: najnowsze pierwsze (okienko bierze `w[0]` jako ostatni start); liczba wierszy: **nie do ustalenia** (`moje.mjs` tnie do 300 po swojej stronie). **Brak:** identyfikatora imprezy/edycji, `result_id`, płci i miejsca wg płci, liczby ukończonych, źródła | widżet `:131`, `osoba.mjs:151`, `moje.mjs:50,63` |
| `upcoming_races` | `{p_from, p_to, lim:300}` (+ `p_q` rdzeń przy ucięciu) | `group_key`, `name`, `event_date`, `city`, `distances[]`, `source_url`, `status`, `klucz`, `dokladnosc_daty` | `p_q` = podciąg nazwy/miasta; pełne 300 = „uciete"; `status` ∈ `zgloszona\|potwierdzona\|null` | `sb.js IMPREZY.szukaj:460`, `biegi.mjs:42` |
| `events_search` (K-API 017) | `{p_q, p_from?, p_to?, p_limit ≤ 20}` | `klucz`, `nazwa`, `data`, `miejscowosc`, `dystanse`, `url_zapisy`, `url_organizer`, `url_regulamin`, `url_zrodlo_strony`, `status`, `przeszla`; `dokladnosc_daty` = null | bez słów zapytania zwraca pustkę; rdzenie i `klucz_szukania` po stronie bazy (blizna-79); `Cache-Control: private, max-age=3600` (spec); także edycje przeszłe | `sb.js:442,459`, `kalendarz.mjs:55` |
| `event_propose` (018) | `{p_nazwa, p_data, p_miejscowosc}` | `klucz`, `istniala`, `status`, `nazwa`, `data` | 5/dobę/konto (hash z tokenu `prywatne.konto()`), dedup data ±1 + nazwa bez cyfr; **świadomie POZA `RPC_DOZWOLONE`** — tylko przez EF `impreza-zglos` (biała lista 3 pól) | `zglos.mjs:31` |
| `event_hide` (018) | `{p_klucz}` (tylko `zgloszenie:<uuid>`) | — (kod sprawdza tylko `error`) | tylko konto z listy hashy `prywatne.trenerzy` po stronie F6 (403 inaczej); Caddy strefa `na_zapis` 10/min/token (spec) | `races.html:599` |
| `event_course_status` | — | — | **na białej liście, 0 użyć w UI**; argumenty i wynik **nie do ustalenia z repo** | nikt |
| `erasure_preview` | `{p_runner_key}` | `result_id`, `event_name`, `event_date`, `distance_km`, `time_seconds`, `source`, `ma_id_zrodla`, `dopasowanie` | sam odczyt | `usun-dane.js:331` |
| `erasure_request` | `{p_result_ids uuid[1..200], p_blokuj_nazwisko}` | id wniosku | wymaga świeżego logowania OTP/magiclink ≤ 15 min (PT403); komunikaty tylko z funkcji 012 (`PT4xx`) | `usun-dane.js:375` |
| `erasure_confirm` / `erasure_cancel` | `{p_id}` | stan (`ukryte\|wstrzymane\|wygasle\|cofniete`) | ukrycie od razu, kasowanie po 30 dniach | `usun-dane.js` |
| `erasure_status` | `{}` | ≤ 20 wniosków: `id`, `stan`, `utworzono`, `ukryto`, `kasowanie_od`, `wierszy` | | `usun-dane.js:280` |

**Transport i limity (z kodu i spec, nie z serwera):**
- Klient przeglądarkowy: `POST https://api.biegamy.run/rpc/<nazwa>`, token Supabase **PROD** wyłącznie w nagłówku (TEST nigdy — `BM_SRODOWISKO`),
  `credentials:'omit'`, `cache:'no-store'`, `redirect:'error'`, timeout **15 s**, 401 → jedno `refreshSession()` i ponowienie;
  kody: `wylaczone`, `srodowisko`, `nieznane_rpc`, `brak_sesji`, `offline`, `siec`, `timeout`, `zle_dane`(400), `nieautoryzowany`(401),
  `odmowa`(403), `brak`(404), `za_duze`(413), `limit`(429, `retryAfter` z `Retry-After`), `serwer`(5xx).
- EF (`f6.mjs`): timeout **8 s**, 429 → `BladF6('limit')` → „Maszyna wyników jest teraz zajęta — spróbuj za chwilę."; pamięć WSPÓLNA
  w izolacie: klucz = RPC + argumenty, **10 min, ≤ 500 wpisów** (znika przy zimnym starcie).
- Caddy (wg `docs/okienko-spec.md:76,304`, decyzja B2 z 1.11): **300/min na IP + 60/min na nagłówek Authorization**; strefa `na_zapis`
  10/min/token dla `event_propose`/`event_hide`; CORS tylko `https://biegamy.run` (+ drugi origin, LEKCJE #27). **Treść Caddyfile
  nie do ustalenia z repo.** Anonim → 401 `PGRST302` (`docs/kalendarz-jedna-lista-projekt.md:4`).
- Service Worker **nie przechwytuje** `api.biegamy.run` (brak dopasowanej gałęzi w `sw.js`, potwierdzone w przeglądzie B) — każde
  wywołanie idzie w sieć; `js/wyniki-api.js` i `js/tekst.mjs` są w precache (`sw.js:93,100`).
- Jak dziś obsługiwane 429: widżet → „Za dużo wyszukiwań – odczekaj minutę" (albo „za godzinę" przy `Retry-After ≥ 3600`),
  usun-dane → komunikat z PT429 albo jw., okienko → zdanie o zajętej maszynie (reszta odpowiedzi zostaje), `IMPREZY` → sekcja znika
  (błąd nie wchodzi do pamięci sesji). Nigdzie nie ma **ponowienia** ani **wyłącznika** (circuit breaker) po 429.

### 1.2 Klient i ekrany

| gdzie | co robi | czego NIE ma |
|---|---|---|
| `races.html` `<details id="wyniki-szukaj-sekcja">` + `js/wyszukiwarka-wynikow.js` | pole (≥ 3 znaki, debounce 350 ms) → `search_runners` → lista kandydatów (rocznik, N wyników, ostatnie miasto/bieg, „prawdopodobnie") → tap → `runner_results` → tabela Data / Zawody (link `result_url` przez `safeExternalHref`) / Dyst. / Czas / Tempo / Miejsce (open + kat.); `scope='private'` → „🔒 tylko Ty"; stopka „Usuń moje dane". Wszystko przez `textContent`, zero `innerHTML` | URL stanu, wstecz (każde szukanie kasuje szczegóły), klik w zawody, rekordy, trend, edycje, porównanie, **jakakolwiek pamięć** (każdy tap = RPC) |
| okienko (EF `okienko`, `osoba.mjs`, `moje.mjs`, `js/okienko.js`) | tryb osoby: `search_runners` ≤ 3 + `runner_results` dla najlepszego → karta „N startów · ostatni · najlepszy czas na dystansie ostatniego startu" + 5 ostatnich + „Otwórz wyniki" (→ `races.html`); `moje_wyniki`: `athletes.f6_runner_key` albo szukanie po `full_name` + rocznik → jeden = karta, kilku = „Który to Ty?" (→ RPC `ustaw_f6_runner_key`); `rekordyZWynikow` = najlepszy czas na 5/10/21,1/42,2 km ±3 %; reguła publiczności sportowej: ≥ 30 startów / Mistrzostwa Polski / podium OPEN | karta nie jest klikalna w głąb (otwiera tylko wyszukiwarkę od zera) |
| `usun-dane.html` + `js/usun-dane.js` | pełny obieg wniosku o ukrycie (OTP, podgląd, blokada nazwisko+rocznik 3 lata) | — |
| K4/K5 (`sb.js IMPREZY`, `races.html` „W Polsce", modale celu) | kalendarz imprez maszyny, powiązanie celu kluczem `impreza_klucz`, zgłoszenie brakującej imprezy | wyniki imprezy, klik z imprezy do wyników |
| nawigacja między stronami | `@view-transition { navigation: auto }` w `theme.css` + handlery `pageswap`/`pagereveal` w `sb.js` (`tests/view-transitions.test.js`) — przejścia między DOKUMENTAMI są płynne | **żadna strona nie używa hash-routingu ani `pushState`** — `history.replaceState` tylko do czyszczenia parametrów (`zawodnik.html`, `index.html`, `nutrition.html`, `raporty.html`); stan filtrów w `races.html` nie przeżywa odświeżenia (przegląd B) |

### 1.3 Dane w naszej bazie (Supabase BiegaMy)

- **`athletes.f6_runner_key`** `text` (migracja `20261101_f6_runner_key.sql`): CHECK `^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$`,
  zapis **wyłącznie** przez RPC `ustaw_f6_runner_key(p_key)` (SECURITY DEFINER, `auth.uid()`), wyzwalacz `athletes_f6_klucz_tylko_rpc`
  (zmiana poza RPC → 42501), `GRANT SELECT (f6_runner_key)` dla `authenticated`. Powiązanie profil ↔ maszyna jest więc **decyzją zawodnika**
  („To ja"), nigdy automatem. Odczyt cudzego klucza idzie przez RLS `athletes_read_public` (`is_public = true` i zalogowany) albo
  `athletes_read_by_coach`.
  ⚠️ **Klucz `k:<nazwisko>|<rocznik>`** (wiersze bez id ze źródła — widoczny w `tests/wyszukiwarka-wynikow.test.js:58`) ma spację i `|`,
  więc **nie przechodzi** przez CHECK ani `RE_KLUCZ` w `moje.mjs:16` i `js/okienko.js` — „Który to Ty?" odfiltrowuje takie osoby
  (`moje.mjs:61`), a `ustaw_f6_runner_key` odrzuciłby je (22023). Ilu biegaczy ma taki klucz: nie do ustalenia z repo.
- **`athletes.pb_5k/pb_10k/pb_half/pb_marathon`** `text` + `pb_*_year smallint` — ręczne życiówki, rok nie data, bez nazwy biegu.
  Walidator SSOT `window.walidujPB` (`sb.js:1023`): kształt `m:ss`/`h:mm:ss`, podłoga = rekord świata (`_PB_DYST.rek`: 750 / 1560 / 3420 / 7200 s),
  ostrzeżenie (nie błąd) powyżej 600 s/km. Nic nie aktualizuje PB automatycznie; `window.PRS` i `prs.html` to ekran gratulacji, nie silnik.
- **`athletes.race_goals`** `text` z JSON-em (`sb.js:3824`): `[{name, date, race_id|null, proposed_race_id?, impreza_klucz?, miejscowosc?,
  distance_km?}]`; `goal`/`target_date` = pierwszy cel; odczyt `czytajRaceGoals` (odmowa zapisu przy uszkodzeniu), zapis `serializeRaceGoals`;
  14 miejsc zapisu, „ostatni wygrywa" między stronami (zaległość w pamięci), bez CHECK i triggera. Widok `public_athletes` (anon) oddaje
  `race_goals` publicznych.
- **`races`** (`supabase/schema/rls/races.txt` + kod): `name, date, city, voivodeship|region, distance_km` (JEDEN), `url_regulamin, url_organizer,
  description, status pending|approved|rejected, added_by, signup_count, cover_url, cover_9x16_url`. Brak `impreza_klucz`. RLS: zalogowani czytają
  `approved`, własne `pending`, trener wszystko.
- **`race_signups`**: **tylko** `(id, race_id, athlete_id, created_at)`. RLS: własny INSERT/SELECT/DELETE, `signups_coach_read` (trener widzi
  zapisy **wszystkich**, nie tylko swoich — nagrobek w `races.html:770`), UPDATE **zdjęty 9.10** (`20261009_revoke_update_race_signups.sql`,
  upsert `ignoreDuplicates`). Trigger `update_race_signup_count` (SECURITY DEFINER).
- **`training_logs`**: `training_type` `'Start'`/`'Wyścig'` + `casual_effort boolean` (znacznik „treningowo", `tests/znacznik-startu.test.js`);
  **brak `race_id`**. Pamięć z 16.08 (`project_zaleglosc_wyniki_startow_petla_nie_zamknieta`) — potwierdzone dziś grepem: **`race_results`
  nie istnieje, `is_race` nie istnieje, nie ma gdzie zapisać wyniku startu**. To jest dokładnie luka, którą zamyka B.
- **`delete_my_account`** kasuje `race_signups` po `athlete_id` — każda nowa tabela z `athlete_id` musi dojść do tej listy (LEKCJE: prawda
  jest w różnicy listy FK i ciała funkcji). Pomocniki: `auth_my_athlete_id()` (STABLE, SECURITY DEFINER), `auth_is_coach()`.
- Wzorzec „trener zmienia tylko swoje pola": `training_logs_guard_coach_fields` (trigger, 42501 z listą odrzuconych kolumn) — do skopiowania
  dla kolumn systemowych nowej tabeli.
- Riegel 1,06 stoi w **trzech kopiach**: `zawodnik.html:5098` (`K_DOLNA`), `js/generator-planu.js:325`, testy. Wykładnik indywidualny
  **odrzucony** 16.08 (pamięć). Trend formy z wyników (A) będzie czwartym konsumentem — do decyzji, czy wynieść do `js/`.

### 1.4 Testy, które dziś pilnują tej okolicy

`wyniki-api.test.js`, `wyszukiwarka-wynikow.test.js`, `usun-dane.test.js`, `blizna-53` (lista RPC = Caddy), `blizna-54` (sekcja wyników z
prawdziwym `sb`), `blizna-63` (XSS linki `result_url`), `blizna-67/80/81/82/107` (tryb osoby, prywatność nazwisk), `blizna-73/74/77/89`
(kalendarz, imprezy), `blizna-78` (`f6_runner_key`, „Który to Ty?", migracja), `blizna-87` (K5). Każda zmiana `RPC_DOZWOLONE` = zmiana
`blizna-53` **i** Caddy **i** `f6.bramka` (dwa ostatnie poza repo).

---

## 2. A. Wyniki jak manager — projekt

### 2.1 Gdzie to żyje: nowa strona `wyniki.html`, nie rozbudowa `<details>` w `races.html`

- `races.html` ma już dwie listy, hero, formularz, modal uczestników (~1 900 linii) i żadnego routingu. „Manager" to własny ekran ze stosem.
- Jeden dokument + **hash-routing** (`#/…`) + `history.pushState` → stos „wstecz" za darmo: systemowy przycisk Android, swipe iOS, `popstate`.
  Hash **nie wychodzi do serwera** (GitHub Pages nie loguje fragmentu) — to argument prywatności, nie tylko wygody.
- Wejścia: `races.html` (sekcja „Wyniki zawodników" → link do `wyniki.html`, widżet zostaje jako `#/` tej strony), okienko („Otwórz wyniki" →
  `wyniki.html#/zawodnik/<klucz>` zamiast `races.html` — zmiana w `EKRANY`, dwie kopie pod blizna-65/76), profil (`f6_runner_key` ustawiony →
  „Moje wyniki"). Przejścia między dokumentami są płynne dzięki VT (`navigation: auto`), więc wejście i wyjście nie zgrzyta.
- Strona wymaga sesji (jak `races.html`), bo F6 odrzuca anonima (401). Precache w SW jak inne strony; offline → `bmStanOffline` (blizna-49).

### 2.2 Ekrany, URL stanu, przejścia

| URL | ekran | przejścia |
|---|---|---|
| `#/` | szukaj (dzisiejszy widżet 1:1), „Moje wyniki" (gdy `f6_runner_key`), ostatnio oglądani **tylko w pamięci dokumentu** (nie w storage) | tap kandydata → `#/zawodnik/<klucz>` |
| `#/zawodnik/<klucz>` | nagłówek (nazwa, rocznik, N startów, „prawdopodobnie" gdy `probable`), **rekordy na dystansach** (5 / 10 / 21,1 / 42,2 ±3 % — `rekordyZWynikow` z `moje.mjs`, do wyniesienia do `js/`; + „inne dystanse": najlepszy czas na każdym innym dystansie), **trend formy** (wykres: każdy start na dystansie klasycznym znormalizowany Riegel 1,06 do 10 km, oś czasu; trail/ultra/inne dystanse poza wykresem, z podpisem „N startów poza wykresem"), **lista startów** (tabela jak dziś; wiersz klikalny), przycisk „To ja" (gdy brak własnego klucza; → `ustaw_f6_runner_key`), link „Profil w BiegaMy" (pkt 2.5) | tap startu → `#/impreza/<klucz_imprezy>/<rok>` (wymaga `event_key` z F6 — pkt 2.3); „Porównaj z…" → `#/porownaj/<a>/<b>` |
| `#/impreza/<klucz>/<rok>` (albo `#/impreza/<edycja_id>`) | nagłówek (nazwa, data, miasto, dystanse, źródło jako tekst, link do strony wyników przez `safeExternalHref`), **zakładki dystansów**, **tabela**: miejsce open / kat. / płeć, nazwisko (klik → `#/zawodnik/…`), rocznik, kat., czas, tempo; **„Nasi"** (zawodnicy BiegaMy w tej edycji — pkt 2.3/2.5), **„Nasi — wyniki zgłoszone"** (B), **edycje** (lata → inna edycja), **rekord trasy** per dystans; „skocz do mojego miejsca" (gdy mam klucz i start w tej edycji) | tap nazwiska → profil; tap roku → inna edycja (`#/impreza/<klucz>/<inny rok>`) |
| `#/porownaj/<a>/<b>` | dwa nagłówki, **wspólne starty** (ta sama edycja + dystans) z oboma czasami, różnicą w s i %, kto szybszy; bilans X:Y; rekordy obok siebie; oba trendy na jednym wykresie | tap startu → impreza; tap osoby → profil |

Zasady wspólne:
- **Stos**: każde przejście = `pushState({hash, scrollY})`; `popstate` → render z pamięci (zero RPC przy powrocie) + przywrócenie przewinięcia.
  `replaceState` tylko przy poprawce URL (np. normalizacja klucza). Otwarcie linku „na zimno" → render z hash po sesji.
- **Udostępnianie**: przycisk „Udostępnij" = `navigator.share({url})` albo kopiowanie do schowka (jak karty); link zawiera tylko hash
  (klucz F6, klucz imprezy, rok) — bez nazwiska, **poza kluczami `k:…`** (pkt 2.5). Odbiorca bez sesji ląduje na `index.html`; w repo **nie ma**
  mechanizmu `?next=`/powrotu po logowaniu (grep: `index.html` obsługuje tylko `#dolacz`/`#sponsor`) — do decyzji (pytanie 7).
- **Rendering**: wiersze przez `textContent`/`el()` jak widżet albo string + `escapeHtml` jak `races.html`; klucze w `data-*` + jeden delegowany
  klik z walidacją wzorca (CLAUDE.md: zero JS-in-attribute). Tabela do 1 000 wierszy bez wirtualizacji; powyżej — stronicowanie (pkt 2.4).
- **Błędy**: te same kody co `komunikatBledu` widżetu + `bmStanOffline`; 429 → zdanie z `Retry-After` **i wyłączenie prefetchu na `retryAfter` s**.

### 2.3 Dane per ekran: które RPC są, które trzeba dodać (propozycja kontraktu dla kolektora)

| ekran | potrzebuje | jest | brakuje |
|---|---|---|---|
| `#/` | `search_runners` | ✅ | — |
| `#/zawodnik` | wszystkie starty z czasem, dystansem, miejscami **i identyfikatorem edycji** | `runner_results` (bez identyfikatora imprezy) | `event_key` + `edition_id` w `runner_results` (albo `runner_results_v2`) |
| `#/impreza` | pełna lista wyników edycji z miejscami open/kat/płeć, stronicowana; lista edycji; rekord trasy | ❌ (`events_search` zna tylko kalendarz: nazwa/data/miejscowość/linki/klucz) | `event_results`, `event_info` |
| `#/porownaj` | dwa `runner_results` z `edition_id` → wspólne starty **po stronie klienta** | ✅ po rozszerzeniu `runner_results` | nic więcej (nie dokładać `head_to_head` w v1) |
| „Nasi" w edycji | lista kluczy F6 z edycji → kto z nich ma konto publiczne w BiegaMy | ❌ | RPC **po naszej stronie** (niżej) |

**Propozycja dla kolektora (SQL na maszynie3, SECURITY INVOKER, tylko `authenticated`, nazwy po polsku jak 017/018; każda nowa nazwa →
Caddy `@dozwolone` + `f6.bramka` + `RPC_DOZWOLONE` + `blizna-53`):**

1. **`runner_results` — DOŁOŻYĆ kolumny, nie zmieniać istniejących**: `event_key text` (ten sam klucz co `events_search.klucz`, np. `kalendarz:…`/
   `wyniki:…` — czy wyniki i kalendarz mają dziś wspólny klucz: **nie do ustalenia z repo**), `edition_id uuid` (edycja = impreza + rok +
   klasyfikacja/dystans), `position_gender int`, `finishers_total int`, `finishers_category int`, `result_id uuid` (ten z `erasure_preview`),
   `source text`. Dołożenie kolumn jest **bezpieczne** dla obecnych klientów — widżet, `osoba.mjs`, `moje.mjs` czytają po nazwach pól;
   zmiana nazw/kolejności — nie. Jeśli kolektor woli nową funkcję: `runner_results_v2` i stara zostaje dla okienka.
2. **`event_results(p_edition_id uuid, p_offset int default 0, p_limit int default 200)`** → `runner_key, display_name, yob, gender, club,
   category, time_seconds, position_total, position_category, position_gender, probable, scope`; kolejność `position_total`; `p_limit ≤ 200`
   (twardo po stronie SQL jak `p_limit ≤ 20` w 017); osobno **`event_results_count(p_edition_id)`** albo kolumna `total` w każdym wierszu
   (tańsze: jedno wywołanie). Wymaganie: **ten sam filtr ukryć (erasure) co w `runner_results`** — wiersz ukryty wnioskiem nie może się
   pojawić w liście edycji ani w rekordzie trasy. Jak F6 filtruje dziś `scope`: nie do ustalenia z repo.
   Indeks (propozycja): `(edition_id, position_total)` + `(edition_id, runner_key)` (do „skocz do mojego miejsca").
3. **`event_info(p_event_key text)`** → `edycje: [{edition_id, rok, data, miejscowosc, dystans_km, finishers, url_zrodlo}]`,
   `rekord_trasy: [{dystans_km, time_seconds, runner_key, display_name, rok}]` (tylko z wyników nieukrytych; z `probable` — pytanie 10),
   `nazwa`, `miejscowosc`. Indeks: `(event_key, rok)`.
4. Nie dokładać w v1: `head_to_head` (klient policzy z dwóch `runner_results` po `edition_id`), `runner_summary` (klient policzy z listy) —
   chyba że `runner_results` jest stronicowane/ucięte po stronie serwera (nie do ustalenia; `moje.mjs` zakłada ≤ 300).

**RPC po naszej stronie (Supabase BiegaMy), bez zmian w F6:**
- **`nasi_po_kluczach_f6(p_klucze text[])`** SECURITY **INVOKER**, `language sql`, `stable`: `select id, full_name, avatar_url, f6_runner_key
  from athletes where f6_runner_key = any(p_klucze)` — RLS wołającego decyduje: `athletes_read_public` (tylko publiczni) + własny + (trener) swoi.
  POST z tablicą zamiast `.in('f6_runner_key', […])` w URL — 200 kluczy × ~20 znaków ≈ 5 KB, ale lista maratonu to tysiące (ryzyko 414,
  przegląd B pkt „Koszty"). Limit: `array_length ≤ 500`, wołane per strona wyników (200 wierszy). Grant EXECUTE tylko `authenticated`.
- Nic więcej w bazie dla A.

### 2.4 Cache, prefetch, stronicowanie

- **Jedna pamięć w dokumencie** (`Map`, klucz = RPC + argumenty, TTL **10 min** jak `f6.mjs`, ≤ 200 wpisów, LRU) — ta sama reguła co okienko,
  zapisana w jednym pliku `js/wyniki-pamiec.mjs` (bez import/export, wzorzec `js/tekst.mjs`), żeby EF mogła ją kiedyś importować.
  **Nie `sessionStorage`** dla wyników osób — zasada z `wyniki-api.js`/`usun-dane.js` (bez danych osób w magazynach przeglądarki);
  `IMPREZY` trzyma w sesji tylko kalendarz (bez osób) i to zostaje.
- **Powrót „wstecz" = zero RPC** (render z pamięci). Odświeżenie strony = pamięć pusta (świadomie).
- **Prefetch tylko z intencji**: `pointerdown`/`touchstart` na wierszu startu → `event_results` strona 1 (jedno wywołanie); na profilu **nie**
  prefetchować wszystkich imprez (N wywołań, limit 60/min). Porównanie: oba `runner_results` równolegle (`Promise.all`).
- **Stronicowanie `event_results`**: 200/strona; strona 2 przy przewinięciu do ~70 % (`IntersectionObserver`); „skocz do mojego miejsca" =
  `p_offset = floor((position_total − 1) / 200) × 200` z `runner_results`. Maraton 5 000 ukończonych = 25 stron, ale człowiek zwykle ogląda
  1–3. Szacunek rozmiaru: 200 wierszy × ~150 B ≈ **30 KB** JSON (szacunek, nie pomiar).
- **Budżet wywołań**: typowa sesja „managera" (szukaj → profil → impreza (2 strony) → 2 zawodników → porównanie) ≈ **8–12 RPC** przy
  limicie 60/min/token — mieści się; **wyłącznik**: po 429 strona przestaje prefetchować i pokazuje odliczanie z `Retry-After`.
- **Trend formy**: liczony w przeglądarce z `runner_results` (brak nowego RPC); tylko dystanse 5/10/21,1/42,2 ±3 % (jak `rekordyZWynikow`),
  normalizacja Riegel 1,06 do 10 km; ≥ 3 punkty, inaczej „za mało startów na wykres". Bez prognoz czasu (zasada z okienka, blizna-78).

### 2.5 Prywatność

- **Wyniki zawodów są publiczne** (serwer F6, decyzje U3/B8), ale nasz kod trzyma zasady: tekst tylko przez `textContent`/`escapeHtml`; linki
  `result_url`/`url_zrodlo` przez `safeExternalHref {tylkoHttps}`; klucze w `data-*` i w hash przez `encodeURIComponent` + walidacja wzorcem
  przy odczycie; nic z tej strony nie idzie do modelu ani do sieci.
- **Klucz w URL**: `datasport:368751` to identyfikator ze źródła, nie nazwisko. ⚠️ **Klucze `k:<imię nazwisko>|<rocznik>`** (wyniki bez id ze
  źródła) niosą nazwisko — link `#/zawodnik/k:jan%20kowalski%7C1990` zawiera dane osoby. Hash nie trafia do logów serwera, ale trafia do
  historii przeglądarki i do odbiorcy linku. Decyzja (pytanie 3): dopuścić (nazwisko i tak jest w treści publicznej) albo poprosić kolektor
  o stabilny klucz zastępczy (np. `nk:<hash>`) dla takich wierszy. Dziś takich osób nie da się też wskazać jako „To ja" (pkt 1.3).
- **Link do profilu BiegaMy tylko gdy publiczny**: `nasi_po_kluczach_f6` / zapytanie po `f6_runner_key` przechodzi przez RLS — zawodnik widzi
  wyłącznie `is_public = true` (+ siebie), trener także swoich prywatnych (`athletes_read_by_coach`, jak w Społeczności i M3-0b — ze znacznikiem
  „profil prywatny"). Dla prywatnych **nie pokazujemy nawet faktu** „jest w BiegaMy" — brak wiersza = brak informacji. Powiązanie istnieje tylko,
  gdy zawodnik sam kliknął „To ja" (`ustaw_f6_runner_key`) — nigdy po nazwisku.
- **Erasure**: wynik ukryty wnioskiem musi zniknąć z `event_results`, rekordu trasy i porównań po stronie F6 (wymaganie do kontraktu);
  po naszej stronie pamięć 10 min oznacza, że w otwartej karcie innej osoby ukryty wiersz może być widoczny ≤ 10 min — ta sama cena, którą
  okienko już płaci; `usun-dane` obiecuje „zaraz po potwierdzeniu" w wyszukiwarce — zapis w spec, nie zmiana tekstu.
- **„Prawdopodobnie"** (`probable`): profil może być zlepkiem dwóch osób o tym samym nazwisku i roczniku — etykieta na profilu, przy rekordach
  i w porównaniu; rekord trasy z wierszy `probable` — pytanie 10.
- **Trener**: widzi to samo co zawodnik (wyniki publiczne) + prywatne profile swoich przy linkowaniu; `event_hide` zostaje jak jest.

### 2.6 Koszty, limity, ryzyka

| ryzyko | skutek | zabezpieczenie |
|---|---|---|
| `event_results` dla dużej imprezy obciąża F6 | wolne odpowiedzi, 429 dla innych | limit 200/strona w SQL, indeks `(edition_id, position_total)`, prefetch tylko z intencji, wyłącznik po 429; p95 czasu — do zmierzenia na maszynie (nie do ustalenia z repo) |
| cztery miejsca listy RPC (Caddy, `f6.bramka`, `RPC_DOZWOLONE`, `blizna-53`) | nazwa dodana w repo, brakująca w Caddy = 404/403 bez śladu | kolejność wdrożenia: najpierw kolektor (test S- jak `tools/test-018`), potem repo; `blizna-53` liczy nazwy |
| zmiana kontraktu `runner_results` | okienko/widżet czytają po nazwach — dołożenie kolumn bezpieczne, zmiana nazw psuje 3 miejsca | tylko dodawanie kolumn; test równoważności kształtu w `blizna-78`/`wyszukiwarka-wynikow.test.js` |
| klucze `k:…` w URL i w „To ja" | nazwisko w linku; część osób bez „To ja" | pytanie 3; walidator kluczy do wyświetlania szerszy niż `RE_KLUCZ` do zapisu |
| link bez sesji | 401 z F6 → ekran logowania, hash ginie | `wyniki.html` zapamiętuje hash w `sessionStorage` (sam hash, bez danych) przed przekierowaniem i przywraca po powrocie — nowy, mały mechanizm (pytanie 7) |
| trend z Riegela zaniża trail/ultra, parkrun „w luzie" wygląda jak spadek formy | fałszywy obraz | tylko dystanse klasyczne, bez ocen słownych, podpis „z wyników zawodów, bez treningów"; nie używać do niczego poza wykresem |
| czwarta kopia Riegela 1,06 | dryf (bramki pilnują kopii) | jedna stała w `js/` albo test równości jak `EKRANY` |
| okienko „Otwórz wyniki" → nowa strona | `EKRANY` w dwóch kopiach (EF + UI) | blizna-65/76 wymuszą zmianę obu |
| pomiar użycia | nie wiemy, czy ktokolwiek przewija poza profil (dziś brak pomiaru wejść na `races.html` — przegląd B) | jeden licznik zdarzeń bez treści (ekran, nie klucz) — decyzja, czy w ogóle |

---

## 3. B. Wynik zgłoszony — projekt

### 3.1 Model danych — porównanie trzech miejsc

| wariant | za | przeciw | werdykt |
|---|---|---|---|
| kolumny w `race_signups` (`czas_s`, …) | tabela już istnieje, RLS własnych wierszy | obejmuje **tylko** nasze `races` (FK `race_id`) — nie cele z `impreza_klucz` (kalendarz maszyny) ani cele bez powiązania; UPDATE zdjęty 9.10 (trzeba by cofnąć revoke); trener nie ma INSERT/UPDATE; `signups_coach_read` widzi wszystkich | ❌ |
| pole w `race_goals[]` (JSON w `athletes`) | zero migracji, cel już ma `name/date/impreza_klucz/distance_km` | tekst bez CHECK i triggera, 14 miejsc zapisu, „ostatni wygrywa" między stronami, brak RLS per pole (trener nadpisuje całą kolumnę), bez UNIQUE, bez indeksu — nie da się ani zwalidować w bazie, ani dopasować do oficjalnego, ani pokazać na stronie imprezy bez skanu wszystkich profili | ❌ |
| **nowa tabela `wyniki_zgloszone`** | własny RLS (zawodnik swój, trener swoich, publiczny profil), CHECK-i tempa w bazie, UNIQUE na start, indeks po `impreza_klucz`/`race_id` do sekcji „Nasi — zgłoszone", miękkie powiązanie z celem po (nazwa, data) | migracja (bramka-commit), dopisanie do `delete_my_account`, nowe miejsce w migawce RLS | ✅ |

**Kształt (propozycja):**

| kolumna | typ | reguła |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `athlete_id` | `uuid not null references athletes(id) on delete cascade` | czyj wynik |
| `nazwa_imprezy` | `text not null` | 3–200 znaków (CHECK `char_length`) |
| `data` | `date not null` | CHECK `data <= current_date` **nie da się** (STABLE vs IMMUTABLE — ta sama blizna co `walidujRokPB`) → pilnuje klient + trigger BEFORE INSERT (dozwolone: `now()` w triggerze) |
| `miejscowosc` | `text` | ≤ 80 |
| `dystans_km` | `numeric(6,3) not null` | CHECK `between 0.5 and 400` |
| `czas_s` | `integer not null` | CHECK `between 60 and 360000` (100 h) |
| — | | CHECK **tempa**: `czas_s / dystans_km between 140 and 1200` (2:20–20:00 /km) — twarda granica w bazie, miękkie progi w kliencie (3.3) |
| `impreza_klucz` | `text` | CHECK jak `RE_KLUCZ_IMPREZY` `^(kalendarz\|biegamy\|wyniki\|zgloszenie):[A-Za-z0-9:._-]{1,120}$` — z celu (K5) |
| `race_id` | `uuid references races(id) on delete set null` | gdy start z naszego kalendarza |
| `zrodlo` | `text not null` | CHECK `in ('zawodnik','trener')` |
| `wpisal_user_id` | `uuid not null default auth.uid()` | kto wpisał (zawodnik albo trener) |
| `uwagi` | `text` | ≤ 300 |
| `stan` | `text not null default 'zgloszony'` | CHECK `in ('zgloszony','zastapiony')` — `zastapiony` = jest oficjalny |
| `oficjalny_result_id` | `text` | `result_id` z F6 (gdy dopasowano) |
| `oficjalny_czas_s` | `integer` | |
| `roznica_pct` | `numeric(6,2)` | `abs(czas_s − oficjalny_czas_s) / oficjalny_czas_s × 100` |
| `dopasowano_at` | `timestamptz` | |
| `created_at`, `updated_at` | `timestamptz not null default now()` | trigger `updated_at` (wzorzec `update_can_updated_at`) |
| UNIQUE | `(athlete_id, data, dystans_km)` | jeden wynik na start tego dnia i dystansu (sztafety/dwa biegi dziennie — świadomie poza v1) |
| indeksy | `(athlete_id, data desc)`, `(impreza_klucz) where impreza_klucz is not null`, `(race_id) where race_id is not null` | profil, strona imprezy, karta naszych zawodów |

Powiązanie z celem z `race_goals` — **miękkie**: przy wpisie klient kopiuje z celu `name/date/miejscowosc/impreza_klucz/race_id/distance_km`;
nie dodajemy nic do JSON-a (zero nowych miejsc zapisu `race_goals`).

### 3.2 RLS (szkic, role jak w `athletes`: `authenticated`, anon nic)

| polecenie | polityka | warunek |
|---|---|---|
| SELECT | `wz_read_own` | `athlete_id = auth_my_athlete_id()` |
| SELECT | `wz_read_by_coach` | `athlete_id in (select id from athletes where coach_id = auth.uid())` — zawężone do **swoich** (nie jak `signups_coach_read`) |
| SELECT | `wz_read_public` | `auth.uid() is not null and exists (select 1 from athletes a where a.id = athlete_id and a.is_public = true)` — profil publiczny i sekcja „Nasi — zgłoszone"; dla prywatnych: nic (brak wiersza = brak informacji) |
| INSERT | `wz_insert_own` | `with check (athlete_id = auth_my_athlete_id() and zrodlo = 'zawodnik' and wpisal_user_id = auth.uid())` |
| INSERT | `wz_insert_coach` | `with check (zrodlo = 'trener' and wpisal_user_id = auth.uid() and athlete_id in (select id from athletes where coach_id = auth.uid()))` |
| UPDATE | `wz_update_own` / `wz_update_coach` | jak SELECT own/coach, `with check` to samo + **trigger-strażnik**: kolumny `stan`, `oficjalny_*`, `roznica_pct`, `dopasowano_at`, `athlete_id`, `zrodlo`, `wpisal_user_id` zmienia tylko RPC `wynik_zgloszony_dopasuj` (ustawienie `biegamy.wz_rpc`, wzorzec `athletes_f6_klucz_tylko_rpc`) — inaczej 42501 z listą kolumn (wzorzec `training_logs_guard_coach_fields`) |
| DELETE | `wz_delete_own` / `wz_delete_coach` | jak SELECT own/coach |

Granty: `revoke all from public, anon`; `grant select, insert, update, delete to authenticated` (tabelowo — tabela jest nowa, nie ma
kolumnowej historii jak `athletes`). ⚠️ `create table` w Supabase sam nadaje anonowi ALL z default privileges (pamięć:
`project_zaleglosc_community_stats_do_kasacji`) — revoke **po** create, asercja `has_table_privilege('anon', …) = false` w migracji.
Czy zawodnik może edytować wynik wpisany przez trenera (i odwrotnie): polityki wyżej na to pozwalają (obie strony widzą i piszą) — pytanie 5.

### 3.3 Walidacja absurdów — progi tempa per dystans

⚠️ **Liczby z rozsądku i rekordów świata, nie z pomiaru** (konwencja repo: nazwać źródło liczby). Rekordy świata jako podłoga są już SSOT
w `walidujPB` (`_PB_DYST.rek`); tu rozszerzam na dowolny dystans.

| dystans | twardy błąd (odrzuć) | miękkie ostrzeżenie („na pewno?", wymaga potwierdzenia) | w bazie (CHECK) |
|---|---|---|---|
| < 3 km | tempo < 2:30/km | < 3:15/km; > 10:00/km | 2:20–20:00/km |
| 3–15 km (5, 10) | < 2:30/km (5 km WR ≈ 2:31) · < 2:36/km (10 km WR ≈ 2:37) — jedna reguła: `< 150 s/km` | < 3:20/km; > 10:00/km | jw. |
| 15–30 km (21,1) | < 2:40/km (WR ≈ 2:43) | < 3:30/km; > 10:00/km | jw. |
| 30–50 km (42,2) | < 2:50/km (WR ≈ 2:51) | < 3:40/km; > 10:00/km | jw. |
| > 50 km (ultra) | < 3:30/km | < 4:30/km; > 15:00/km (góry) | jw. |
| każdy | `czas < 60 s`, `czas > 100 h`, `dystans ∉ [0,5; 400]`, **data w przyszłości**, data < 1990 (jak `PB_ROK_OD`) | czas lepszy od własnego `pb_*` na tym dystansie (±3 %) o **> 15 %** → „to byłby nowy rekord o X % — na pewno?"; wynik wpisany > 365 dni po dacie | — |

Format czasu: `autoColonTime` + ten sam parser co `walidujPB` (`_PB_KSZTALT`, człony < 60, dopełnienie `h:mm` na długich) — **rozszerzyć
`walidujPB` o dowolny dystans** (dziś `_PB_DYST` zna tylko 4) zamiast pisać drugi walidator; `tools/sprawdz-pb-walidacja.js` dalej zielony,
bo 4 dystanse zostają kluczami. Odrzucenia w kliencie **nie** idą do `client_errors` (to nie błąd systemu); odrzucenia przez CHECK w bazie —
tak, przez `zglosNieudanyZapis` (bez treści wiersza, `tests/zglaszanie-zapisow.test.js`).

### 3.4 Dopasowanie z oficjalnym (po `f6_runner_key` + impreza)

- **Kto i kiedy może dopasować**: F6 przyjmuje **tylko tokeny użytkowników** (przegląd B, luka 1: „bez konta serwisowego do F6") — EF/cron
  **nie może** odpytać maszyny za wszystkich. Czy konto serwisowe istnieje/może powstać: **nie do ustalenia z repo** (pytanie 2). Dlatego v1 =
  **dopasowanie leniwe w przeglądarce właściciela albo jego trenera**, własnym tokenem, 1 RPC (`runner_results`, w pamięci 10 min):
  przy otwarciu profilu/kalendarza/`wyniki.html` z wynikami `stan = 'zgloszony'` i ustawionym `athletes.f6_runner_key`.
- **Reguła dopasowania** (jedna funkcja w `js/wyniki-dopasuj.mjs`, bez import/export, testowalna): oficjalny wiersz pasuje, gdy
  `|event_date − data| ≤ 1 dzień` **i** `|distance_km − dystans_km| ≤ 3 %` **i** (gdy oba mają klucz) `event_key = impreza_klucz`
  (do czasu `event_key` w `runner_results` — tylko data + dystans; ta sama reguła ±1 dzień co dedup K5). Dwa kandydaty → żaden (nie zgadujemy).
- **Zapis**: RPC `wynik_zgloszony_dopasuj(p_id uuid, p_result_id text, p_czas_s int)` SECURITY DEFINER, sprawdza `auth.uid()` = właściciel
  albo trener właściciela, ustawia `stan='zastapiony'`, `oficjalny_*`, `roznica_pct`, `dopasowano_at`. ⚠️ Wartość „oficjalnego" czasu
  **przychodzi z przeglądarki** (zawodnik mógłby ją sfałszować) — dlatego kolumny `oficjalny_*` są **informacyjne**: rekordy, rekord trasy,
  porównania liczą się **zawsze z żywego F6** (A), nigdy z tej tabeli. To zamyka wektor „wpiszę sobie oficjalny czas".
- **Różnica > 2 %** → po dopasowaniu toast + stały dopisek na wierszu („oficjalnie 45:12 — zgłoszone 44:00, różnica 2,7 %"); opcjonalnie
  wiersz w `notifications` (tabela istnieje, `trigger_send_push`) — tylko dla zawodnika (nie trenera), typ nowy, decyzja przy wdrożeniu.
  ≤ 2 % → cicho `zastapiony`, w UI oficjalny czas z etykietą „oficjalny".
- **Bez `f6_runner_key`** → brak dopasowania; przy wyniku zgłoszonym przycisk „Znajdź mnie w wynikach" → istniejąca ścieżka „Który to Ty?"
  (okienko) albo to samo w `wyniki.html#/` (A, pkt 2.2).
- **Oficjalny zastępuje zgłoszony** = wiersz zostaje (historia), ale **UI pokazuje oficjalny**; zgłoszony tylko w dopisku. Usunięcie oficjalnego
  wnioskiem erasure → nie cofamy stanu automatycznie (nie wiemy o tym); `stan` można ręcznie cofnąć kasując i wpisując ponownie — poza v1.

### 3.5 Reguła „zgłoszony nie bije rekordów"

- `athletes.pb_*` — **nie aktualizujemy** automatycznie (dziś też nic nie aktualizuje; zasada „człowiek rozstrzyga"). Przy wyniku lepszym od
  `pb_*` na dystansie klasycznym ±3 %: jedno zdanie „To lepiej niż Twoja życiówka — zaktualizuj ją w Profilu" z linkiem, bez zapisu.
- `rekordyZWynikow` (okienko, `wyniki.html`), rekord trasy, porównania, trend — **wyłącznie z F6**; `wyniki_zgloszone` nie wchodzi do żadnej
  z tych funkcji (test: moduł rekordów nie importuje/nie czyta tej tabeli).
- Odznaki i wyzwania — **nie** (nie podpinać do `checkBadges`; `BADGE_BACKFILL_KEY` bez zmian).
- W UI zawsze etykieta „zgłoszony" (szara kursywa jak „zgłoszona przez biegacza"), **bez miejsca** w klasyfikacji, w osobnych sekcjach:
  w profilu „Wyniki zgłoszone", na stronie imprezy „Nasi — wyniki zgłoszone" (pod oficjalną tabelą, nigdy w niej).

### 3.6 UI — gdzie wpis, jaka etykieta

| miejsce | kiedy | co |
|---|---|---|
| `zawodnik.html` (lista celów, `renderGoals:3517`) | cel z `date ≤ dziś` i bez wyniku; dziś cele przeszłe są na liście (bez filtra daty — `profil.html:1207` filtruje, `zawodnik.html` nie) | przycisk „Wpisz wynik" → modal: dystans (chipy 5 / 10 / 21,1 / 42,2 + „inny" + z `distance_km` celu), czas (`autoColonTime`), miejscowość/nazwa z celu, uwagi; po zapisie wiersz celu dostaje „✓ 44:30 · zgłoszony" |
| `races.html` karta naszych zawodów | po dacie, zapisany (`_mySignups`) | ten sam modal, `race_id` wypełnione; dla trenera lista zapisanych z „Wpisz wynik" (zrodlo `trener`) |
| `kalendarz.html` / `profil.html` (trener przy zawodniku) | cel zawodnika po dacie | ten sam modal, `zrodlo='trener'` |
| okienko | „pobiegłem 10 km w 44:30 w Dębnie" | router (0 tokenów) → **nie zapisuje** (zasada: EF i model nie piszą) → karta „Zapisz wynik" otwierająca modal z wypełnionymi polami (`data-*`); kalkulator z M3-2 już rozpoznaje dystans i czas |
| `profil.html?id=` (publiczny) | `is_public` | sekcja „Ostatnie wyniki (zgłoszone)" ≤ 5, przez RLS `wz_read_public`; prywatny — nic |
| `wyniki.html#/impreza` (A) | `impreza_klucz = event_key` albo `race_id` | „Nasi — wyniki zgłoszone" |

Modal = **jeden** (w `sb.js` jak `askBikeOrRun`/modal celu — nie trzy kopie; LEKCJE o kopiach), zapis przez jedną funkcję
`window.zapiszWynikZgloszony` (jak `zapiszLog`), `client_errors` przy odrzuceniu bazy.

### 3.7 Migracja — szkic SQL (NIE wykonywać; plik `20261110_wyniki_zgloszone.sql` + `20261110_WYCOFANIE_wyniki_zgloszone.sql`)

```sql
-- B (po 8.11): wyniki startów zgłoszone przez zawodnika albo trenera. Oficjalne wyniki żyją w F6; ta tabela ich NIE zastępuje
-- w rekordach ani porównaniach. Testowane PRZED prod w transakcji z rollbackiem (wzorzec 20261101_f6_runner_key.sql).
begin;

create table if not exists public.wyniki_zgloszone (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references public.athletes(id) on delete cascade,
  nazwa_imprezy       text not null check (char_length(nazwa_imprezy) between 3 and 200),
  data                date not null,
  miejscowosc         text check (miejscowosc is null or char_length(miejscowosc) <= 80),
  dystans_km          numeric(6,3) not null check (dystans_km between 0.5 and 400),
  czas_s              integer not null check (czas_s between 60 and 360000),
  impreza_klucz       text check (impreza_klucz is null or impreza_klucz ~ '^(kalendarz|biegamy|wyniki|zgloszenie):[A-Za-z0-9:._-]{1,120}$'),
  race_id             uuid references public.races(id) on delete set null,
  zrodlo              text not null check (zrodlo in ('zawodnik','trener')),
  wpisal_user_id      uuid not null default auth.uid(),
  uwagi               text check (uwagi is null or char_length(uwagi) <= 300),
  stan                text not null default 'zgloszony' check (stan in ('zgloszony','zastapiony')),
  oficjalny_result_id text,
  oficjalny_czas_s    integer check (oficjalny_czas_s is null or oficjalny_czas_s between 60 and 360000),
  roznica_pct         numeric(6,2),
  dopasowano_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint wz_tempo_rozsadne check (czas_s::numeric / dystans_km between 140 and 1200),   -- 2:20–20:00 /km
  constraint wz_jeden_na_start unique (athlete_id, data, dystans_km)
);
create index if not exists wz_athlete_data on public.wyniki_zgloszone (athlete_id, data desc);
create index if not exists wz_impreza on public.wyniki_zgloszone (impreza_klucz) where impreza_klucz is not null;
create index if not exists wz_race on public.wyniki_zgloszone (race_id) where race_id is not null;

-- data nie z przyszłości: CHECK nie może użyć current_date (STABLE) → BEFORE INSERT/UPDATE
create or replace function public.wz_data_nie_z_przyszlosci() returns trigger language plpgsql set search_path = public as $$
begin
  if new.data > current_date then raise exception 'wynik z przyszłości' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists wz_data_nie_z_przyszlosci on public.wyniki_zgloszone;
create trigger wz_data_nie_z_przyszlosci before insert or update on public.wyniki_zgloszone
  for each row execute function public.wz_data_nie_z_przyszlosci();

-- kolumny systemowe tylko przez RPC dopasowania (wzorzec athletes_f6_klucz_tylko_rpc + training_logs_guard_coach_fields)
create or replace function public.wz_guard_systemowe() returns trigger language plpgsql set search_path = public as $$
declare zm text[] := '{}';
begin
  if coalesce(current_setting('biegamy.wz_rpc', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.athlete_id is distinct from old.athlete_id then zm := array_append(zm, 'athlete_id'); end if;
    if new.zrodlo is distinct from old.zrodlo then zm := array_append(zm, 'zrodlo'); end if;
    if new.wpisal_user_id is distinct from old.wpisal_user_id then zm := array_append(zm, 'wpisal_user_id'); end if;
    if new.stan is distinct from old.stan then zm := array_append(zm, 'stan'); end if;
  end if;
  if new.oficjalny_result_id is not null or new.oficjalny_czas_s is not null or new.roznica_pct is not null or new.dopasowano_at is not null then
    if tg_op = 'INSERT' or new.oficjalny_result_id is distinct from old.oficjalny_result_id or new.oficjalny_czas_s is distinct from old.oficjalny_czas_s
       or new.roznica_pct is distinct from old.roznica_pct or new.dopasowano_at is distinct from old.dopasowano_at then zm := array_append(zm, 'oficjalny_*'); end if;
  end if;
  if array_length(zm, 1) is null then return new; end if;
  raise exception 'wyniki_zgloszone: kolumny systemowe tylko przez wynik_zgloszony_dopasuj(). Odrzucone: %', array_to_string(zm, ', ') using errcode = '42501';
end $$;
drop trigger if exists wz_guard_systemowe on public.wyniki_zgloszone;
create trigger wz_guard_systemowe before insert or update on public.wyniki_zgloszone for each row execute function public.wz_guard_systemowe();

-- dopasowanie z oficjalnym (wartości informacyjne — rekordy liczy F6, nie ta tabela)
create or replace function public.wynik_zgloszony_dopasuj(p_id uuid, p_result_id text, p_czas_s integer) returns void
  language plpgsql security definer set search_path = public as $$
declare v_ath uuid; v_czas integer;
begin
  if auth.uid() is null then raise exception 'brak sesji' using errcode = '42501'; end if;
  if p_result_id !~ '^[A-Za-z0-9:._-]{1,120}$' or p_czas_s is null or p_czas_s not between 60 and 360000 then raise exception 'złe dane' using errcode = '22023'; end if;
  select athlete_id, czas_s into v_ath, v_czas from public.wyniki_zgloszone where id = p_id;
  if v_ath is null then raise exception 'brak wiersza' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.athletes a where a.id = v_ath and (a.user_id = auth.uid() or a.coach_id = auth.uid())) then
    raise exception 'nie Twój wynik' using errcode = '42501'; end if;
  perform set_config('biegamy.wz_rpc', '1', true);
  update public.wyniki_zgloszone set stan = 'zastapiony', oficjalny_result_id = p_result_id, oficjalny_czas_s = p_czas_s,
    roznica_pct = round(abs(v_czas - p_czas_s)::numeric / p_czas_s * 100, 2), dopasowano_at = now() where id = p_id;
  perform set_config('biegamy.wz_rpc', '', true);
end $$;

-- RLS
alter table public.wyniki_zgloszone enable row level security;
create policy wz_read_own      on public.wyniki_zgloszone for select to authenticated using (athlete_id = public.auth_my_athlete_id());
create policy wz_read_by_coach on public.wyniki_zgloszone for select to authenticated using (athlete_id in (select id from public.athletes where coach_id = auth.uid()));
create policy wz_read_public   on public.wyniki_zgloszone for select to authenticated using (exists (select 1 from public.athletes a where a.id = athlete_id and a.is_public = true));
create policy wz_insert_own    on public.wyniki_zgloszone for insert to authenticated with check (athlete_id = public.auth_my_athlete_id() and zrodlo = 'zawodnik' and wpisal_user_id = auth.uid());
create policy wz_insert_coach  on public.wyniki_zgloszone for insert to authenticated with check (zrodlo = 'trener' and wpisal_user_id = auth.uid() and athlete_id in (select id from public.athletes where coach_id = auth.uid()));
create policy wz_update_own    on public.wyniki_zgloszone for update to authenticated using (athlete_id = public.auth_my_athlete_id()) with check (athlete_id = public.auth_my_athlete_id());
create policy wz_update_coach  on public.wyniki_zgloszone for update to authenticated using (athlete_id in (select id from public.athletes where coach_id = auth.uid())) with check (athlete_id in (select id from public.athletes where coach_id = auth.uid()));
create policy wz_delete_own    on public.wyniki_zgloszone for delete to authenticated using (athlete_id = public.auth_my_athlete_id());
create policy wz_delete_coach  on public.wyniki_zgloszone for delete to authenticated using (athlete_id in (select id from public.athletes where coach_id = auth.uid()));

-- granty: najpierw odebrać wszystko (create table w Supabase potrafi nadać anonowi ALL z default privileges), potem dokładnie tyle, ile trzeba
revoke all on public.wyniki_zgloszone from public, anon;
grant select, insert, update, delete on public.wyniki_zgloszone to authenticated;
revoke all on function public.wynik_zgloszony_dopasuj(uuid, text, integer) from public, anon;
grant execute on function public.wynik_zgloszony_dopasuj(uuid, text, integer) to authenticated;
revoke all on function public.wz_guard_systemowe() from public, anon, authenticated;
revoke all on function public.wz_data_nie_z_przyszlosci() from public, anon, authenticated;

-- delete_my_account: dołożyć `DELETE FROM public.wyniki_zgloszone WHERE athlete_id = v_athlete_id;` (cascade i tak zadziała przy DELETE athletes,
-- ale funkcja NIE kasuje wiersza athletes — anonimizuje go — więc bez tej linii wyniki zostałyby przy „Usunięty użytkownik").

do $$ begin
  if has_table_privilege('anon', 'public.wyniki_zgloszone', 'select') then raise exception 'wyniki_zgloszone: anon ma SELECT'; end if;
  if has_function_privilege('anon', 'public.wynik_zgloszony_dopasuj(uuid,text,integer)', 'execute') then raise exception 'anon ma EXECUTE'; end if;
  if not exists (select 1 from pg_policies where tablename = 'wyniki_zgloszone' and policyname = 'wz_read_public') then raise exception 'brak polityki'; end if;
end $$;
commit;
```

Wycofanie: `drop function … wynik_zgloszony_dopasuj; drop table … wyniki_zgloszone;` + zdjęcie linii z `delete_my_account` (osobny plik
WYCOFANIE, jak każda migracja tu). Bramka-commit zapali się na migracji — to oczekiwane (feedback: bramka blokuje fakt, nie ryzyko).
Po wdrożeniu: `tools/polityki-bazy.js --zrzut` (nowy plik w `supabase/schema/rls/`), `tools/funkcje-bazy.js`.

### 3.8 Testy (nowa blizna B, `node --test`)

1. Walidator: tabela przypadków z 3.3 (każdy wiersz: twardy/miękki/ok), dopełnienie `h:mm`, data z przyszłości, dystans 0,4 i 401.
2. Migracja (tekstowo, jak blizna-78): CHECK tempa, UNIQUE, trigger-strażnik z `current_setting('biegamy.wz_rpc')`, RPC z `auth.uid()`
   i sprawdzeniem właściciela/trenera, `revoke … from public, anon` po `create table`, asercje `has_table_privilege`, plik WYCOFANIE,
   `delete_my_account` zawiera `wyniki_zgloszone`.
3. Dopasowanie: ±1 dzień, ±3 % dystansu, dwa kandydaty → brak, `roznica_pct` 2,7 → komunikat, 1,9 → cicho; `event_key` gdy jest.
4. „Nie bije rekordów": `rekordyZWynikow`/moduł rekordów nie czyta `wyniki_zgloszone`; `checkBadges` nie zna tabeli; brak `pb_*` w ścieżce zapisu.
5. UI: jeden modal, zapis jedną funkcją, `data-*` bez `onclick` z danymi, etykieta „zgłoszony" w profilu/karcie/imprezie, trener → `zrodlo='trener'`,
   okienko nie zapisuje (EF bez `insert(`/`from('wyniki_zgloszone')`).
6. RLS „po skutku", nie po wzorcu (LEKCJE #19): próba w transakcji przed prod z `set local role authenticated` i `request.jwt.claims` dla 3 kont
   (własne, trener swojego, obcy) — 0 wierszy dla obcego prywatnego, wiersze dla publicznego.

Testy A (nowa blizna A): router hash (parse/serialize, odrzucenie kluczy spoza wzorca, `encodeURIComponent`), stos (`pushState`/`popstate`
→ render z pamięci bez RPC), pamięć (TTL, limit, **brak `sessionStorage`/`localStorage` z danymi osób**), prefetch tylko z intencji, wyłącznik
po 429, `RPC_DOZWOLONE` = nowe nazwy (rozszerzenie blizna-53), trend tylko z dystansów klasycznych i bez słów-prognoz, „Nasi" wyłącznie przez
RPC z RLS, `EKRANY` w obu kopiach.

---

## 4. Kolejność wdrożenia po 8.11

| krok | co | wartość | ryzyko | miara |
|---|---|---|---|---|
| **1. `wyniki.html` na istniejących RPC** (A, 1–2 dni, bez bazy, bez kolektora) | strona z routerem hash, stosem, pamięcią 10 min; `#/` = widżet; `#/zawodnik/<klucz>`: rekordy, trend, lista; „To ja"; wejścia z `races.html` i okienka (`EKRANY`); `#/porownaj` z dwóch `runner_results` **po dacie+dystansie** (do czasu `edition_id`) | od razu „manager" dla profilu i porównania; zero zmian po stronie F6 | klucze `k:…` w URL; VT między dokumentami; `EKRANY` w 2 kopiach | 0 wpisów `client_errors` z `wyniki.html` w tydzień; ≤ 12 RPC na sesję (licznik w pamięci, podgląd w konsoli); 0 zapisów do magazynów (test) |
| **2. B — tabela + modal + etykieta** (1–2 dni, migracja) | `wyniki_zgloszone` + RLS + RPC dopasowania (bez użycia jeszcze), walidator, jeden modal w 4 miejscach, etykieta w profilu/karcie/`wyniki.html` | zamyka pętlę z 16.08 („nie ma gdzie zapisać wyniku"); materiał do przyszłej walidacji predykcji | migracja (bramka-commit, `delete_my_account`, default privileges anon); „ostatni wygrywa" nie dotyczy (osobna tabela) | liczba wyników zgłoszonych w 14 dni; odrzucenia CHECK w `client_errors` (ma być ~0 — klient waliduje wcześniej) |
| **3. F6: `runner_results` + kolumny, `event_results`, `event_info`** (kolektor; w repo: `RPC_DOZWOLONE`, blizna-53, `#/impreza`, edycje, rekord trasy, „skocz do mojego miejsca", `nasi_po_kluczach_f6`) | klik w start → pełne wyniki; impreza przez lata; „Nasi" | koszt zapytań na F6 (indeksy), erasure w nowych funkcjach, 4 miejsca listy RPC | p95 `event_results` (do zmierzenia na maszynie — dziś nie do ustalenia); 429 w tygodniu; rozmiar strony 200 wierszy |
| **4. B2 — dopasowanie leniwe + komunikat > 2 %**, „Nasi — zgłoszone" na stronie imprezy, porównanie po `edition_id` | zgłoszony ustępuje oficjalnemu bez pracy człowieka | zależy od `f6_runner_key` (tylko osoby po „To ja"); oficjalny czas z przeglądarki = informacyjny | odsetek `zastapiony` wśród zgłoszonych po 30 dniach; ile > 2 % |
| **5. Wykończenie** | prefetch z intencji + wyłącznik 429, udostępnianie (`navigator.share`), powrót do hash po logowaniu, okienko „pobiegłem …" → modal, precache SW, ewentualny licznik ekranów | płynność i szybkie przewijanie | mały mechanizm `sessionStorage` z hash (bez danych) | RPC/sesję przed i po prefetchu; czas do pierwszego renderu z pamięci przy „wstecz" (ma być 0 RPC) |

Kolejność 1 → 2 jest celowa: krok 1 nie potrzebuje bazy ani kolektora, krok 2 nie potrzebuje A; krok 3 to jedyny, który czeka na maszynę,
i może iść równolegle z 2. Krok 4 wymaga 1 + 2 + 3 (dla `event_key`; bez niego działa po dacie+dystansie).

## Pytania do Filipa (nie do rozstrzygnięcia z repo)

1. **`event_course_status`** — co przyjmuje i zwraca (na białej liście, 0 użyć)? Czy F6 ma już w wynikach identyfikator edycji/imprezy
   i czy klucz imprezy w wynikach to ten sam `klucz`, co w `events_search`?
2. **Konto serwisowe F6 dla EF** — istnieje / może powstać? Bez niego dopasowanie hurtowe (cron) jest niemożliwe; v1 = leniwe w przeglądarce.
3. **Klucze `k:<nazwisko>|<rocznik>`** — dopuścić w URL (wyniki publiczne) czy poprosić kolektor o klucz zastępczy? Dziś takie osoby nie mogą
   kliknąć „To ja" (CHECK i `RE_KLUCZ`). Ilu ich jest — do policzenia na maszynie.
4. **Widoczność wyniku zgłoszonego**: tylko `is_public` (jak profil) czy także znajomi (`friendships accepted`)? Propozycja: jak profil.
5. **Edycja krzyżowa**: zawodnik poprawia wynik wpisany przez trenera i odwrotnie — tak (polityki wyżej) czy tylko autor?
6. **Zgłoszony a odznaki/wyzwania/`pb_*`** — propozycja: nie wchodzi nigdzie, tylko podpowiedź „zaktualizuj życiówkę". OK?
7. **Link do udostępnienia bez sesji** — F6 zostaje tylko dla zalogowanych (401 anon)? Jeśli tak: dokładamy powrót do hash po logowaniu
   (mały mechanizm `sessionStorage` bez danych) czy link działa dopiero po ręcznym zalogowaniu?
8. **Nowa strona `wyniki.html`** (propozycja) czy rozbudowa `races.html`?
9. **Progi tempa** z 3.3 — akceptacja liczb (z rekordów świata i rozsądku, nie z pomiaru) i CHECK 2:20–20:00/km w bazie.
10. **Rekord trasy z wierszy `probable`** (dopiętych po nazwisku i roczniku) — liczyć z etykietą czy pomijać?
11. **Powiadomienie push** przy różnicy > 2 % (`notifications` + `trigger_send_push`) czy tylko dopisek w UI?
12. **Licznik użycia** `wyniki.html` (ekran, bez kluczy) — chcemy pomiar, czy pytamy Maćka/Kasię jak dotąd?
