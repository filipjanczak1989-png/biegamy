// ─────────────────────────────────────────────────────────────────────────────
// WALIDACJA ŻYCIÓWEK — window.walidujPB / window.dopelnijPB (SSOT w sb.js).
//
// NAJKOSZTOWNIEJSZA BLIZNA W REPO: kolumny athletes.pb_* to `text`, a render
// robił `+s`. Dla poprawnego "25:20" dawało to NaN, więc PB wypadało po cichu
// i karta predykcji chowała się (majace.length === 0). Zmierzone 15.08.2026:
// 30 z 53 zawodników NIE WIDZIAŁO karty mimo wpisanych życiówek, a widziały ją
// 4 osoby — te z gołą liczbą w PB, czyli z danymi w złym formacie.
// Funkcja działała wyłącznie dla ludzi, którzy wpisali dane błędnie.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { zaladujSb } = require('./_srodowisko.js');
const KSZTALTY = require('./_dane/pb-ksztalty.js');

const w = zaladujSb();

describe('walidujPB — pokrycie klas kształtów', () => {
  for (const p of KSZTALTY) {
    const etykieta = p.w === '' ? '(pusty)' : JSON.stringify(p.w);
    test(`${etykieta} na ${p.d} km — ${p.blizna}`, () => {
      const r = w.walidujPB(p.w, p.d);
      assert.equal(r.ok, p.ok, r.blad || '(bez komunikatu)');
      if (p.ok && 'sek' in p) assert.equal(r.sekundy, p.sek);
      if (p.ostrzezenie) assert.ok(r.ostrzezenie, 'oczekiwano ostrzezenia');
    });
  }
});

describe('walidujPB — to, czego `+s` nie potrafiło', () => {
  test('poprawne "25:20" daje SEKUNDY, a nie NaN', () => {
    // +('25:20') === NaN — to jest cala blizna, jednym wyrazeniem.
    assert.ok(Number.isNaN(+'25:20'), 'zalozenie testu: +s na "25:20" to NaN');
    assert.equal(w.walidujPB('25:20', 5).sekundy, 1520);
  });

  test('gola liczba NIE jest cicho przyjmowana jako sekundy', () => {
    // +('56') === 56 — stara sciezka przepuszczala to jako 56 SEKUND.
    assert.equal(+'56', 56);
    assert.equal(w.walidujPB('56', 10).ok, false);
  });

  test('guard `> 0` przezyl jako `sekundy === null`', () => {
    // Zera musza dawac null, nie 0 — inaczej wchodza do doboru bazy Riegela.
    for (const z of ['0', '0:00', '00:00', '0:00:00']) {
      const r = w.walidujPB(z, 42.195);
      assert.equal(r.ok, true, z);
      assert.equal(r.sekundy, null, z);
      assert.ok(!(r.sekundy > 0), `${z}: null > 0 musi byc false`);
    }
  });
});

describe('walidujPB — komunikaty mówią CO jest źle', () => {
  // Decyzja produktowa: nigdzie nie moze paść "bledny format".
  test('brak dwukropka: komunikat podaje gotowa podpowiedz', () => {
    const r = w.walidujPB('56', 10);
    assert.match(r.blad, /dwukropkiem/);
    assert.match(r.blad, /56:00/, 'ma podac wartosc do wpisania');
  });

  test('czlon >= 60: komunikat podaje KTORY czlon', () => {
    const r = w.walidujPB('9:99:99', 42.195);
    assert.match(r.blad, /99/);
    assert.match(r.blad, /mniejsze niż 60/);
  });

  test('h:mm na dlugim: komunikat tlumaczy OBA odczytania', () => {
    const r = w.walidujPB('2:14', 21.0975);
    assert.match(r.blad, /2 godz\. 14 min/);
    assert.match(r.blad, /2 min 14 s/);
  });

  test('nigdzie nie pada "bledny format"', () => {
    for (const p of KSZTALTY.filter((x) => !x.ok)) {
      const r = w.walidujPB(p.w, p.d);
      assert.doesNotMatch(r.blad, /błędny format|bledny format/i, `dla ${JSON.stringify(p.w)}`);
    }
  });
});

describe('walidujPB — kolejność sprawdzeń (ustalona testem, nie rozumowaniem)', () => {
  // Pierwsza wersja walidatora miala te dwa bledy i wyszly dopiero na danych.
  test('zera PRZED dwukropkiem — inaczej "0" dostaje blad zamiast wyczyszczenia', () => {
    const r = w.walidujPB('0', 42.195);
    assert.equal(r.ok, true);
    assert.equal(r.blad, undefined);
  });

  test('ksztalt PRZED dwukropkiem — inaczej "abc" daje "czytamy jako abc sekund"', () => {
    const r = w.walidujPB('abc', 5);
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.blad, /abc sekund/);
  });
});

describe('dopelnijPB — dopowiada na blur, deterministycznie', () => {
  // To NIE jest zgadywanie intencji: wartosc dwuczlonowa na HM/maratonie nie ma
  // drugiego mozliwego odczytania — "2:04" jako 2 min 4 s byloby szybsze od
  // rekordu swiata o rzad wielkosci. Dlatego wolno to zrobic PRZY POLU
  // WEJSCIOWYM, a nie wolno w renderze ani w migracji.
  const przypadki = [
    ['56', 10, '56:00', 'gola liczba na dziesiatce = minuty'],
    ['36', 5, '36:00', 'gola liczba na piatce = minuty'],
    ['2:04', 21.0975, '2:04:00', 'dwa czlony na HM = godziny:minuty'],
    ['3:46', 42.195, '3:46:00', 'dwa czlony na maratonie = godziny:minuty'],
    ['2', 42.195, '2:00:00', 'sama liczba na maratonie = godziny'],
    ['25:20', 5, '25:20', 'poprawne mm:ss na piatce zostaje nietkniete'],
    ['1:45:00', 21.0975, '1:45:00', 'poprawne h:mm:ss zostaje nietkniete'],
    ['abc', 5, 'abc', 'czego nie rozumiemy, tego nie ruszamy'],
  ];
  for (const [wej, d, oczek, opis] of przypadki) {
    test(`"${wej}" na ${d} km -> "${oczek}" (${opis})`, () => {
      assert.equal(w.dopelnijPB(wej, d), oczek);
    });
  }

  test('dwa czlony na KROTKIM dystansie to mm:ss — NIE dopelniamy', () => {
    // Na 5/10 km dwuczlonowy zapis jest jednoznaczny i poprawny.
    assert.equal(w.dopelnijPB('45:30', 10), '45:30');
    assert.equal(w.dopelnijPB('22:00', 5), '22:00');
  });
});
