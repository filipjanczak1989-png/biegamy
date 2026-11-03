# WYPRAWA (projekt F) — sekrety akcji + ślad GPS + mapa (komenda Filipa 4.11.2026, termin czwartek 6.11 18:00)

Wyprawa Filipa i Kasi w DWÓCH DNIACH (7–8.11, ok. 2×120 km, nocleg po drodze). **Cel tajny do „Dotarliśmy”.** Akcja trwa dalej
do 12 500 km — „Dotarliśmy” kończy tylko wyprawę.

## A) Sekrety — jedna zasada: wszystko tajne żyje w bazie, licznik oddaje według stanu

- `akcje.wyprawa_cel_nazwa` (migracja `20261104_akcja_wyprawa.sql`, ustawione dla `dla-fabianka` i `proba`). `akcja_licznik` oddaje
  `wyprawa_cel_nazwa` i `wyprawa_cel_km` **wyłącznie gdy `wyprawa_dotarla_at is not null`**; przed tym `wyprawa_km` + `wyprawa_trwa`.
  Asercja w migracji: licznik akcji przed startem nie ma tych kluczy. Test po skutku `tools/akcja-wyprawa-test.sh` (13 asercji,
  zielone na prod w transakcji z rollbackiem: dla-fabianka i próba przed/po dotarciu, RLS śladu).
- Teksty z jednej funkcji `js/akcja.mjs tekstWyprawy`: przed dotarciem „Wyprawa · Filip i Kasia: X km · cel: tajemnica”, po dotarciu
  „Wyprawa · dotarli: <nazwa z bazy> ✓ · X km” (bez nazwy w bazie → „na miejsce”). `linkTrasy(d)` → `mapa-wyprawy.html`.
  Guzik `start-akcji.html`: „Dotarliśmy” (bez nazwy celu).
- **Zwiad `jasn* gór* / częstochow* / jasnogórsk*` w repo** (stan 4.11, po zmianach):
  1. widoczne dla użytkownika → **usunięte**: `start-akcji.html` (guzik), `js/akcja.mjs` (tekst + komentarz nagłówka);
  2. wzorce rozpoznające pytania → **zostają**: `supabase/functions/okienko/router.mjs` `ZAGADKA_ZAWSZE` (`jasna gora|jasnej gor\w*`) —
     odpowiedzi (zagadki `js/akcja-cytaty.mjs`, karty, zdania) nazwy nie zawierają (asercja w bliźnie);
  3. docs/komentarze → zostają: `docs/akcja-f-spec.md` (§3 tytuł, tabela 5.11, pkt „Wyprawa”), `docs/akcja-f-proba-generalna.md`
     („Dotarliśmy na Jasną Górę” w liście kontrolnej — **do poprawy ręcznej przy próbie**: guzik mówi teraz „Dotarliśmy”),
     `supabase/migrations/20261104_akcja_wyprawa.sql` (UPDATE ustawiający nazwę — jedyne miejsce w repo z literałem, celowo);
     `js/kalendarz-lista.mjs` mapa miast → województwo (Częstochowa wśród 300 miast — dane geograficzne, na białej liście blizny);
     `out-pdf/*.json` (dane wyników, nie strona).
- **Blizna-116** (jeden test): skanuje wszystko, co trafia do użytkownika (html, `sb.js`, `js/*`, wszystkie EF) bez komentarzy, z pominięciem
  linii definiujących wzorce wejścia (`const X = /…/`), i failuje na nazwę celu **oraz nazwisko dziecka** (dotychczasowy strażnik z blizny-101
  dotyczył `js/akcja.mjs`; imię po starcie jest w cytatach i na guziku świadomie — decyzja Filipa z dnia 3).

## B) Ślad GPS

- EF `akcja-wyprawa-slad` (`verify_jwt = false`): `POST {rodzaj:'odswiez', slug?, athlete_id?, od?}` z `x-push-secret` — pobiera
  z intervals listę aktywności kont wyprawy (`akcje.wyprawa_athlete_ids`) od `wystartowala_at` do `wyprawa_dotarla_at`/jutro,
  typy Run/TrailRun/Walk/Hike (bieżnia i wirtualne nie mają trasy), strumień `latlng`, upraszcza do ≤ 1 pkt / 50 m (`slad.mjs uprosc`),
  zapisuje do `akcja_wyprawa_slad` (unikalność akcja × aktywność; aktywność bez trasy zapisana pusta, żeby nie pytać w kółko).
  Poświadczenia z `intervals_credentials` (OAuth Bearer albo Basic API_KEY, jak `intervals-activity-detail`) — nigdy w odpowiedzi ani logu.
- Odświeżanie: **cron co 15 min** (`akcja-wyprawa-slad`, sekret z vault jak `akcja-push`) + **`intervals-webhook` po imporcie** aktywności
  (woła EF z `athlete_id`; EF sama sprawdza, czy konto jest w trwającej wyprawie).
- RLS: `akcja_wyprawa_slad` bez grantów i bez polityk dla anon/authenticated — czyta i pisze tylko service (EF).
- Sonda 4.11 (pg_net z bazy, klucze nie opuściły bazy): Filip — ostatnie 3 biegi z latlng (844–1038 pkt), ostatnia aktywność 31.10
  BEZ latlng (bieżnia/wirtualna → pominięta przez typ); Kasia — latlng ✓ (888 pkt), **ostatnia aktywność w BiegaMy 6.10** (sync Kasi do
  sprawdzenia przed 7.11, jak w próbie generalnej); konto testowe — 1 aktywność z latlng (1020 pkt) → próba E możliwa.
  ⚠️ Tokeny OAuth intervals bez odświeżania w repo — jeśli wygasną, EF loguje `intervals lista 401` w raporcie i nic nie zapisuje.

## C) Prywatność (slad.mjs `ukryj`, blizna-116 na danych z noclegiem i startem)

Dystans liczony wzdłuż CAŁEJ wyprawy (aktywności po kolei). Ukryte: `[0, 2 000 m]` od startu NA ZAWSZE; przy każdej przerwie > 3 h
między aktywnościami 2 000 m przed końcem poprzedniej i 2 000 m po początku następnej NA ZAWSZE (także po dotarciu); ostatnie 500 m
każdej aktywności dopóki `wyprawa_dotarla_at is null`. Bez punktu „teraz”: mapa kończy się na końcu ostatniego wgranego odcinka minus
500 m. Przed startem EF oddaje `{start:false}`. Surowe punkty nigdy nie wychodzą z EF — klient dostaje tylko widoczne segmenty.

## D) Mapa

`mapa-wyprawy.html` (nowy plik, poza zamrożeniem): Leaflet 1.9.4 z `vendor/` (sha256 js `5c9aecfc…ed47`, css `b570abbd…2539`, źródło cdnjs;
`.gitattributes` `vendor/** -text`), kafle `tile.openstreetmap.org` z atrybucją, linia `#e8561e`, bez znacznika celu do dotarcia,
„ostatnia aktualizacja HH:MM”, „Dokąd biegną? Zobaczysz na końcu.”; po dotarciu kółko w ostatnim widocznym punkcie z nazwą z bazy.
Linki „Zobacz trasę ›”: `dla-fabianka.html` (przycisk `#trasa`, widoczny gdy `linkTrasy`) i karta Dziś (`js/akcja.mjs kartaDzisHtml`) —
oba PRZED czwartkiem 18:00. Podglądy: `Downloads\biegamy-podglady\mapa-wyprawy-trwa.png`, `mapa-wyprawy-dotarli.png` (atrapa śladu).

## E) Próba na koncie testowym (Filip)

1. Migracja + deploy EF `akcja-wyprawa-slad` i `intervals-webhook` (hook) + push.
2. Guzik próby (`start-akcji.html?proba=1`) → `wystartowala_at = now()`. Stare aktywności są PRZED startem, więc dla próby EF ma `od`:
   `curl -X POST https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/akcja-wyprawa-slad -H "x-push-secret: <PUSH_HOOK_SECRET>" -H "content-type: application/json" -d '{"rodzaj":"odswiez","slug":"proba","od":"2026-09-01"}'`
   (`od` działa WYŁĄCZNIE dla akcji testowej). Konto testowe ma 1 aktywność z latlng → strefa startu + końcówka 500 m; dwie aktywności
   z przerwą > 3 h są w testach jednostkowych (blizna-116), na koncie testowym nie ma drugiej — jeśli chcesz zobaczyć nocleg na mapie,
   wgraj do konta testowego drugą aktywność (np. z intervals) z datą ≥ 3 h po pierwszej.
3. `mapa-wyprawy.html?slug=proba` → ślad po strefach; „Dotarliśmy” na stronie próby → nazwa celu i znacznik.
4. „Resetuj próbę” czyści `wystartowala_at`/`wyprawa_dotarla_at`; wiersze śladu próby zostają (klucz akcja × aktywność) — usuń ręcznie:
   `delete from akcja_wyprawa_slad where akcja_id = (select id from akcje where slug = 'proba')`.

## Czego się nie da / do decyzji

- Kasia: ostatnia aktywność w BiegaMy 6.10 — bez działającego sync jej km i ślad nie wejdą (próba generalna, pkt „Kasia”).
- Dystans/dni wyprawy (`wyprawa_cel_km`) nadal `null` — ustaw w bazie (po dotarciu pokaże się obok nazwy).
- Mapa dla próby jest publiczna jak dla akcji (`?slug=proba`) — ślad konta testowego po strefach; jeśli to przeszkadza, EF może odmówić
  `testowa` bez sesji (jedna linia).

## Kalendarz — konto serwisowe F6 (zatwierdzone)

Nazwy sekretów do ustawienia: `F6_KONTO_EMAIL`, `F6_KONTO_HASLO` (EF `okladki-imprez` loguje się `signInWithPassword` kluczem publicznym,
bierze JWT i woła `upcoming_races`; hasło nigdy w logu).
