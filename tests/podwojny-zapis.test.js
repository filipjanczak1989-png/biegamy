// ─────────────────────────────────────────────────────────────────────────────
// PODWÓJNY ZAPIS — klucz idempotencji i zamek między kartami.
//
// BLIZNA: po zdjęciu cooldownu (16.08.2026) w ciągu doby powstało 10 nadmiarowych
// wierszy u 3 osób i WSZYSTKIE w oknie 30 sekund — czyli 100% to retry, zero
// świadomych. Magdalena: cztery identyczne zapisy w 15 s, DWA W TEJ SAMEJ
// SEKUNDZIE. Pytanie „Masz już trening z tego dnia" tego nie łapało i nie mogło:
// ono działa między różnymi wypełnieniami formularza, a tu chodzi o JEDNO
// wypełnienie wysłane kilka razy.
//
// ⚠️ `_savingLog` nie wystarcza — to zmienna per-załadowanie strony, więc dwie
//    otwarte karty mają dwa niezależne guardy i żadna nie widzi drugiej.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');

describe('klucz idempotencji', () => {
  const w = zaladujSb();

  test('każde wywołanie daje INNY klucz', () => {
    const k = new Set(Array.from({ length: 50 }, () => w.nowyKluczZapisu()));
    assert.equal(k.size, 50, 'klucze się powtórzyły — to nie byłby klucz, tylko stała');
  });

  test('⚠️ działa BEZ crypto.randomUUID (starsze WebView Messengera)', () => {
    /* Messenger na starszym Androidzie nie ma randomUUID. Gdyby klucz był
       wtedy `undefined`, indeks unikalny NIE zadziałałby — bo warunek
       częściowy wymaga `external_id IS NOT NULL`. Czyli akurat u ludzi
       z najgorszą przeglądarką ochrona zniknęłaby po cichu. */
    const bez = zaladujSb();
    bez.crypto = undefined;
    const k = bez.nowyKluczZapisu();
    assert.equal(typeof k, 'string');
    assert.ok(k.length >= 12, 'klucz zapasowy za krótki: ' + k);
    assert.notEqual(k, bez.nowyKluczZapisu(), 'klucz zapasowy się powtarza');
  });
});

describe('odcisk treści', () => {
  const w = zaladujSb();

  test('te same dane → ten sam odcisk', () => {
    const a = w.odciskZapisu(['ath', '2026-08-16', 'Bieg spokojny', 10.05, '1:07:54']);
    const b = w.odciskZapisu(['ath', '2026-08-16', 'Bieg spokojny', 10.05, '1:07:54']);
    assert.equal(a, b);
  });

  test('⚠️ różny dystans → RÓŻNY odcisk (inaczej blokowalibyśmy prawdziwy drugi trening)', () => {
    const a = w.odciskZapisu(['ath', '2026-08-16', 'Bieg spokojny', 10.05, '1:07:54']);
    const b = w.odciskZapisu(['ath', '2026-08-16', 'Bieg spokojny', 5.0, '1:07:54']);
    assert.notEqual(a, b);
  });

  test('różny dzień → różny odcisk', () => {
    assert.notEqual(w.odciskZapisu(['a', '2026-08-16', 'X', 1, '1']),
                    w.odciskZapisu(['a', '2026-08-15', 'X', 1, '1']));
  });

  test('null i undefined nie wywracają odcisku', () => {
    assert.equal(typeof w.odciskZapisu(['a', null, undefined, 0, '']), 'string');
  });
});

describe('⚠️ zamek między kartami', () => {
  function zeSztucznymMagazynem() {
    const w = zaladujSb();
    const mag = new Map();
    w.localStorage = {
      getItem: (k) => (mag.has(k) ? mag.get(k) : null),
      setItem: (k, v) => mag.set(k, String(v)),
      removeItem: (k) => mag.delete(k),
    };
    return w;
  }

  test('pierwszy zapis przechodzi, drugi w oknie — NIE', () => {
    const w = zeSztucznymMagazynem();
    assert.equal(w.zamekZapisu('odcisk-1', 60), true);
    assert.equal(w.zamekZapisu('odcisk-1', 60), false, 'drugi zapis przeszedł — zamek nie działa');
  });

  test('INNY odcisk przechodzi mimo zamka na pierwszym', () => {
    const w = zeSztucznymMagazynem();
    w.zamekZapisu('odcisk-1', 60);
    assert.equal(w.zamekZapisu('odcisk-2', 60), true, 'zamek zablokował niepowiązany zapis');
  });

  test('⚠️ po upływie okna zapis JEST możliwy', () => {
    /* Prawdziwy drugi trening tego samego dnia musi się dać zapisać.
       Okno to 60 s, a zmierzone: w całej historii ZERO przypadków dwóch
       treningów o identycznym dystansie i czasie w odstępie < 60 s, które
       byłyby prawdziwe. */
    const w = zeSztucznymMagazynem();
    w.zamekZapisu('odcisk-1', 60);
    w.localStorage.setItem('bm_zapis_odcisk-1', String(Date.now() - 61000));
    assert.equal(w.zamekZapisu('odcisk-1', 60), true, 'zamek trzyma dłużej niż okno');
  });

  test('⚠️ po NIEUDANYM zapisie zamek znika — powtorka jest legalna', () => {
    /* Zamek ma blokowac powtorzenie UDANEGO zapisu, nie probe po bledzie.
       Bez `zwolnijZamek` czlowiek, ktoremu padla siec, klikalby „Zapisz"
       jeszcze raz w ciagu 60 s i dostawal „juz zapisane" — a NIE BYLOBY.
       To zamienialoby ochrone przed duplikatem w UTRATE treningu. */
    const w = zeSztucznymMagazynem();
    assert.equal(w.zamekZapisu('odcisk-1', 60), true);
    assert.equal(w.zamekZapisu('odcisk-1', 60), false, 'zamek nie zadzialal');
    w.zwolnijZamek('odcisk-1');                       // <- zapis padl
    assert.equal(w.zamekZapisu('odcisk-1', 60), true, 'po bledzie powtorka NADAL zablokowana');
  });

  test('zwolnienie NIEISTNIEJACEGO zamka nie wywraca sie', () => {
    const w = zeSztucznymMagazynem();
    assert.doesNotThrow(() => w.zwolnijZamek('nigdy-nie-bylo'));
  });

  test('⚠️ brak localStorage NIE MOŻE blokować zapisu', () => {
    /* Tryb prywatny Safari potrafi rzucać przy zapisie do localStorage.
       Gdyby zamek wtedy zwracał false, człowiek nie zapisałby treningu
       w ogóle — czyli ochrona przed duplikatem stałaby się utratą danych. */
    const w = zaladujSb();
    w.localStorage = { getItem() { throw new Error('SecurityError'); },
                       setItem() { throw new Error('SecurityError'); } };
    assert.equal(w.zamekZapisu('odcisk-1', 60), true);
  });
});

describe('⚠️ zapis wysyła klucz i rozdziela błędy', () => {
  /* !! PRZENIESIONE 27.08.2026 ZE `zawodnik.html` DO `sb.js`. Trzy kopie
     `saveLog` zostały scalone w jeden rdzeń `window.zapiszLog`; asercje są te
     same co przed scaleniem, zmieniło się WYŁĄCZNIE miejsce. Blizny z 16.08
     nie wolno przy takiej operacji skasować — to one opisują, czemu ten
     mechanizm w ogóle istnieje. */
  const zaw = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
  const rdzen = fs.readFileSync(path.join(KORZEN, 'sb.js'), 'utf8');

  test('insert niesie external_source i external_id', () => {
    assert.match(rdzen, /payload\.external_source = 'app';/);
    assert.match(rdzen, /payload\.external_id = w\.kluczZapisu \|\| null;/);
  });

  test('⚠️ external_source to NIE „intervals" — inaczej podszywalibyśmy się pod zegarek', () => {
    /* Wszyscy konsumenci (`trener.html`, `profil.html`, `sb.js`, `share-card`)
       rozróżniają po `source === 'intervals'`. Gdyby wpis ręczny dostał
       `external_source: 'intervals'`, indeks nadal by działał, ale zapytania
       liczące treningi „z zegarka" zaczęłyby je łapać. */
    assert.doesNotMatch(rdzen, /external_source = 'intervals'/);
    assert.doesNotMatch(zaw, /external_source:\s*'intervals'/);
  });

  test('klucz odnawiany przy KAŻDYM otwarciu formularza', () => {
    /* Po scaleniu klucz odnawiają WSZYSTKIE modale, które potrafią zapisać
       log — także `kalendarz.html:openModal`, który do 27.08 nie miał go
       wcale, więc twardy unikat w bazie tej ścieżki nie obejmował. */
    const kal = fs.readFileSync(path.join(KORZEN, 'kalendarz.html'), 'utf8');
    const wz = /window\._kluczZapisu = window\.nowyKluczZapisu/g;
    const ileZ = (zaw.match(wz) || []).length;
    const ileK = (kal.match(wz) || []).length;
    assert.equal(ileZ, 3, 'zawodnik: miejsc resetu klucza ' + ileZ + ' (spodziewane 3)');
    assert.equal(ileK, 2, 'kalendarz: miejsc resetu klucza ' + ileK + ' (spodziewane 2: openModal + openLogModal)');
  });

  test('23505 traktowane jako SUKCES, nie błąd', () => {
    assert.match(rdzen, /wynikI\.error\.code === '23505'/);
    assert.match(rdzen, /return \{ ok: true, id: null, powtorzony: true \};/);
  });

  test('⚠️ brak funkcji ZGŁASZANY, błąd zapytania PRZEPUSZCZANY', () => {
    /* Do 16.08.2026 jeden `catch` połykał obie sytuacje i w obu zapisywał.
       Magdalena miała cztery duplikaty i ZERO wpisów w `client_errors` —
       właśnie dlatego nie dało się powiedzieć, czy mechanizm w ogóle działał. */
    assert.match(zaw, /is not a function\|undefined/);
    assert.match(zaw, /zglosNieudanyZapis\('brak-funkcji', 'pytajODrugiTrening'/);
  });

  test('⚠️ odcisk deklarowany w zasiegu CALEJ funkcji, nie w bloku INSERT-a', () => {
    /* Pierwsza wersja deklarowala `const _odcisk` wewnatrz bloku `else`,
       wiec `if (error)` nizej go NIE WIDZIALO i zamek nigdy sie nie zwalnial
       po nieudanym zapisie. Testy jednostkowe helperow tego nie widza —
       to blad ZASIEGU w miejscu wywolania. */
    const iDekl = rdzen.indexOf('var odcisk = null;');
    const iBlok = rdzen.indexOf('odcisk = window.odciskZapisu');
    const iZwoln = rdzen.indexOf('window.zwolnijZamek(odcisk)');
    assert.ok(iDekl > 0, 'brak deklaracji `var odcisk` w zasiegu funkcji');
    assert.ok(iDekl < iBlok && iBlok < iZwoln, 'kolejnosc: deklaracja -> przypisanie -> zwolnienie');
    assert.doesNotMatch(rdzen, /const odcisk = window\.odciskZapisu/,
      '`const` w bloku INSERT-a — zwolnienie zamka bedzie poza zasiegiem');
    /* Rdzen ma dodatkowo `catch`, ktory tez zwalnia zamek — bez tego wyjatek
       JS zostawialby zamek zalozony na 60 s przy NIEZAPISANYM treningu. */
    assert.match(rdzen, /catch \(e\) \{[\s\S]{0,120}zwolnijZamek\(odcisk\)/);
  });

  test('⚠️ komunikat zamka MOWI, CO ZROBIC — nie samo „juz zapisane"', () => {
    /* W kalendarzu NIE MA pytania „masz juz trening z tego dnia" — istnieje
       wylacznie w zawodnik.html. Dla dwoch ROZNYCH treningow tego samego dnia
       (rano i wieczor, ten sam typ i dystans) zamek jest wiec JEDYNA bariera,
       a sam napis „juz zapisany" bylby wtedy NIEPRAWDA: trening drugi nie jest
       zapisany, tylko odrzucony. Komunikat musi dawac wyjscie. */
    assert.match(rdzen, /Ten trening jest już zapisany\./);
    assert.match(rdzen, /odczekaj chwilę i spróbuj ponownie/);
    const kal = fs.readFileSync(path.join(KORZEN, 'kalendarz.html'), 'utf8');
    assert.doesNotMatch(kal, /pytajODrugiTrening/,
      'kalendarz zyskal pytanie o drugi trening — zaktualizuj uzasadnienie tego testu');
  });

  test('zamek sprawdzany PRZED insertem, nie po', () => {
    const iZamek = rdzen.indexOf('window.zamekZapisu(odcisk, 60)');
    const iIns = rdzen.indexOf("sb.from('training_logs').insert(payload)");
    assert.ok(iZamek > 0 && iIns > 0 && iZamek < iIns, 'zamek po insercie albo go nie ma');
  });
});
