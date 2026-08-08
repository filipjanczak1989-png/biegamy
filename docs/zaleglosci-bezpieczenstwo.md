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
