/* BLIZNA 238 / NIEŚMIERTELNOŚĆ NA STAŁE (zgłoszenie Filipa 13.11): „na którymś poziomie gra się zawiesza i włącza się nieśmiertelność na stałe”.
   Pętla gry liczy krok czasu z różnicy znaczników dwóch klatek i przycinała go tylko z góry (0,05 s). Klatka ze znacznikiem wcześniejszym niż poprzednia
   dawała ujemny krok i wtedy wszystko szło wstecz o tę różnicę: czas rundy rósł, każdy trwający zegar ochrony (nietykalność, przemiana, kask) rósł,
   a świat cofał się o tysiące pikseli, więc przed graczem robiła się pusta droga bez przeszkód i cegieł. Przy cofnięciu o 60 s nietykalność z 1 s robiła się
   61 s, a runda trwała minutę dłużej. Zegar ochrony z wartością spoza liczb (NaN) zostawał taki na zawsze, a z nim brak kolizji.
   Teraz krok jest przycięty z obu stron, a zegar, który nie jest dodatnią liczbą, wraca do zera. Zasady liczenia cegieł i rankingu bez zmian.
   Test: prawdziwy silnik, każda postać, poziomy 1, 5, 10 i 20; klatka cofnięta o 60 s w trakcie nietykalności, potem runda kończy się w swoim czasie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const KOD = [new vm.Script(czytaj('js/cegielki-logika.mjs'), { filename: 'cegielki-logika.mjs' }), new vm.Script(czytaj('js/cegielki.js'), { filename: 'cegielki.js' })];
const ATLAS = czytaj('assets/gra/atlas.json');
const KLATKA_MS = 1000 / 60, COFNIECIE_MS = 60000;

function losowanie(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function plotno() {
  const nic = () => {}, gradient = { addColorStop: nic }, k = { measureText: (t) => ({ width: String(t).length * 8 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient, getImageData: () => ({ data: new Uint8ClampedArray(4) }) };
  ['save', 'restore', 'scale', 'setTransform', 'drawImage', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'ellipse', 'arc', 'rect', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fill', 'stroke', 'clip',
    'fillText', 'strokeText', 'translate', 'rotate', 'setLineDash'].forEach((n) => { k[n] = nic; });
  return k;
}
function element() {
  return {
    hidden: false, textContent: '', value: '', checked: false, style: { setProperty() {} }, dataset: {}, children: [], width: 100, height: 100,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, prepend() {}, select() {}, click() {},
    classList: { toggle() {}, add() {} }, querySelector() { return element(); }, querySelectorAll() { return []; }, getContext() { return plotno(); },
  };
}

/* Prawdziwy silnik w pionie telefonu, ?test=1. Klatki idą przez pętlę gry (requestAnimationFrame) ze znacznikami czasu, jak w przeglądarce. */
async function silnik(postac, poziom) {
  const raf = [], el = {};
  class Obraz {
    constructor() { this.width = this.height = this.naturalWidth = this.naturalHeight = 100; this.complete = true; }
    set src(v) { this._s = v; Promise.resolve().then(() => this.onload && this.onload()); }
    get src() { return this._s; }
  }
  const los = { f: losowanie(poziom * 31 + postac.length) };
  const c = vm.constants && vm.constants.DONT_CONTEXTIFY ? vm.createContext(vm.constants.DONT_CONTEXTIFY) : vm.createContext({});
  Object.assign(c, {
    URLSearchParams, Intl, console, setTimeout: () => 0, clearTimeout() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    location: { search: '?test=1&pora=dzien&poziom_gry=' + poziom, hostname: 'localhost', href: 'http://localhost/gra-cegielki.html' },
    navigator: {}, performance: { now: () => 0 }, matchMedia: () => ({ matches: false }), addEventListener() {},
    localStorage: { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } },
    requestAnimationFrame: (f) => raf.push(f), cancelAnimationFrame() {}, Image: Obraz, __los: los,
    document: { getElementById: (id) => el[id] || (el[id] = element()), createElement: () => element(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    fetch: async (u) => { if (/atlas\.json/.test(u)) return { ok: true, json: async () => JSON.parse(ATLAS) }; throw new Error('bez sieci'); },
  });
  c.window = c;
  vm.runInContext('Math.random = function () { return __los.f(); };', c);
  for (const s of KOD) s.runInContext(c);
  let petla = null, ts = 1000;
  const pompuj = async () => { for (const f of raf.splice(0)) { if (f.name === 'petla') petla = f; else f(ts); } await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < 200 && !c.__gra; i++) await pompuj();
  c.BM_CEGIELKI_GRA.start(postac);
  let maly = false;
  for (let i = 0; i < 400; i++) { await pompuj(); const g = c.__gra(); if (g.maly) maly = true; else if (maly && g.t === 0) break; }
  const G = c.__gra();
  assert.ok(petla, 'pętla gry'); assert.equal(G.maly, false); assert.equal(G.postac, postac); assert.equal(G.poziom, poziom);
  /* Jedna klatka przeglądarki: pętla dostaje znacznik czasu. Gracz nie skacze i nie zbiera: liczy się tylko czas. */
  const klatka = (znacznik) => { ts = znacznik; raf.length = 0; petla(ts); };
  const klatki = (n) => { for (let i = 0; i < n; i++) klatka(ts + KLATKA_MS); };
  return { G: () => c.__gra(), klatka, klatki, ts: () => ts };
}

const POSTACIE = ['kasia', 'filip', 'rowerzysta', 'koparka'], POZIOMY = [1, 5, 10, 20];

test('klatka cofnięta w czasie nie wydłuża rundy ani nietykalności i nie cofa świata (każda postać, poziomy 1, 5, 10, 20)', async () => {
  for (const postac of POSTACIE) for (const poziom of POZIOMY) {
    const m = postac + ', poziom ' + poziom, S = await silnik(postac, poziom);
    S.klatki(600);   // 10 s rundy
    const g = S.G(); g.nietykalny = 1; g.przemiana = 0; g.reakcja = 0;   // trwa ochrona po kasku albo po upadku
    const przed = { czas: g.czas, niet: g.nietykalny, s: g.s, t: g.t };
    S.klatka(S.ts() - COFNIECIE_MS);
    assert.ok(g.czas <= przed.czas, m + ': czas rundy urósł z ' + przed.czas.toFixed(2) + ' do ' + g.czas.toFixed(2) + ' s');
    assert.ok(g.nietykalny <= przed.niet, m + ': nietykalność urosła z ' + przed.niet + ' do ' + g.nietykalny.toFixed(2) + ' s');
    assert.ok(g.s >= przed.s, m + ': świat cofnął się o ' + (przed.s - g.s).toFixed(0) + ' px');
    assert.ok(g.t >= przed.t, m + ': czas gry cofnął się');
    let zeszla = false;
    for (let i = 0; i < 70 && !zeszla; i++) { S.klatki(1); zeszla = g.nietykalny === 0; }   // 1 s ochrony to 60 klatek
    assert.ok(zeszla, m + ': nietykalność nie skończyła się w 1,2 s, zostało ' + g.nietykalny);
    const limit = Math.ceil((g.czas + 30) * 60);
    for (let i = 0; i < limit && !g.st.koniec; i++) S.klatki(1);
    assert.ok(g.st.koniec, m + ': runda nie skończyła się, czas ' + g.czas.toFixed(1) + ' s');
  }
});

test('zegar ochrony bez liczby (NaN) kończy się w następnej klatce, a nie trwa do końca rundy', async () => {
  const S = await silnik('kasia', 5);
  S.klatki(300);
  const g = S.G();
  g.nietykalny = NaN; g.przemiana = NaN;
  S.klatki(1);
  assert.equal(g.nietykalny, 0, 'nietykalny = ' + g.nietykalny);
  assert.equal(g.przemiana, 0, 'przemiana = ' + g.przemiana);
});

test('pętla gry przycina krok czasu z obu stron, a zegary bez liczby zeruje', () => {
  const s = czytaj('js/cegielki.js').replace(/\r/g, '');
  assert.match(s, /var dt = Math\.min\(0\.05, Math\.max\(0, \(t - poprz\) \/ 1000 \|\| 0\)\); poprz = t;/);
  assert.match(s, /g\[kz\] = g\[kz\] > 0 \? Math\.max\(0, g\[kz\] - dt\) : 0;/);
});
