# Migawka DOSTĘPU z PRODUKCJI — RLS, granty i polityki

Generowane: `node tools/polityki-bazy.js --zrzut`
Porównanie: `node tools/polityki-bazy.js`
Sprawdzenie samego narzędzia: `node tools/polityki-bazy.js --samokontrola`

To **nie są migracje**. To zapis tego, co **faktycznie stoi na produkcji**
w dniu zrzutu: **80 relacji** (74 tabele + 6 widoków), **189 polityk RLS**.
Migracje w `supabase/migrations/` opisują **17** z tych 189.

---

## ⚠️⚠️ OSTRZEŻENIE 1: TO SIĘ JUŻ ROZJECHAŁO, A PRODUKCJA BYŁA NOWSZA

W repo leżał pełny zrzut polityk z **26.05.2026**
(`.security-audit/2026-05-26/policies-all.csv`). Porównanie z produkcją
**29.08.2026** — trzy miesiące:

| | ile |
|---|---|
| polityk | 146 → **189** |
| o niezmienionej treści | 125 |
| ⚠️ **ZMIENIONYCH** | **14** |
| dodanych | 50 |
| usuniętych | 7 |

⛔ **Żadna z tych 14 zmian nie ma zapisu w `migrations/`.** Kierunek jest ten sam
co przy poprawce burstu w `trigger_detect_moment`: **produkcja jest nowsza
i poprawniejsza od repo**.

Najostrzejszy przykład — `nutrition_meals / coach_reads_athletes_meals`:

| | warunek |
|---|---|
| maj 2026 | `a.id = nutrition_meals.athlete_id` |
| produkcja dziś | `a.user_id = nutrition_meals.athlete_id` |

To jest **naprawa realnego błędu**. `nutrition_meals.athlete_id` trzyma `user_id`,
a nie `athletes.id` — przed poprawką trener **nie widział posiłków** swojego
zawodnika. ⛔ Odtworzenie tej polityki z czegokolwiek starszego **cofnęłoby
naprawę**. Tak samo `training_plans_insert_coach`, któremu dołożono na produkcji
warunek „zawodnik należy do tego trenera", i siedem polityk
`training_plans`/`training_plan_workouts`, które zeszły z roli `public`
na `authenticated`.

**Wniosek praktyczny: jeśli migawka różni się od bazy, domyślnie NOWSZA JEST
BAZA.** Zanim cokolwiek „przywrócisz", sprawdź którą stronę.

## ⚠️⚠️ OSTRZEŻENIE 2: SIEDEM TABEL Z RLS I ZEREM POLITYK

RLS włączone + zero polityk = dla każdej roli bez `BYPASSRLS` tabela jest
**pusta**. Jeśli dane mimo to gdzieś się pojawiają, idą przez funkcję
`SECURITY DEFINER` — i **nigdzie nie jest napisane, że tak ma być**.

| tabela | granty | co to znaczy |
|---|---|---|
| ⚠️ **`community_stats`** | **anon + authenticated (pełne)** | wygląda na tabelę do czytania z klienta, a przez PostgREST **nie da się z niej przeczytać nic**; działa wyłącznie przez `SECURITY DEFINER` (`community_km`) |
| `account_deletions_audit` | brak | nieosiągalna — spójne z przeznaczeniem |
| `athletes_pb_backup_20260814` | brak | jw. (kopia) |
| `backup_krok_a_20260814` | brak | jw. (kopia) |
| `radio_plays` | brak | jw. |
| `security_events` | brak | jw. |
| `storage_cleanup_queue` | brak | jw. |

⚠️ Sześć z siedmiu jest spójnych: brak grantów, brak polityk, nikt nie wchodzi.
**Wyłamuje się `community_stats`** — ma pełne granty dla `anon`
i `authenticated` (łącznie z `INSERT`/`UPDATE`/`DELETE`), a jedyne, co ją
chroni, to brak polityk. To działa, ale opiera się na nieopisanym założeniu.
Nie ruszać bez decyzji: **dodanie jakiejkolwiek polityki natychmiast otwiera
tę tabelę** w zakresie, jaki dają granty.

## ⚠️ OSTRZEŻENIE 3: widok omija RLS

Widok bez `security_invoker` czyta uprawnieniami **właściciela**, więc RLS tabel
źródłowych go nie dotyczy. Trzy widoki są nadane roli `anon`:

- `public_athletes` — **w porządku**: filtruje `is_public = true` i wystawia
  9 wybranych kolumn;
- `radio_top` — agregaty utworów, bez danych osobowych;
- ⚠️ `radio_comments_view` — **nie filtruje niczego** i dociąga `full_name`
  oraz `avatar_url` z `athletes`. Niezalogowany widzi treść wszystkich
  komentarzy radiowych wraz z imieniem i awatarem autora. Może tak ma być —
  ale to decyzja, której nikt nie zapisał.

---

## Dlaczego jeden plik na TABELĘ, a nie na politykę

Bo polityki permisywne **łączą się przez OR**. Pojedyncza polityka nie mówi,
kto ma dostęp — mówi to dopiero komplet polityk danej tabeli razem z flagą RLS
i grantami. Plik z jedną polityką byłby więc zapisem, którego **nie da się
przeczytać bez otwierania sąsiednich plików**.

Przy funkcjach było odwrotnie (`supabase/schema/funkcje/`, plik na obiekt), bo
funkcja jest samodzielna. Ta różnica jest celowa.

Efekt: 80 plików zamiast 189, a każdy odpowiada na całe pytanie „kto co widzi
w tej tabeli".

## Co jest w środku i dlaczego akurat to

Każdy plik zawiera **cztery wymiary naraz**:

1. **`relrowsecurity` / `relforcerowsecurity`** — czy RLS w ogóle działa;
2. **granty tabelowe** — czy rola dosięga tabeli;
3. **granty kolumnowe ponad tabelowe** — patrz niżej;
4. **polityki** — komplet, posortowany.

⚠️ **Migawka samych polityk byłaby ślepa dokładnie tam, gdzie boli.** To ta sama
pułapka, którą przy funkcjach dały triggery: `relrowsecurity` i granty **nie są
własnością polityki**. D7 pokazało, że dla `anon` realną bramką był GRANT, nie
polityka — `anon` nie ma grantów na 64 z 74 tabel, więc rola `public`
w politykach jest tam martwą literą. Bez wymiarów 1–3 migawka pokazywałaby
„bez zmian" po wyłączeniu RLS albo po dosypaniu grantu dla `anon`.
Samokontrola sprawdza każdy z tych wymiarów osobno.

⚠️ **Granty kolumnowe są tu nośne, nie kosmetyczne.** Jest ich 66 i bez nich
migawka kłamałaby w stronę uspokajającą:

- `athletes` **nie ma** tabelowego `SELECT` dla `authenticated` — ma go na
  **55 wymienionych kolumnach**. Migawka tabelowa twierdziłaby, że zalogowany
  nie czyta `athletes`.
- `game_events` daje `anon` `INSERT` na czterech kolumnach, ale **nie na
  `athlete_id`** — czyli anonim może dodać zdarzenie, ale nie może go przypisać
  do cudzego konta. Ta ochrona jest wyłącznie kolumnowa.

## Dlaczego pliki są .txt, a nie .sql

⚠️ Format jest **opisowy, nie wykonywalny** — i to decyzja, nie estetyka.
Pierwsza wersja renderowała stan jako gotowe `CREATE POLICY …` <!-- bramka:przyklad -->
i `GRANT … TO anon`. Dwa powody, dla których to było złe:

1. **Plik wyglądający na wykonywalny zachęca do odtworzenia produkcji z repo** —
   czyli do dokładnie tego, przed czym ostrzega OSTRZEŻENIE 1 na górze tego
   pliku. Migawka ma być zapisem stanu, nie kuszącym skryptem.
2. **Zderzało się to z `tools/bramka-commit.js`**, która słusznie blokuje
   `GRANT … TO anon` i `CREATE POLICY` w dodanych liniach — a dla `anon` <!-- bramka:przyklad -->
   robi to również w CI. Migawka **prawdziwie** zawiera granty dla `anon`
   (np. `community_stats`, `game_events`), bo tak jest na produkcji, więc
   każde jej odświeżenie zapalałoby CI na czerwono.

⚠️ Bramka ma wyjście — znacznik `bramka:przyklad` w linii — ale z twardym
limitem 12 linii i własnym komentarzem: „rosnąca lista wyjątków znaczy, że
reguła jest zła, nie że potrzeba więcej wyjątków". Migawka dałaby ich setki.
**Osłabienie reguły chroniącej przed uprawnieniem dla niezalogowanego byłoby
złą odpowiedzią na dobre ostrzeżenie — więc zmienił się format, a nie bramka.**

Informacja jest ta sama i czytelniejsza. Zmienia się to, że pliku nie da się
bezmyślnie wkleić do `db query`.

## Jak liczona jest suma

⚠️ Z postaci **znormalizowanej** (białe znaki zwinięte, małe litery).
`pg_policies.qual` to tekst **po deparse**, nie źródło — Postgres sam dokłada
kwalifikacje (`id` → `athletes.id`, 134 z 189 polityk) i rzutowania
(`'planned'::text`, 27 polityk). Dobra strona: suma **nie zależy od tego, jak
ktoś napisał DDL**. Zła: zależy od deparsera, więc upgrade Postgresa może ją
ruszyć bez zmiany znaczenia — ta sama akceptowana cena co przy funkcjach.

⚠️ **Role i uprawnienia są SORTOWANE.** `roles` przychodzi jako tablica
(`{anon,authenticated}`) i kolejność nie jest niczym gwarantowana — bez
sortowania ta sama polityka dawałaby dwie różne sumy, czyli migotanie przy
niezmienionej bazie. Samokontrola ma na to osobny przypadek.

## Czego ta migawka NIE robi

- **Nie obejmuje schematu `storage`** — tam żyje kolejnych **19 polityk**
  (m.in. dla awatarów i kart), a 2 dalsze są poza `public` i `storage`.
  To znana, nazwana dziura, nie przeoczenie.
- Nie tłumaczy, **dlaczego** dana polityka powstała. Zapisuje stan, nie zamiar.
- Nie jest sprawdzana w CI — wymagałoby to poświadczeń do produkcji, co zmienia
  CI w cel ataku. ⚠️ Sama `--samokontrola` bazy nie potrzebuje, więc mogłaby
  stać w CI; dziś nie stoi.
- Nie obejmuje tabel, kolumn ani indeksów jako takich — tylko to, kto ma do nich
  dostęp. Definicje funkcji i triggerów są w `supabase/schema/funkcje/`.
