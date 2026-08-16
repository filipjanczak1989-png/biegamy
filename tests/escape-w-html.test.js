// ─────────────────────────────────────────────────────────────────────────────
// ESCAPE'Y \uXXXX W TREŚCI HTML — czyli tam, gdzie nic ich nie interpretuje.
//
// BLIZNA: karta VO2max pokazywała `\UD83E\UDEC1 SILNIK TLENOWY \U00B7 VO\U2082MAX`
// zamiast „🫁 Silnik tlenowy · VO₂max". Escape'y `\uXXXX` działają WYŁĄCZNIE
// w literałach JavaScript; w markupie to zwykły tekst: backslash, `u`, cyfry.
//
// ⚠️ WIELKIE LITERY (`\UD83E` zamiast `\ud83e`) to `text-transform:uppercase`
//    w tym samym `style`, a NIE podwójne escapowanie ani uszkodzenie danych.
//    Obie pierwsze hipotezy — Filipa i moja — były błędne.
//
// ⚠️ NIC TEGO NIE ZEPSUŁO PO DRODZE: dwa commity z 24.07.2026 (f9aa7fb, d68b6b5)
//    wstawiły tekst już w tej postaci. W tym samym commicie były 4 inne linie
//    z `\u`, które działają — bo trafiły do JS. Autor mieszał konwencje.
//
// Zmierzone przed naprawą: 218 escape'ów razem, z tego 17 w treści HTML
// w 6 liniach `zawodnik.html`. Widziało to 5 osób (karta VO2max, tylko przy
// danych z Garmina) i 17 osób (blok „Poranny sygnał", po subskrypcji push).
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const PLIKI = fs.readdirSync(KORZEN)
  .filter((f) => f.endsWith('.html') && !/^biegus-v1|^_mockup/.test(f));

const ESC = /\\u[0-9a-fA-F]{4}/g;

/** Escape'y poza blokami <script> — z numerem linii i kontekstem. */
function escapeWTresci(src) {
  const skrypty = [...src.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)]
    .map((m) => [m.index, m.index + m[0].length]);
  const wSkrypcie = (i) => skrypty.some(([a, b]) => i >= a && i < b);

  const linie = src.split('\n');
  const offsety = [];
  let poz = 0;
  for (const l of linie) { offsety.push(poz); poz += l.length + 1; }

  const out = [];
  for (const m of src.matchAll(ESC)) {
    if (wSkrypcie(m.index)) continue;
    let nr = 0;
    while (nr + 1 < offsety.length && offsety[nr + 1] <= m.index) nr++;
    out.push({ nr: nr + 1, esc: m[0], linia: linie[nr].trim().slice(0, 70) });
  }
  return out;
}

describe('⚠️ żaden escape \\uXXXX nie może siedzieć w treści HTML', () => {
  for (const plik of PLIKI) {
    test(plik, () => {
      const src = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      const zle = escapeWTresci(src);
      assert.deepEqual(zle, [],
        plik + ': ' + zle.length + ' escape\'ów w markupie:\n  ' +
        zle.map((z) => 'linia ' + z.nr + ' ' + z.esc + ' — ' + z.linia).join('\n  '));
    });
  }

  test('⚠️ KONTROLA NEGATYWNA: wykrywacz naprawdę wykrywa', () => {
    /* Bez tego wszystkie testy wyżej przechodziłyby również wtedy, gdyby
       funkcja zawsze zwracała pustą listę — czyli mierzyłyby własną awarię.
       To ta sama pułapka co bramka świecąca na zielono. */
    const udawany = '<div style="text-transform:uppercase;">\\ud83e\\udec1 X \\u00b7 Y</div>';
    const zle = escapeWTresci(udawany);
    assert.equal(zle.length, 3, 'wykrywacz przepuścił escape\'y w markupie');
  });

  test('⚠️ KONTROLA NEGATYWNA: escape w <script> NIE jest zgłaszany', () => {
    /* W literale JS `ł` to litera `ł` i działa poprawnie. Gdyby test
       zgłaszał również te, kazałby „naprawiać" 90 poprawnych miejsc
       w samym zawodnik.html — i zostałby wyłączony jako uciążliwy. */
    const udawany = '<script>const x = "sygna\\u0142";</script>';
    assert.deepEqual(escapeWTresci(udawany), []);
  });

  test('escape\'y w JS nadal istnieją — inaczej test nic nie chroni', () => {
    /* Gdyby ktoś „naprawił" wszystko hurtem, łącznie z literałami JS,
       ten test padnie i pokaże, że zmiana poszła za daleko. */
    const zaw = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
    const wSkryptach = [...zaw.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)]
      .map((m) => m[0]).join('').match(ESC) || [];
    assert.ok(wSkryptach.length > 50,
      'escape\'ów w JS jest ' + wSkryptach.length + ' — spodziewane ~90');
  });
});
