# Akcja — które typy treningów się liczą (zwiad 2.11.2026)

Zasada Filipa (2.11  18:35): **do akcji liczą się tylko bieg i chód.** Wdrożona tego samego dnia
(`supabase/migrations/20261102_akcja_typy.sql`  funkcja `public.akcja_typ_liczy` — jedyna lista typów akcji).

- **Liczy:** bieg w każdej odmianie (typy `is_run_type`: spokojny  bieg spokojny  wybieganie  długi  tempo  progresja  interwały  start  wyścig  regeneracja; plus „wzmacniający”)  chód: spacer  marsz  nordic walking  nordic  wędrówka.
  Z zegarka (`external_type`  gdy jest): Run  TrailRun  Treadmill  VirtualRun  Walk  Hike  NordicWalk.
- **Nie liczy:** rower (każdy)  pływanie  siła  Zastępczy  Odpoczynek  „inny” i **każdy typ nieznany**.
  Wpis z zegarka z innym typem niż bieg/chód nie liczy  nawet gdy ktoś ręcznie zmienił `training_type` na bieg.

Dane: cała tabela `training_logs` na produkcji 2.11 (bez wpisów `__badge__`). Akcja liczy dopiero od startu (7.11) —
historia poniżej to tylko obraz tego  jakie typy w ogóle występują.

## Liczy — 3353 wpisów, 27 900 km
| training_type | external_type (zegarek) | wpisów | km | źródło |
|---|---|---:|---:|---|
| Spokojny |  | 1845 | 14 717.8 | aplikacja, intervals, ręczny/stary |
| Bieg spokojny |  | 266 | 2 375.6 | aplikacja, intervals, ręczny/stary |
| Regeneracja |  | 203 | 1 355.2 | aplikacja, intervals, ręczny/stary |
| Interwały |  | 169 | 1 404.6 | aplikacja, intervals, ręczny/stary |
| Wybieganie |  | 143 | 1 991.0 | aplikacja, intervals, ręczny/stary |
| Spokojny | Run | 138 | 1 038.9 | intervals |
| Start |  | 136 | 1 592.1 | aplikacja, intervals, ręczny/stary |
| Tempo |  | 135 | 1 057.7 | aplikacja, intervals, ręczny/stary |
| Spacer | Walk | 98 | 243.8 | intervals |
| spokojny |  | 60 | 659.8 | intervals |
| Wzmacniający |  | 31 | 370.2 | aplikacja, ręczny/stary |
| Spacer |  | 30 | 274.7 | aplikacja, intervals, ręczny/stary |
| Regeneracja | Run | 25 | 149.1 | intervals |
| Spokojny | VirtualRun | 18 | 101.8 | intervals |
| Interwały | Run | 17 | 131.0 | intervals |
| Start | Run | 16 | 156.9 | intervals |
| Wybieganie | Run | 14 | 202.3 | intervals |
| Tempo | Run | 4 | 20.5 | intervals |
| Spacer | Hike | 3 | 38.9 | intervals |
| Regeneracja | VirtualRun | 1 | 6.0 | intervals |
| Tempo | VirtualRun | 1 | 12.0 | intervals |

## Nie liczy — 1098 wpisów, 4 441 km
| training_type | external_type (zegarek) | wpisów | km | źródło |
|---|---|---:|---:|---|
| Zastępczy |  | 976 | 3 907.2 | aplikacja, intervals, ręczny/stary |
| inny |  | 39 | 0.0 | intervals |
| Siłownia | WeightTraining | 28 | 0.0 | intervals |
| Siłownia |  | 16 | 30.0 | aplikacja, intervals |
| Siłownia | Workout | 9 | 0.0 | intervals |
| Rower |  | 9 | 302.9 | aplikacja, intervals, ręczny/stary |
| Odpoczynek |  | 8 | 48.1 | aplikacja, ręczny/stary |
| Rower | Ride | 4 | 66.0 | intervals |
| Pływanie | Swim | 3 | 2.8 | intervals |
| Rower | VirtualRide | 3 | 75.4 | intervals |
| Pływanie |  | 1 | 0.2 | intervals |
| Zastępczy | Other | 1 | 0.4 | intervals |
| Ergometr | VirtualRow | 1 | 8.0 | intervals |

## Do decyzji Filipa
- **„Wzmacniający”** (31 wpisów, ~12 km na wpis — to biegi) — **liczę jako bieg**, choć nie ma go w `is_run_type`.
  Jeśli to ma nie liczyć: usuń z tablicy w `akcja_typ_liczy` (jedno miejsce) i z blizny-105.
- **„Zastępczy”** z intervals (941 wpisów, 3 357 km) — **nie liczy**. To stare importy sprzed 6.10, kiedy webhook wrzucał każdy
  nie-bieg do „Zastępczy” (spacery też), plus dziś typy spoza mapy intervals. Od 6.10 Walk/Hike idą jako „Spacer” — od 7.11 to wystarczy.
- **Nordic walking z zegarka:** mapa intervals (`_shared/typ-aktywnosci.mjs`) nie ma typu nordic walkingu, więc taki trening z zegarka
  ląduje dziś w „Zastępczy” i **nie liczy**. Ręcznie wpisany „Nordic walking” liczy, ale w ręcznym wpisie nie ma takiego przycisku — jest „Spacer”.
  `NordicWalk` w liście zegarka jest na zapas; nie sprawdziłem, czy intervals w ogóle używa takiej nazwy.
- **„Odpoczynek” z kilometrami** (8 wpisów, 48 km) — nie liczy (nieznany sens).
