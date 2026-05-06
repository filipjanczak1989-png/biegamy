.# BiegaMy — PWA Wdrożenie

## Co dostałeś

```
pwa_files/
├── manifest.json              ← Konfiguracja PWA (nazwa, kolory, ikonki)
├── sw.js                       ← Service Worker (cache + offline)
├── offline.html                ← Strona "Brak połączenia"
├── sb.js                       ← (już masz, tylko upewnij się że jest aktualny)
├── icons/
│   ├── icon-72.png … icon-1024.png   (8 rozmiarów standardowych)
│   ├── icon-maskable-192/512/1024.png (3 rozmiary maskable dla Android)
│   ├── apple-touch-icon.png    (180×180 dla iOS)
│   ├── favicon-16.png, favicon-32.png
│   └── favicon.ico
└── 14 plików .html             ← Z dodanymi PWA meta tags + rejestracja SW
```

## Jak wgrać

Wgraj **wszystkie** pliki z `pwa_files/` do **głównego katalogu** hostingu, zachowując strukturę folderów.

Końcowa struktura na biegamy.run:

```
biegamy.run/
├── index.html
├── zawodnik.html
├── trener.html
├── kalendarz.html
├── gra.html
├── profil.html
├── statystyki.html
├── odznaki.html
├── wyzwania.html
├── races.html
├── strava-callback.html
├── o-nas.html
├── prs.html
├── terms.html
├── manifest.json     ← NOWY
├── sw.js             ← NOWY
├── offline.html      ← NOWY
├── sb.js             ← (już masz)
└── icons/            ← NOWY FOLDER
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-192.png
    ├── icon-384.png
    ├── icon-512.png
    ├── icon-1024.png
    ├── icon-maskable-192.png
    ├── icon-maskable-512.png
    ├── icon-maskable-1024.png
    ├── apple-touch-icon.png
    ├── favicon-16.png
    ├── favicon-32.png
    └── favicon.ico
```

## Jak przetestować

### Test 1: Strona ładuje się normalnie
1. Otwórz biegamy.run w Chrome (komputer)
2. F12 → Console → szukaj `[PWA]` lub `[SW]` — powinieneś zobaczyć logi service workera
3. Network tab → kolumna "Size" — niektóre zasoby będą miały "(ServiceWorker)" zamiast rozmiaru → znaczy że SW działa

### Test 2: Ikona w pasku adresu (Chrome)
Po kilku sekundach od załadowania strony, **w prawym końcu paska adresu Chrome** pojawi się ikona instalacji (mały komputer ze strzałką w dół). To znaczy że PWA jest poprawnie skonfigurowane.

Kliknij → "Zainstaluj BiegaMy" → BiegaMy pojawi się jako standalone aplikacja z ikoną na pulpicie.

### Test 3: Instalacja na telefonie (Android Chrome)
1. Otwórz biegamy.run w Chrome na telefonie
2. Po chwili pojawi się banner "Dodaj BiegaMy do ekranu głównego" lub w menu Chrome (3 kropki) → "Zainstaluj aplikację"
3. Kliknij → ikona pojawia się na ekranie domowym
4. Otwórz z ekranu domowego → otwiera się jak natywna apka, bez paska adresu Chrome

### Test 4: Instalacja na iOS Safari
1. Otwórz biegamy.run w Safari (NIE Chrome — na iOS musi być Safari)
2. Kliknij ikonę "Udostępnij" (kwadrat ze strzałką)
3. Scroll w dół → "Dodaj do ekranu początkowego"
4. Potwierdź → ikona BiegaMy na ekranie domowym

### Test 5: Tryb offline
1. Otwórz biegamy.run, zaloguj się
2. Otwórz Network tab w DevTools → ustaw na "Offline" (dropdown lub checkbox)
3. Kliknij Refresh → strona ŁADUJE SIĘ z cache (zamiast Chrome no-internet error)
4. Spróbuj wejść na coś czego nigdy nie odwiedzałeś → zobaczysz `offline.html` (BiegaMy themed)

## Po pierwszym wdrożeniu — UPDATE strategia

Service Worker cache się aktualizuje automatycznie po deploy:

1. Zmień `CACHE_VERSION` w `sw.js` (np. `'biegamy-v1'` → `'biegamy-v2'`)
2. Wgraj nowy `sw.js` na hosting
3. User otwiera apkę → SW wykrywa nową wersję → auto-reload z fresh cache
4. Stary cache jest automatycznie czyszczony

**WAŻNE:** Bez zmiany CACHE_VERSION userzy będą mieć starą wersję! Zmieniaj go przy każdym deploy.

## Manifest.json — co skonfigurowane

- `name`: "BiegaMy"
- `short_name`: "BiegaMy" (max 12 znaków, używany na ekranie domowym)
- `start_url`: "/zawodnik.html" (otwiera się w panelu zawodnika domyślnie — możesz zmienić na "/" jeśli chcesz landing)
- `display`: "standalone" (bez paska Chrome — wygląd natywnej apki)
- `orientation`: "portrait" (telefon w pionie)
- `theme_color`: "#07070a" (czarny pasek statusu)
- `background_color`: "#07070a" (czarne tło splash screen przy ładowaniu)
- `lang`: "pl"

### Shortcuts (długie naciśnięcie ikony)

Skonfigurowane 3 skróty:
- 🏃 **Dodaj trening** → `/zawodnik.html?action=add-log` (UWAGA: musisz dodać obsługę `?action=add-log` w zawodnik.html jeśli chcesz auto-otwarcia formularza)
- 👥 **Społeczność** → `/zawodnik.html?section=social`
- 📊 **Statystyki** → `/statystyki.html`

Jeśli nie chcesz tych skrótów, usuń sekcję `"shortcuts"` z manifest.json.

## Service Worker — strategie cache

| Zasób | Strategia | Behaviour |
|---|---|---|
| HTML/CSS/JS lokalne | Stale-while-revalidate | Natychmiast z cache, w tle update |
| Ikony, fonty | Stale-while-revalidate | jw |
| Storage Supabase (avatary, banery) | Cache-first | Najpierw cache, potem network |
| REST API Supabase (`/rest/v1/`) | Network-first | Świeże dane, fallback na cache |
| Auth Supabase (`/auth/v1/`) | Network-only | Zawsze świeże (logowanie/refresh) |
| Edge functions | Network-only | Zawsze świeże |
| Strava API | Network-only | Zawsze świeże |

## Pułapki / Q&A

### "Nie widzę ikonki instalacji w Chrome"
- Czy strona jest na **HTTPS**? (PWA wymaga HTTPS — biegamy.run powinno być OK)
- Czy `manifest.json` ładuje się? (DevTools → Application → Manifest)
- Czy SW się zarejestrował? (DevTools → Application → Service Workers)
- Chrome ma **kryteria** dla instalowalności — minimum 1 ikona ≥192×192 + maskable. Mamy ✅

### "Po deploy user dalej widzi starą wersję"
- Zmieniłeś `CACHE_VERSION` w `sw.js`? Bez tego SW serwuje starą cache.
- Awaryjne czyszczenie: DevTools → Application → Storage → "Clear site data"

### "Po instalacji apka otwiera się jak strona, nie jak app"
- Sprawdź `display: "standalone"` w manifest.json
- iOS: musi być dodana przez **Safari** (nie Chrome)

### "Auth nie działa offline"
- To celowe — auth wymaga sieci. Bez tego SW chciałby cache'ować login token, co jest niebezpieczne.

### "Strava callback nie działa po dodaniu PWA"
- `start_url: /zawodnik.html` w manifest może niepoprawnie redirektować strava-callback. Jeśli zauważysz problem — zmień `start_url` na `/`.

## TODO opcjonalne (po wdrożeniu)

1. **Background Sync** dla logów treningowych — żeby zalogowane offline biegi wysłały się gdy odzyskasz internet (wymaga zmian w sw.js + zawodnik.html)
2. **Push Notifications** — powiadomienia od trenera (Web Push API + VAPID keys)
3. **Better splash screen** — iOS wymaga osobnych obrazków splash w wielu rozmiarach (Apple touch startup image). Można dodać generator później.
4. **PWA install banner** — własny banner zachęcający do instalacji (zamiast natywnego Chrome banner)
