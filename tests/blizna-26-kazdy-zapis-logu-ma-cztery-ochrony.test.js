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
    slad: (cialo) => /if\s*\(\s*_savingLog\w*\s*\)/.test(cialo)
                  && /_savingLog\w*\s*=\s*true/.test(cialo)
                  && /_savingLog\w*\s*=\s*false/.test(cialo),
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
    slad: (cialo) => /external_source\s*:\s*'app'/.test(cialo) && /external_id/.test(cialo),
  },
};

// ── REJESTR ŚCIEŻEK ──────────────────────────────────────────────────────────
// `wymaga: true`  → zapis z FORMULARZA wypełnianego przez człowieka; komplet obowiązkowy.
// `wymaga: false` → zapis bez formularza; `powod` mówi, dlaczego warstwy nie mają sensu.
const REJESTR = {
  'zawodnik.html:saveLog': {
    wymaga: true,
    opis: 'główny modal „Zaloguj trening" — wzorzec, od 16.08 komplet',
  },
  'kalendarz.html:saveLog': {
    wymaga: true,
    opis: 'log-modal w kalendarzu (ścieżka OCR) — ZAŁATANE 27.08.2026',
  },
  'kalendarz.html:saveTraining': {
    wymaga: false,
    PRZYPIETA_WADA: true,
    powod:
      'ZAPIS Z FORMULARZA BEZ ŻADNEJ Z CZTERECH WARSTW — to ta sama klasa wady '
      + 'co załatana kopia saveLog, tylko wykryta później (27.08, przy zwiadzie). '
      + 'Wpisuje log jako skutek uboczny oznaczania planu jako zrobiony; kolumna '
      + '`source` ma default \'manual\', więc te wiersze są nie do odróżnienia od '
      + 'ręcznych. Zmierzone 27.08: 75 par duplikatów manual+manual, WSZYSTKIE '
      + 'z `external_id` NULL po obu stronach, obie mierzalne pary poniżej minuty. '
      + '⚠️ NIE ZAŁATANE ŚWIADOMIE: funkcja ma ~200 linii, DWIE role (trener '
      + 'i zawodnik) i 12 wyjść — dołożenie warstw to nie łata, tylko przebudowa, '
      + 'i wymaga osobnej decyzji. Gdy ją dostanie: przenieś wpis na wymaga:true.',
  },
  'kalendarz.html:executeMoveScreen': {
    wymaga: false,
    powod:
      'Nie jest zapisem formularza. Przenosi ZDJĘCIE na inny dzień i zakłada '
      + 'kikut `training_type: \'Zdjęcie\'` bez dystansu, czasu i tętna, gdy '
      + 'w dniu docelowym nie ma logu. Nie ma wypełniania, nie ma uploadu '
      + '(plik już jest w Storage), a powtórzenie daje wpis, który człowiek '
      + 'widzi od razu w kalendarzu — bo tam właśnie jest.',
  },
  'zawodnik.html:CIRCUIT.saveCircuitLog': {
    wymaga: false,
    powod:
      'Nie jest zapisem formularza. `source: \'circuit\'` — log powstaje '
      + 'automatycznie na zakończenie obwodu, z pomiaru, a nie z pól. Nie ma '
      + 'guzika „Zapisz" do podwójnego tapnięcia ani załącznika do wgrania. '
      + 'W bazie 2 takie logi, zero duplikatów.',
  },
};

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
    ...przed.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm),
    ...przed.matchAll(/^(?:const|let|var)\s+(\w+)\s*=\s*\{/gm),
  ].sort((a, b) => a.index - b.index);
  if (!kandydaci.length) return null;
  const start = kandydaci[kandydaci.length - 1];
  const koniec = src.indexOf('\n}', start.index);
  const doIdx = koniec === -1 ? src.length : koniec + 2;
  /* Nazwa metody — TYLKO wewnątrz obiektu, inaczej wszystkie zapisy z CIRCUIT
     zlałyby się w jeden wpis rejestru i dołożenie drugiego przeszłoby cicho.
     ⚠️ Dla zwykłej funkcji dopisek jest szkodliwy: `if (…) {` wygląda dla
        wzorca jak metoda i produkował klucze w rodzaju `saveLog.if`. */
  const jestObiektem = /^(?:const|let|var)\s/.test(start[0]);
  const SLOWA_KLUCZOWE = new Set(['if', 'for', 'while', 'switch', 'catch', 'try', 'else', 'do', 'return', 'function']);
  let ostatnia = null;
  if (jestObiektem) {
    const metody = [...src.slice(start.index, idx)
      .matchAll(/^\s{2,}(\w+)\s*:\s*(?:async\s+)?function|^\s{2,}(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm)]
      .map((m) => m[1] || m[2])
      .filter((n) => n && !SLOWA_KLUCZOWE.has(n));
    ostatnia = metody.length ? metody[metody.length - 1] : null;
  }
  return {
    nazwa: ostatnia ? `${start[1]}.${ostatnia}` : start[1],
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
    assert.ok(Object.keys(SCIEZKI).length >= 5,
      'znaleziono ' + Object.keys(SCIEZKI).length + ' ścieżek — wzorzec przestał pasować, '
      + 'a wtedy CAŁY ten plik przechodzi mierząc pustkę');
  });

  test('kazda warstwa jest wykrywalna — wzorzec z zawodnik.html ma komplet', () => {
    // Gdyby ślad którejś warstwy przestał pasować, test niżej zzieleniałby
    // na wszystkim. Wzorzec jest tu kotwicą: on MUSI mieć wszystkie cztery.
    const cialo = SCIEZKI['zawodnik.html:saveLog'];
    assert.ok(cialo, 'zniknął wzorzec — zawodnik.html:saveLog');
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

describe('PRZYPIETA WADA — saveTraining nadal bez ochron', () => {
  // !! TEN TEST ŚWIECI NA ZIELONO PRZY ISTNIEJĄCEJ WADZIE i to jest świadome.
  //    Wada jest ZMIERZONA i UDOKUMENTOWANA wyżej w REJESTRZE, a jej naprawa
  //    wymaga decyzji, bo to przebudowa funkcji dwuroli. Test pilnuje, żeby
  //    stan nie zmienił się PO CICHU w żadną stronę.
  const KLUCZ = 'kalendarz.html:saveTraining';

  test('wpis w rejestrze niesie liczby, nie samo „TODO"', () => {
    const wpis = REJESTR[KLUCZ];
    assert.equal(wpis.PRZYPIETA_WADA, true);
    assert.match(wpis.powod, /75 par/, 'przypięta wada bez zmierzonej skali to TODO, nie blizna');
  });

  test('stan faktyczny: ZERO z czterech warstw', () => {
    const cialo = SCIEZKI[KLUCZ];
    const ma = Object.entries(WARSTWY).filter(([, w]) => w.slad(cialo)).map(([n]) => n);
    assert.deepEqual(ma, [],
      'DOBRA WIADOMOŚĆ: saveTraining dostał ochronę (' + ma.join(', ') + ').\n'
      + '→ Przenieś wpis w REJESTRZE na `wymaga: true` i usuń ten test. '
      + 'Czerwony kolor znaczy tu „wada naprawiona, zaktualizuj rejestr", nie „regresja".');
  });
});
