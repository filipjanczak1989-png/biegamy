// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 28 — KOLEJNOŚĆ `vh`/`dvh` I PARZYSTOŚĆ OBSŁUGI KLAWIATURY W CZACIE.
//
// CO SIĘ STAŁO. Czat jest zaimplementowany DWA RAZY: `zawodnik.html`
// (`#section-msgs`) i `trener.html` (`.pchat-view` / `#t-chat-view`). Obie
// nakładki to `position:fixed` na całą wysokość ekranu i OBIE miały:
//
//     height:100dvh; height:100vh;
//
// czyli kolejność ODWROTNĄ do wzorca fallbacku. Druga deklaracja wygrywa
// kaskadę, więc `dvh` NIE DZIAŁAŁO NIGDY — w żadnej przeglądarce, od dnia
// napisania. Wyglądało na obsłużone i właśnie dlatego nikt tego nie sprawdzał.
// Poprawne jest `vh` PIERWSZE (fallback dla starych silników), `dvh` DRUGIE.
//
// Zgłoszenie Maćka (28.08.2026): pod polem wpisywania w czacie siedzi pusty
// pas, a po otwarciu klawiatury spod niej wyłazi karta licznika
// #100kmDlaKasi — czyli treść sekcji HOME, leżącej POD nakładką czatu
// (`#spol-pasek` nigdy nie był częścią czatu).
//
// !! UWAGA NA GRANICE TEGO, CO USTALONE. Powyższa wada kaskady jest
//    ZWERYFIKOWANA w kodzie. Czy sama tłumaczy WIDOK licznika spod klawiatury
//    — NIE JEST potwierdzone; wymagałoby odtworzenia na urządzeniu. Test pilnuje
//    tego, co zmierzone, i nie udaje, że domyka cały objaw.
//
// !! SPROSTOWANIE DO PIERWSZEJ WERSJI TEGO PLIKU. Napisałem w niej, że
//    `zawodnik.html` „nie ma ani jednego odwołania do visualViewport". To była
//    NIEPRAWDA — wzięła się z `grep ... | head -6`, które ucięło wynik na
//    trafieniach z `trener.html`. Zawodnik ma własny `setupChatViewportFix`
//    (wołany z `openChatThread`), funkcjonalnie równy wersji trenera.
//    Stąd kształt tego testu: pilnuje PARZYSTOŚCI obu kopii, a nie „braku"
//    w jednej z nich. Wniosek na przyszłość: `head` na grepie, z którego
//    wyciąga się wniosek o NIEOBECNOŚCI, zamienia pomiar w zgadywanie.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');

// Obie implementacje czatu: plik → id nakładki na cały ekran.
const CZATY = [
  { plik: 'zawodnik.html', nakladka: 'section-msgs' },
  { plik: 'trener.html', nakladka: 't-chat-view' },
];

describe('samo-kontrola', () => {
  test('assert potrafi wykryc falsz', () => {
    assert.throws(() => assert.equal(1, 2));
  });

  test('obie nakladki czatu ISTNIEJA — inaczej test mierzy pustke', () => {
    for (const c of CZATY) {
      assert.match(czytaj(c.plik), new RegExp('id="' + c.nakladka + '"'),
        c.plik + ': brak elementu #' + c.nakladka + ' — zmieniono nazwę? zaktualizuj CZATY');
    }
  });
});

describe('⚠️ KOLEJNOSC vh/dvh — `vh` to FALLBACK, wiec musi byc PIERWSZE', () => {
  for (const c of CZATY) {
    test(c.plik, () => {
      /* ⚠️ SZUKAMY W CAŁYM PLIKU, nie przy elemencie. Pierwsza wersja ciachała
         wycinek od `id="..."` i zakładała styl INLINE — tak jest u zawodnika,
         ale u trenera wysokość idzie z klasy `.pchat-view` zadeklarowanej setki
         linii wyżej niż sam `<div id="t-chat-view">`. Test świecił wtedy na
         czerwono z powodu własnego wzorca, nie z powodu kodu. */
      const src = czytaj(c.plik).replace(/\s+/g, '');
      assert.ok(!src.includes('height:100dvh;height:100vh'),
        c.plik + ': `height:100dvh` stoi PRZED `height:100vh`, więc `vh` wygrywa '
        + 'kaskadę i `dvh` nie działa nigdy — dokładnie stan sprzed 28.08.2026.');
      assert.ok(src.includes('height:100vh;height:100dvh'),
        c.plik + ': zniknęła para height:100vh + height:100dvh — czat stracił '
        + 'albo fallback, albo jednostkę reagującą na klawiaturę.');
    });
  }
});

describe('PARZYSTOSC — obsluga klawiatury jest w OBU kopiach', () => {
  /* !! TO JEST TEST PARZYSTOŚCI, NIE OBECNOŚCI. Obie strony mają dziś handler
     i tak ma zostać. Powód, dla którego w ogóle go pilnujemy: w jednym tygodniu
     TRZY RAZY okazało się, że poprawka żyje w jednej z dwóch kopii —
       · cztery ochrony przed podwójnym zapisem (zawodnik miał, kalendarz nie)
         → 38 nadmiarowych logów u 8 osób;
       · czyszczenie tempa dla nie-biegów (kalendarz miał, zawodnik nie)
         → 40 wierszy z tempem przy treningu siłowym;
       · kolejność vh/dvh — akurat ta była zepsuta w OBU naraz.
     Przy takiej częstotliwości taniej jest przypiąć parę, niż znaleźć czwarty
     przypadek po zgłoszeniu od człowieka. */
  for (const c of CZATY) {
    test(c.plik + ' — nasluchuje resize i scroll visualViewport', () => {
      const src = czytaj(c.plik);
      assert.match(src, /visualViewport\.addEventListener\('resize'/,
        c.plik + ': brak nasłuchu `resize` — nakładka nie zwęzi się przy klawiaturze.');
      assert.match(src, /visualViewport\.addEventListener\('scroll'/,
        c.plik + ': brak nasłuchu `scroll` — na iOS klawiatura przesuwa widok bez resize.');
    });

    test(c.plik + ' — ustawia wysokosc z visualViewport.height', () => {
      assert.match(czytaj(c.plik), /style\.height = (?:window\.)?(?:visualViewport\.height|vvh) \+ 'px'/,
        c.plik + ': nasłuch jest, ale nic nie ustawia wysokości — martwa gałąź.');
    });

    test(c.plik + ' — ZDEJMUJE poprzedni nasluch przed dodaniem nowego', () => {
      /* Bez tego każde wejście w czat dokłada kolejny listener do tego samego
         obiektu i po kilku otwarciach handler biegnie wielokrotnie na zdarzenie. */
      assert.match(czytaj(c.plik), /visualViewport\.removeEventListener\('resize'/,
        c.plik + ': brak `removeEventListener` — nasłuchy się kumulują.');
    });
  }
});
