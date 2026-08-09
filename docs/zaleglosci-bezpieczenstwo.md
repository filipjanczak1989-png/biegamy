# Zaległości bezpieczeństwa

Rzeczy znalezione przy okazji innej roboty, które nie są dziś dziurą, ale staną się nią,
gdy ktoś dołoży kod nieświadomy warunku. Każdy wpis ma: **stan na dziś**, **czym grozi**,
**bramkę do wykonania przy zmianie**.

Pełny audyt anty-XSS zamknięty w maju 2026 — ślad w `git log --grep "(anti-XSS)"`.
Audyt prywatności (F1–F5) zamknięty w lipcu 2026.

---

## ⚠️ `intervals_activities.raw_data` trzyma PEŁNE tętno, niezależnie od `hr_public`

**Znalezione:** 8 sierpnia 2026, przy opisywaniu wariantu „dane" karty treningu.
**Stan na dziś: NIE ma wycieku.** Wpis jest o pułapce, nie o incydencie.

### Na czym polega

`intervals-activity-detail` filtruje tętno funkcją `stripHr()` — ale **wyłącznie na wyjściu
EF-a**, tuż przed `return`. Do bazy zapis idzie **wcześniej i zawsze pełny**:

```
index.ts:114–120   ścieżka cache   → J(200, canSeeHr ? out : stripHr(out))
index.ts:169–182   ścieżka świeża  → insert/update rowc { raw_data: payload }   ← PEŁNY, przed stripem
index.ts:184       return          → J(200, canSeeHr ? payload : stripHr(payload))
```

To jest **decyzja projektowa, nie błąd**: cache ma być jeden dla wszystkich widzów, a o tym,
kto zobaczy tętno, rozstrzyga się przy odczycie. Konsekwencja: w tabeli leży komplet HR
także dla zawodników z `hr_public = false`, a bramka `canSeeHr` **istnieje tylko w tym
jednym EF-ie**.

### Czym grozi

Każdy przyszły konsument chodzący po `service_role` — a karty, crony i EF-y raportowe
chodzą — czyta `raw_data` **z pominięciem RLS i z pominięciem `stripHr`**. Kod, który
„po prostu bierze przebieg z cache'u", opublikuje tętno wszystkich. Pułapka jest cicha:
nic nie rzuci błędu, dane po prostu będą.

### Kto to dziś czyta (zmierzone 8/8, grep na całym repo)

| miejsce | co bierze | ocena |
|---|---|---|
| `intervals-activity-detail:114` | własny cache | ✅ ma `canSeeHr` + `stripHr` na obu ścieżkach |
| `generate-training-plan:303` | `raw_data` z 20 ostatnich aktywności | ✅ **bez wycieku** — czyta dane TEGO zawodnika, dla którego generuje plan, a plan widzi zawodnik i jego trener; oboje i tak mają `canSeeHr = true` |

Konsumentów jest **dwóch i tylko dwóch**. Żaden nie przecieka.

### Bramka

**Przy dokładaniu KAŻDEGO nowego czytelnika `intervals_activities.raw_data`:**

1. Ustal, **kto zobaczy wynik**. Jeśli ktokolwiek poza właścicielem i jego trenerem —
   sprawdź `athletes.hr_public` **w swoim kodzie**. Nie zakładaj, że dane z cache'u
   są przefiltrowane, bo nie są.
2. Pola do wyczyszczenia (komplet — patrz `stripHr`, `index.ts:84`):
   `series.hr` · `splits[].hr_avg` · `hr_zones` · `has_hr`.
   ⚠️ **`splits[].hr_avg` to per-kilometrowe tętno** — najłatwiejsze do przeoczenia,
   bo siedzi w tablicy, a nie w obiekcie `series`.
3. Jeśli konsumentów zrobi się trzech, **przenieś `stripHr` do wspólnego modułu**
   zamiast kopiować. Trzecia kopia listy pól to ta sama choroba co `RUN_TYPES`.

**Pierwszy przypadek, który tę bramkę uruchomi:** wariant „dane" karty treningu
(wykres tętna) — opisany w `karty-rodzaje-spec.md`, „Na później, nie teraz".

### Czego świadomie NIE robimy

Nie czyścimy tętna w bazie ani nie rozdzielamy cache'u na wersję z HR i bez. Cache jest
jeden i pełny, bo właściciel i trener mają prawo do kompletu, a dublowanie wierszy pod
widoczność mnożyłoby stan, który może się rozjechać. Filtrujemy **przy odczycie** — tak
jak wszędzie indziej w tej aplikacji.

---

## Kolumny `strava_*` w bazie — ZMIERZONE, problem teoretyczny

**Zgłoszone 9 sierpnia 2026** przy porządkowaniu metryczki `index.html`, gdzie strona obiecywała
integrację ze Stravą. Integracja jest **nieosiągalna od dawna**: w całym repozytorium nie ma ani
jednego adresu `strava.com/oauth`, więc użytkownik nie ma jak zainicjować połączenia. Żywa
integracja to intervals.icu.

Podejrzenie brzmiało: tokeny części zawodników mogą wciąż leżeć w bazie z czasów, gdy Strava
działała. **Sprawdzone — nie leżą.**

| co | ile |
|---|---|
| `athletes.strava_access_token` | **0** (przy 47 zawodnikach) |
| `athletes.strava_refresh_token` | **0** |
| `athletes.strava_token_expires_at` | **0** |
| `athletes.strava_athlete_id` / `strava_connected_at` | **0** / **0** |
| `strava_activities` (cała tabela) | **0 wierszy** |
| `training_logs` z `external_source='strava'` | **0** |
| `athlete_intake_forms.strava_url` | **0** |
| `jr_strava_bonuses` | **0 wierszy** |

**Wniosek: nie ma czego kasować.** Zero danych uwierzytelniających, zero aktywności. Kolumny są
puste i zostają — reguła „Strava porzucona, ale kod zostaje pod Garmina" nadal obowiązuje, a puste
kolumny nic nie kosztują.

**Jeden wyjątek, który NIE jest tokenem:** `training_logs.strava_link` ma **199 wypełnionych
wierszy**. To adresy URL wklejone ręcznie przez zawodników przy logach, nie dane dostępowe —
nie dają nikomu dostępu do cudzego konta i nie pochodzą z OAuth. Zostają.

**Klauzule w `privacy.html`, `privacy-en.html` i `terms.html`** opisujące przetwarzanie danych ze
Stravy są warunkowe („jeśli połączysz konto…"), więc nie kłamią. Przy tym stanie bazy można je
kiedyś usunąć jako martwe, ale to zmiana w tekście prawnym — osobna decyzja, nie porządki.
