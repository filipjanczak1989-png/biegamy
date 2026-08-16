// ─────────────────────────────────────────────────────────────────────────────
// SAMOPOCZUCIE — czteropoziomowa skala i jej render.
//
// BLIZNA 1: skala miała TRZY poziomy (`bad`/`mid`/`good`), a gałąź w Edge
// Functions chwaląca zawodnika odpalała przy `avg >= 3.5` na skali 1..4.
// Sufit wynosił 3,0, więc **gałąź „czuje się ŚWIETNIE" nie odpaliła ANI RAZU** —
// raporty od początku mogły ostrzec albo być neutralne, nigdy pochwalić.
// Zmierzone 16.08.2026: 13 osób z ≥3 ocenami, rozkład średnich 2,00–3,00.
//
// BLIZNA 2: `feel = NULL` (1602 z 2649 logów, 60%) renderowało się w czterech
// miejscach jako „neutralna mina" — baza mówiła „nie wiem", a ekran „przeciętnie".
//
// BLIZNA 3: skala żyła w DZIEWIĘCIU kopiach renderu, z trzema zestawami ikon
// i trzema nazewnictwami („Świetnie" / „OK" / „DOBRZE" dla tej samej wartości).
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const w = zaladujSb();
/* ⚠️ `vm` ma własny realm, więc tablice z sb.js mają INNY Array.prototype
   i `deepStrictEqual` odrzuca je mimo identycznej treści. Kopiujemy do
   lokalnej tablicy — porównujemy wartości, nie prototypy. */
const POZIOMY = Array.from(w.FEEL_POZIOMY);

describe('skala ma cztery poziomy i komplet opisów', () => {
  test('kolejność od najgorszego do najlepszego', () => {
    assert.deepEqual(POZIOMY, ['bad', 'mid', 'good', 'great']);
  });

  test('każdy poziom ma etykietę, emoji, kolor i ikonę wektorową', () => {
    for (const p of POZIOMY) {
      assert.ok(w.FEEL_ETYKIETY[p], 'brak etykiety dla ' + p);
      assert.ok(w.FEEL_EMOJI[p], 'brak emoji dla ' + p);
      assert.ok(w.FEEL_KOLORY[p], 'brak koloru dla ' + p);
      assert.match(w.feelSvg(p, 18), /^<svg /, 'brak SVG dla ' + p);
    }
  });

  test('⚠️ etykiety są RÓŻNE — drabina, nie synonimy', () => {
    /* „Świetnie" znaczyło kiedyś `good` w dwóch miejscach i „DOBRZE" w trzecim.
       Po przesunięciu drabiny każda etykieta musi znaczyć jeden poziom. */
    const etykiety = POZIOMY.map((p) => w.FEEL_ETYKIETY[p]);
    assert.equal(new Set(etykiety).size, etykiety.length, 'powtórzona etykieta: ' + etykiety.join(', '));
  });

  test('⚠️ „Świetnie" to NAJWYŻSZY poziom, nie przedostatni', () => {
    /* To jest cały powód przesunięcia: gałąź w EF brzmi „czuje się ŚWIETNIE"
       i odpala wyłącznie na szczycie skali. Gdyby „Świetnie" wróciło na `good`,
       etykieta i treść raportu znowu mówiłyby co innego. */
    assert.equal(w.FEEL_ETYKIETY[POZIOMY[POZIOMY.length - 1]], 'Świetnie');
    assert.notEqual(w.FEEL_ETYKIETY.good, 'Świetnie');
  });
});

describe('⚠️ brak oceny NIE jest oceną', () => {
  for (const puste of [null, undefined, '', 'ok', 'nieznane']) {
    test('feelEmoji(' + JSON.stringify(puste) + ') → pusty napis', () => {
      assert.equal(w.feelEmoji(puste), '');
    });
    test('feelSvg(' + JSON.stringify(puste) + ') → pusty napis', () => {
      assert.equal(w.feelSvg(puste), '');
    });
  }

  test('kontrola negatywna: znane poziomy JEDNAK coś zwracają', () => {
    /* Bez tego test wyżej przechodziłby też wtedy, gdyby funkcja zwracała
       pusty napis ZAWSZE — czyli mierzyłby własną awarię. */
    for (const p of POZIOMY) {
      assert.notEqual(w.feelEmoji(p), '', p + ' zwraca pusto');
      assert.notEqual(w.feelSvg(p), '', p + ' zwraca pusto');
    }
  });
});

describe('mnożniki wysiłku', () => {
  test('cztery pozycje, `great` obecne', () => {
    assert.equal(Object.keys(w.FORMA_FEEL_MODIFIERS).length, 4);
    assert.equal(w.FORMA_FEEL_MODIFIERS.great, 1.0);
  });

  test('⚠️ `great` nie obniża TRIMP względem `good`', () => {
    /* Mnożnik PODNOSI obciążenie za trening, który bolał (bad = 1.3).
       Gdyby `great` dostało np. 0.9, ten sam trening liczyłby się mniej tylko
       dlatego, że komuś dobrze poszło — a to zmienia formę, nie samopoczucie. */
    assert.equal(w.FORMA_FEEL_MODIFIERS.great, w.FORMA_FEEL_MODIFIERS.good);
  });

  test('brak oceny liczy się jak `good` (1.0), nie jak kara', () => {
    assert.equal(w.formaTRIMP({ duration: '1:00:00', training_type: 'Spokojny', feel: null }),
                 w.formaTRIMP({ duration: '1:00:00', training_type: 'Spokojny', feel: 'good' }));
  });
});

describe('⚠️ render idzie przez SSOT — żadnych własnych kopii', () => {
  const PLIKI = ['zawodnik.html', 'trener.html', 'kalendarz.html', 'profil.html'];

  test('zero rekonstrukcji skali poza sb.js', () => {
    /* Do 16.08.2026 render żył w dziewięciu kopiach. Ten test PADNIE, gdy ktoś
       zrobi dziesiątą — bo nowy poziom trzeba by wtedy dokładać w dziesięciu
       miejscach, a jedno na pewno zostanie pominięte. */
    const wzory = [
      /feel\s*===?\s*'good'\s*\?/,
      /\{\s*good\s*:\s*'<svg/,
      /good\s*:\s*'&#x1F60A;'/,
    ];
    const winne = [];
    for (const plik of PLIKI) {
      const kod = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      for (const rx of wzory) if (rx.test(kod)) winne.push(plik + ' → ' + rx.source);
    }
    assert.deepEqual(winne, [], 'własny render samopoczucia poza sb.js:\n  ' + winne.join('\n  '));
  });

  test('każde z trzech wejść oferuje WSZYSTKIE cztery poziomy', () => {
    const WEJSCIA = [
      ['zawodnik.html', (p) => "selFeel(this,'" + p + "')"],
      ['zawodnik.html', (p) => 'data-fr="' + p + '"'],
      ['kalendarz.html', (p) => 'data-feel="' + p + '"'],
    ];
    for (const [plik, wzor] of WEJSCIA) {
      const kod = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      for (const p of POZIOMY) {
        assert.ok(kod.includes(wzor(p)), plik + ': brak poziomu ' + p + ' (' + wzor(p) + ')');
      }
    }
  });

  test('⚠️ wejścia używają JEDNEGO nazewnictwa — tego z sb.js', () => {
    /* Trzy wejścia miały trzy różne zestawy słów dla tych samych wartości. */
    for (const plik of ['zawodnik.html', 'kalendarz.html']) {
      const kod = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      for (const p of POZIOMY) {
        assert.ok(kod.includes('>' + w.FEEL_ETYKIETY[p] + '<'),
          plik + ': brak etykiety „' + w.FEEL_ETYKIETY[p] + '" dla ' + p);
      }
    }
    const zaw = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
    assert.equal(/>OK</.test(zaw) && /feel-lbl/.test(zaw) ? zaw.includes('feel-lbl">OK<') : false,
      false, 'została stara etykieta „OK" w modalu logowania');
  });
});

describe('odznaki liczą nowy poziom', () => {
  test('⚠️ `great` liczy się razem z `good`', () => {
    /* Dokładne dopasowanie `feel === 'good'` sprawiłoby, że kto wybierze
       WYŻSZY poziom, PRZESTANIE zbierać odznakę — mimo że czuje się lepiej. */
    const kod = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
    assert.match(kod, /DOBRE_SAMOPOCZUCIE\s*=\s*\[\s*'good',\s*'great'\s*\]/);
    assert.doesNotMatch(kod, /filter\(l => l\.feel === 'good'\)\.length/,
      'odznaka nadal liczy wyłącznie `good`');
  });
});
