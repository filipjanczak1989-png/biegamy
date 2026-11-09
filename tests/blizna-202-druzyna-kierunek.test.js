/* BLIZNA 202 / DRUŻYNA BIEGNIE W TĘ SAMĄ STRONĘ (decyzja Filipa 9.11 po zgłoszeniu „biegacze z naprzeciwka się odwracają”, blizna-197).
   Przeszkód-biegaczy gra nie ma. Drużyna na poziomach 15–19 to sam obraz za graczem, biegnie razem z nim w prawo, a rysunek druzyna.webp patrzy w lewo:
   wyglądała na biegaczy z naprzeciwka. Teraz rysowana w lustrze, w tym samym prostokącie (przesunięcie i skala jak dotąd), tylko na poziomach 15–19.
   Test: prawdziwy silnik w node:vm (jak blizna-197), płótno pamięta znak skali i przesunięcie przy każdym rysunku drużyny. */
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

/* Płótno: znak skali w poziomie i przesunięcie; każdy rysunek drużyny zapisany z lewą krawędzią na ekranie. */
function plotno(slad) {
  let sx = 1, tx = 0; const stos = [], nic = () => {}, gradient = { addColorStop: nic };
  const k = {
    save() { stos.push([sx, tx]); }, restore() { if (stos.length) [sx, tx] = stos.pop(); },
    translate(a) { tx += sx * a; }, scale(a) { if (a < 0) sx = -sx; }, setTransform(a, b, c, d, e) { sx = a < 0 ? -1 : 1; tx = e || 0; },
    drawImage(o, ...r) {
      if (!o || !o.druzyna) return;
      const [dx, , dw] = r.length === 8 ? [r[4], r[5], r[6]] : [r[0], r[1], r[2]];
      slad.push({ lustro: sx < 0, lewa: sx < 0 ? tx - dx - dw : tx + dx, szer: dw });
    },
    measureText: (t) => ({ width: String(t).length * 8 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  ['fillRect', 'strokeRect', 'beginPath', 'closePath', 'ellipse', 'arc', 'rect', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fill', 'stroke', 'clip',
    'fillText', 'strokeText', 'rotate', 'setLineDash'].forEach((n) => { k[n] = nic; });
  return k;
}
function element(slad) {
  return {
    hidden: false, textContent: '', value: '', checked: false, style: { setProperty() {} }, dataset: {}, children: [], width: 100, height: 100,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, prepend() {}, select() {}, click() {},
    classList: { toggle() {}, add() {} }, querySelector() { return element(slad); }, querySelectorAll() { return []; }, getContext() { return plotno(slad); },
  };
}
async function runda(poziom) {
  const slad = [], raf = [], el = {};
  class Obraz {
    constructor() { this.width = this.height = this.naturalWidth = this.naturalHeight = 100; this.complete = true; }
    set src(v) { this.druzyna = /druzyna\.webp/.test(v); this._s = v; Promise.resolve().then(() => this.onload && this.onload()); }
    get src() { return this._s; }
  }
  const c = vm.constants && vm.constants.DONT_CONTEXTIFY ? vm.createContext(vm.constants.DONT_CONTEXTIFY) : vm.createContext({});
  Object.assign(c, {
    URLSearchParams, Intl, console, setTimeout: () => 0, clearTimeout() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    location: { search: '?test=1&pora=dzien&poziom_gry=' + poziom, hostname: 'localhost', href: 'http://localhost/gra-cegielki.html' },
    navigator: {}, performance: { now: () => 0 }, matchMedia: () => ({ matches: false }), addEventListener() {},
    localStorage: { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } },
    requestAnimationFrame: (f) => raf.push(f), cancelAnimationFrame() {}, Image: Obraz,
    document: { getElementById: (id) => el[id] || (el[id] = element(slad)), createElement: () => element(slad), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    fetch: async (u) => { if (/atlas\.json/.test(u)) return { ok: true, json: async () => JSON.parse(ATLAS) }; throw new Error('bez sieci'); },
  });
  c.window = c;
  for (const s of KOD) s.runInContext(c);
  let petla = null;
  const pompuj = async () => { for (const f of raf.splice(0)) { if (f.name === 'petla') petla = f; else f(0); } await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < 200 && !c.__gra; i++) await pompuj();
  c.BM_CEGIELKI_GRA.start('kasia');
  let maly = false;
  for (let i = 0; i < 400; i++) { await pompuj(); const g = c.__gra(); if (g.maly) maly = true; else if (maly && g.t === 0) break; }
  for (let i = 0; i < 5; i++) await pompuj();
  const G = c.__gra();
  assert.equal(G.poziom, poziom); assert.ok(petla, 'pętla gry');
  for (let k = 1; k <= 120; k++) { G.nietykalny = 1; c.__krok(1 / 60); if (k % 10 === 0) { raf.length = 0; petla(0); } }
  return { slad, L: c.BM_CEGIELKI, graczX: c.__gra().graczX };
}

test('drużyna na poziomach 15–19 rysowana w lustrze, twarzą w kierunku biegu, w tym samym miejscu co dotąd; na 14 i 20 jej nie ma', async () => {
  for (const p of [15, 17, 19]) {
    const r = await runda(p);
    assert.ok(r.slad.length > 0, 'poziom ' + p + ': drużyna rysowana');
    assert.ok(r.slad.every((d) => d.lustro), 'poziom ' + p + ': każdy rysunek drużyny w lustrze');
    assert.ok(r.slad.every((d) => d.szer > 0 && d.lewa < 390 && d.lewa + d.szer > -300), 'poziom ' + p + ': w kadrze, za graczem jak dotąd');
  }
  for (const p of [14, 20]) assert.equal((await runda(p)).slad.length, 0, 'poziom ' + p + ': bez drużyny');
});

test('odbicie w tym samym prostokącie (przesunięcie o szerokość), przeszkody i postać bez zmian; flaga w logice', () => {
  const g = czytaj('js/cegielki.js').replace(/\r/g, '');
  assert.match(g, /if \(L\.DRUZYNA\.lustro\) \{ x\.save\(\); x\.translate\(xx \+ w, yy\); x\.scale\(-1, 1\); x\.drawImage\(o, kl \* a\.cw, 0, a\.cw, a\.ch, 0, 0, w, h\); x\.restore\(\); \}/);
  assert.match(g, /var xx = graczX\(\) - w \* \(0\.62 \+ i \* 0\.86\) - 14/, 'miejsce drużyny bez zmian');
  new Function(czytaj('js/cegielki-logika.mjs').replace(/\r/g, ''))();
  const L = globalThis.BM_CEGIELKI;
  assert.equal(L.DRUZYNA.lustro, true); assert.equal(L.DRUZYNA.od, 15); assert.equal(L.DRUZYNA.doo, 19);
  assert.equal(L.druzynaWRundzie(15, true), false, 'mały budowniczy: bez drużyny');
});
