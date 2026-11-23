/* BLIZNA 347 (23.11): przejścia między stronami (View Transitions, theme.css @view-transition) — client_errors dalej dostawał odrzucenia
   „Transition was skipped. Navigation aborted” (Dziś), „…Viewport size changed” (Profil, Android) i Safari „skipTransition() was called” (Kalendarz),
   7 dni: 44 wpisy, choć pageswap/pagereveal łapały `finished` od 15.08. Obiekt przejścia ma TRZY obietnice: ready, finished, updateCallbackDone.
   P1: pageswap łapie wszystkie trzy; pagereveal łapie ready i updateCallbackDone, a finished ma swój .catch() przed .finally() (sprzątanie data-vt-dir,
   view-transitions.test.js). P2: rejestrator zapisuje „Nazwa: komunikat” („AbortError: Transition was skipped”) — bez nazwy nie dało się ustalić, co odrzuciło. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { atrapaPrzegladarki, atrapaElementu } = require('./_srodowisko.js');

const ZRODLO = fs.readFileSync(path.join(__dirname, '..', 'sb.js'), 'utf8');

/** Atrapa obietnicy: liczy .catch() i kolejność. */
function atrapa() {
  const stan = { catchy: 0, kolejnosc: [] };
  const p = { catch() { stan.catchy++; stan.kolejnosc.push('catch'); return p; }, finally(fn) { stan.kolejnosc.push('finally'); if (fn) fn(); return p; } };
  return { p, stan };
}
/** sb.js w atrapie z działającym addEventListener (jak view-transitions.test.js). */
function srodowisko(kierunek) {
  const ctx = atrapaPrzegladarki(), sluchacze = {}, atrybuty = {};
  ctx.addEventListener = (t, f) => { (sluchacze[t] = sluchacze[t] || []).push(f); };
  ctx.__odpal = (t, e) => (sluchacze[t] || []).forEach((f) => f(e));
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.sessionStorage = { _v: kierunek || null, getItem(k) { return k === 'bm_vt_dir' ? this._v : null; }, setItem() {}, removeItem(k) { if (k === 'bm_vt_dir') this._v = null; } };
  ctx.document = Object.assign({}, ctx.document, { addEventListener() {}, body: { appendChild() {} }, getElementById: () => null, readyState: 'complete', querySelectorAll: () => [],
    documentElement: { setAttribute: (k, v) => { atrybuty[k] = v; }, removeAttribute: (k) => { delete atrybuty[k]; } },
    createElement: () => { const e = atrapaElementu(); e.style = {}; return e; } });
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const prawdziwy = ctx.console; ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  vm.runInContext(ZRODLO, ctx, { filename: 'sb.js' });
  ctx.console = prawdziwy;
  return { ctx, atrybuty };
}
const trzy = () => { const r = atrapa(), f = atrapa(), u = atrapa(); return { vt: { ready: r.p, finished: f.p, updateCallbackDone: u.p }, r: r.stan, f: f.stan, u: u.stan }; };

test('P1 pageswap: wszystkie trzy obietnice przejścia oznaczone jako obsłużone (po jednym .catch)', () => {
  const { ctx } = srodowisko(null), t = trzy();
  ctx.__odpal('pageswap', { viewTransition: t.vt });
  assert.deepEqual([t.r.catchy, t.f.catchy, t.u.catchy], [1, 1, 1]);
});

test('P1 pagereveal: ready i updateCallbackDone obsłużone; finished jak dotąd: jeden .catch() przed .finally(), atrybut kierunku sprzątnięty', () => {
  for (const kier of [null, 'fwd', 'back']) {
    const { ctx, atrybuty } = srodowisko(kier), t = trzy();
    ctx.__odpal('pagereveal', { viewTransition: t.vt });
    assert.equal(t.r.catchy, 1, 'ready'); assert.equal(t.u.catchy, 1, 'updateCallbackDone');
    assert.deepEqual(t.f.kolejnosc, ['catch', 'finally'], 'finished: jeden catch, potem finally (bez drugiego odrzucenia)');
    assert.equal(atrybuty['data-vt-dir'], undefined, 'atrybut kierunku zdjęty po końcu przejścia (' + kier + ')');
  }
});

test('P1: starsza przeglądarka (tylko finished), brak przejścia i obietnica-nie-obietnica — bez wyjątku', () => {
  const { ctx } = srodowisko('fwd'), f = atrapa();
  assert.doesNotThrow(() => ctx.__odpal('pagereveal', { viewTransition: { finished: f.p } }));
  const f2 = atrapa();
  assert.doesNotThrow(() => ctx.__odpal('pageswap', { viewTransition: { ready: null, finished: f2.p, updateCallbackDone: 5 } }));
  assert.equal(f2.stan.catchy, 1, 'ready bez obietnicy nie przerywa: finished dalej obsłużone');
  assert.doesNotThrow(() => { ctx.__odpal('pagereveal', {}); ctx.__odpal('pageswap', {}); ctx.__odpal('pageswap', null); });
});

test('P1 na prawdziwych obietnicach: pominięte przejście (wszystkie trzy odrzucone) nie zostawia nieobsłużonego odrzucenia', async () => {
  const nieobsluzone = [], h = (r) => nieobsluzone.push(r && r.message);
  process.on('unhandledRejection', h);
  try {
    for (const [zdarzenie, kier] of [['pageswap', null], ['pagereveal', null], ['pagereveal', 'fwd']]) {
      const { ctx } = srodowisko(kier);
      const odrzuc = (m) => Promise.reject(Object.assign(new Error(m), { name: 'AbortError' }));
      ctx.__odpal(zdarzenie, { viewTransition: { ready: odrzuc('ready ' + zdarzenie), finished: odrzuc('finished ' + zdarzenie), updateCallbackDone: odrzuc('ucd ' + zdarzenie) } });
    }
    await new Promise((ok) => setImmediate(ok)); await new Promise((ok) => setImmediate(ok));
  } finally { process.off('unhandledRejection', h); }
  assert.deepEqual(nieobsluzone, [], 'żadna z trzech obietnic nie zostaje bez odbiorcy');
});

/* ── P2: rejestrator (wycięty blok _initClientErrorLog, jak blizna-299) ── */
function logger() {
  const s = ZRODLO.replace(/\r\n/g, '\n'), od = s.indexOf('(function _initClientErrorLog() {'), koniec = s.indexOf('\n  })();', od);
  assert.ok(od > 0 && koniec > od);
  const kod = s.slice(od, koniec + '\n  })();'.length), handlery = {}, wpisy = [];
  const ctx = { console, Map, Promise, String, RegExp, Date, setTimeout: () => 0, caches: { keys: () => Promise.resolve([]) },
    location: { pathname: '/kalendarz.html', search: '' }, navigator: { userAgent: 'x' },
    sb: { auth: { onAuthStateChange() {}, getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
      from: (t) => ({ insert: (o) => { wpisy.push(o); return Promise.resolve({}); } }) } };
  ctx.window = ctx; ctx.addEventListener = (typ, f) => { (handlery[typ] = handlery[typ] || []).push(f); };
  vm.createContext(ctx); vm.runInContext(kod, ctx); ctx._authUid = 'u1';
  const odpal = (typ, ev) => { const e = Object.assign({ wstrzymane: false, preventDefault() { this.wstrzymane = true; } }, ev); (handlery[typ] || []).forEach((f) => f(e)); return e; };
  return { wpisy, odpal };
}

test('P2: unhandledrejection zapisuje „Nazwa: komunikat”; bez nazwy sam komunikat; nie-błąd jako tekst; szum „opt-in disabled” dalej bez wpisu', () => {
  const L = logger();
  L.odpal('unhandledrejection', { reason: { name: 'AbortError', message: 'Transition was skipped. Navigation aborted' } });
  L.odpal('unhandledrejection', { reason: { name: 'InvalidStateError', message: 'Transition was aborted because of invalid state. Viewport size changed' } });
  L.odpal('unhandledrejection', { reason: { name: 'AbortError', message: 'Skipping view transition because skipTransition() was called.' } });
  L.odpal('unhandledrejection', { reason: { message: 'bez nazwy' } });
  L.odpal('unhandledrejection', { reason: 'tekst odrzucenia' });
  const szum = L.odpal('unhandledrejection', { reason: { name: 'InvalidStateError', message: 'Transition was aborted because of invalid state. ViewTransition opt-in disabled' } });
  assert.deepEqual(L.wpisy.map((w) => w.message), ['AbortError: Transition was skipped. Navigation aborted',
    'InvalidStateError: Transition was aborted because of invalid state. Viewport size changed',
    'AbortError: Skipping view transition because skipTransition() was called.', 'bez nazwy', 'tekst odrzucenia']);
  assert.ok(L.wpisy.every((w) => w.kind === 'unhandledrejection'));
  assert.equal(szum.wstrzymane, true, 'szum Chrome z 19.11 dalej pomijany');
});
