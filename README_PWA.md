# BiegaMy — PWA (wszystko w roocie)

## Struktura

WSZYSTKIE pliki idą do głównego folderu repo (root). NIE w podkatalogu icons/.

```
twoje_repo/
├── index.html              ← nadpisz
├── zawodnik.html           ← nadpisz
├── trener.html             ← nadpisz
├── ... (pozostałe 11 HTML)
├── manifest.json           ← NOWY
├── sw.js                   ← NOWY
├── offline.html            ← NOWY
├── sb.js                   (już masz - dla pewności porównaj)
├── icon-72.png             ← NOWE 16 ikon w roocie
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

## Co zrobić

1. Skopiuj WSZYSTKIE pliki z paczki do roota repo (nadpisz HTML, dodaj nowe)
2. UWAGA: jeśli wcześniej miałeś pliki ikon w roocie z poprzedniej próby — zostają jak są (ten sam plik)
3. git add . / commit / push
4. GitHub Pages auto-deploy
5. Hard refresh w przeglądarce (Ctrl+Shift+R)
6. DevTools > Application > Service Workers > "Update" or "Unregister" stary

## Test

Po deploy:
- DevTools > Console > nie powinno być żadnych 404 ikon
- DevTools > Application > Manifest > powinien załadować się bez błędów
- Pasek adresu Chrome > pojawi się ikonka "Zainstaluj BiegaMy"
