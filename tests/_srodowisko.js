// ─────────────────────────────────────────────────────────────────────────────
// ŚRODOWISKO TESTOWE — atrapa przeglądarki + ładowarka kodu produkcyjnego.
//
// Repo nie ma builda i to jest zaleta, więc testy nie dokładają toolchainu:
// wyłącznie `node:test` i `node:vm`, zero zależności, zero package.json.
//
// !! DLACZEGO `vm` A NIE WYCIĄGANIE FUNKCJI REGEXPEM. Kod produkcyjny siedzi
//    w <script> wewnątrz HTML (zawodnik.html ma 9 bloków, 605 kB). Wyciąganie
//    pojedynczych funkcji wzorcem tekstowym działa raz i psuje się przy
//    pierwszej zmianie wcięcia — w sesji 15.08.2026 wysypało się dwukrotnie.
//    `vm` z atrapą ładuje CAŁY plik tak, jak robi to przeglądarka, więc test
//    widzi dokładnie ten kod, który pojedzie na produkcję.
//    Zmierzone: sb.js + wszystkie 9 bloków zawodnik.html ładują się bez błędu.
//
// !! CONSOLE JEST WYCISZANE NA CZAS ŁADOWANIA. Kod strony ma skutki uboczne
//    przy wczytaniu (hero loguje kilka linii). Bez wyciszenia wyniki testów
//    toną w szumie.
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');

/** Atrapa elementu DOM — na tyle bogata, żeby kod strony się wykonał. */
function atrapaElementu() {
  const el = {
    style: new Proxy({}, { get: () => '', set: () => true }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, children: [], value: '', textContent: '', innerHTML: '',
    appendChild() {}, removeChild() {}, remove() {}, insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute: () => {},
    focus() {}, click() {}, scrollIntoView() {},
    querySelector: () => atrapaElementu(), querySelectorAll: () => [], closest: () => null,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
  };
  return el;
}

/** Kontekst udający przeglądarkę. Jeden na test — bez współdzielenia stanu. */
function atrapaPrzegladarki() {
  const ctx = {
    console, setTimeout, setInterval, clearTimeout, clearInterval, queueMicrotask,
    URL, URLSearchParams, TextEncoder, TextDecoder, Promise, Date, Math, JSON, Intl,
    fetch: () => Promise.reject(new Error('test: brak sieci')),
    document: {
      addEventListener() {}, removeEventListener() {},
      querySelector: () => atrapaElementu(), querySelectorAll: () => [],
      createElement: () => atrapaElementu(), getElementById: () => atrapaElementu(),
      head: atrapaElementu(), body: atrapaElementu(), documentElement: atrapaElementu(),
      readyState: 'complete', visibilityState: 'visible', cookie: '',
    },
    navigator: {
      userAgent: 'node-test',
      serviceWorker: { addEventListener() {}, register: () => Promise.resolve({}) },
      clipboard: { writeText: () => Promise.resolve() }, share: () => Promise.resolve(),
    },
    location: {
      href: 'https://biegamy.run/zawodnik.html', search: '', pathname: '/zawodnik.html',
      hostname: 'biegamy.run', assign() {}, replace() {}, reload() {},
    },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    supabase: {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: null } }),
          getUser: async () => ({ data: { user: null } }),
          onAuthStateChange() {},
        },
        from: () => ({}),
        channel: () => ({ on() { return this; }, subscribe() {} }),
        removeChannel() {},
      }),
    },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    CustomEvent: class {}, Image: class {}, Audio: class { play() { return Promise.resolve(); } },
    Notification: { permission: 'default' }, PushManager: class {},
    alert() {}, confirm: () => false, prompt: () => null, scrollTo() {},
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.top = ctx;
  return ctx;
}

/** Wykonuje kod w kontekście z wyciszonym console (kod strony loguje przy starcie). */
function cicho(ctx, kod, nazwa) {
  const prawdziwy = ctx.console;
  const nic = () => {};
  ctx.console = { log: nic, warn: nic, error: nic, info: nic, debug: nic, table: nic };
  try {
    vm.runInContext(kod, ctx, { filename: nazwa });
  } finally {
    ctx.console = prawdziwy;
  }
}

/** Wycina bloki <script> BEZ src i BEZ ld+json — czyli realny kod strony. */
function blokiSkryptow(plikHtml) {
  const html = fs.readFileSync(path.join(KORZEN, plikHtml), 'utf8');
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1]) && !/ld\+json/.test(m[1]))
    .map((m) => m[2]);
}

/** Kontekst z załadowanym sb.js. Wystarcza do wszystkiego, co jest w SSOT. */
function zaladujSb() {
  const ctx = atrapaPrzegladarki();
  vm.createContext(ctx);
  cicho(ctx, fs.readFileSync(path.join(KORZEN, 'sb.js'), 'utf8'), 'sb.js');
  return ctx;
}

/** Kontekst z sb.js + wszystkimi blokami <script> danej strony. */
function zaladujStrone(plikHtml) {
  const ctx = zaladujSb();
  blokiSkryptow(plikHtml).forEach((kod, i) => cicho(ctx, kod, `${plikHtml}#${i}`));
  return ctx;
}

module.exports = { zaladujSb, zaladujStrone, blokiSkryptow, atrapaElementu, atrapaPrzegladarki };
