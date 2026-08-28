# Migawka funkcji i triggerów z PRODUKCJI

Generowane: `node tools/funkcje-bazy.js --zrzut`
Porównanie: `node tools/funkcje-bazy.js`

To **nie są migracje**. To zapis tego, co **faktycznie stoi na produkcji**
w dniu zrzutu. Migracje w `supabase/migrations/` opisują osiem obiektów;
tutaj jest ich **53** (43 funkcje + 10 triggerów).

---

## ⚠️⚠️ ZANIM ZACZNIESZ „PORZĄDKOWAĆ": PRODUKCJA BYWA NOWSZA OD REPO

Zmierzone **28.08.2026**, przy tworzeniu tej migawki. Z ośmiu obiektów, które
repo w ogóle definiuje w `migrations/`, **dwa się rozjechały** — i w obu
wypadkach **nowsza jest baza**.

### `trigger_detect_moment` — ⚠️ PRODUKCJA WYGRYWA, NIE RUSZAĆ

| | co ma |
|---|---|
| **produkcja** (ten katalog) | **statement-level z tabelą przejściową**: `FOR r IN SELECT DISTINCT athlete_id FROM nowe … RETURN NULL` |
| `migrations/20260713000000_push_revival_security_events.sql` | starsza wersja **row-level**: `NEW.athlete_id`, `RETURN NEW` |

To jest **poprawka burstu z 5.08.2026**: import 2500 wierszy z zegarka wywoływał
2500 razy tę samą Edge Function, każde wywołanie czytało pełną historię.
Po poprawce — **jedno wywołanie na zawodnika**.

⛔ **Odtworzenie bazy z pliku migracji COFNĘŁOBY tę poprawkę.** Migracja nigdy
nie została zaktualizowana; poprawka poszła prosto do bazy.

⚠️ Poprawka siedzi **w dwóch miejscach naraz** — w ciele funkcji **i** w definicji
triggera `training_logs.trg_detect_moment_ins`
(`REFERENCING NEW TABLE AS nowe FOR EACH STATEMENT`). Sama funkcja bez triggera
jest martwa: `SELECT … FROM nowe` nie ma skąd wziąć tabeli. Dlatego migawka
obejmuje triggery, nie tylko funkcje.

### `trigger_detect_moment_row` — repo o niej NIE WIE

Funkcja istnieje wyłącznie na produkcji, żadna migracja jej nie zawiera.
Używa jej trigger `training_logs.trg_detect_moment_upd` (row-level, dla
aktualizacji — te nigdy nie są masowe, więc tam poziom wiersza jest poprawny).

### `trigger_send_push` — różnica tylko w komentarzu

Produkcja nie ma komentarza `-- push może paść, ale INSERT do notifications
MUSI przejść`, obecnego w migracji. Funkcjonalnie identyczne.
⚠️ Nieszkodliwe, ale to **dowód, że obie strony pisano osobno** — gdyby plik
był źródłem wdrożenia, komentarz by tam był.

### Zgodne (6)

`accept_intake_form`, `accept_terms`, `biegus_ranking`, `community_km`,
`delete_my_account`, `suma_biegowa` — treść identyczna po normalizacji.

---

## Dlaczego jeden plik na obiekt, a nie jeden zbiorczy

Bo migawka istnieje **po to, żeby przyszły rozjazd był czytelny**, a nie tylko
wykrywalny. W jednym pliku (~150 kB) każda zmiana byłaby hunkiem w ścianie,
`git blame` wskazywałby zawsze ten sam commit „aktualizacja migawki",
a `git log` nie odpowiadałby na pytanie „co się działo z `community_km`".

Przy jednym pliku na obiekt:
- zmiana jednej funkcji = zmiana jednego pliku, widoczna w `git log --stat`;
- `git log --follow supabase/schema/funkcje/community_km.sql` daje historię
  tej jednej funkcji;
- nowa funkcja na produkcji pojawia się jako **nowy plik**, a nie jako wtrącenie
  w środku alfabetycznej listy.

`SUMY.txt` jest dodatkiem, nie alternatywą: jedna linia na obiekt pozwala
zobaczyć w jednym diffie, **ile** się ruszyło, zanim otworzy się poszczególne pliki.

## Jak liczona jest suma

⚠️ Z postaci **znormalizowanej** (białe znaki zwinięte, małe litery), nie
z surowego `pg_get_functiondef`. Ten ostatni formatuje wynik, więc upgrade
Postgresa potrafiłby zmienić sumę bez zmiany kodu — a bramka, która krzyczy
bez powodu, przestaje być czytana.

Komentarze **zostają** w porównaniu: różnica w komentarzu też jest rozjazdem
repo↔baza i chcemy ją widzieć. Tak wyszedł `trigger_send_push`.

## Czego ta migawka NIE robi

- Nie tłumaczy, **co** te funkcje robią ani dlaczego powstały. 33 z nich nie ma
  w repo żadnego opisu — to osobny dług, do spłacania stopniowo.
- Nie jest sprawdzana w CI. Wymagałoby to poświadczeń do produkcji w CI, co
  zmienia CI w cel ataku — decyzja Filipa 29.08.2026. Porównanie uruchamia
  człowiek lokalnie, tam gdzie i tak wykonuje migracje.
- Nie obejmuje tabel, kolumn, indeksów ani polityk RLS. Tylko funkcje i triggery.
