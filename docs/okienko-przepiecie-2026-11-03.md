# Okienko — przepięcie na nową wersję dla wszystkich (3.11.2026, gałąź okienko/przepiecie, do OK Filipa)

Dla użytkownika to po prostu **Okienko**: bez „2.0”, „v2”, „nowe okienko”, „beta” w interfejsie, odpowiedziach, chipach i tytułach
(etykieta „okienko 2.0” zdjęta z `js/okienko.js`; blizna-130 skanuje teksty widoczne dla ludzi).

## 1. Przełącznik (bez deployu, bez migracji)

Przełącznik istnieje od E0 (`okienko_ustawienia`, RPC `okienko_wersja()`; test po skutku `tools/okienko-v2-test.sh`, asercje 3a/3b).

Włączenie dla wszystkich:
```sql
update public.okienko_ustawienia set wartosc = 'true', zmieniono = now() where klucz = 'v2_dla_wszystkich';
```

Powrót (wybierz jeden):
```sql
-- A) wszyscy wracają do starego okienka, nowa wersja tylko dla kont z listy (Filip + testowe) — zwykły powrót:
update public.okienko_ustawienia set wartosc = 'false', zmieniono = now() where klucz = 'v2_dla_wszystkich';
-- B) awaryjnie: nowa wersja wyłączona dla WSZYSTKICH, także z listy:
update public.okienko_ustawienia set wartosc = 'false', zmieniono = now() where klucz = 'v2_wlaczone';
```
Sprawdzenie stanu: `select klucz, wartosc, zmieniono from public.okienko_ustawienia order by klucz;`

Uwagi:
- Przeglądarka pyta o wersję raz na sesję strony (`js/okienko.js`, `_wersja`) — po UPDATE otwarte karty zmieniają wersję po odświeżeniu.
- Awaria nowej wersji (nagłówek `X-Okienko-Wersja: v1`) i tak przełącza sesję na stare okienko — bez naszego ruchu.
- Limity dzienne liczą się per wersja (nowa: `okienko_v2_log`), budżet miesięczny wspólny (v1 + v2) — bez zmian.

## 2. Co weszło przed przepięciem (gałąź okienko/przepiecie)

| punkt | zmiana | blizna |
|---|---|---|
| bez etykiety wersji | `js/okienko.js`: zdjęte „okienko 2.0”; kciuki zostają (tylko gdy odpowiedź ma `log_id`) | 130 |
| blokada podwójnego wysłania | `js/okienko.js` `wyslij`: póki trwa odpowiedź, kolejne wysłanie (Enter, przycisk, chip) ignorowane, przycisk „Zapytaj” wyłączony | 131 |
| ławka akcji | router (wspólny v1 i v2): wyprawa i jej cel, „dokąd biegniecie”, „czy biegniecie do X”, Częstochowa/Jasna Góra, licznik („ile km już jest”), zdrowie innych osób („co mu jest”); potok v2: po starcie licznik z `akcja_licznik`, wyprawa „zdradzimy na mecie” (cel nigdy), dopytanie po akcji bez modelu | 132 + `tests/lawka-akcji.test.js` |
| „ile osób korzysta” | „o nas” + liczba z bazy: konta z logowaniem bez usuniętych, w dół do dziesiątek („Z BiegaMy korzysta ponad 90 biegaczy.” przy 91) | 133 |
| „pokaż profil Kasi / Filipa” | „o nas” + karta profilu (oba profile publiczne), bez przycisku znajomości; wygrywa z nawigacją do własnego Profilu | 133 |
| nazwisko Kasi | bez zmian: odmowa (decyzja Filipa nie została podana — przyjęte NIE) | — |

Ławka akcji: 22 pytania × 3 stany licznika (przed startem / wyprawa trwa / po dotarciu) × 3 konteksty rozmowy = 192 przypadki.
Wynik 3.11: **atrapy 192/192, na żywo 192/192** (prawdziwy klasyfikator, sieć, model rozmowy i model v1 Gemini; prawdziwy cel wyprawy
z bazy na liście zakazanych słów, nie drukowany; **0 wywołań Gemini** — wszystkie pytania zatrzymał router). Licznik prawdziwego `akcja_licznik`
nie jest dostępny anonimowo (42501), więc stany licznika są odtworzone w ławce w kształcie RPC.
Komenda: `node tests/_lawka-akcji.js` (atrapy) albo `AKCJA_CEL_SEKRET=<z bazy> GEMINI_API_KEY=… node tests/_lawka-akcji.js --zywy`.
