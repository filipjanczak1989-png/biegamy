/* BLIZNA 239 / NIEBO KOŃCZY SIĘ NA 78 % SZEROKOŚCI (zrzut Filipa 13.11 23:21, Samsung, PWA, 720 px): niebo i nocne przyciemnienie kończyły się na ~560 px,
   po prawej czarne niebo, jaśniejsze wzgórza i drzewo, a droga, trawa i ziemia szły przez całą szerokość. Gra ustawiała skalę płótna (skala × dpr) tylko w rozmiar(),
   wołanym wyłącznie na „resize”. Android po powrocie z tła potrafi odtworzyć kontekst 2D ze stanem od zera (przekształcenie 1:1): świat w pionie ma 560 jednostek
   szerokości, więc prostokąt nieba kończył się na 560 z 720 px, a kafle drogi i wzgórz wychodziły poza niego. Do tego zmiana wymiaru bez dostarczonego „resize”
   (podział ekranu, pasek systemowy, powrót z tła) zostawiała płótno w starym rozmiarze.
   Teraz każda klatka ustawia przekształcenie od nowa, a wymiar okna jest sprawdzany w każdej klatce (dwa odczyty) i przy powrocie karty, pageshow, obrocie i visualViewport.
   Test: prawdziwy silnik, płótno zapisujące przekształcenia. */
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

/* Płótno główne zapisuje bieżące przekształcenie i każdy fillRect z przekształceniem w chwili rysowania. */
function plotnoZapisujace(slad) {
  const nic = () => {}, gradient = { addColorStop: nic };
  const k = {
    t: [1, 0, 0, 1, 0, 0], stos: [],
    setTransform(a, b, c, d, e, f) { this.t = [a, b, c, d, e, f]; }, resetTransform() { this.t = [1, 0, 0, 1, 0, 0]; },
    save() { this.stos.push(this.t.slice()); }, restore() { if (this.stos.length) this.t = this.stos.pop(); },
    translate(x, y) { this.t = [this.t[0], 0, 0, this.t[3], this.t[4] + x * this.t[0], this.t[5] + y * this.t[3]]; }, scale(a, b) { this.t = [this.t[0] * a, 0, 0, this.t[3] * b, this.t[4], this.t[5]]; },
    fillRect(x, y, w, h) { slad.fillRect.push({ x, y, w, h, t: this.t.slice(), styl: this.fillStyle }); },
    measureText: (t) => ({ width: String(t).length * 8 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  ['drawImage', 'strokeRect', 'beginPath', 'closePath', 'ellipse', 'arc', 'rect', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fill', 'stroke', 'clip', 'fillText', 'strokeText', 'rotate', 'setLineDash'].forEach((n) => { k[n] = nic; });
  return k;
}
function element(ctx) {
  return {
    hidden: false, textContent: '', value: '', checked: false, style: { setProperty() {} }, dataset: {}, children: [], width: 100, height: 100,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, prepend() {}, select() {}, click() {},
    classList: { toggle() {}, add() {} }, querySelector() { return element(); }, querySelectorAll() { return []; }, getContext() { return ctx || plotnoZapisujace({ fillRect: [] }); },
  };
}

async function silnik() {
  const raf = [], el = {}, slad = { fillRect: [] }, ctx = plotnoZapisujace(slad);
  class Obraz { constructor() { this.width = this.height = this.naturalWidth = this.naturalHeight = 100; this.complete = true; } set src(v) { this._s = v; Promise.resolve().then(() => this.onload && this.onload()); } get src() { return this._s; } }
  const c = vm.constants && vm.constants.DONT_CONTEXTIFY ? vm.createContext(vm.constants.DONT_CONTEXTIFY) : vm.createContext({});
  Object.assign(c, {
    URLSearchParams, Intl, console, setTimeout: () => 0, clearTimeout() {}, innerWidth: 360, innerHeight: 800, devicePixelRatio: 2,
    location: { search: '?test=1&pora=noc&poziom_gry=1', hostname: 'localhost', href: 'http://localhost/gra-cegielki.html' },
    navigator: {}, performance: { now: () => 0 }, matchMedia: () => ({ matches: false }), addEventListener() {},
    localStorage: { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } },
    requestAnimationFrame: (f) => raf.push(f), cancelAnimationFrame() {}, Image: Obraz,
    document: { getElementById: (id) => el[id] || (el[id] = element(id === 'c' ? ctx : null)), createElement: () => element(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    fetch: async (u) => { if (/atlas\.json/.test(u)) return { ok: true, json: async () => JSON.parse(ATLAS) }; throw new Error('bez sieci'); },
  });
  c.window = c;
  for (const s of KOD) s.runInContext(c);
  let petla = null, ts = 1000;
  const pompuj = async () => { for (const f of raf.splice(0)) { if (f.name === 'petla') petla = f; else f(ts); } await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < 200 && !c.__gra; i++) await pompuj();
  c.BM_CEGIELKI_GRA.start('kasia');
  let maly = false;
  for (let i = 0; i < 400; i++) { await pompuj(); const g = c.__gra(); if (g.maly) maly = true; else if (maly && g.t === 0) break; }
  assert.ok(petla, 'pętla gry');
  const klatka = () => { ts += 1000 / 60; raf.length = 0; slad.fillRect.length = 0; petla(ts); };
  return { c, ctx, slad, plotno: el.c, klatka };
}
/* Niebo: pierwszy fillRect klatki zaczyna się w (0, 0) i ma szerokość świata W. Jego prawa krawędź na ekranie (px płótna) = t[0] × W + t[4]. */
function prawaKrawedzNieba(slad) { const r = slad.fillRect.find((f) => f.x === 0 && f.y === 0); assert.ok(r, 'nie ma prostokąta nieba'); return r.t[0] * r.w + r.t[4]; }

test('kontekst 2D od zera (powrót z tła na Androidzie): w następnej klatce niebo i przyciemnienie nocy znów do prawej krawędzi', async () => {
  const S = await silnik();
  S.klatka();
  const szer = S.plotno.width;
  assert.equal(szer, 720, 'płótno 360 px × dpr 2');
  assert.ok(Math.abs(prawaKrawedzNieba(S.slad) - szer) < 1, 'przed: niebo do ' + prawaKrawedzNieba(S.slad));
  S.ctx.setTransform(1, 0, 0, 1, 0, 0);   // tak wygląda odtworzony kontekst: przekształcenie 1:1
  S.klatka();
  const prawa = prawaKrawedzNieba(S.slad);
  assert.ok(Math.abs(prawa - szer) < 1, 'po odtworzeniu kontekstu niebo kończy się na ' + prawa.toFixed(0) + ' z ' + szer + ' px (zgłoszenie: 560 z 720)');
  const tint = S.slad.fillRect.filter((f) => f.x === 0 && f.y === 0 && /rgba\(10,16,56/.test(String(f.styl)));
  assert.ok(tint.length > 0, 'nocne przyciemnienie rysowane');
  for (const f of tint) assert.ok(Math.abs(f.t[0] * f.w + f.t[4] - szer) < 1, 'przyciemnienie nocy do ' + (f.t[0] * f.w + f.t[4]).toFixed(0));
});

test('zmiana szerokości okna bez zdarzenia resize: w następnej klatce płótno i niebo w nowym rozmiarze', async () => {
  const S = await silnik();
  S.klatka();
  assert.equal(S.plotno.width, 720);
  S.c.innerWidth = 412; S.c.innerHeight = 860;   // zdarzenie „resize” nie przychodzi (podział ekranu, powrót z tła)
  S.klatka();
  assert.equal(S.plotno.width, 824, 'płótno ' + S.plotno.width + ' px zamiast 412 × 2');
  assert.equal(S.plotno.style.width, '412px');
  assert.ok(Math.abs(prawaKrawedzNieba(S.slad) - 824) < 1, 'niebo do ' + prawaKrawedzNieba(S.slad).toFixed(0) + ' z 824 px');
});

test('wymiar sprawdzany w każdej klatce i przy powrocie karty, obrocie, pageshow, visualViewport; kontekst odtworzony = rozmiar od nowa', () => {
  const s = czytaj('js/cegielki.js').replace(/\r/g, '');
  assert.match(s, /function rysuj\(\) \{\n[^\n]*\n[^\n]*\n\s+x\.setTransform\(skala \* dpr, 0, 0, skala \* dpr, 0, 0\);/);
  assert.match(s, /sprawdzRozmiar\(\);[^\n]*\n\s+czasGlobalny \+= dt;/);
  for (const z of ['addEventListener("orientationchange", poZmianieRozmiaru)', 'addEventListener("pageshow", sprawdzRozmiar)', 'visualViewport.addEventListener("resize", sprawdzRozmiar)', 'c.addEventListener("contextrestored"', 'if (!document.hidden) sprawdzRozmiar();']) assert.ok(s.includes(z), z);
});
