// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 26 — KAŻDA ŚCIEŻKA ZAPISU LOGU MA KOMPLET CZTERECH OCHRON.
//
// CO SIĘ STAŁO. `saveLog` istnieje w DWÓCH plikach. 16.08.2026 wersja
// w zawodnik.html dostała cztery warstwy ochrony przed podwójnym zapisem.
// Kopia w kalendarz.html nie dostała ŻADNEJ — i nikt tego nie zauważył przez
// 11 dni, bo obie funkcje nazywają się tak samo i obie „działają".
//
// Zmierzone 27.08.2026 na produkcji: 25 grup duplikatów, 38 nadmiarowych
// logów, 8 osób, największa grupa 4 wpisy, 67 osieroconych plików w Storage.
// !! WSZYSTKIE 54 pary mają `external_id` NULL po obu stronach — czyli żadna
//    nie przeszła chronioną ścieżką. Z 251 logów OCR 29 MA `external_id`
//    i ani jeden z nich nie jest w duplikacie. Ochrona działa; brakowało jej.
// !! Odstępy: 19 z 21 mierzalnych par PONIŻEJ 5 SEKUND (najkrótsza 111 ms),
//    ZERO powyżej minuty → wielokrotne odpalenie handlera, nie człowiek.
// !! Wartości w parach identyczne co do pola → to nie drugie rozpoznanie OCR.
//
// !! PO CO TEN TEST. Wada nie polegała na złej linijce, tylko na ISTNIENIU
//    drugiej kopii, której nikt nie objął poprawką. Test pilnuje więc nie
//    treści funkcji, ale KOMPLETU ŚCIEŻEK: rejestr niżej musi się zgadzać
//    z tym, co faktycznie siedzi w repo. Piąta kopia zapala się na czerwono
//    w momencie powstania, a nie po miesiącu i 38 nadmiarowych wierszach.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const PLIKI = ['zawodnik.html', 'kalendarz.html', 'trener.html', 'profil.html', 'sb.js'];

// ── CZTERY WARSTWY ───────────────────────────────────────────────────────────
// Każda jest wykrywana po śladzie, który MUSI znaleźć się w ciele funkcji.
const WARSTWY = {
  /* ⚠️ ŚLAD MUSI WYMAGAĆ OBU POŁÓWEK WARSTWY, nie samego identyfikatora.
     Pierwsza wersja szukała gołego `_savingLog` i `_bmPath` — a te występują
     też w drugiej połowie mechanizmu (`finally { flaga = false }`, `f._bmPath
     = path`). Test negatywny 27.08 zdjął sam guard i sam odczyt znacznika,
     i ZOSTAŁ ZIELONY: ochrona była wyłączona, a blizna tego nie widziała. */
  A_zapis_w_toku: {
    opis: 'guard „zapis już trwa" — odczyt + ustawienie + zwolnienie',
    /* Nazwa flagi celowo NIE jest przypięta do jednej: `_savingLog` w stronie,
       `_zapisWToku` w rdzeniu. Sprawdzamy KSZTAŁT mechanizmu (odczyt, podniesienie,
       opuszczenie), bo to on chroni, a nie konkretny identyfikator. */
    slad: (cialo) => /if\s*\(\s*(?:_savingLog\w*|_zapisWToku)\s*\)/.test(cialo)
                  && /(?:_savingLog\w*|_zapisWToku)\s*=\s*true/.test(cialo)
                  && /(?:_savingLog\w*|_zapisWToku)\s*=\s*false/.test(cialo),
  },
  B_zamek_60s: {
    opis: 'zamek 60 s na odcisku treści + zwolnienie po błędzie',
    slad: (cialo) => /odciskZapisu/.test(cialo) && /zamekZapisu/.test(cialo)
                  && /zwolnijZamek/.test(cialo),
  },
  C_upload_bmPath: {
    opis: 'znacznik `_bmPath` na File — ODCZYT (reużyj) + ZAPIS (zapamiętaj)',
    slad: (cialo) => /if\s*\(\s*\w+\._bmPath\s*\)/.test(cialo)
                  && /\w+\._bmPath\s*=\s*/.test(cialo),
  },
  D_external_id: {
    opis: 'external_source/external_id → twardy unikat w bazie',
    /* Dwie formy zapisu tego samego: pole w literale obiektu (strony) albo
       przypisanie do payloadu (rdzeń). Przypięcie się do jednej zzieleniałoby
       po zwykłym przepisaniu stylu, nie po utracie ochrony. */
    slad: (cialo) => /external_source\s*(?::|=)\s*'app'/.test(cialo)
                  && /external_id/.test(cialo),
  },
};

// ── REJESTR ŚCIEŻEK ──────────────────────────────────────────────────────────
// `wymaga: true`  → zapis z FORMULARZA wypełnianego przez człowieka; komplet obowiązkowy.
// `wymaga: false` → zapis bez formularza; `powod` mówi, dlaczego warstwy nie mają sensu.
const REJESTR = {
  'sb.js:zapiszLog': {
    wymaga: true,
    opis: 'RDZEŃ — jedyne miejsce, które zapisuje log z formularza (scalone 27.08.2026)',
  },
  'kalendarz.html:executeMoveScreen': {
    wymaga: false,
    powod:
      'Nie jest zapisem formularza. Przenosi ZDJĘCIE na inny dzień i zakłada '
      + "kikut `training_type: 'Zdjęcie'` bez dystansu, czasu i tętna, gdy "
      + 'w dniu docelowym nie ma logu. Nie ma wypełniania, nie ma uploadu '
      + '(plik już jest w Storage), a powtórzenie daje wpis, który człowiek '
      + 'widzi od razu w kalendarzu — bo tam właśnie jest.',
  },
  'zawodnik.html:CIRCUIT.saveCircuitLog': {
    wymaga: false,
    powod:
      "Nie jest zapisem formularza. `source: 'circuit'` — log powstaje "
      + 'automatycznie na zakończenie obwodu, z pomiaru, a nie z pól. Nie ma '
      + 'guzika „Zapisz" do podwójnego tapnięcia ani załącznika do wgrania. '
      + 'W bazie 2 takie logi, zero duplikatów.',
  },
};

/* Wołający rdzeń — po scaleniu to ONI są „ścieżkami zapisu", nie INSERT-y. */
const WOLAJACY = [
  ['zawodnik.html', 'saveLog'],
  ['kalendarz.html', 'saveLog'],
  ['kalendarz.html', 'saveTraining'],
];

// ── WYSZUKIWANIE ŚCIEŻEK ─────────────────────────────────────────────────────
/** Ciało jednostki obejmującej dany indeks. Koniec = pierwsze `}` w kolumnie 0,
 *  bo w tych plikach ciała są wcięte.
 *  !! DWA WZORCE, NIE JEDEN. Pierwsza wersja szukała wyłącznie `function` na
 *     poziomie pliku i CICHO przypisywała INSERT z obiektu `const CIRCUIT = {}`
 *     do poprzedzającej go funkcji — czyli mierzyłaby cudze ciało. Złapała to
 *     dopiero samo-kontrola „ciało musi obejmować znaleziony INSERT" niżej;
 *     bez niej test byłby zielony i bezwartościowy. */
function funkcjaZawierajaca(src, idx) {
  const przed = src.slice(0, idx);
  const kandydaci = [
    /* Puste grupy `()` trzymają jednolity kształt dopasowania: [1] = wcięcie,
       [2] = nazwa. Bez nich wzorce bez wcięcia przesuwają numerację grup
       i `nazwa` staje się `undefined` — cicho, bo dalej wszystko się „liczy". */
    ...przed.matchAll(/^()(?:async\s+)?function\s+(\w+)\s*\(/gm),
    /* Obiekt-kontener TYLKO na poziomie pliku. Dopuszczenie wcięcia sprawiało,
       że zwykłe `const payload = {` wewnątrz metody stawało się „ścieżką"
       i rejestr dostawał klucz `zawodnik.html:payload`. */
    ...przed.matchAll(/^()(?:const|let|var)\s+(\w+)\s*=\s*\{/gm),
    ...przed.matchAll(/^([ \t]*)window\.(\w+)\s*=\s*(?:async\s+)?function/gm),
  ].sort((a, b) => a.index - b.index);
  if (!kandydaci.length) return null;
  const start = kandydaci[kandydaci.length - 1];
  const wciecie = start[1] || '';
  /* Koniec = pierwsza linia zamykajaca NA TYM SAMYM WCIECIU co poczatek.
     !! Pierwsza wersja szukala `}` w kolumnie 0 i dzialala, dopoki wszystkie
        zapisy siedzialy w plikach HTML. Rdzen w sb.js jest wciety o dwa znaki
        wewnatrz opakowania, wiec wycinanie konczylo sie natychmiast i test
        mierzyl CUDZE cialo (`_ICU_BTN`). Zlapala to samo-kontrola nizej —
        gdyby jej nie bylo, blizna zzielenialaby mierzac nie ten kod. */
  const koniecWz = new RegExp('^' + wciecie + '\\};?[ \\t]*$', 'm');
  const reszta = src.slice(start.index);
  const m = koniecWz.exec(reszta.slice(1));
  const doIdx = m ? start.index + 1 + m.index + m[0].length : src.length;
  const jestObiektem = /^(?:const|let|var)\s/.test(start[0]);
  const SLOWA_KLUCZOWE = new Set(['if', 'for', 'while', 'switch', 'catch', 'try', 'else', 'do', 'return', 'function']);
  let ostatnia = null;
  if (jestObiektem) {
    const metody = [...src.slice(start.index, idx)
      .matchAll(/^\s{2,}(\w+)\s*:\s*(?:async\s+)?function|^\s{2,}(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm)]
      .map((m2) => m2[1] || m2[2])
      .filter((n) => n && !SLOWA_KLUCZOWE.has(n));
    ostatnia = metody.length ? metody[metody.length - 1] : null;
  }
  return {
    nazwa: ostatnia ? `${start[2]}.${ostatnia}` : start[2],
    cialo: src.slice(start.index, doIdx),
    od: start.index,
    do: doIdx,
  };
}

/** Usuwa komentarze przed szukaniem śladów.
 *  !! BEZ TEGO TEST BYŁ ŚLEPY. Wzorzec warstwy D (`external_source: 'app'`)
 *     trafiał w KOMENTARZ, który cytuje tę linijkę w wyjaśnieniu. Zdjęcie
 *     prawdziwego pola z payloadu nie zapalało niczego na czerwono — test
 *     mierzył prozę zamiast kodu. Wykryte testem negatywnym 27.08.2026;
 *     samo napisanie asercji nie wystarczyło, dopiero próba jej złamania. */
function bezKomentarzy(kod) {
  return kod
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // blokowe
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // liniowe; `[^:]` chroni https://
}

function znajdzSciezki() {
  const wynik = {};
  for (const plik of PLIKI) {
    let src;
    try { src = czytaj(plik); } catch (_) { continue; }
    for (const m of src.matchAll(/from\('training_logs'\)\s*\.insert\(/g)) {
      const f = funkcjaZawierajaca(src, m.index);
      assert.ok(f, `${plik}: INSERT poza jakąkolwiek funkcją (linia ~${src.slice(0, m.index).split('\n').length})`);
      // Samo-kontrola wycinania: ciało MUSI obejmować znaleziony INSERT.
      assert.ok(m.index >= f.od && m.index < f.do,
        `${plik}:${f.nazwa} — wycinanie ciała funkcji zawiodło, test mierzyłby nie ten kod`);
      wynik[`${plik}:${f.nazwa}`] = bezKomentarzy(f.cialo);
    }
  }
  return wynik;
}

const SCIEZKI = znajdzSciezki();

describe('samo-kontrola', () => {
  test('assert potrafi wykryc falsz', () => {
    assert.throws(() => assert.equal(1, 2));
  });

  test('wykrywacz w ogole cos znalazl', () => {
    assert.ok(Object.keys(SCIEZKI).length >= 3,
      'znaleziono ' + Object.keys(SCIEZKI).length + ' ścieżek — wzorzec przestał pasować, '
      + 'a wtedy CAŁY ten plik przechodzi mierząc pustkę');
  });

  test('kazda warstwa jest wykrywalna — wzorzec z zawodnik.html ma komplet', () => {
    // Gdyby ślad którejś warstwy przestał pasować, test niżej zzieleniałby
    // na wszystkim. Wzorzec jest tu kotwicą: on MUSI mieć wszystkie cztery.
    const cialo = SCIEZKI['sb.js:zapiszLog'];
    assert.ok(cialo, 'zniknął rdzeń — sb.js:zapiszLog');
    for (const [nazwa, w] of Object.entries(WARSTWY)) {
      assert.ok(w.slad(cialo), `ślad warstwy ${nazwa} nie pasuje do wzorca — wykrywacz zepsuty`);
    }
  });

  test('helpery warstw ISTNIEJA w sb.js (inaczej slady nic nie znacza)', () => {
    const sb = czytaj('sb.js');
    for (const h of ['nowyKluczZapisu', 'zamekZapisu', 'zwolnijZamek', 'odciskZapisu']) {
      assert.match(sb, new RegExp('window\\.' + h + '\\s*='), `brak window.${h} w sb.js`);
    }
  });
});

describe('⚠️ KOMPLET SCIEZEK — tu zapala sie PIATA KOPIA', () => {
  test('kazda sciezka zapisu w repo jest W REJESTRZE', () => {
    const nieznane = Object.keys(SCIEZKI).filter((k) => !REJESTR[k]);
    assert.deepEqual(nieznane, [],
      'NOWA ścieżka zapisu do training_logs, której nikt nie sklasyfikował: '
      + nieznane.join(', ')
      + '\n→ Dopisz ją do REJESTRU w tym pliku. Jeśli to zapis z formularza, '
      + 'MUSI dostać komplet czterech warstw — inaczej powtarzasz wadę z 27.08.2026 '
      + '(38 nadmiarowych logów u 8 osób).');
  });

  test('kazda sciezka z rejestru NADAL ISTNIEJE w repo', () => {
    const zniknely = Object.keys(REJESTR).filter((k) => !SCIEZKI[k]);
    assert.deepEqual(zniknely, [],
      'rejestr wymienia ścieżki, których już nie ma: ' + zniknely.join(', ')
      + ' — usuń wpis albo popraw nazwę (funkcja mogła zostać przemianowana).');
  });
});

describe('sciezki zapisu Z FORMULARZA maja komplet czterech ochron', () => {
  for (const [klucz, wpis] of Object.entries(REJESTR)) {
    if (!wpis.wymaga) continue;
    for (const [nazwa, w] of Object.entries(WARSTWY)) {
      test(`${klucz} — ${nazwa}`, () => {
        const cialo = SCIEZKI[klucz];
        assert.ok(cialo, `ścieżka ${klucz} zniknęła z repo`);
        assert.ok(w.slad(cialo),
          `${klucz} nie ma warstwy ${nazwa}: ${w.opis}\n`
          + '→ Bez niej ta ścieżka produkuje duplikaty. Zmierzone na kopii '
          + 'kalendarz.html:saveLog przed łatą: 38 nadmiarowych logów, 8 osób, '
          + 'odstępy od 111 ms.');
      });
    }
  }
});

describe('⚠️ SSOT — strony NIE PISZA do training_logs z formularza', () => {
  /* Mocniejszy niezmiennik niż przed scaleniem. Wcześniej pilnowaliśmy, żeby
     KAŻDA z kilku kopii miała cztery warstwy — i to nie wystarczyło, bo nowa
     kopia powstawała bez nich. Teraz kopii nie ma: zapis z formularza ma
     dokładnie jedno miejsce, a strony tylko je wołają. */
  test('rdzen `window.zapiszLog` istnieje w sb.js', () => {
    assert.match(czytaj('sb.js'), /window\.zapiszLog = async function/);
  });

  test('⚠️ ZADNA strona nie ma wlasnego INSERT-a z formularza', () => {
    const zForm = Object.keys(SCIEZKI)
      .filter((k) => !k.startsWith('sb.js:'))
      .filter((k) => REJESTR[k] && REJESTR[k].wymaga);
    assert.deepEqual(zForm, [],
      'strona odtworzyła własny zapis logu z formularza: ' + zForm.join(', ')
      + ' → To jest dokładnie ta wada, która 27.08.2026 dała 38 nadmiarowych '
      + 'logów u 8 osób. Zapis idzie przez window.zapiszLog z sb.js.');
  });

  test('wszystkie trzy modale WOLAJA rdzen', () => {
    for (const [plik, fn] of WOLAJACY) {
      const src = czytaj(plik);
      const i = src.indexOf('function ' + fn + '(');
      assert.ok(i > 0, plik + ': brak funkcji ' + fn);
      const cialo = src.slice(i, src.indexOf('\n}', i));
      assert.match(cialo, /window\.zapiszLog\(/,
        plik + ':' + fn + ' nie woła rdzenia — albo zapisuje po swojemu, albo przestała zapisywać');
    }
  });
});
