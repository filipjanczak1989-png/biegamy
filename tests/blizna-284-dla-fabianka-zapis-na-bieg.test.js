/* BLIZNA 284 / 18.11: bieg-mikolajki otwarty, a na stronie akcji (dla-fabianka.html) do biegu prowadził tylko mały link „Bieg wirtualny ›” pod plakatem.
   - wyraźny „Zapisz się na bieg ›” (przycisk główny) na samej górze: pod linijką z nazwą akcji, nad sceną (order -11; mur pod sceną spychał niżej pod krawędź ekranu);
   - tylko gdy licznik oddaje obiekt bieg w fazie z otwartym zapisem (zapisy, trwa, wyniki); szkic (brak pola), zakończony, nie-obiekt: bez przycisku;
   - pod nim jedna linia z licznika: nazwa i termin („… · 18.11–6.12”), tylko textContent; ?proba=1 prowadzi na bieg.html?proba=1.
   Strona w vm jak w blizna-241 (prawdziwe sb.js, js/akcja.mjs i blok <script> strony). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb, blokiSkryptow, zamrozTimery } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const kod = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const czekaj = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const BIEG = (x) => Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-08', faza: 'trwa', dystanse_km: [5] }, x || {});
const LICZNIK = (bieg) => ({ wystartowala: true, nazwa: 'Kilometry dla Fabianka', suma_km: 10, cel_km: 100, pct: 10, start: '2026-11-07', koniec: null, zamknieta: false, url_zbiorki: 'https://www.siepomaga.pl/x', stawka_filip_gr: 10, filip_gr: 100, filip_max_gr: 125000, bieg });

function magazyn() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; }
function nowyElement(id) {
  const h = {}, e = { id, hidden: false, innerHTML: '', className: '', href: '', value: '', style: {}, attrs: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener(t, f) { (h[t] = h[t] || []).push(f); }, getAttribute(n) { return this.attrs[n] === undefined ? null : this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = String(v); },
    removeAttribute(n) { delete this.attrs[n]; }, appendChild(c) { return c; }, remove() {}, querySelectorAll: () => [], querySelector: () => null, insertAdjacentElement() {}, scrollIntoView() {} };
  let tekst = ''; Object.defineProperty(e, 'textContent', { get: () => tekst, set: (v) => { tekst = String(v); }, enumerable: true });
  return e;
}
function domStrony(ctx) {
  const html = czytaj('dla-fabianka.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), rej = new Map(), zdarzenia = {};
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const id = /\bid="([^"]+)"/.exec(m[2]); if (!id) continue;
    const e = nowyElement(id[1]); e.hidden = /\shidden(?=[\s>]|$)/.test(m[2]); e.href = (/\bhref="([^"]*)"/.exec(m[2]) || [])[1] || ''; rej.set(id[1], e);
  }
  const daj = (id) => { if (!rej.has(id)) rej.set(id, nowyElement(id)); return rej.get(id); };
  Object.assign(ctx.document, { getElementById: daj, querySelector: () => null, querySelectorAll: () => [], createElement: (t) => Object.assign(nowyElement(''), { tag: t }), head: nowyElement('head'), body: nowyElement('body'),
    readyState: 'interactive', visibilityState: 'visible', addEventListener: (t, f) => { (zdarzenia[t] = zdarzenia[t] || []).push(f); } });
  return { daj, zdarzenia };
}
async function strona(licznik, search) {
  const ctx = zamrozTimery(zaladujSb());
  Object.assign(ctx.location, { pathname: '/dla-fabianka.html', search: search || '' }); ctx.localStorage = magazyn();
  if (search) ctx.BM_ULICA = { licznikProby: async () => JSON.parse(JSON.stringify(licznik)) };   // ?proba=1: licznik próby z ulicy (konto testowe)
  const dom = domStrony(ctx);
  ctx.fetch = async (url) => (/akcja-licznik/.test(url) ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(licznik)) } : { ok: false, status: 404, json: async () => null });
  vm.runInContext(kod('js/akcja.mjs'), ctx, { filename: 'js/akcja.mjs' });
  blokiSkryptow('dla-fabianka.html').forEach((k, i) => vm.runInContext(k, ctx, { filename: 'dla-fabianka.html#' + i }));
  (dom.zdarzenia.DOMContentLoaded || []).forEach((f) => f()); await czekaj();
  return dom;
}

test('HTML: „Zapisz się na bieg ›” jako przycisk główny, ukryty w HTML, przed trzema przyciskami pod sceną; opis tylko textContent', () => {
  const h = czytaj('dla-fabianka.html');
  assert.match(h, /<div class="bieg-gora" id="bieg-gora" hidden>\n\s*<a class="przycisk przycisk--glowny" id="bieg-zapisz" href="bieg\.html">Zapisz się na bieg ›<\/a>\n\s*<p id="bieg-opis"><\/p>\n\s*<\/div>\n\s*<div class="przyciski przyciski--gora">/);
  assert.match(h, /\.bieg-gora \{ order: -11;/, 'na górze: ta sama kolejność co linijka z nazwą akcji, za nią w DOM, przed sceną (-10)');
  assert.match(h, /\.linijka \{ order: -11;/); assert.match(h, /#scena-gora \.us-okno \{ order: -10;/);
  assert.ok(h.indexOf('id="bieg-gora"') > h.indexOf('id="pasek"') && h.indexOf('id="bieg-gora"') < h.indexOf('id="dolacz"'));
  assert.doesNotMatch(h, /innerHTML[^;\n]*\b(b|d\.bieg)\b/, 'z danych biegu nic przez innerHTML');
});

test('otwarty bieg (trwa): przycisk widoczny, link na bieg.html, linia „nazwa · 18.11–6.12”', async () => {
  const z = await strona(LICZNIK(BIEG()));
  assert.equal(z.daj('pelna').hidden, false);
  assert.equal(z.daj('bieg-gora').hidden, false);
  assert.equal(z.daj('bieg-zapisz').href, 'bieg.html');
  assert.equal(z.daj('bieg-opis').textContent, 'Wirtualny Bieg Mikołajkowy dla Fabianka · 18.11–6.12');
  for (const faza of ['zapisy', 'wyniki']) assert.equal((await strona(LICZNIK(BIEG({ faza })))).daj('bieg-gora').hidden, false, faza);
});

test('bez otwartego biegu: brak przycisku (szkic = brak pola, zakończony, nie-obiekt, brak fazy)', async () => {
  for (const [opis, bieg] of [['szkic', null], ['zakończony', BIEG({ faza: 'zakonczony' })], ['nie-obiekt', '<b>x</b>'], ['bez fazy', BIEG({ faza: undefined })]]) {
    assert.equal((await strona(LICZNIK(bieg))).daj('bieg-gora').hidden, true, opis);
  }
});

test('treść z licznika tylko jako tekst; ?proba=1 prowadzi na bieg próbny', async () => {
  const z = await strona(LICZNIK(BIEG({ nazwa: '<img src=x onerror=alert(1)>', dzien_od: '2026-12-06', dzien_do: '2026-12-06' })), '?proba=1');
  assert.equal(z.daj('bieg-opis').textContent, '<img src=x onerror=alert(1)> · 6.12', 'tekst dosłownie, jeden dzień bez zakresu');
  assert.equal(z.daj('bieg-opis').innerHTML, '');
  assert.equal(z.daj('bieg-zapisz').href, 'bieg.html?proba=1');
});
