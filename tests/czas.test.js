// ─────────────────────────────────────────────────────────────────────────────
// CZAS I MASKI — każdy przypadek odpowiada bliźnie z .ai/LEKCJE.md albo z sesji.
// Test bez blizny to przyszły fałszywy alarm, więc go tu nie ma.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { zaladujSb } = require('./_srodowisko.js');

const w = zaladujSb();

describe('samo-kontrola zestawu', () => {
  // !! TEN TEST PILNUJE POZOSTAŁYCH. Zestaw testów, o którym nie wiadomo, czy
  //    potrafi zaświecić na czerwono, jest wart tyle co bramka bez testu
  //    negatywnego (.ai/LEKCJE.md #2). Zamiast trzymać wyłączony, celowo psuty
  //    przypadek — który po wyłączeniu i tak niczego nie dowodzi — sprawdzamy
  //    NA STAŁE, że mechanizm asercji faktycznie odrzuca fałsz.
  test('assert potrafi wykryc falsz (inaczej caly zestaw jest dekoracja)', () => {
    assert.throws(() => assert.equal(1, 2), /Expected values to be strictly equal/);
    assert.throws(() => assert.ok(false));
  });

  test('srodowisko zaladowalo SSOT z sb.js', () => {
    for (const nazwa of ['_secsToTime', 'autoColonTime', 'autoColonResult', '_dzienWaw', 'isRunType']) {
      assert.equal(typeof w[nazwa], 'function', `brak window.${nazwa}`);
    }
  });
});

describe('_dzienWaw — doba warszawska, nie UTC', () => {
  // BLIZNA: reguły odznak liczyły `String(logged_at).slice(0,10)`, czyli dobę UTC.
  // Bieg Maćka o 00:51 czasu polskiego to 22:51 UTC dnia POPRZEDNIEGO — wypadał
  // poza oknem wyzwania. Zmierzone 15.08: 64 z 2605 logów zmienia dobę.
  test('log o 22:51 UTC nalezy do NASTEPNEGO dnia warszawskiego', () => {
    assert.equal(w._dzienWaw('2026-08-14T22:51:05+00:00'), '2026-08-15');
    assert.notEqual(w._dzienWaw('2026-08-14T22:51:05+00:00'), '2026-08-14');
  });

  test('log w srodku dnia nie przesuwa sie', () => {
    assert.equal(w._dzienWaw('2026-08-15T05:01:25+00:00'), '2026-08-15');
  });

  test('granica przesuwa sie z czasem letnim/zimowym', () => {
    assert.equal(w._dzienWaw('2026-08-14T21:59:00+00:00'), '2026-08-14'); // lato: +2
    assert.equal(w._dzienWaw('2026-12-14T23:30:00+00:00'), '2026-12-15'); // zima: +1
    assert.equal(w._dzienWaw('2026-12-14T22:30:00+00:00'), '2026-12-14');
  });

  // BLIZNA: .ai/LEKCJE.md #6 — try/catch nie łapał, bo toLocaleDateString NIE RZUCA
  // na złej dacie (oddaje 'Invalid Date'), a new Date(null) to epoka ('1970-01-01').
  // Oba przeszłyby dalej jako prawdopodobnie wyglądający klucz dnia i zatrułyby
  // matematykę streaków — '1970-01-01' posortowałoby się na początek.
  test('smiec na wejsciu NIE staje sie prawdopodobna data', () => {
    assert.notEqual(w._dzienWaw('abc'), 'Invalid Date');
    assert.equal(w._dzienWaw('abc'), 'abc');
  });

  test('null NIE staje sie epoka', () => {
    assert.notEqual(w._dzienWaw(null), '1970-01-01');
    assert.equal(w._dzienWaw(null), '');
  });
});

describe('maski wejsciowe — formatuja, ale NIE walidują', () => {
  // BLIZNA: .ai/LEKCJE.md #5. Te trzy asercje DOKUMENTUJĄ zachowanie, którego
  // nie naprawiamy w masce (autoColonTime ma 8 obcych konsumentów, u których
  // model "od prawej" jest poprawny). Naprawa jest OBOK — w walidatorze.
  // Gdyby ktoś kiedyś "poprawił" maskę, te testy pokażą, że zmienił kontrakt.
  test('autoColonTime SKLADA 9:99:99 z pieciu cyfr — maska to produkuje', () => {
    const el = { value: '99999' };
    w.autoColonTime(el);
    assert.equal(el.value, '9:99:99');
  });

  test('autoColonTime na 4 cyfrach daje mm:ss — stad h:mm na dlugim dystansie', () => {
    const el = { value: '0204' };
    w.autoColonTime(el);
    assert.equal(el.value, '02:04'); // czlowiek mial na mysli 2 godz. 04 min
  });

  test('autoColonResult ponizej 3 cyfr NIE wstawia dwukropka', () => {
    const el = { value: '56' };
    w.autoColonResult(el);
    assert.equal(el.value, '56'); // stad "56" w bazie, czytane jako 56 SEKUND
  });
});

describe('autoColonResult po rozluznieniu o warstwe H:MM:SS', () => {
  // BLIZNA: cap .slice(0,5) dawal maksimum "99:59" = 1 h 39 min, wiec ktos
  // przechodzacy dziesiatke w 1:40 NIE MOGL wpisac swojego wyniku.
  // Rozluznione 15.08; ponizej 5 cyfr zachowanie ma byc BIT W BIT takie jak bylo.
  const bezZmian = [['4', '4'], ['45', '45'], ['453', '45:3'], ['4530', '45:30']];
  for (const [wejscie, oczekiwane] of bezZmian) {
    test(`regresja: "${wejscie}" -> "${oczekiwane}"`, () => {
      const el = { value: wejscie };
      w.autoColonResult(el);
      assert.equal(el.value, oczekiwane);
    });
  }

  test('5-6 cyfr daje H:MM:SS — dziesiatka w 1:40:00 jest wpisywalna', () => {
    const a = { value: '14000' };
    w.autoColonResult(a);
    assert.equal(a.value, '1:40:00');
    const b = { value: '104500' };
    w.autoColonResult(b);
    assert.equal(b.value, '10:45:00');
  });
});

describe('_secsToTime — SSOT formatowania', () => {
  // BLIZNA: predyktor mial WLASNA kopie formattera, karmiona MINUTAMI zamiast
  // sekundami. "0:27" na piatce i "4:19" na maratonie to byl ten sam format
  // niosacy dwie rozne jednostki.
  test('ponizej godziny: M:SS', () => {
    assert.equal(w._secsToTime(1528), '25:28');
    assert.equal(w._secsToTime(27), '0:27');
  });

  test('powyzej godziny: H:MM:SS', () => {
    assert.equal(w._secsToTime(8080), '2:14:40');
    assert.equal(w._secsToTime(16845), '4:40:45');
  });

  test('zaokragla, nie obcina', () => {
    assert.equal(w._secsToTime(59.6), '1:00');
  });
});

describe('isRunType — co liczy sie do sum biegowych', () => {
  // BLIZNA: import z intervals wstawia "Spokojny" z wielkiej litery; regula
  // odznaki wyzwania sumuje tylko typy biegowe.
  test('rozpoznaje niezaleznie od wielkosci liter i spacji', () => {
    assert.equal(w.isRunType('Spokojny'), true);
    assert.equal(w.isRunType('  spokojny '), true);
  });

  test('odrzuca nie-biegowe', () => {
    assert.equal(w.isRunType('Wzmacniający'), false);
    assert.equal(w.isRunType('Zastępczy'), false);
    assert.equal(w.isRunType(null), false);
  });
});
