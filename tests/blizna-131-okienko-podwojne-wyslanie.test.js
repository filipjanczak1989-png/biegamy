/* BLIZNA 131 (3.11.2026, raport: „Jak zacząć biegać” wysłane dwa razy w 1,75 s → dwa zapytania do sieci, drugie przed zapisem pamięci
   podręcznej): póki trwa odpowiedź, kolejne wysłanie Okienka jest ignorowane, a przycisk „Zapytaj” wyłączony; po odpowiedzi (także błędnej)
   blokada puszcza. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');

function swiat() {
  const ctx = zaladujSb();
  ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ctx.navigator = Object.assign({}, ctx.navigator, { onLine: true });
  const el = {}; const daj = (id) => (el[id] = el[id] || { id, innerHTML: '', value: '', disabled: false, attrs: {}, dataset: {}, style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() {}, querySelector: () => null, querySelectorAll: () => [] });
  const przycisk = daj('przycisk');
  const form = daj('okienko-form'); form.querySelector = (s) => (s === 'button[type="submit"]' ? przycisk : null);
  ctx.document.getElementById = (id) => (id === 'okienko-form' ? form : daj(id));
  const zwolnij = [];
  ctx.__fetch = 0;
  ctx.fetch = () => { ctx.__fetch++; return new Promise((res) => zwolnij.push(() => res({ status: 200, headers: { get: () => null }, json: async () => ({ zdania: ['Odpowiedź.'], karty: [], wersja: 'v2' }) }))); };
  ctx.window.sb = Object.assign({}, ctx.window.sb, { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) }, rpc: () => Promise.resolve({ data: 'v2' }) });
  vm.runInContext(fs.readFileSync(path.join(KORZEN, 'js/okienko.js'), 'utf8'), ctx, { filename: 'js/okienko.js' });
  return { ctx, O: ctx.OKIENKO, el, przycisk, zwolnij };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('drugie wysłanie w trakcie odpowiedzi → zignorowane (jeden fetch), przycisk wyłączony; po odpowiedzi znowu działa', async () => {
  const { ctx, O, el, przycisk, zwolnij } = swiat();
  const p1 = O.wyslij('Jak zacząć biegać');
  await tick(); await tick();
  assert.equal(przycisk.disabled, true, 'przycisk „Zapytaj” wyłączony w trakcie');
  const p2 = O.wyslij('Jak zacząć biegać');   // podwójne kliknięcie / Enter
  await tick(); await tick();
  assert.equal(ctx.__fetch, 1, 'jedno zapytanie mimo dwóch wysłań');
  await p2;
  zwolnij.shift()();
  await p1;
  assert.equal(przycisk.disabled, false, 'po odpowiedzi przycisk wraca');
  assert.match(el['okienko-wynik'].innerHTML, /Odpowiedź\./);
  const p3 = O.wyslij('plan na jutro'); await tick(); await tick();
  assert.equal(ctx.__fetch, 2, 'kolejne pytanie po odpowiedzi przechodzi');
  zwolnij.shift()(); await p3;
});

test('błąd sieci też zwalnia blokadę (finally)', async () => {
  const { ctx, O, przycisk } = swiat();
  ctx.fetch = () => { ctx.__fetch++; return Promise.reject(new Error('sieć')); };
  await O.wyslij('test');
  assert.equal(przycisk.disabled, false);
  await O.wyslij('test 2');
  assert.equal(ctx.__fetch, 2);
});

test('kod: flaga wTrakcie sprawdzana przed wysłaniem, zwalniana w finally', () => {
  const src = fs.readFileSync(path.join(KORZEN, 'js/okienko.js'), 'utf8');
  assert.match(src, /if \(wTrakcie\) return;/); assert.match(src, /wTrakcie = true; przyciskZapytaj\(true\);/); assert.match(src, /\} finally \{ wTrakcie = false; przyciskZapytaj\(false\); \}/);
});
