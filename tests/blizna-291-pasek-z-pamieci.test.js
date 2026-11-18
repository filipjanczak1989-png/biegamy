/* BLIZNA 291 / 18.11 wieczór: pasek biegu na Dziś od razu z pamięci telefonu (decyzja Filipa po pomiarze: skok układu, CLS 0,509 → 0,572).
   Ostatni stan potwierdzony przez bazę (slug, nazwa, link, koniec biegu, czas) leży w localStorage pod bm_bieg_pasek_ostatni. Przy wczytaniu js/akcja.mjs
   na Dziś pasek rysuje się z pamięci, zanim przyjdzie licznik; pasekBiegu potwierdza go albo chowa i czyści pamięć (zapisany, inna faza, błąd, krzyżyk).
   Pamięć ważna 24 h i nie po końcu biegu; link tylko bieg.html albo bieg.html?proba=1; bez potwierdzenia w 30 s pasek znika (brak danych = brak paska).
   zawodnik.html bez zmian (jedyny element #bieg-pasek z blizny 290). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const KLUCZ = 'bm_bieg_pasek_ostatni', T0 = Date.parse('2026-11-20T10:00:00Z');
function el(tag) {
  const e = { tag, dzieci: [], attrs: {}, style: { cssText: '' }, hidden: true, href: '', type: '', h: {},
    appendChild(c) { this.dzieci.push(c); return c; }, setAttribute(n, v) { this.attrs[n] = String(v); }, addEventListener(t, f) { this.h[t] = f; } };
  let t = ''; Object.defineProperty(e, 'textContent', { get: () => t + e.dzieci.map((c) => c.textContent).join(''), set: (v) => { t = String(v); e.dzieci = []; } });
  return e;
}
function pamiec(start) { const m = new Map(Object.entries(start || {})); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; }
const ZAPIS = (x) => JSON.stringify(Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', href: 'bieg.html', koniec: '2026-12-06T19:00:00+00:00', t: T0 - 3600e3 }, x || {}));
const BIEG = (x) => ({ wystartowala: true, testowa: false, bieg: Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', faza: 'trwa', koniec_at: '2026-12-06T19:00:00+00:00' }, x || {}) });
const zegary = [];
let A, paskaPrzyWczytaniu;
test.before(async () => {
  const SB = zaladujSb(); for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  /* wczytanie modułu NA DZIŚ: element jest, pamięć świeża → pasek narysowany przy wczytaniu, zanim ktokolwiek zawoła licznik */
  paskaPrzyWczytaniu = el('div');
  globalThis.document = { createElement: el, getElementById: (id) => (id === 'bieg-pasek' ? paskaPrzyWczytaniu : null), addEventListener() {} };
  globalThis.localStorage = pamiec({ [KLUCZ]: ZAPIS({ t: Date.now() - 60e3, koniec: new Date(Date.now() + 86400e3).toISOString() }) });
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href); A = globalThis.BM_AKCJA;
});
function srodowisko(start) {
  globalThis.localStorage = pamiec(start);
  zegary.length = 0;
  globalThis.setTimeout = (f, ms) => { zegary.push({ f, ms, zywy: true }); return zegary.length; };
  globalThis.clearTimeout = (id) => { if (zegary[id - 1]) zegary[id - 1].zywy = false; };
  return el('div');
}

test('przy wczytaniu modułu na Dziś: pasek z pamięci od razu, bez zapytań', () => {
  assert.equal(paskaPrzyWczytaniu.hidden, false);
  assert.equal(paskaPrzyWczytaniu.textContent, '🎅 Wirtualny Bieg Mikołajkowy dla Fabianka ·Zapisz się ›×');
  assert.equal(paskaPrzyWczytaniu.dzieci[0].dzieci[0].href, 'bieg.html');
});

test('pamięć: tylko świeża (24 h), przed końcem biegu, nie schowana, z linkiem bieg.html; zła = brak paska', () => {
  const ok = srodowisko({ [KLUCZ]: ZAPIS() });
  assert.deepEqual(A.pasekZPamieci(ok, T0), { slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', href: 'bieg.html', koniec: '2026-12-06T19:00:00+00:00' });
  assert.equal(ok.hidden, false);
  for (const [opis, start] of [
    ['brak pamięci', {}], ['starsza niż 24 h', { [KLUCZ]: ZAPIS({ t: T0 - 24 * 3600e3 }) }], ['z przyszłości', { [KLUCZ]: ZAPIS({ t: T0 + 60e3 }) }],
    ['po końcu biegu', { [KLUCZ]: ZAPIS({ koniec: '2026-11-20T10:00:00Z' }) }], ['schowana krzyżykiem', { [KLUCZ]: ZAPIS(), 'bm_bieg_pasek_ukryty_bieg-mikolajki': '1' }],
    ['obcy link', { [KLUCZ]: ZAPIS({ href: 'javascript:alert(1)' }) }], ['link na inną stronę', { [KLUCZ]: ZAPIS({ href: 'https://example.org/bieg.html' }) }],
    ['zły slug', { [KLUCZ]: ZAPIS({ slug: '<b>' }) }], ['pusta nazwa', { [KLUCZ]: ZAPIS({ nazwa: '' }) }], ['nazwa nie-tekst', { [KLUCZ]: ZAPIS({ nazwa: { x: 1 } }) }],
    ['uszkodzony JSON', { [KLUCZ]: '{' }], ['null', { [KLUCZ]: 'null' }]]) {
    const e = srodowisko(start);
    assert.equal(A.pasekZPamieci(e, T0), null, opis); assert.equal(e.hidden, true, opis); assert.equal(zegary.length, 0, opis + ': bez zegara');
  }
  globalThis.localStorage = { getItem() { throw new Error('zablokowany'); }, setItem() { throw new Error('zablokowany'); }, removeItem() { throw new Error('zablokowany'); } };
  assert.equal(A.pasekZPamieci(el('div'), T0), null, 'zablokowana pamięć: nic, bez wyjątku');
  assert.equal(A.pasekZPamieci(null, T0), null);
});

test('bez potwierdzenia w 30 s pasek z pamięci znika; potwierdzenie zatrzymuje zegar', async () => {
  const e = srodowisko({ [KLUCZ]: ZAPIS() });
  A.pasekZPamieci(e, T0);
  assert.equal(zegary.length, 1); assert.equal(zegary[0].ms, 30000);
  zegary[0].f(); assert.equal(e.hidden, true, 'brak danych = brak paska');
  const e2 = srodowisko({ [KLUCZ]: ZAPIS() });
  A.pasekZPamieci(e2, T0);
  await A.pasekBiegu(e2, BIEG(), { rpc: async () => ({ data: [] }) });
  assert.equal(zegary[0].zywy, false, 'zegar zatrzymany'); assert.equal(e2.hidden, false);
});

test('baza zapisuje i czyści pamięć: potwierdzony → zapis; zapisany, inna faza, błąd, krzyżyk → czysto', async () => {
  const e = srodowisko();
  await A.pasekBiegu(e, BIEG(), { rpc: async () => ({ data: [] }) });
  const z = JSON.parse(globalThis.localStorage.getItem(KLUCZ));
  assert.deepEqual([z.slug, z.nazwa, z.href, z.koniec], ['bieg-mikolajki', 'Wirtualny Bieg Mikołajkowy dla Fabianka', 'bieg.html', '2026-12-06T19:00:00+00:00']); assert.ok(Math.abs(z.t - Date.now()) < 5000);
  for (const [opis, d, rpc] of [['zapisany „ja”', BIEG(), async () => ({ data: [{ rodzaj: 'ja', numer: 3 }] })], ['faza zakończony', BIEG({ faza: 'zakonczony' }), async () => ({ data: [] })],
    ['błąd zapytania', BIEG(), async () => ({ error: { message: 'x' } })], ['wyjątek sieci', BIEG(), async () => { throw new Error('sieć'); }], ['brak licznika', null, async () => ({ data: [] })]]) {
    const p = srodowisko({ [KLUCZ]: ZAPIS() });
    A.pasekZPamieci(p, T0); assert.equal(p.hidden, false, opis + ': najpierw z pamięci');
    await A.pasekBiegu(p, d, { rpc });
    assert.equal(p.hidden, true, opis + ': po bazie schowany'); assert.equal(globalThis.localStorage.getItem(KLUCZ), null, opis + ': pamięć wyczyszczona');
  }
  const k = srodowisko({ [KLUCZ]: ZAPIS() });
  A.pasekZPamieci(k, T0);
  k.dzieci[0].dzieci[1].h.click();
  assert.equal(k.hidden, true); assert.equal(globalThis.localStorage.getItem(KLUCZ), null, 'krzyżyk czyści pamięć'); assert.equal(zegary[0].zywy, false);
});

test('kod: pamięć tylko w js/akcja.mjs, zawodnik.html bez zmian w tej części; tekst przez textContent', () => {
  const kod = fs.readFileSync(path.join(KORZEN, 'js/akcja.mjs'), 'utf8').replace(/\r/g, '');
  assert.match(kod, /try \{ if \(g\.document && g\.document\.getElementById\) \{ var elPaska = g\.document\.getElementById\("bieg-pasek"\); if \(elPaska\) pasekZPamieci\(elPaska\); \} \} catch \(e\) \{\}/);
  const blok = kod.slice(kod.indexOf('PASEK OD RAZU Z PAMIĘCI'), kod.indexOf('g.BM_AKCJA = {'));
  assert.ok(blok.length > 1500); assert.doesNotMatch(blok, /innerHTML|\.rpc\("(?!akcja_bieg_moi)|fetch\(/);
  const z = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
  assert.equal((z.match(/bieg-pasek/g) || []).length, 2, 'zawodnik.html: element i wywołanie (jak w bliźnie 290)'); assert.doesNotMatch(z, /bm_bieg_pasek_ostatni|pasekZPamieci/);
});
