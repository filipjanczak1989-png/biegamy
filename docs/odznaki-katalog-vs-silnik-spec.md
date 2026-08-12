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

## Dwa systemy reguł, które nie mogą się nałożyć

`BADGES` + `_checkBadgeRules` liczą **całą historię** („500 km w życiu").
`WYZWANIA` liczą **okno dat**. To dwie różne rzeczy i muszą takie zostać.

> **Odznaka wyzwania nie może mieć reguły progowej w `_checkBadgeRules`.**
> Reguły tam liczą całą historię, więc `if (total >= 100)
> awardBadge('100km_wrzesien_2026')` odpaliłoby natychmiast 20 z 28 zawodników.
> Wpis w `BADGES` jest bezpieczny i **wymagany** — niesie nazwę, opis i ikonę,
> a nie warunek. Jedyną regułą dla wyzwania jest pętla po `WYZWANIA` z oknem dat.

### Skala, przed którą to broni — zmierzona 12.08.2026

```
gdyby regula liczyla CALA HISTORIE:
  maja >= 100 km w zyciu :  20 z 28 zawodnikow z logami  -> '100 km dla Kasi' natychmiast
  maja >=   1 km w zyciu :  28 z 28                      -> 'Razem' natychmiast

stan faktyczny (okno 2026-09-01 -> 2026-09-20, pomiar 2026-08-12):
  zawodnikow z jakimikolwiek km w oknie :  0
  dostaliby '100km_wrzesien_2026'       :  0
  dostaliby 'razem_wrzesien_2026'       :  0
```

Bez tych liczb rozdzielenie systemów brzmi jak przezorność. Z nimi widać, że
pojedyncza reguła progowa w złym miejscu rozdałaby odznakę wyzwania **20 osobom
za bieganie sprzed roku** — zanim wyzwanie w ogóle wystartuje.

Dlaczego wpis w `BADGES` jest wymagany, a nie tylko niegroźny: `awardBadge` nie
waliduje wobec listy, więc brak definicji **nie zatrzymuje przyznania** — zabiera
tylko pop-up (`BADGES.find()` → `undefined`, wyciszone przez `if (badge)`),
usuwa odznakę z sekcji w `zawodnik.html` i sprawia, że powiadomienie brzmi
„Zdobyłeś odznakę: 100km_wrzesien_2026 🏅" zamiast nazwy. To dokładnie ten sam
objaw co 24 odznaki przyznane bez definicji w katalogu (sekcja wyżej).

### Bramka przy każdym nowym wyzwaniu

Testem jednostkowym tego nie sprawdzisz — potrzebny jest pomiar na produkcji.
Przed wypuszczeniem policz, ilu zawodników dostałoby odznakę **przed** datą `od`.
Wynik inny niż 0 oznacza, że okno nie działa.

## Zasada: pole musi nieść tę informację, o której mówi opis

> **Odznaka musi mierzyć to, co obiecuje jej opis.** Sprawdzić, czy pole niesie
> tę informację, o której mowa — `created_at` to moment zapisu, nie treningu;
> `city` to profil, nie miejsce biegu; `precipitation_sum` to doba, nie godzina.
> **Wszystkie trzy wyglądają poprawnie w kodzie.**

To jest najgroźniejsza klasa błędu w tym module, bo nie daje żadnego objawu:
reguła się kompiluje, test przechodzi, odznaka się przyznaje. Wychodzi dopiero,
gdy człowiek zapyta, dlaczego dostał „Nocnego maratończyka" za trening o 14:00.

Zmierzone przypadki tej pułapki (12.08.2026):

| pole | co wygląda, że mierzy | co mierzy naprawdę | dowód |
|---|---|---|---|
| `logged_at` (godzina) | porę biegu | moment/sposób wpisu | 10:00 → 582 logów (OCR), 12:00 → 419 (ręczne) = **50,4% syntetycznych** |
| `athletes.city` | miejsce biegu | miasto zamieszkania z profilu | wypełnione u **17 z 48**; 3 z 11 miast nie geokodują się |
| `precipitation_sum` | opad podczas biegu | sumę z całej doby | bieg o 6:00 dostaje odznakę za ulewę o 20:00 |
| `pace` | średnie tempo biegu | cokolwiek wpisano | **8 wierszy** z `0:00`, `0:01`, `0:16` u 6 zawodników |

Test jednostkowy tego nie wykryje — dane testowe tworzy autor reguły, więc
powielają jego założenie. Wykrywa to tylko **predykcja na produkcji**: policz
przed wdrożeniem, ilu zawodników dostanie odznakę. Wynik u wszystkich albo
u nikogo oznacza, że reguła mierzy nie to, co trzeba.

## Zasada na przyszłość

**Nowa pozycja w katalogu bez reguły w silniku = obietnica bez pokrycia.**
Dodając odznakę, dodaje się jedno i drugie w tym samym commicie — albo nie
dodaje się wcale.
