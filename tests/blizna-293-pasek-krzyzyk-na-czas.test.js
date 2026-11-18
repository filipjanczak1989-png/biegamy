/* BLIZNA 293 / 18.11 noc: krzyżyk paska biegu na Dziś chował „na zawsze” w danym wariancie — za mocno (decyzja Filipa). Teraz (tylko js/akcja.mjs):
   zapisani (numer, dzieci, dyplom) — schowany do końca bieżącego dnia w czasie polskim, następnego dnia pasek wraca; „Zapisz się” — na 3 dni.
   W kluczu bm_bieg_pasek_ukryty_<slug>[_<wariant>] leży chwila powrotu (ms). Stara wartość „1” (65a96e43/4e154a14) = schowany do końca dnia, w którym ją
   odczytamy, więc u tych, którzy już kliknęli, pasek wraca jutro. Przeterminowany albo uszkodzony klucz nie chowa paska i znika. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const T = Date.parse('2026-11-20T10:00:00Z'), POLNOC = Date.parse('2026-11-20T23:00:00Z'), DZIEN = 864e5, KLUCZ = 'bm_bieg_pasek_ostatni';
const BIEG = (x) => ({ wystartowala: true, testowa: false, bieg: Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', faza: 'trwa', koniec_at: '2026-12-06T19:00:00+00:00' }, x || {}) });
const JA = (x) => Object.assign({ id: 'u1', rodzaj: 'ja', numer: 7, ukonczony_at: null }, x || {});
const DZ = { id: 'u2', rodzaj: 'dziecko', numer: 12, ukonczony_at: null };
function el(tag) {
  const e = { tag, dzieci: [], attrs: {}, style: { cssText: '' }, hidden: true, href: '', type: '', h: {},
    appendChild(c) { this.dzieci.push(c); return c; }, setAttribute(n, v) { this.attrs[n] = String(v); }, addEventListener(t, f) { this.h[t] = f; } };
  let t = ''; Object.defineProperty(e, 'textContent', { get: () => t + e.dzieci.map((c) => c.textContent).join(''), set: (v) => { t = String(v); e.dzieci = []; } });
  return e;
}
function srodowisko(start) {
  const m = new Map(Object.entries(start || {}));
  globalThis.document = { createElement: el };
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  return { m, pasek: el('div') };
}
const rpc = (moi) => ({ rpc: async () => ({ data: moi }) });
async function kliknij(moi, bieg) {   // krzyżyk o chwili T
  const s = srodowisko(), teraz = Date.now; Date.now = () => T;
  try { await A.pasekBiegu(s.pasek, BIEG(bieg), rpc(moi), T); s.pasek.dzieci[0].dzieci[1].h.click(); } finally { Date.now = teraz; }
  return s;
}
let A;
test.before(async () => {
  const SB = zaladujSb(); for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href); A = globalThis.BM_AKCJA;
});

test('koniec dnia w czasie polskim: zima, lato, tuż po północy, dni zmiany czasu', () => {
  for (const [t, k, opis] of [['2026-11-20T10:00:00Z', '2026-11-20T23:00:00Z', 'zima (CET): 11:00 → północ'], ['2026-11-20T22:59:59Z', '2026-11-20T23:00:00Z', '23:59:59'],
    ['2026-11-20T23:00:00Z', '2026-11-21T23:00:00Z', 'równo północ: już nowy dzień'], ['2026-11-20T23:30:00Z', '2026-11-21T23:00:00Z', '00:30 następnego dnia'],
    ['2026-07-01T10:00:00Z', '2026-07-01T22:00:00Z', 'lato (CEST)'], ['2026-03-29T00:30:00Z', '2026-03-29T22:00:00Z', '29.03: zmiana na czas letni'],
    ['2026-10-25T10:00:00Z', '2026-10-25T23:00:00Z', '25.10: zmiana na czas zimowy'], ['2026-12-06T19:00:00Z', '2026-12-06T23:00:00Z', 'koniec biegu 20:00']]) {
    assert.equal(new Date(A.koniecDniaWaw(Date.parse(t))).toISOString(), new Date(Date.parse(k)).toISOString(), opis);
  }
});

test('zapisani (numer, dzieci, dyplom): schowany do końca dnia, od północy pasek wraca', async () => {
  for (const [moi, wariant] of [[[JA()], 'numer'], [[DZ], 'dzieci'], [[JA({ ukonczony_at: '2026-11-19T08:00:00Z' })], 'dyplom']]) {
    const s = await kliknij(moi), klucz = 'bm_bieg_pasek_ukryty_bieg-mikolajki_' + wariant;
    assert.equal(Number(s.m.get(klucz)), POLNOC, wariant + ': chwila powrotu = północ');
    assert.equal(await A.pasekBiegu(s.pasek, BIEG(), rpc(moi), T + 3600e3), null, wariant + ': za godzinę schowany');
    assert.equal(await A.pasekBiegu(s.pasek, BIEG(), rpc(moi), POLNOC - 1), null, wariant + ': 23:59:59,999 schowany');
    const w = await A.pasekBiegu(s.pasek, BIEG(), rpc(moi), POLNOC);
    assert.equal(w && w.wariant, wariant, wariant + ': od północy wraca'); assert.equal(s.m.has(klucz), false, wariant + ': przeterminowany klucz sprzątnięty');
  }
});

test('„Zapisz się”: schowany na 3 dni, potem wraca', async () => {
  const s = await kliknij([]), klucz = 'bm_bieg_pasek_ukryty_bieg-mikolajki';
  assert.equal(Number(s.m.get(klucz)), T + 3 * DZIEN);
  assert.equal(await A.pasekBiegu(s.pasek, BIEG(), rpc([]), T + DZIEN), null, 'następnego dnia nadal schowany');
  assert.equal(await A.pasekBiegu(s.pasek, BIEG(), rpc([]), T + 3 * DZIEN - 1), null);
  assert.equal((await A.pasekBiegu(s.pasek, BIEG(), rpc([]), T + 3 * DZIEN)).wariant, 'zapis', 'po 3 dniach wraca');
});

test('stare „1” (na zawsze) = schowany do końca dnia odczytu, jutro pasek wraca; uszkodzony klucz nie chowa', async () => {
  for (const [klucz, moi, wariant] of [['bm_bieg_pasek_ukryty_bieg-mikolajki', [], 'zapis'], ['bm_bieg_pasek_ukryty_bieg-mikolajki_numer', [JA()], 'numer']]) {
    const s = srodowisko({ [klucz]: '1' });
    assert.equal(await A.pasekBiegu(s.pasek, BIEG(), rpc(moi), T), null, wariant + ': dziś schowany');
    assert.equal(Number(s.m.get(klucz)), POLNOC, wariant + ': „1” zamienione na północ dnia odczytu (także „Zapisz się”: nie 3 dni)');
    assert.equal(await A.pasekBiegu(s.pasek, BIEG(), rpc(moi), POLNOC - 1), null);
    assert.equal((await A.pasekBiegu(s.pasek, BIEG(), rpc(moi), POLNOC + 9 * 3600e3)).wariant, wariant, wariant + ': jutro rano wraca');
  }
  for (const zly of ['', 'abc', '-5', 'Infinity', String(T - 1)]) {
    const s = srodowisko({ 'bm_bieg_pasek_ukryty_bieg-mikolajki_numer': zly });
    assert.equal((await A.pasekBiegu(s.pasek, BIEG(), rpc([JA()]), T)).wariant, 'numer', 'klucz ' + JSON.stringify(zly) + ': pasek widać');
    assert.equal(s.m.has('bm_bieg_pasek_ukryty_bieg-mikolajki_numer'), false, 'klucz ' + JSON.stringify(zly) + ' sprzątnięty');
  }
});

test('pamięć telefonu respektuje termin krzyżyka; kod bez zapisu „na zawsze”', () => {
  const zap = JSON.stringify({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', href: 'bieg.html', wariant: 'numer', numer: 7, wazny_do: null, t: T - 60e3 });
  const s = srodowisko({ [KLUCZ]: zap, 'bm_bieg_pasek_ukryty_bieg-mikolajki_numer': String(POLNOC) });
  assert.equal(A.pasekZPamieci(s.pasek, T), null, 'schowany dziś: z pamięci nic');
  const s2 = srodowisko({ [KLUCZ]: JSON.stringify(Object.assign(JSON.parse(zap), { t: POLNOC + 60e3 })), 'bm_bieg_pasek_ukryty_bieg-mikolajki_numer': String(POLNOC) });
  assert.equal(A.pasekZPamieci(s2.pasek, POLNOC + 3600e3).wariant, 'numer', 'po północy z pamięci znowu');
  const kod = fs.readFileSync(path.join(KORZEN, 'js/akcja.mjs'), 'utf8').replace(/\r/g, '');
  const blok = kod.slice(kod.indexOf('18.11: PASEK BIEGU NA DZIŚ'), kod.indexOf('g.BM_AKCJA = {'));
  assert.doesNotMatch(blok, /kluczPaskaBiegu\([^)]*\), "1"\)/, 'krzyżyk nie zapisuje już „1” (na zawsze)');
  assert.match(blok, /x\.addEventListener\("click", function \(\) \{ schowajPasek\(s\); potwierdzPasek\(el, null\); \}\);/);
});
