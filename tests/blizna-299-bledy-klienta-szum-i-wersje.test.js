/* BLIZNA 299 / 19.11: client_errors z 24 h (bieg.html, /bieg, dla-fabianka.html) — 60 wierszy, dwie przyczyny (odczyt bez kont, decyzja Filipa: poprawki 1a, 2, 3).
   1a. 55 wierszy to szum Chrome: wejście ze strony z `@view-transition{navigation:auto}` (theme.css) na stronę bez niego daje w nowej stronie
       „InvalidStateError: Transition was aborted because of invalid state. ViewTransition opt-in disabled” (pagereveal.viewTransition = null, strona nie ma
       czego złapać; odtworzone w Chrome 157) oraz „Script error.” bez źródła w tej samej sekundzie (12 z 12). Logger w sb.js pomija dokładnie ten wariant
       i taki „Script error.” w oknie ±2 s; reszta jak dotąd.
   2.  5 wierszy: „B.zdanieKoniecWyniku is not a function” / „B.zdanieWieleRazy…” w minutach po pushu: nowy bieg.html z sieci, stary js/bieg.mjs z pamięci.
       bieg.html ładuje js/bieg.mjs i js/akcja.mjs z ?v= = 8 znaków sha256 pliku (bez \r); test pilnuje, że skrót zgadza się z plikiem.
   3.  app_version: tylko pamięć wersji (^biegamy-RRRR-), nie biegamy-obrazy-v1 (26 z 60 wierszy miało tę nazwę zamiast wersji). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const skrot = (p) => crypto.createHash('sha256').update(czytaj(p)).digest('hex').slice(0, 8);

test('2: bieg.html ładuje js/bieg.mjs i js/akcja.mjs z ?v= równym skrótowi pliku (zmiana modułu bez nowego ?v= = czerwony test)', () => {
  const h = czytaj('bieg.html');
  for (const p of ['js/bieg.mjs', 'js/akcja.mjs']) {
    const m = new RegExp('<script defer src="' + p.replace(/\./g, '\\.') + '\\?v=([0-9a-f]{8})"></script>').exec(h);
    assert.ok(m, p + ': brak ?v=');
    assert.equal(m[1], skrot(p), p + ': ?v= nie zgadza się z plikiem. Po zmianie modułu wpisz w bieg.html ?v=' + skrot(p));
  }
  assert.equal((h.match(/src="js\/bieg\.mjs/g) || []).length, 1, 'jeden znacznik modułu');
  assert.match(czytaj('sw.js'), /return \/\\\.\(html\|css\|m\?js\|png\|jpg\|jpeg\|svg\|ico\|woff2\?\|ttf\|json\)\$\/i\.test\(url\.pathname\)/, 'sw.js rozpoznaje moduł po ścieżce (parametr ?v= nie zmienia strategii), a pamięć trzyma pełny adres');
});

/* Logger z sb.js w atrapie: wycięty blok _initClientErrorLog, własne window/sb/caches/setTimeout/Date.now; wpisy = insert do client_errors. */
function logger() {
  const s = czytaj('sb.js'), od = s.indexOf('(function _initClientErrorLog() {'), koniec = s.indexOf('\n  })();', od);
  assert.ok(od > 0 && koniec > od, 'blok loggera w sb.js');
  const kod = s.slice(od, koniec + '\n  })();'.length);
  const handlery = {}, wpisy = [], timery = []; let T = 1000000;
  const ctx = {
    console, Map, Promise, String, RegExp,
    Date: { now: () => T },
    setTimeout: (f, ms) => { timery.push({ f, kiedy: T + ms }); return timery.length; },
    caches: { keys: () => Promise.resolve(['biegamy-obrazy-v1', 'biegamy-2026-11-19-ff52ed7-static', 'biegamy-2026-11-19-ff52ed7-runtime']) },
    location: { pathname: '/bieg.html', search: '' }, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/157' },
    sb: { auth: { onAuthStateChange() {}, getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
          from: (t) => ({ insert: (o) => { wpisy.push(Object.assign({ tabela: t }, o)); return Promise.resolve({}); } }) },
  };
  ctx.window = ctx; ctx.addEventListener = (typ, f) => { (handlery[typ] = handlery[typ] || []).push(f); };
  vm.createContext(ctx); vm.runInContext(kod, ctx, { filename: 'sb.js#_initClientErrorLog' });
  ctx._authUid = 'u1';
  const odpal = (typ, ev) => { const e = Object.assign({ wstrzymane: false, preventDefault() { this.wstrzymane = true; } }, ev); (handlery[typ] || []).forEach((f) => f(e)); return e; };
  const czekaj = (ms) => { T += ms; for (const t of timery.splice(0)) { if (t.kiedy <= T) t.f(); else timery.push(t); } };
  return { ctx, wpisy, odpal, czekaj };
}
const VT = { name: 'InvalidStateError', message: 'Transition was aborted because of invalid state. ViewTransition opt-in disabled' };

test('1a: odrzucenie przejścia „opt-in disabled” bez wpisu i bez czerwieni w konsoli; inne odrzucenia przejść i zwykłe odrzucenia jak dotąd', () => {
  const L = logger();
  const e = L.odpal('unhandledrejection', { reason: VT });
  assert.equal(L.wpisy.length, 0); assert.equal(e.wstrzymane, true, 'preventDefault');
  L.odpal('unhandledrejection', { reason: { name: 'InvalidStateError', message: 'Transition was skipped' } });
  L.odpal('unhandledrejection', { reason: { name: 'AbortError', message: 'Transition was aborted because of invalid state' } });
  L.odpal('unhandledrejection', { reason: { name: 'TypeError', message: 'x is not a function', stack: 'TypeError: x…' } });
  assert.deepEqual(L.wpisy.map((w) => [w.tabela, w.kind, w.message]), [['client_errors', 'unhandledrejection', 'Transition was skipped'],
    ['client_errors', 'unhandledrejection', 'Transition was aborted because of invalid state'], ['client_errors', 'unhandledrejection', 'x is not a function']]);
});

test('1a: „Script error.” bez źródła obok odrzucenia przejścia (przed albo po, do 2 s) pomijany; samotny i z plikiem zapisywany', () => {
  let L = logger();
  L.odpal('unhandledrejection', { reason: VT }); L.czekaj(300);
  L.odpal('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 }); L.czekaj(3000);
  assert.equal(L.wpisy.length, 0, 'po odrzuceniu');
  L = logger();
  L.odpal('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 }); L.czekaj(500);
  L.odpal('unhandledrejection', { reason: VT }); L.czekaj(3000);
  assert.equal(L.wpisy.length, 0, 'przed odrzuceniem (zapis czeka 2 s)');
  L = logger();
  L.odpal('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 });
  assert.equal(L.wpisy.length, 0, 'zapis dopiero po 2 s'); L.czekaj(2000);
  assert.deepEqual(L.wpisy.map((w) => [w.kind, w.message]), [['error', 'Script error.']], 'samotny „Script error.” zapisany');
  L = logger();
  L.odpal('unhandledrejection', { reason: VT }); L.czekaj(200);
  L.odpal('error', { message: 'Uncaught TypeError: B.zdanieKoniecWyniku is not a function', filename: 'https://biegamy.run/bieg.html', lineno: 355, colno: 41, error: { stack: 'TypeError…' } });
  assert.equal(L.wpisy.length, 1, 'błąd z plikiem od razu, także obok szumu'); assert.equal(L.wpisy[0].lineno, 355);
  L.czekaj(5000); L.odpal('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 }); L.czekaj(2000);
  assert.equal(L.wpisy.length, 2, '„Script error.” 5 s po szumie zapisany');
});

test('3: app_version z pamięci wersji (biegamy-RRRR-…), nie z biegamy-obrazy-v1', async () => {
  const L = logger();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(L.ctx._appVersion, 'biegamy-2026-11-19-ff52ed7');
  L.odpal('error', { message: 'Uncaught Error: x', filename: 'https://biegamy.run/sb.js', lineno: 1, colno: 1 });
  assert.equal(L.wpisy[0].app_version, 'biegamy-2026-11-19-ff52ed7');
  assert.match(czytaj('sb.js'), /var v = ks\.find\(function\(k\)\{ return \/\^biegamy-\\d\{4\}-\/\.test\(k\); \}\);/);
});
