# Status synchronizacji + kreator naprawy (3.11.2026)

Powód: Kasia po zmianie telefonu — import martwy od 6.10, intervals przy Garminie pokazuje 401. Dotąd BiegaMy widziało tylko
„nic nie przyszło od X dni” i nie umiało powiedzieć, KTÓRE ogniwo stoi (blizna-20: sam czas nie odróżnia zepsutej rury od przerwy).

## Ogniwa

Rura: zegarek → aplikacja producenta → intervals.icu → BiegaMy. Źródłem prawdy jest intervals (jedno zapytanie o aktywności z 30 dni):

| ogniwo | warunek | co widzi człowiek |
|---|---|---|
| `brak` | nie połączony z intervals | nic nowego (dotychczasowy panel „Połącz zegarek”) |
| `token` | intervals odpowiada 401/403 | „Połączenie BiegaMy ↔ intervals.icu wygasło” + przycisk „Połącz ponownie z intervals” |
| `zegarek` | intervals OK, ale brak aktywności od > 7 dni | „Zegarek nie wysyła treningów do intervals.icu (Garmin Connect) — ostatni 28 dni temu” + kroki ①–④ |
| `import` | intervals ma nowsze niż BiegaMy (> 1 dzień) | „intervals.icu ma nowe treningi, BiegaMy jeszcze nie” + „Sprawdź teraz” |
| `siec` | inny błąd / timeout 8 s | „Nie udało się sprawdzić — spróbuj za chwilę” (nikogo nie oskarżamy) |
| `ok` | reszta | nic |

Nazwa źródła z pola intervals `source` (GARMIN_CONNECT → „Garmin Connect”), awaryjnie z `device_name` — kroki mówią „Garmin”, nie ogólnie.

## Części

- `supabase/migrations/20261105_intervals_status.sql` — tabela `intervals_status` (1 wiersz na zawodnika; pisze TYLKO EF service, czyta
  właściciel i trener przez RLS). Test po skutku: `IS_Z_MIGRACJA=1 bash tools/intervals-status-test.sh` (6 asercji, transakcja wycofana).
- `supabase/functions/intervals-status/` — `ogniwo.mjs` (czysta decyzja, testowana w node) + `index.ts` (`{athlete_id}` własny albo
  podopiecznego; `{wszyscy:true}` trener, ≤ 60). Pisze intervals_status i `athletes.intervals_token_dead_at` (401 ustawia, udany odczyt czyści).
- `sb.js` WATCH: `statusSync`, `sprawdzSync`, `statusDnia` (raz na dobę w tle), `kreatorHtml` (pełny kreator w Profilu, wpięty w
  `render('status')`), `sprawdzTeraz` (ręczny sync + EF + przerysowanie w miejscu), `pasekProblemu` (jednorazowy pasek na Dziś,
  zamknięcie pamiętane per sprawdzenie). Poprawiony state OAuth: zapas w localStorage 15 min (na telefonie zgoda wraca w innej karcie).
- `intervals-callback.html` — przyjmuje state z sessionStorage ALBO localStorage; komunikat bez „CSRF”.
- `zawodnik.html` — slot `#watch-pasek-slot` pod topbarem, pasek „⌚ … Napraw ›” → `profil.html?open=icu`.
- `trener.html` Poranek — przy zawodniku ogniwo z nazwą źródła („zegarek nie wysyła do intervals (Garmin Connect) od 28 dni — kreator w jego
  Profilu”) + „⌚ Sprawdź zegarki wszystkich” (EF `{wszyscy:true}`).
- Blizna-121 pilnuje decyzji ogniwa, kształtu EF/RLS, tekstów bez żargonu (token/OAuth/CSRF/JWT), zapasu state, paska i listy trenera.

## Świadome decyzje

- Przy `zegarek` nie pokazujemy starego panelu „nic nie przyszło od X dni” — kreator mówi to samo konkretniej (bez dwóch paneli).
- Próg ciszy 7 dni; okno 30 dni (zero aktywności w oknie = `zegarek`, dni_ciszy = 30).
- Różnica 1 dnia intervals↔BiegaMy to strefa czasowa, nie `import`.
- EF oddaje fakty, teksty buduje klient — jedna kopia tekstów w sb.js.

## Do zrobienia przez Filipa

1. `IS_Z_MIGRACJA=1 bash tools/intervals-status-test.sh` → 6/6, potem migracja `20261105_intervals_status.sql`.
2. `supabase functions deploy intervals-status`.
3. Kasia (ogniwo `zegarek`, Garmin fenix 3, ostatni 6.10): komputer → intervals.icu → Settings → Connections → Garmin: Disconnect / Connect;
   przy 401 najpierw usunąć intervals.icu w Garmin Connect → Połączone aplikacje. Potem w BiegaMy „Sprawdź teraz”.

## LEKCJA — przypadek Kasi (3.11.2026, Filip 12:43: „działa, dużo tarcia, nie może się powtórzyć”)

Przebieg: zmiana telefonu → Garmin Connect na nowym telefonie nie był połączony z intervals.icu (przy Garminie w intervals „401”) →
intervals nie dostawał nic od 6.10 → BiegaMy od 6.10 nic nie importowało. BiegaMy ↔ intervals było cały czas sprawne (token z 8.07 żył),
więc panel „nie dosyła od X dni” wskazywał złe miejsce. Naprawa, która zadziałała:

1. intervals.icu → Settings → Connections → Garmin: **Disconnect**, potem **Connect** (na komputerze, logowanie do Garmina od nowa).
2. **Download old data** przy Garminie — bez tego intervals dostaje tylko NOWE treningi, przerwa (6.10–3.11) zostaje dziurą. To był
   krok kluczowy i najmniej oczywisty; stąd osobny punkt ④ w kreatorze.
3. BiegaMy: sync (okno 90 dni + dedup po external_id) dociągnął 15 treningów 6.10–2.11 bez duplikatów.

Co zmieniło się w kodzie: kroki kreatora po jednym zdaniu, „Pobierz stare dane” jako osobny krok, przycisk „Pobierz zaległe treningi”
(Profil = pełna historia, kreator/callback = 90 dni), sync od razu po ponownym połączeniu w `intervals-callback.html`, okno syncu w
`_shared/okno-syncu.mjs` (blizna-121: luka 30 dni → komplet, drugi sync → 0).

Dla trenera: gdy w Poranku widać „zegarek nie wysyła do intervals (Garmin Connect) od N dni”, to Z DEFINICJI problem po stronie
zegarek→intervals — pierwsze pytanie brzmi „zmieniałeś telefon / zegarek?”, a nie „połącz ponownie BiegaMy”.

