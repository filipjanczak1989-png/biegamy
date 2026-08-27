// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 27 — `undefined` NIE RUSZA KOLUMNY, `null` JĄ CZYŚCI.
//
// PO CO. Scalenie trzech kopii `saveLog` w jeden rdzeń (`window.zapiszLog`,
// 27.08.2026) opiera się na rozróżnieniu, którego nie widać w sygnaturze
// i które przy pierwszym „uproszczeniu" ginie bezszelestnie:
//
//     pola.attachment_url === undefined  →  NIE dotykaj kolumny
//     pola.attachment_url === null       →  zapisz NULL (wyczyść)
//
// Trzej wołający potrzebują RÓŻNYCH gałęzi tego rozróżnienia:
//   · zawodnik.html:saveLog     — musi móc WYCZYŚCIĆ załączniki, gdy człowiek
//                                 usunął w modalu wszystkie zdjęcia;
//   · kalendarz.html:saveTraining — robi UPDATE CZĘŚCIOWY (dopina zdjęcie do
//                                 istniejącego logu) i NIE MOŻE nadpisać
//                                 dystansu, tempa ani typu wpisanych gdzie indziej;
//   · kalendarz.html:saveLog    — zwykły pełny zapis.
//
// !! „UPROSZCZENIE" DO `if (wartosc)` PSUJE OBIE SKRAJNE GAŁĘZIE NARAZ:
//    falsy-check wyrzuca `null` razem z `undefined` (zawodnik traci możliwość
//    usunięcia załącznika), a bezwarunkowe pisanie wszystkiego wysyła
//    `undefined` jako NULL (saveTraining kasuje cudze dane przy dopinaniu
//    zdjęcia). Dlatego test sprawdza OBA kierunki, nie jeden.
//
// !! TO TEST ZACHOWANIA, NIE TEKSTU. Wywołuje prawdziwy rdzeń z atrapą `sb`
//    i ogląda payload, który NAPRAWDĘ poszedłby do bazy. Dopasowanie wzorca
//    w źródle przeszłoby po każdym przepisaniu stylu.
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { zaladujSb } = require('./_srodowisko.js');

const w = zaladujSb();

/** Atrapa `sb` zapisująca payload, który trafiłby do bazy. */
function atrapaSb(zapis) {
  const wynikSelect = { data: [{ id: 'LOG-1' }], error: null };
  return {
    from() {
      const b = {
        insert(p) { zapis.op = 'insert'; zapis.payload = p; return b; },
        update(p) { zapis.op = 'update'; zapis.payload = p; return b; },
        eq() { return b; },
        select() { return Promise.resolve(wynikSelect); },
        then(res, rej) { return Promise.resolve(wynikSelect).then(res, rej); },
      };
      return b;
    },
  };
}

let zapis;
beforeEach(() => {
  zapis = {};
  w.sb = atrapaSb(zapis);
  // localStorage w atrapie oddaje null, wiec zamek zawsze przepuszcza.
  w.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
});

const BAZA = {
  athleteId: 'ATL-1', dzien: '2026-08-27', typ: 'Spokojny',
  kluczZapisu: 'klucz-1', zrodlo: 'manual',
};

describe('samo-kontrola', () => {
  test('assert potrafi wykryc falsz', () => {
    assert.throws(() => assert.equal(1, 2));
  });

  test('rdzen istnieje i atrapa lapie payload', async () => {
    const r = await w.zapiszLog(Object.assign({}, BAZA, { pola: { distance_km: 10 } }));
    assert.equal(r.ok, true, 'zapis nie powiodl sie: ' + JSON.stringify(r));
    assert.equal(zapis.op, 'insert');
    assert.equal(zapis.payload.distance_km, 10, 'atrapa nie zlapala payloadu');
  });
});

describe('⚠️ UPDATE — undefined NIE RUSZA kolumny', () => {
  test('pole pominiete NIE pojawia sie w payloadzie', async () => {
    await w.zapiszLog(Object.assign({}, BAZA, {
      idLoguDoEdycji: 'LOG-1',
      typ: undefined,
      pola: { comment: 'tylko komentarz' },
    }));
    assert.equal(zapis.op, 'update');
    assert.equal(zapis.payload.comment, 'tylko komentarz');
    for (const k of ['distance_km', 'duration', 'pace', 'heart_rate',
                     'attachment_url', 'training_type']) {
      assert.ok(!(k in zapis.payload),
        `„${k}" trafilo do UPDATE mimo ze wolajacy go NIE PODAL — `
        + 'dopiecie zdjecia do istniejacego logu skasuje cudze dane');
    }
  });

  test('⚠️ `typ: undefined` NIE nadpisuje training_type', async () => {
    /* saveTraining dopina zalacznik do logu, ktory moze miec inny typ niz
       wybrany w modalu planu. Nadpisanie typu przepisaloby cudzy wpis. */
    await w.zapiszLog(Object.assign({}, BAZA, {
      idLoguDoEdycji: 'LOG-1', typ: undefined, pola: { strava_link: 'x' },
    }));
    assert.ok(!('training_type' in zapis.payload));
  });

  test('⚠️ `pace` NIE jest zerowane przy nie-biegu, gdy wolajacy go nie podal', async () => {
    /* Rdzen czysci tempo dla nie-biegow — ale normalizacja TEZ podlega
       kontraktowi. Przy UPDATE czesciowym `pace` jest `undefined`
       i wyzerowanie go skasowaloby tempo wpisane wczesniej. */
    await w.zapiszLog(Object.assign({}, BAZA, {
      idLoguDoEdycji: 'LOG-1', typ: 'Wzmacniający', pola: { comment: 'x' },
    }));
    assert.ok(!('pace' in zapis.payload),
      'pace wyzerowane mimo ze wolajacy go nie podal');
  });
});

describe('⚠️ null CZYSCI kolumne', () => {
  test('`pola.pace = null` trafia do payloadu jako null', async () => {
    await w.zapiszLog(Object.assign({}, BAZA, {
      idLoguDoEdycji: 'LOG-1', pola: { pace: null },
    }));
    assert.ok('pace' in zapis.payload, 'null zostal potraktowany jak undefined');
    assert.equal(zapis.payload.pace, null);
  });

  test('⚠️ `wyczyscZalaczniki` daje attachment_url = null, nie brak pola', async () => {
    /* Gałąź, ktora ginie pierwsza przy „uproszczeniu" do falsy-checka:
       czlowiek usunal wszystkie zdjecia i zapisuje. Bez tego kolumna zostaje
       nietknieta, a usuniete zdjecia wracaja po odswiezeniu. */
    await w.zapiszLog(Object.assign({}, BAZA, {
      idLoguDoEdycji: 'LOG-1', pola: {}, wyczyscZalaczniki: true,
    }));
    assert.ok('attachment_url' in zapis.payload,
      'wyczyszczenie zalacznikow NIE dotarlo do bazy — zdjecia wroca po odswiezeniu');
    assert.equal(zapis.payload.attachment_url, null);
  });

  test('bez `wyczyscZalaczniki` i bez plikow kolumna zostaje NIETKNIETA', async () => {
    await w.zapiszLog(Object.assign({}, BAZA, {
      idLoguDoEdycji: 'LOG-1', pola: { comment: 'x' },
    }));
    assert.ok(!('attachment_url' in zapis.payload));
  });

  test('istniejace zalaczniki + brak nowych → kolumna zapisana, nie wyczyszczona', async () => {
    await w.zapiszLog(Object.assign({}, BAZA, {
      idLoguDoEdycji: 'LOG-1', pola: {},
      zalacznikiIstniejace: ['a/1.jpg', 'a/2.jpg'],
    }));
    assert.equal(zapis.payload.attachment_url, 'a/1.jpg,a/2.jpg');
  });
});

describe('INSERT — kontrakt dziala tak samo', () => {
  test('pominiete pola nie ida do INSERT-a jako null', async () => {
    await w.zapiszLog(Object.assign({}, BAZA, { pola: { distance_km: 5 } }));
    assert.equal(zapis.op, 'insert');
    assert.ok(!('heart_rate' in zapis.payload),
      'pominiete pole poszlo do INSERT-a — nadpisuje wartosc domyslna kolumny');
    assert.equal(zapis.payload.training_type, 'Spokojny', 'INSERT musi niesc typ');
  });

  test('⚠️ INSERT BEZ TYPU jest odrzucany, nie zapisywany po cichu', async () => {
    const r = await w.zapiszLog(Object.assign({}, BAZA, { typ: undefined, pola: {} }));
    assert.equal(r.ok, false);
    assert.equal(zapis.op, undefined, 'poszedl INSERT bez training_type');
  });

  test('nie-bieg traci tempo, gdy wolajacy JE PODAL', async () => {
    await w.zapiszLog(Object.assign({}, BAZA, {
      typ: 'Wzmacniający', pola: { distance_km: 3, pace: '6:30' },
    }));
    assert.equal(zapis.payload.pace, null,
      'tempo przy nie-biegu — 40 takich wierszy jest juz w bazie, nie dokladamy');
  });
});
