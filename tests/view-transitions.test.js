// ─────────────────────────────────────────────────────────────────────────────
// VIEW TRANSITIONS — czy KAŻDA ścieżka domyka `viewTransition.finished`.
//
// BLIZNA, KTÓRA KOSZTOWAŁA NAJWIĘCEJ. 14.08.2026 poprawka `.catch()` została
// zatwierdzona jako zamknięcie 42 nieobsłużonych odrzuceń w `client_errors`.
// Zmiana była poprawna — i objęła ZERO z dziewięciu wierszy, które przyszły
// po niej. Handler wychodził wcześniej (`if (d !== 'fwd' && d !== 'back') return`)
// i nigdy nie dochodził do naprawionej linii, więc chronił WYŁĄCZNIE nawigacje
// swipe'owe. Zmierzone przez porównanie starego i nowego sb.js w tym samym
// harnessie: stary dawał 2 nieobsłużone odrzucenia, nowy zero, a ścieżka
// swipe'owa w OBU dawała zero — dlatego stara poprawka wyglądała na skuteczną.
// Patrz .ai/LEKCJE.md #9.
//
// !! CO TU JEST NAPRAWDĘ SPRAWDZANE: że handler zostaje PRZYPIĘTY, a nie że
//    „nie ma błędu". Atrapa `finished` liczy wywołania `.catch()` i `.finally()`,
//    więc test mówi wprost, na której ścieżce promise zostaje bez odbiorcy.
//    Test oparty na prawdziwym odrzuceniu wymagałby process.on('unhandledRejection'),
//    co w `node --test` wywraca cały przebieg — i mierzyłby skutek zamiast
//    przyczyny.
//
// !! `@view-transition { navigation: auto }` w theme.css sprawia, że przejście
//    powstaje przy KAŻDEJ nawigacji w obrębie originu — nie tylko przy swipie.
//    Stąd dwa zdarzenia: `pageswap` na starym dokumencie, `pagereveal` na nowym,
//    każde z własnym `finished`, każde odrzucające przy pominiętym przejściu.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { atrapaPrzegladarki, atrapaElementu } = require('./_srodowisko.js');

const ZRODLO = fs.readFileSync(path.join(__dirname, '..', 'sb.js'), 'utf8');

/** Atrapa `finished` — liczy, czy ktokolwiek się podpiął i w jakiej kolejności. */
function atrapaFinished() {
  const stan = { catchy: 0, finalnie: 0, kolejnosc: [] };
  const p = {
    catch(fn) { stan.catchy++; stan.kolejnosc.push('catch'); return p; },
    finally(fn) { stan.finalnie++; stan.kolejnosc.push('finally'); if (fn) fn(); return p; },
  };
  return { p, stan };
}

/** Kontekst z działającym addEventListener i podglądem atrybutów :root. */
function srodowisko(kierunek) {
  const ctx = atrapaPrzegladarki();
  const sluchacze = {};
  const atrybuty = {};
  ctx.addEventListener = (t, f) => { (sluchacze[t] = sluchacze[t] || []).push(f); };
  ctx.__odpal = (t, e) => (sluchacze[t] || []).forEach((f) => f(e));
  ctx.__ilu = (t) => (sluchacze[t] || []).length;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.sessionStorage = {
    _v: kierunek || null,
    getItem(k) { return k === 'bm_vt_dir' ? this._v : null; },
    setItem() {}, removeItem(k) { if (k === 'bm_vt_dir') this._v = null; },
  };
  ctx.document = Object.assign({}, ctx.document, {
    addEventListener() {},
    documentElement: { setAttribute: (k, v) => { atrybuty[k] = v; }, removeAttribute: (k) => { delete atrybuty[k]; } },
    body: { appendChild() {} },
    getElementById: () => null,
    createElement: () => { const e = atrapaElementu(); e.style = {}; return e; },
    readyState: 'complete', querySelectorAll: () => [],
  });
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const prawdziwy = ctx.console;
  ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  vm.runInContext(ZRODLO, ctx, { filename: 'sb.js' });
  ctx.console = prawdziwy;
  return { ctx, atrybuty };
}

describe('KAŻDA ścieżka domyka `finished` — bo każda go dostaje', () => {
  test('pagereveal, nawigacja NIE-swipe — TA ścieżka była dziurawa', () => {
    const { ctx } = srodowisko(null);
    const f = atrapaFinished();
    ctx.__odpal('pagereveal', { viewTransition: { finished: f.p } });
    assert.equal(f.stan.catchy, 1,
      'promise zostaje bez odbiorcy — dokładnie ten błąd zamknęliśmy 14.08 jako naprawiony');
  });

  test('pagereveal, nawigacja swipe — działało od 14.08, ma działać dalej', () => {
    const { ctx } = srodowisko('fwd');
    const f = atrapaFinished();
    ctx.__odpal('pagereveal', { viewTransition: { finished: f.p } });
    assert.equal(f.stan.catchy, 1);
  });

  test('pageswap — STARY dokument, druga ścieżka bez odbiorcy', () => {
    const { ctx } = srodowisko(null);
    const f = atrapaFinished();
    ctx.__odpal('pageswap', { viewTransition: { finished: f.p } });
    assert.equal(f.stan.catchy, 1, 'pageswap ma własny finished i też odrzuca');
  });

  test('.catch() PRZED .finally() — inaczej powstaje DRUGIE odrzucenie', () => {
    // `.finally()` przepuszcza odrzucenie dalej, więc łańcuch zakończony na
    // `.finally()` oddaje nowy, już nieobsłużony promise.
    const { ctx } = srodowisko('back');
    const f = atrapaFinished();
    ctx.__odpal('pagereveal', { viewTransition: { finished: f.p } });
    assert.deepEqual(f.stan.kolejnosc, ['catch', 'finally']);
  });

  test('brak viewTransition — nikt się nie podpina i nic nie leci', () => {
    const { ctx, atrybuty } = srodowisko('fwd');
    ctx.__odpal('pagereveal', {});
    ctx.__odpal('pageswap', {});
    assert.equal(atrybuty['data-vt-dir'], undefined);
  });
});

describe('animacja bez zmian — warunkowany jest ATRYBUT, nie przypięcie', () => {
  test('swipe ustawia kierunek, a sprzątanie go zdejmuje', () => {
    const { ctx, atrybuty } = srodowisko('fwd');
    const f = atrapaFinished();
    let podczas;
    f.p.finally = function (fn) { podczas = atrybuty['data-vt-dir']; if (fn) fn(); return f.p; };
    ctx.__odpal('pagereveal', { viewTransition: { finished: f.p } });
    assert.equal(podczas, 'fwd', 'kierunek musi stać PRZED animacją');
    assert.equal(atrybuty['data-vt-dir'], undefined, 'i zniknąć po niej');
  });

  test('nawigacja nie-swipe NIE dostaje kierunku — cross-fade zostaje', () => {
    // To jest cała różnica wobec „przeniesienia .catch() wyżej": handler
    // przypina się zawsze, ale atrybut wchodzi wyłącznie przy swipie.
    const { ctx, atrybuty } = srodowisko(null);
    ctx.__odpal('pagereveal', { viewTransition: { finished: atrapaFinished().p } });
    assert.equal(atrybuty['data-vt-dir'], undefined);
  });
});

describe('kontrakt na źródle — te dwie rzeczy MUSZĄ zostać', () => {
  test('zero wczesnych wyjść między odczytem kierunku a przypięciem handlera', () => {
    assert.doesNotMatch(ZRODLO, /if \(d !== 'fwd' && d !== 'back'\) return;/,
      'wczesne wyjście wróciło — naprawa objęłaby znów tylko swipe');
  });

  test('oba zdarzenia mają listener', () => {
    const { ctx } = srodowisko(null);
    assert.ok(ctx.__ilu('pagereveal') >= 1, 'brak listenera pagereveal');
    assert.ok(ctx.__ilu('pageswap') >= 1, 'brak listenera pageswap');
  });
});
