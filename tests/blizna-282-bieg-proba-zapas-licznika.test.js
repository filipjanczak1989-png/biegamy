/* BLIZNA 282 / 18.11: bieg.html?proba=1 na koncie testowym pokazywał „Nie udało się wczytać biegu” i „Lista chwilowo niedostępna”.
   licznikProby (js/ulica.mjs → js/akcja-cytaty.mjs) czeka bez limitu na EF akcja-proba-wizerunek; gdy ta nie odpowiedziała w 8 s, strona brała licznik publiczny
   'proba' (EF akcja-licznik: zawsze 404) i zostawała bez biegu. Zapas: licznik próby z RPC akcja_licznik, z limitem 8 s, tylko dla konta testowego
   (slugDla z js/akcja-cytaty.mjs), bo baza przyjmuje zapis na próbę od każdego zalogowanego. Funkcje wycięte z bieg.html i uruchomione na atrapach. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(KORZEN, 'bieg.html'), 'utf8').replace(/\r/g, '');
const OD = HTML.indexOf('  function cytatyProby()'), DO = HTML.indexOf('  function pobierzSesje()');
const czekaj = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
let B, C;

test.before(async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  B = globalThis.BM_BIEG_REAL; C = globalThis.BM_AKCJA_CYTATY;
});

const LICZNIK = { wystartowala: true, testowa: true, bieg: { slug: 'proba-bieg', nazwa: 'Bieg próbny', faza: 'trwa', dystanse_km: [5] } };
function strona(o) {
  const slad = { rpc: [], zgloszenia: [], publiczny: [], skrypty: 0 };
  const glowa = { appendChild: () => { slad.skrypty++; } };
  const istniejacy = o.skryptJest ? { addEventListener: (z, f) => { if (z === 'load') slad.zaladuj = f; } } : null;
  const document = { head: glowa, querySelector: (q) => (q === 'script[src="js/akcja-cytaty.mjs"]' ? istniejacy : null),
    createElement: () => ({ addEventListener: (z, f) => { if (z === 'load') slad.zaladuj = f; } }) };
  const window = { BM_AKCJA_CYTATY: o.bezCytatow ? undefined : C, sb: {
    rpc: (n, a) => {
      slad.rpc.push(a === undefined ? [n] : [n, a]);
      if (n === 'auth_my_athlete_id') return o.kontoWisi ? new Promise(() => {}) : Promise.resolve({ data: o.konto });
      return Promise.resolve(o.rpcBlad ? { error: { message: 'x' } } : { data: LICZNIK });
    },
    from: () => { throw new Error('strona nie czyta tabel wprost'); } } };
  const A = { pobierzPubliczny: (s) => { slad.publiczny.push(s); return Promise.resolve(null); } };
  const f = new Function('PROBA', 'SLUG_AKCJI', 'window', 'document', 'B', 'A', 'licznikStrony', 'pobierzSesje', 'zglosBlad',
    HTML.slice(OD, DO) + '\n  return { pobierzLicznik: pobierzLicznik, licznikProbyZapas: licznikProbyZapas, cytatyProby: cytatyProby };');
  const api = f(o.proba !== false, o.proba !== false ? 'proba' : 'dla-fabianka', window, document, B, A,
    () => Promise.resolve(o.dp || null), () => Promise.resolve({ user: { id: 'uid' } }), (n, e) => slad.zgloszenia.push([n, e && e.code]));
  return { api, slad, window };
}
const TESTOWE = '9c2df65c-6a46-410e-ad5f-474e5d973ec9';

test('fragment bieg.html: zapas licznika próby jest między licznikStrony a pobierzSesje', () => {
  assert.ok(OD > 0 && DO > OD, 'funkcje cytatyProby … pobierzLicznik przed pobierzSesje');
  assert.equal(C.slugDla(TESTOWE), 'proba', 'konto z testu jest na liście kont testowych js/akcja-cytaty.mjs');
});

test('konto testowe, licznikProby bez wyniku: licznik z RPC akcja_licznik(proba), zgłoszenie do client_errors', async () => {
  const { api, slad } = strona({ konto: TESTOWE });
  const d = await api.pobierzLicznik();
  assert.equal(d && d.bieg && d.bieg.nazwa, 'Bieg próbny');
  assert.deepEqual(slad.rpc, [['auth_my_athlete_id'], ['akcja_licznik', { p_slug: 'proba' }]], 'konto i licznik tylko przez RPC');
  assert.deepEqual(slad.zgloszenia, [['licznik próby', 'zapas']]);
  assert.deepEqual(slad.publiczny, [], 'bez licznika publicznego proba (404)');
});

test('konto spoza listy testowej: bez próby, jak przed poprawką (licznik publiczny, bez zgłoszenia)', async () => {
  const { api, slad } = strona({ konto: '00000000-0000-4000-8000-0000000000bb' });
  assert.equal(await api.pobierzLicznik(), null);
  assert.deepEqual(slad.publiczny, ['proba']);
  assert.deepEqual(slad.zgloszenia, []);
});

test('licznikProby z wynikiem: ten licznik, zapas niewykorzystany', async () => {
  const dp = { wystartowala: true, bieg: { slug: 'proba-bieg' }, url_zbiorki: 'https://example.org' };
  const { api, slad } = strona({ konto: TESTOWE, dp });
  assert.equal(await api.pobierzLicznik(), dp);
  assert.deepEqual(slad.zgloszenia, []);
});

test('RPC licznika pada: licznik publiczny (null), bez zgłoszenia zapasu', async () => {
  const { api, slad } = strona({ konto: TESTOWE, rpcBlad: true });
  assert.equal(await api.pobierzLicznik(), null);
  assert.deepEqual(slad.publiczny, ['proba']);
  assert.deepEqual(slad.zgloszenia, []);
});

test('prawdziwy bieg (bez ?proba=1): bez RPC próby, licznik publiczny dla-fabianka', async () => {
  const { api, slad } = strona({ konto: TESTOWE, proba: false });
  assert.equal(api.licznikProbyZapas(), null);
  await api.pobierzLicznik();
  assert.deepEqual(slad.rpc, []);
  assert.deepEqual(slad.publiczny, ['dla-fabianka']);
});

test('zapas ma limit 8 s: zawieszone zapytanie o konto nie trzyma strony', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { api, slad } = strona({ konto: TESTOWE, kontoWisi: true });
  let wynik = 'czeka';
  api.pobierzLicznik().then((d) => { wynik = d; });
  await czekaj();
  assert.equal(wynik, 'czeka');
  t.mock.timers.tick(8000);
  await czekaj();
  assert.equal(wynik, null);
  assert.deepEqual(slad.publiczny, ['proba']);
});

test('js/akcja-cytaty.mjs: istniejący skrypt (wczytywany przez ulicę) nie jest dokładany drugi raz', async () => {
  const s1 = strona({ konto: TESTOWE, bezCytatow: true, skryptJest: true });
  const p1 = s1.api.cytatyProby();
  await czekaj();
  assert.equal(s1.slad.skrypty, 0, 'bez drugiego <script>');
  s1.window.BM_AKCJA_CYTATY = C; s1.slad.zaladuj();
  assert.equal(await p1, C);
  const s2 = strona({ konto: TESTOWE, bezCytatow: true });
  const p2 = s2.api.cytatyProby();
  await czekaj();
  assert.equal(s2.slad.skrypty, 1, 'bez skryptu: jeden nowy <script>');
  s2.window.BM_AKCJA_CYTATY = C; s2.slad.zaladuj();
  assert.equal(await p2, C);
});
