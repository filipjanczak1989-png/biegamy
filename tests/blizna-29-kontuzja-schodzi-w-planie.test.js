// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 29 — PLAN FAKTYCZNIE SCHODZI PRZY KONTUZJI (nie „prompt o to prosi").
//
// CO SIĘ STAŁO. Do 28.08.2026 zgłoszony ból wpływał na plan WYŁĄCZNIE przez
// Edge Function `generate-training-plan`, odpalaną tylko z `trener.html`.
// Kliencki `window.GeneratorPlanu` — jedyna ścieżka dla 35 z 63 zawodników
// (tych bez trenera) — nie czytał `injuries` w ogóle i sam to o sobie pisał:
// „Nie widzi za to kontuzji, snu ani życia".
//
// !! RÓŻNICA, KTÓRĄ TEN PLIK PILNUJE. W EF progi są ZDANIAMI W PROMPCIE
//    („OBJĘTOŚĆ −40%") — prośbą do modelu, bez gwarancji, że plan naprawdę
//    zejdzie. W silniku są ARYTMETYKĄ. Dlatego każda asercja niżej mierzy
//    WYNIK: `meta.objetosciTygodni`, `meta.objetosciFaktyczne` i sumę
//    `target_distance_km` z realnie rozpisanych jednostek. Test, który
//    sprawdzałby obecność reguły w tekście, przechodziłby także wtedy, gdy
//    model reguły nie posłucha — czyli mierzyłby nie to zjawisko.
//
// !! TO JEST ZABEZPIECZENIE, NIE FUNKCJA. Ten generator wyprodukował ZERO
//    planów w 3,5 miesiąca (`training_plans` ma wyłącznie `source='coach_ai'`;
//    klient zapisuje `source:'self'` — takich wierszy nie ma). Nie testujemy
//    czegoś, z czego ktoś dziś korzysta — testujemy, żeby w dniu, w którym
//    PIERWSZY człowiek z kontuzją go użyje, plan już to widział.
//    Zabezpieczenie działa wtedy, gdy nikt na nie nie patrzy.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/generator-planu.js');

const TODAY = '2026-08-28';
const AKCENTY = ['Interwały', 'Tempo'];

function zaTyg(n) {
  const d = new Date(TODAY + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

/** Wejście kontrolne: półmaraton za 14 tygodni, 5 dni, baza 40 km/tydz. */
function uloz(bol, nadpisz) {
  const we = Object.assign({
    dystans: 'half', dniWTygodniu: 5, dataStartu: zaTyg(14), today: TODAY,
    poziom: { p10sec: 300, wynik: null, objetoscTygodniowa: 40 },
    celCzasowy: null, bol: bol,
  }, nadpisz || {});
  const r = G.uloz(we);
  assert.ok(r.ok, 'silnik odmówił na wejściu kontrolnym: ' + JSON.stringify(r.sciana || {}));
  return r;
}

const sumaKm = (t) => Math.round(t.reduce((s, x) => s + (x.target_distance_km || 0), 0) * 10) / 10;
const akcenty = (t) => t.filter((x) => AKCENTY.includes(x.workout_type)).length;
const tydzien = (t, n) => t.filter((x) => x.week_number === n);

describe('samo-kontrola', () => {
  test('assert potrafi wykryc falsz', () => {
    assert.throws(() => assert.equal(1, 2));
  });

  /* ⚠️ BEZ TEGO PRZYPADKU CAŁA RESZTA JEST BEZWARTOŚCIOWA. Asercje „akcentów
     jest 0" i „objętość spadła" przechodzą trywialnie na planie, który nigdy
     nie miał akcentów ani objętości. Punkt odniesienia MUSI być zmierzony. */
  test('plan BEZ kontuzji ma akcenty i objetosc — jest co obnizac', () => {
    const r = uloz(null);
    assert.ok(akcenty(r.treningi) > 0,
      'plan kontrolny nie ma ani jednego akcentu — reszta testu mierzyłaby pustkę');
    assert.ok(sumaKm(r.treningi) > 100,
      'plan kontrolny ma ' + sumaKm(r.treningi) + ' km — za mało, żeby spadek był mierzalny');
    assert.ok(r.meta.objetosciTygodni[0] > 0);
  });
});

describe('POZIOM 1 — „boli lekko": objetosc BEZ ZMIAN, ale zero akcentow', () => {
  test('objetosc tygodniowa NIE spada', () => {
    const bez = uloz(null), z = uloz({ poziom: 1 });
    assert.equal(z.meta.objetosciTygodni[0], bez.meta.objetosciTygodni[0],
      'poziom 1 obniżył objętość — reguła mówi „BEZ ZMIAN"');
  });

  test('⚠️ ZERO akcentow — w swiezym planie kazdy akcent jest NOWY', () => {
    /* Reguła EF brzmi „zero NOWYCH akcentów". Silnik nie dostaje historii
       treningów, więc nie ma jak sprawdzić, czy interwały „już były
       i przebiegały bezboleśnie" — bierze wersję ostrzejszą. */
    assert.equal(akcenty(uloz({ poziom: 1 }).treningi), 0);
  });
});

describe('POZIOM 2 — „boli mocno": objetosc −40%', () => {
  test('planowana objetosc spada DOKLADNIE o 40%', () => {
    const bez = uloz(null), z = uloz({ poziom: 2 });
    const a = bez.meta.objetosciTygodni, b = z.meta.objetosciTygodni;
    assert.equal(a.length, b.length, 'zmieniła się liczba tygodni');
    for (let i = 0; i < a.length; i++) {
      if (!(a[i] > 0)) continue;
      const stos = b[i] / a[i];
      assert.ok(Math.abs(stos - 0.60) < 0.001,
        'tydzień ' + (i + 1) + ': stosunek ' + stos.toFixed(3) + ', oczekiwany 0.600');
    }
  });

  test('⚠️ SPADEK JEST W ROZPISANYCH JEDNOSTKACH, nie tylko w krzywej', () => {
    /* Tu jest cała różnica wobec stanu sprzed 28.08: mierzymy kilometry,
       które trafią do `training_plan_workouts`, a nie liczbę w metadanych. */
    const bez = sumaKm(uloz(null).treningi), z = sumaKm(uloz({ poziom: 2 }).treningi);
    assert.ok(z < bez * 0.7,
      'suma planu ' + z + ' km wobec ' + bez + ' km — spadek nie dotarł do jednostek');
    assert.ok(z > bez * 0.5,
      'suma planu ' + z + ' km wobec ' + bez + ' km — spadek WIĘKSZY niż reguła; ' +
      'to nie jest „bezpieczniej", tylko inna reguła niż zapisana');
  });

  test('zero akcentow — same biegi spokojne', () => {
    assert.equal(akcenty(uloz({ poziom: 2 }).treningi), 0);
  });
});

describe('POZIOM 3 — „nie moge biegac": pierwszy tydzien BEZ BIEGANIA', () => {
  test('pierwszy tydzien ma ZERO kilometrow', () => {
    const t1 = tydzien(uloz({ poziom: 3 }).treningi, 1);
    assert.ok(t1.length > 0, 'pierwszy tydzień zniknął z planu zamiast być pusty biegowo');
    assert.equal(sumaKm(t1), 0, 'pierwszy tydzień ma ' + sumaKm(t1) + ' km zamiast zera');
  });

  test('⚠️ pierwszy tydzien to DNI ODPOCZYNKU, nie biegi po 0 km', () => {
    /* Różnica widoczna dla człowieka: siedem wpisów „Odpoczynek" to plan,
       a siedem biegów z zerowym dystansem to usterka wyglądająca jak plan. */
    const t1 = tydzien(uloz({ poziom: 3 }).treningi, 1);
    for (const j of t1) {
      assert.equal(j.workout_type, 'Odpoczynek',
        'jednostka „' + j.workout_type + '" w tygodniu bez biegania');
    }
  });

  test('kolejne tygodnie SA — plan sie nie konczy na odpoczynku', () => {
    const r = uloz({ poziom: 3 });
    assert.ok(sumaKm(tydzien(r.treningi, 2)) > 0, 'drugi tydzień też pusty — to już nie powrót');
    assert.equal(akcenty(r.treningi), 0);
  });
});

describe('⚠️ SMIEC NA WEJSCIU NIE MOZE UDAWAC KONTUZJI ANI JEJ GUBIC', () => {
  /* `bol` przychodzi z bazy przez wołającego. Zła wartość ma dać plan JAK
     BEZ KONTUZJI — nigdy losowo obniżony i nigdy wywrócony silnik. */
  for (const zly of [{ poziom: 0 }, { poziom: 9 }, { poziom: null }, { poziom: 'dwa' }, {}]) {
    test('bol=' + JSON.stringify(zly) + ' → plan jak bez kontuzji', () => {
      const bez = uloz(null), z = uloz(zly);
      assert.equal(z.meta.objetosciTygodni[0], bez.meta.objetosciTygodni[0]);
      assert.equal(akcenty(z.treningi), akcenty(bez.treningi));
    });
  }

  test('poziom jako STRING „2" tez dziala — baza potrafi oddac tekst', () => {
    /* `injuries.poziom` bywa czytane przez PostgREST jako liczba, ale wołający
       robi `Number(...)`; gdyby przestał, silnik ma to wytrzymać sam. */
    const a = uloz({ poziom: '2' }), b = uloz({ poziom: 2 });
    assert.equal(a.meta.objetosciTygodni[0], b.meta.objetosciTygodni[0]);
  });
});
