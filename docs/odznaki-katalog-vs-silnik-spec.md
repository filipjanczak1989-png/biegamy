# Odznaki: katalog obietnic vs silnik reguł

Stan zmierzony **12.08.2026**. Dokument opisuje, dlaczego dwie kopie `BADGES`
to nie jest zwykła duplikacja do scalenia, i co trzeba rozstrzygnąć, zanim
ktokolwiek je scali.

## Dwie role, nie dwie kopie

| plik | rola | liczba definicji |
|---|---|---|
| `odznaki.html:115` | **KATALOG** — to, co człowiek widzi jako listę celów | 110 |
| `zawodnik.html:12524` | **SILNIK** — tu mieszkają reguły `_checkBadgeRules` | 99 |

Nazwa `BADGES` w obu plikach sugeruje, że to ta sama rzecz w dwóch kopiach.
Nie jest. Jeden plik obiecuje, drugi wykonuje — a rozjeżdżają się dlatego,
że nikt nie musiał ich uzgadniać.

**Wyniesienie do `sb.js` samo z siebie tego nie naprawi.** Scalenie da jedną
listę, ale nadal będzie ona zawierała pozycje, dla których nie istnieje żadna
reguła. Scalenie bez decyzji z sekcji „Do rozstrzygnięcia" tylko ujednolici
obietnicę składaną wszystkim.

## Lista nie bramkuje przyznawania

```js
// zawodnik.html — awardBadge()
await sb.from('achievements').insert({ athlete_id: _athleteId, badge_id: badgeId });
const badge = BADGES.find(b => b.id === badgeId);
if (badge) setTimeout(() => showBadgePopup(badge), 400);   // lista TYLKO do pop-upu
```

`awardBadge` nie sprawdza `BADGES`. O przyznaniu decyduje wyłącznie istnienie
wywołania `awardBadge('id')` w `_checkBadgeRules`. Brak definicji = brak pop-upu,
nie brak przyznania.

Konsekwencja: **rozjazd list nie może zgubić żadnej odznaki po stronie bazy.**
Potwierdzone pomiarem — 0 przyznanych `badge_id` bez definicji w `zawodnik.html`,
0 przyznanych bez reguły w kodzie.

## Co realnie boli: katalog kłamie w drugą stronę

```
achievements                      : 725 wierszy, 66 różnych badge_id, 48 zawodników
przyznane, brak w odznaki.html    : 24
```

Dwadzieścia cztery odznaki, które ludzie **mają zdobyte**, nie pokazują się na
ekranie odznak, bo katalog nie ma dla nich definicji. U Filipa: **49 zdobytych
w bazie, 33 widoczne w `odznaki.html`, 16 niewidocznych.** Ten sam człowiek widzi
49 albo 33 w zależności od ekranu.

## 57 odznak bez reguły — to trzy różne problemy

Podział wg tego, **gdzie leżą dane**, nie wg trudności. `checkBadges` pobiera
dziś `logged_at, distance_km, training_type, pace, feel` (`zawodnik.html:12920`).

### A. Wykonalne z danych, które już pobieramy — 23

`sub_5min_km`, `sub_4min_km`, `sub_3_30_km`, `pierwsza_5tka`, `dwucyfrowy`,
`half_marathon`, `maratończyk`, `ultra`, `2000km_total`, `tydzien_50km`,
`tydzien_100km`, `tydzien_150km`, `streak_50`, `streak_365`, `4_w_tygodniu`,
`6_w_tygodniu`, `po_kontuzji`, `kiepski_dzien`, `7_usmiechow`, `mistrz_tempa`,
`rutyna_mistrza`, `bez_wymowek`, `bez_skipa`

Zero zmian w zapytaniu, zero zmian w schemacie — same reguły. To jest tania
połowa i najlepszy pierwszy krok.

⚠️ `2000km_total` dubluje istniejące `dystans_2000` — przy okazji do usunięcia.

### B. Dane są w bazie, ale w innej tabeli lub kolumnie — 18

`ultra_mindset` (`duration`), `plan_ukonczony` (`training_plans`), `nowy_rekord`
i `pb_run` (`athletes.pb_*`), `motywator` i `wsparcie` (`log_reactions`), `lider`
(ranking), `pierwszy_kumpel` + `krag_5/25/50` (`follows`), `pierwsza_wiad`
i `gaduła` (`messages`), `pierwszy_post`, `10_postow`, `cytat_dnia` (posty),
`pierwszy_start` i `5_startow` (`race_signups`)

Wymagają rozszerzenia kontraktu `checkBadges` o kolejne zapytania. Każde
dokłada round-trip przy starcie aplikacji — warto zrobić jednym batchem,
nie po jednym na odznakę.

### C. Danych nie ma nigdzie — 16

- **pogoda w chwili treningu** (6): `nie_ma_wymowek`, `lodowy_biegacz`, `mroz`,
  `upal`, `deszcz`, `snieg` — EF `get-weather` daje prognozę na teraz, nie
  zapisuje warunków przy logu
- **splity** (2): `negative_split`, `tempo_negatyw` — nie przechowujemy podziału
  na połówki
- **pora dnia** (4): `wczesny_ptak`, `sowa`, `poranek_5`, `noc_marathon` —
  ⚠️ `logged_at` ma godzinę, ale dla wpisów ręcznych jest **syntetyczna**
  (manual = 12:00, OCR = 10:00). Reguła oparta na tej godzinie mierzyłaby
  sposób wprowadzenia danych, nie porę biegu
- **system wyzwań** (3): `pierwsze_wyzwanie`, `5_wyzwan`, `10_wyzwan` — stała
  `WYZWANIA` istnieje od 12.08, ale nie ma licznika ukończonych
- **niejednoznaczne** (1): `silna_glowa` („trening mimo zmęczenia") — brak
  definicji, czego dotyczy

## Do rozstrzygnięcia — decyzja produktowa, nie techniczna

Katalog pokazuje cele, których silnik nie umie sprawdzić. Człowiek może dążyć
do odznaki, której nigdy nie dostanie, i **nie ma jak się dowiedzieć, że to nie
jego wina**. To gorsze niż brak odznaki: brak jest neutralny, a nieosiągalny cel
uczy, że wysiłek nie ma związku z nagrodą.

Dwie drogi, do wyboru po wrześniu:

1. **Dopisać brakujące reguły** — grupa A jest tania (23 sztuki, bez zmian
   w zapytaniach). Grupy B i C to realna praca i częściowo nowe dane.
2. **Ukryć odznaki bez reguły** do czasu, aż powstaną — katalog kurczy się do
   tego, co silnik faktycznie umie, i przestaje kłamać.

Drogi nie wykluczają się: A dopisać, B i C ukryć do czasu.

## Zasada na przyszłość

**Nowa pozycja w katalogu bez reguły w silniku = obietnica bez pokrycia.**
Dodając odznakę, dodaje się jedno i drugie w tym samym commicie — albo nie
dodaje się wcale.
