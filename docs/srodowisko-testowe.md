# Środowisko testowe (staging) — Cloudflare Pages + osobny projekt Supabase Free

Stan 9.10.2026: gałąź `test` na GitHubie; front testowy **https://biegamy-test.pages.dev** (Cloudflare Pages,
production branch `test`, podglądy wyłączone); projekt Supabase testu `hgqvhisbaveoawssehpp` (Frankfurt) —
**schemat ZAŁOŻONY 9.10** ze zrzutu prod: 60 tabel, 173 polityki public + 19 storage, 8 bucketów, 32 funkcje
(prod 31 — różnica niżej, „Różnice baza test vs prod"). Jeszcze bez: seed.js, ustawień Auth, Edge Functions.
Prod (GitHub Pages + projekt `afqojgkaveykxbltxzwm`)
zostaje bez zmian. Cel: smoke na telefonie **przed** pushem na `main`.

## Jak to działa

| Element | Prod | Test |
|---|---|---|
| Front | GitHub Pages, `main`, `biegamy.run` | Cloudflare Pages, gałąź `test`, `<projekt>.pages.dev` |
| Build | `deploy.yml` (bump `CACHE_VERSION`, `?v=`) | `tools/test-env/cf-build.sh` (to samo, wersja `biegamy-test-…`) |
| Baza + Auth + Storage + EF | projekt prod | osobny projekt Supabase Free |
| Wybór backendu | `sb.js`: każdy host spoza listy | `sb.js`: host DOKŁADNIE na `BM_HOSTY_TESTOWE` |
| SW, cache, localStorage | origin `biegamy.run` | inny origin — nic się nie miesza |

Przełącznik (`sb.js`, `window._bmWybierzSrodowisko`): **artefakt z `cf-build.sh` ma flagę `BM_ARTEFAKT_TESTOWY = true`
→ baza testowa na KAŻDYM swoim hoście** (pages.dev i podglądy). W repo i na prod flaga = `false`. Dodatkowo
**TEST dla hosta z listy `BM_HOSTY_TESTOWE`** (np. przyszła własna domena); wszystko inne, także
wyjątek w przełączniku, = **PROD jak dotąd**. Host z listy, ale bez kompletnej konfiguracji testowej = **brak
połączenia z bazą** (nie prod) i czerwony pasek. Na teście zawsze żółty pasek „ŚRODOWISKO TESTOWE".

## ⚠️ Pages przekierowuje .html → przejście na Workers (zmierzone 9.10)

Na https://biegamy-test.pages.dev każda strona `.html` odpowiada **308** na adres bez rozszerzenia
(`/zawodnik.html → /zawodnik`, `/kalendarz.html?role=athlete → /kalendarz?role=athlete`). Cloudflare Pages nie
ma opcji, żeby to wyłączyć. Skutek dla SW: precache trzyma pod `/zawodnik.html` odpowiedź PO przekierowaniu, a Chrome
nie poda takiej odpowiedzi nawigacji (tryb przekierowań „manual") — **offline linki aplikacji skończyłyby się
błędem sieci**, czego na prod (GitHub Pages, 200 bez przekierowań) nie ma. Test różniłby się od prod dokładnie
w tym, co ma sprawdzać.

**Rozwiązanie: Cloudflare Workers + static assets** z `html_handling: "none"` (`tools/test-env/wrangler.jsonc`)
i mały `tools/test-env/worker.js` (tylko `/` → `/index.html`). Sprawdzone lokalnie (`wrangler dev`):
`/zawodnik.html`, `/kalendarz.html?role=athlete`, `/offline.html`, `/` → 200 bez przekierowań; brak pliku → `404.html` z 404
(jak GitHub Pages). W panelu Cloudflare: Workers & Pages → Create → **Workers** → Import a repository → repo
`biegamy`, gałąź `test`; Build command `bash tools/test-env/cf-build.sh`; Deploy command
`npx wrangler deploy --config tools/test-env/wrangler.jsonc`. Adres: `biegamy-test.<konto>.workers.dev`.
Projekt Pages można potem usunąć. Flaga artefaktu testowego działa tak samo (to ten sam `cf-build.sh`).

## Keepalive (sekrety repo)

GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:

| Nazwa | Wartość |
|---|---|
| `TEST_SB_URL` | `https://hgqvhisbaveoawssehpp.supabase.co` |
| `TEST_SB_ANON_KEY` | klucz **publishable** testu (ten sam co `BM_TEST.key` w sb.js) — NIGDY secret |

⚠️ Harmonogram GitHub działa tylko z gałęzi domyślnej: `keepalive-test.yml` musi trafić na `main` (plik nie
dotyka prod — pyta wyłącznie bazę testową). Do tego czasu pauzę odsuwa każde użycie projektu (skrypty, seed).

## Zakładanie (raz)

1. **Projekt Supabase Free** (drugi dozwolony aktywny projekt). Zapisz: `TEST_REF`, URL, klucz publishable/anon,
   klucz secret, hasło bazy — **hasła i klucze secret tylko lokalnie** (menedżer haseł), nigdy w repo ani czacie.
2. **Auth w panelu projektu testowego**: Site URL = adres pages.dev; Redirect URLs: `https://<host>/index.html`.
   Logowanie hasłem działa od razu; Google wymaga osobnego klienta OAuth w Google Cloud (opcjonalne).
3. **Schemat ze zrzutu PROD** (nie z migracji). Wymaga **Docker Desktop** (CLI uruchamia pg_dump w kontenerze);
   **hasło bazy prod NIE jest potrzebne** — `db dump --linked` loguje się tokenem CLI (zmierzone 8.10, CLI 2.98.1):
   `TEST_REF=… TEST_DB_URL='postgresql://…' TEST_ANON_KEY=… bash tools/test-env/zaloz-baze-testowa.sh`
   — zrzut schematu, uzupełnienia (buckety, polityki storage, trigger rejestracji, publikacja realtime),
   podmiana adresu prod → test z twardą kontrolą, sekrety vault, kontrola liczb.
   - `TEST_DB_URL` = **Session pooler** testu (`postgres.<ref>@aws-1-eu-central-1.pooler.supabase.com:5432`), NIE
     `db.<ref>.supabase.co` — ten host ma tylko IPv6, a psql w kontenerze Docker Desktop IPv6 nie ma.
   - SQL wykonuje psql z obrazu `public.ecr.aws/supabase/postgres:17.6.1.104`, każdy plik w jednej transakcji
     (`supabase db query` wysyła plik jako jedno prepared statement → 42601 przy wielu instrukcjach).
   - Wznowienie bez ponownego zrzutu: `WZNOW=ostatni …`; odświeżenie samych uzupełnień z prod (tylko odczyt
     generatora): `ODSWIEZ_UZUPELNIENIA=1 WZNOW=ostatni …`. Znaczniki `<plik>.ok` w `~/.cache/biegamy-test/<data>/`.
   - Uzupełnienia są warunkowe (zrzut SAM ma publikację `athletes`) i deparsowane przy pustym `search_path`
     (inaczej `uid()` / `FROM athletes` bez schematu padają na bazie z innym search_path).
   - ⚠️ `EAUTHQUERY unsupported or invalid secret format` przy zrzucie (pooler prod, tymczasowa rola CLI) był
     CHWILOWY — dwa kolejne `db dump` przeszły bez zmian (9.10). Skrypt jeszcze nie ponawia sam; ponów ręcznie.
   - Zapytania do testu przez CLI bez hasła: `supabase link --project-ref hgqvhisbaveoawssehpp --workdir <katalog
     poza repo>` (zapisuje pooler; samo `project-ref` w workdir nie wystarcza — CLI idzie na host IPv6), potem
     `supabase db query --linked --workdir <katalog> "…"`. Podpięcie repo do prod zostaje nietknięte.
4. **Dane syntetyczne**: `TEST_SB_URL=… TEST_SERVICE_KEY=… node tools/test-env/seed.js` → 3 konta
   (`trener@`, `ala@`, `bartek@biegamy-test.invalid`, hasło wypisane raz na ekran).
5. **Edge Functions**: skopiuj `tools/test-env/sekrety-test.env.przyklad` POZA repo, uzupełnij,
   `TEST_REF=… SEKRETY=… bash tools/test-env/deploy-ef.sh`.
6. **Cloudflare Pages**: połącz repo; Production branch = `test`; Build command `bash tools/test-env/cf-build.sh`;
   Output `dist`. Podglądy innych gałęzi: wyłącz (porządek, nie bezpieczeństwo — każdy artefakt z cf-build.sh
   ma flagę testową, więc i tak łączy się z bazą TESTOWĄ).
7. **`sb.js`**: `BM_TEST.url` i `BM_TEST.key` (publishable — publiczny, jak prod) — WPISANE 8.10. Host pages.dev
   NIE musi trafić na listę (flaga artefaktu); lista tylko dla ewentualnej własnej domeny testu.
8. **intervals.icu** (opcjonalne): w ustawieniach aplikacji client_id 533 dopisz redirect URI
   `https://<host>/intervals-callback.html`.
9. **Keepalive**: sekrety repo `TEST_SB_URL`, `TEST_SB_ANON_KEY`; workflow `keepalive-test.yml` musi być na `main`.

## Różnice baza test vs prod (zmierzone 9.10, porównanie nazw `pg_proc` i `pg_event_trigger`)

| Co | Prod | Test | Skąd |
|---|---|---|---|
| `public.rls_auto_enable()` + event trigger **`ensure_rls`** (`ddl_command_end`: CREATE TABLE / CREATE TABLE AS / SELECT INTO) | BRAK | JEST (właściciel `postgres`, SECURITY DEFINER) | Supabase zakłada to w NOWYCH projektach; nie pochodzi ze zrzutu |
| event trigger `issue_pg_graphql_access` — tagi | `CREATE FUNCTION` | `CREATE EXTENSION` | wersja platformy przy zakładaniu projektu |

Pozostałe 31 funkcji `public`: identyczne nazwy i sygnatury, żadna nie należy do rozszerzenia.

⚠️ **`ensure_rls` sprawia, że test jest BEZPIECZNIEJSZY niż prod dokładnie w tym, co test ma sprawdzać.** Każda
nowa tabela w `public` dostaje na teście RLS automatycznie; na prod migracja bez `enable row level security`
zostawi tabelę bez RLS (o dostępie decydują wtedy same granty). Migracja „zielona na teście" może otworzyć tabelę
na prod. Do decyzji (osobny zwiad): zdjąć `ensure_rls` z testu (wierność prod) albo dodać go na prod (zmiana
zachowania prod). Dopóki nierozstrzygnięte: nowa tabela = `enable row level security` jawnie w migracji,
niezależnie od wyniku na teście.

## Smoke na telefonie (każda zmiana przed `main`)

1. Wypchnij zmianę na gałąź `test` (nie na `main`). Cloudflare buduje sam (1–2 min).
2. Na telefonie otwórz `https://<host>/` — **żółty pasek „ŚRODOWISKO TESTOWE"** musi być widoczny. Brak paska = STOP
   (to prod albo stara wersja).
3. Zaloguj się `ala@biegamy-test.invalid` (hasło z seed.js). „Dziś": plan, logi, wiadomość trenera, pierścień.
4. Plan → tydzień z treningami syntetycznymi. Starty → „Bieg Testowy 10 km" z zapisem.
5. Offline: tryb samolotowy po jednym udanym wejściu → „Dziś" i Plan z migawki, pasek „Offline · dane z HH:MM".
6. Powrót z tła po > 10 min z siecią → dane odświeżone bez przeładowania; po nowym pushu na `test`
   i > 30 min — jedno przeładowanie na nowy kod.
7. Trener: wyloguj, zaloguj `trener@biegamy-test.invalid` → panel z dwoma zawodnikami.
8. Dopiero po zielonym smoke: merge `test` → `main` (prod).

Dodanie do ekranu głównego (PWA) na teście tworzy **osobną** aplikację (inny origin) — nie myli się z prod.

## Czego NIE da się przełączyć (faza 1)

| Co | Dlaczego | Skutek na teście |
|---|---|---|
| Push (VAPID) | publiczny klucz VAPID zaszyty w `sb.js` i `sw.js` (prod) | push nie działa |
| Webhook intervals | aplikacja intervals ma JEDEN adres webhooka (prod) | brak automatycznego importu; ręczny sync działa |
| Cron (raport miesiąca, poranny brief) | świadomie nie zakładamy | brak — wołałyby AI co godzinę |
| Maile (Resend) | sekret pusty | nic nie wychodzi |
| `index.html` `<link rel="preconnect">` | kosmetyka | łączy się wstępnie z prod — nic nie wysyła |
| `food-image-fetch` zapasowy obrazek | publiczny plik z magazynu prod | tylko odczyt obrazka |
| `window.SB_FN_URL \|\| '<prod>'` (kalendarz, nutrition, intervals-callback) | wartość awaryjna, gdy sb.js nie wstał | na teście sb.js ustawia SB_FN_URL — prod nieużywany |

## Ryzyka dla prod

- **Podgląd innej gałęzi w Cloudflare**: dzięki fladze artefaktu łączy się z bazą TESTOWĄ (nie prod). Ryzyko
  odwrotne pilnuje build i test blizna-52: flaga `true` w repo = build STOP; deploy.yml nie używa cf-build.sh.
- **Zrzut z prod** czyta schemat (bez danych) przez CLI podpięte do prod — skrypt odmawia, jeśli podpięty projekt
  nie jest prod, i jeśli adres testu wskazuje prod; po podmianie STOP, gdy zostanie choć jeden adres prod.
- **seed.js / deploy-ef.sh / keepalive** odmawiają pracy z adresem prod.
- **Zmiana `sb.js` trafia na prod** (ten sam plik): na hoście prod zachowanie identyczne — test
  `tests/blizna-52` sprawdza macierz hostów i niezmienione wartości prod.
- Pauza projektu Free po 7 dniach: keepalive raz w tygodniu; czy zapytanie REST wystarcza jako „aktywność",
  sprawdź po pierwszych 8 dniach w panelu (status projektu).
