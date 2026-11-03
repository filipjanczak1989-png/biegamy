# Intervals / Garmin — plan B (3.11.2026): audyt importu, bezpieczniki, czujka, komunikat

Tło: 9.10 intervals zapowiada blokadę danych Garmina przez API (bez daty); 14.10 „łatwiejsza ścieżka dla osób prywatnych i aplikacji” (bez
szczegółów); forum (wątek t/609, posty Davida #878, #883, #890 z 26.10) — inne aplikacje spodziewają się aktywności Garmina jako WYDMUSZEK
(id, source, start — bez dystansu i strumieni) albo znikania z listy; FIT wgrane ręcznie raczej OK; inne marki bez zmian.

## 1. Audyt kodu (stan przed poprawkami, 3.11)

| ogniwo | co robi, gdy aktywność Garmina przyjdzie jako WYDMUSZKA | gdy ZNIKNIE z listy intervals |
|---|---|---|
| `intervals-sync` (lista 90 dni) | dedup po `external_id` → już zaimportowane NIE są dotykane (żadnego UPDATE pustymi polami); nowa wydmuszka (bez dystansu i czasu) wpada w filtr „ogryzków” (< 60 s i < 300 m) → **znika bez śladu**: brak logu, plan zostaje `planned` | nic — sync tylko WSTAWIA; **nigdzie w repo nie ma `training_logs.delete`** (sprawdzone grepem po wszystkich EF) → nasze logi zostają |
| wzbogacanie wpisu ręcznego (`kolizja-importu.mjs`) | `rozstrzygnijKolizje` przy km ≤ 0 → `wstaw` (brak_dystansu) → wydmuszka **nigdy nie scala się** z wpisem ręcznym; `zbudujWzbogacenie` kopiuje tylko pola ≠ null i nigdy `distance_km`/`duration`/`comment` | — |
| `intervals-webhook` | ten sam filtr ogryzków → wydmuszka pominięta (`skipped`), insert z catch 23505 (idempotentny) | — |
| `domknijPlanyPoImporcie` | woła się tylko dla wstawionych logów → wydmuszka (pominięta) **nie domyka planu**; `missed` nikt nie ustawia automatycznie (0 wierszy od 21.08) → plan „wisi” jako `planned`, nie „niewykonany” | — |
| `akcja_km_okna` / wyprawa | sumuje `distance_km > 0` → wydmuszka z null **nie zmienia km akcji** | km z już zaimportowanych logów zostają |
| odznaki, sumy tygodnia (sb.js) | `parseFloat(l.distance_km) || 0` i warunki `l.distance_km ? … : null` — null jest bezpieczny (sprawdzone 5 miejsc) | — |
| wellness | upsert tylko wierszy z ≥ 1 wartością ≠ null → nic pustego nie nadpisuje | — |
| `intervals-status` (ogniwo) | wydmuszka ma `start_date_local` → liczona jak aktywność → **fałszywe `import`** („intervals ma nowe treningi, BiegaMy nie”) w nieskończoność, bo nigdy jej nie importujemy | cisza > 7 dni → `zegarek` (fałszywe „zegarek nie wysyła”), chyba że zbiorowa cisza ≥ 3 osób → `garmin` |

Wnioski: (1) nadpisań pustymi polami i kasowań NIE MA — dobrze; (2) wydmuszki ginęły po cichu, plan zostawał otwarty; (3) status mylił
wydmuszki z nowymi treningami, a znikanie z ciszą zegarka. Wyjątków/awarii w tej ścieżce nie ma (filtry zwracają `continue`/`filter`).

## 2. Bezpieczniki (3.11, blizna-128)

- `_shared/wydmuszka.mjs`: `czyWydmuszka(a)` = brak dystansu, czasu i obciążenia; `wierszWydmuszki` = log „wykonany, szczegóły
  niedostępne”: `distance_km` null, `duration`/`pace` null, komentarz z nazwą aktywności + „(Garmin ograniczył dostęp przez intervals.icu)”,
  typ z planu tego dnia. Sync i webhook wstawiają wydmuszki OSOBNO, przed filtrem ogryzków; nigdy nie wzbogacają wpisu ręcznego.
- Plan tego dnia domyka się jak przy każdym imporcie (`domknijPlanyPoImporcie` dobiera po typie), bez `planned_training_id` (brak km);
  km akcji / odznaki / sumy bez zmian (null się nie liczy).
- Znikanie z listy: bez zmian w kodzie — importy nie kasują; blizna-128 pilnuje, że w EF intervals-* nie ma `training_logs … delete`
  ani `update` poza wzbogaceniem pól ≠ null.
- Status: `intervals-status` przekazuje do `ogniwo.mjs` dystans/czas/obciążenie; ≥ 2 wydmuszki z Garmina w oknie i ostatnia aktywność
  Garmina to wydmuszka → ogniwo `garmin` (bez warunku zbiorowego — dowód jest u tej osoby); `import` nie liczy wydmuszek.

## 3. Czujka (noc w Actions)

`tools/czujka-intervals.mjs`: wątek t/609 jako Discourse JSON → nowy post autora wątku ze słowem „Garmin” od `docs/czujka-intervals.json`
(`ostatni_post`) → plik alarmu → krok workflow robi issue z cytatem i linkiem. W poniedziałki (albo `--szukaj`) dodatkowo tytuły z DuckDuckGo
dla „intervals.icu Garmin API” (best-effort, informacyjnie). Stan początkowy: ostatni post 892 (26.10); posty Davida o Garminie przed tym
dniem (878, 883, 890) uznane za znane.

## 4. Komunikat gotowy na odcięcie (przełącznik `GARMIN_BLOKADA=1` w sekretach EF intervals-status + deploy)

W aplikacji (pasek na Dziś i kreator w Profilu, ogniwo `garmin` — także z automatu, gdy status zobaczy wydmuszki):
- pasek: „Garmin ogranicza dostęp dla intervals.icu — Twoje dotychczasowe treningi są bezpieczne; nowe dodaj ręcznie, wkrótce także plikiem .FIT.”
- kreator: nagłówek „Garmin ogranicza dostęp dla intervals.icu”; „Twoje dotychczasowe treningi są bezpieczne — nic nie znika. To nie wina
  Twojego zegarka ani telefonu: Garmin zmienił zasady i intervals.icu nie może przekazywać nam treningów z Garmina.” „Treningi z tego
  okresu zapisujemy jako „wykonane, szczegóły niedostępne” — plan się domyka, ale bez kilometrów. Nowe dodaj ręcznie (zapis treningu albo
  zdjęcie ekranu zegarka); wkrótce także plikiem .FIT. Pracujemy nad bezpośrednim połączeniem z Garminem.”

Szkic posta Filipa (społeczność / Messenger / Radio):

> **Garmin i BiegaMy — co się zmienia.** Garmin zmienił zasady i intervals.icu, przez które do tej pory trafiały do nas Wasze treningi z Garmina,
> nie może już ich przekazywać dalej. Co to oznacza: **wszystko, co już jest w BiegaMy, zostaje** — żaden trening nie zniknie. Nowe treningi
> z Garmina na razie wpadną jako „wykonany, szczegóły niedostępne” (plan się odhacza, ale bez kilometrów). Co możecie zrobić teraz: dodać
> trening ręcznie w „Zapisz trening” albo zdjęciem ekranu zegarka. Co robimy my: w najbliższych dniach wgrywanie pliku .FIT z Garmin Connect,
> a równolegle składamy wniosek o bezpośrednie połączenie z Garminem. Zegarki Coros, Polar i Suunto działają bez zmian. Pytania — czat w aplikacji.

## 5. FIT — budowa zaraz po 8.11 (docs/fit-upload-projekt-2026-11-03.md).
