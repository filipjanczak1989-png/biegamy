/* BLIZNA 197 / NA WYŻSZYCH POZIOMACH BYŁO ŁATWIEJ (zgłoszenie Filipa 9.11): „gracze widzą mniej przeszkód na dalszych poziomach”, „biegacze z naprzeciwka się odwracają”.
   Zmierzone symulacją prawdziwego silnika (60 s, krok 1/60 s, ziarno losowania, bot bez upadków), średnio z 40 rund: poziom 4 = 42,6 przeszkody na minutę,
   poziom 5 = 34,8, a dopiero poziom 13 wracał ponad poziom 4. Od poziomu 5 trasa idzie falami (sekwencja 8–12 s, luz 3–5 s bez przeszkód) i trzy rzeczy
   naraz zjadały przeszkody: odstęp w sekwencji 1,15 s, luz liczony od miejsca na następną przeszkodę (o cały odstęp dłuższy niż 3–5 s) i pierwszy luz
   doklejony do 900 px rozbiegu (pierwsza przeszkoda po ok. 6 s zamiast 2,7 s). Teraz luz liczy się od ostatniej przeszkody, a na starcie od startu rundy,
   odstęp na poziomie 5 to 0,95 s (poziom 20 bez zmian, 0,9 s).
   Biegaczy-przeszkód gra nie ma: przeszkody to pachołek, barierka, kałuża, worki i kamień. Stoją w świecie, więc na ekranie zawsze jadą w stronę gracza
   (w lewo) z prędkością drogi i nigdy nie są rysowane w lustrze. Test pilnuje gęstości i kierunku na każdym poziomie 1–20. */
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
const RODZAJE = ['pacholek', 'barierka', 'kaluza', 'worki', 'kamien'];
const ZIARNA = [1, 2, 3, 4, 5, 6, 7, 8];
const KLATKA = 1 / 60, KLATEK = 3600, RYSUJ_CO = 10, ROZBIEG = 900;

function losowanie(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Płótno: pamięta tylko znak skali w poziomie i liczy przeszkody narysowane w lustrze. */
function plotno(slad) {
  let sx = 1; const stos = [], nic = () => {}, gradient = { addColorStop: nic };
  const k = {
    save() { stos.push(sx); }, restore() { if (stos.length) sx = stos.pop(); },
    scale(a) { if (a < 0) sx = -sx; }, setTransform(a) { sx = a < 0 ? -1 : 1; },
    drawImage(o) { if (o && o.przeszkoda) { slad.rysowane++; if (sx < 0) slad.wLustrze++; } },
    measureText: (t) => ({ width: String(t).length * 8 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  ['fillRect', 'strokeRect', 'beginPath', 'closePath', 'ellipse', 'arc', 'rect', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fill', 'stroke', 'clip',
    'fillText', 'strokeText', 'translate', 'rotate', 'setLineDash'].forEach((n) => { k[n] = nic; });
  return k;
}
function element(slad) {
  return {
    hidden: false, textContent: '', value: '', checked: false, style: { setProperty() {} }, dataset: {}, children: [], width: 100, height: 100,
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, prepend() {}, select() {}, click() {},
    classList: { toggle() {}, add() {} }, querySelector() { return element(slad); }, querySelectorAll() { return []; }, getContext() { return plotno(slad); },
  };
}

/* Jedna runda w prawdziwym silniku, telefon w pionie. Krok gry przez __krok (?test=1), co 10. klatkę rysunek przez pętlę gry bez upływu czasu. */
async function runda(poziom, ziarno) {
  const slad = { rysowane: 0, wLustrze: 0 }, raf = [], el = {};
  class Obraz {
    constructor() { this.width = this.height = this.naturalWidth = this.naturalHeight = 100; this.complete = true; }
    set src(v) { const m = /(\w+)\.webp/.exec(v); this.przeszkoda = !!m && RODZAJE.includes(m[1]); this._s = v; Promise.resolve().then(() => this.onload && this.onload()); }
    get src() { return this._s; }
  }
  const los = { f: losowanie(ziarno) };
  /* Zwykły obiekt globalny bez przechwytywania (Node 22+): każde Math.* w silniku idzie przez globalny, a przechwytywany był 10 razy wolniejszy. */
  const c = vm.constants && vm.constants.DONT_CONTEXTIFY ? vm.createContext(vm.constants.DONT_CONTEXTIFY) : vm.createContext({});
  Object.assign(c, {
    URLSearchParams, Intl, console, setTimeout: () => 0, clearTimeout() {}, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    location: { search: '?test=1&pora=dzien&poziom_gry=' + poziom, hostname: 'localhost', href: 'http://localhost/gra-cegielki.html' },
    navigator: {}, performance: { now: () => 0 }, matchMedia: () => ({ matches: false }), addEventListener() {},
    localStorage: { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } },
    requestAnimationFrame: (f) => raf.push(f), cancelAnimationFrame() {}, Image: Obraz, __los: los,
    document: { getElementById: (id) => el[id] || (el[id] = element(slad)), createElement: () => element(slad), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    fetch: async (u) => { if (/atlas\.json/.test(u)) return { ok: true, json: async () => JSON.parse(ATLAS) }; throw new Error('bez sieci'); },
  });
  c.window = c;
  vm.runInContext('Math.random = function () { return __los.f(); };', c);
  for (const s of KOD) s.runInContext(c);
  let petla = null;
  const pompuj = async () => { for (const f of raf.splice(0)) { if (f.name === 'petla') petla = f; else f(0); } await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < 200 && !c.__gra; i++) await pompuj();
  c.BM_CEGIELKI_GRA.start('kasia');
  let maly = false;
  for (let i = 0; i < 400; i++) { await pompuj(); const g = c.__gra(); if (g.maly) maly = true; else if (maly && g.t === 0) break; }
  await pompuj(); await pompuj();
  const G = c.__gra();
  assert.equal(G.poziom, poziom); assert.equal(G.maly, false); assert.equal(G.t, 0); assert.ok(petla, 'pętla gry');
  los.f = losowanie(ziarno * 7919 + poziom);
  const widziane = new WeakMap(), wszystkie = [], ruchy = { klatek: 0, odGracza: 0 };
  for (let k = 1; k <= KLATEK; k++) {
    G.nietykalny = 1; G.sprint = 0;   // bot bez upadków i bez sprintu po bucie: liczy się sama trasa
    for (const p of G.przeszkody) widziane.set(p, p.ukryta ? null : p.x - G.s);
    c.__krok(KLATKA);
    for (const p of G.przeszkody) {
      if (!widziane.has(p)) { widziane.set(p, null); wszystkie.push(p); continue; }
      const przed = widziane.get(p);
      if (przed === null) continue;
      ruchy.klatek++; if (p.x - G.s - przed >= 0) ruchy.odGracza++;   // odległość od gracza na ekranie ma maleć w każdej klatce
    }
    if (k % RYSUJ_CO === 0) { raf.length = 0; petla(0); }
  }
  assert.ok(Math.abs(G.t - 60) < 1e-6, 'runda 60 s, jest ' + G.t);
  return {
    naMinute: wszystkie.filter((p) => p.x <= G.s).length, rodzaje: [...new Set(wszystkie.map((p) => p.typ))], ruchy, slad,
    pierwsza: Math.min(...wszystkie.map((p) => p.x)), poKolei: wszystkie.every((p, i) => i === 0 || p.x > wszystkie[i - 1].x),
  };
}

let wyniki = null;
async function pomiar() {
  if (wyniki) return wyniki;
  const w = [];
  for (let n = 1; n <= 20; n++) {
    const r = [];
    for (const z of ZIARNA) r.push(await runda(n, z));
    w.push({ poziom: n, naMinute: r.reduce((a, x) => a + x.naMinute, 0) / r.length, rundy: r });
  }
  return (wyniki = w);
}
const srednia = (w, od, doo) => w.slice(od - 1, doo).reduce((a, x) => a + x.naMinute, 0) / (doo - od + 1);

/* Jedna runda to ±1–3 przeszkody szumu losowania (sąsiednie poziomy różnią się o mniej), więc poziom do poziomu z zapasem SZUM, co 4 poziomy już ściśle.
   Stary kod: poziom 5 o 7,8 na minutę rzadszy niż 4, poziomy 5–8 rzadsze niż 1–4. Że każdy poziom jest co najmniej tak trudny jak poprzedni w oczekiwaniu,
   pilnują gałki poziomu bez losowania (test niżej). */
const SZUM = 3;
test('przeszkód na minutę nie ubywa z poziomem (60 s na każdym poziomie 1–20)', async () => {
  const w = await pomiar(), opis = w.map((x) => x.poziom + ': ' + x.naMinute.toFixed(1)).join(', ');
  for (let i = 1; i < w.length; i++) for (let j = 0; j < i; j++) assert.ok(w[i].naMinute >= w[j].naMinute - SZUM, 'poziom ' + w[i].poziom + ' rzadszy niż ' + w[j].poziom + ' (' + opis + ')');
  for (const od of [5, 9, 13, 17]) assert.ok(srednia(w, od, od + 3) > srednia(w, od - 4, od - 1), 'poziomy ' + od + '–' + (od + 3) + ' rzadsze niż ' + (od - 4) + '–' + (od - 1) + ' (' + opis + ')');
  assert.ok(w[19].naMinute > w[0].naMinute * 1.2, 'poziom 20 wyraźnie gęstszy niż 1 (' + opis + ')');
});

test('gałki poziomu bez losowania: z poziomem tylko trudniej (tempo, odstępy, pary, sekwencje, złote)', () => {
  new Function(czytaj('js/cegielki-logika.mjs').replace(/\r/g, ''))();
  const L = globalThis.BM_CEGIELKI, v = 450;
  for (let n = 2; n <= 20; n++) {
    const a = L.planPoziomu(n - 1), b = L.planPoziomu(n), m = 'poziom ' + n;
    assert.ok(L.tempoPoziomu(n) >= L.tempoPoziomu(n - 1), m + ': tempo');
    assert.ok(b.odstep <= a.odstep && b.para >= a.para, m + ': odstęp i pary');
    assert.ok(b.zlota <= a.zlota && b.zlotaNaZiemi <= a.zlotaNaZiemi && b.kaski <= a.kaski, m + ': złote i kaski');
    assert.ok(!L.sekwencjeWRundzie(n - 1, false, 'kasia') || L.sekwencjeWRundzie(n, false, 'kasia'), m + ': sekwencje raz włączone zostają');
    if (L.sekwencjeWRundzie(n - 1, false, 'kasia')) {
      assert.ok(L.dlugoscSekwencji(n, 0.5) >= L.dlugoscSekwencji(n - 1, 0.5), m + ': sekwencja nie krótsza');
      assert.ok(L.odstepSekwencji(n, v, 'kasia', 0.5) <= L.odstepSekwencji(n - 1, v, 'kasia', 0.5), m + ': odstęp w sekwencji nie dłuższy');
    }
  }
  /* Fala z luzem nie może być rzadsza niż zwykła trasa poziomu 4: luz najwyżej 5 s, sekwencja co najmniej 8 s, odstęp w niej na poziomie 5 krótszy niż 1 s. */
  assert.ok(L.odstepSekwencji(5, v, 'kasia', 0.5) / v < 1, 'odstęp w sekwencji na poziomie 5');
  assert.deepEqual(L.SEKWENCJE.luz_s, [3, 5]); assert.deepEqual(L.SEKWENCJE.dlugosc_s, [8, 12]);
});

test('każda przeszkoda jedzie na ekranie w stronę gracza i nie jest w lustrze, na każdym poziomie', async () => {
  const w = await pomiar();
  for (const p of w) for (const r of p.rundy) {
    assert.ok(r.ruchy.klatek > 3000, 'poziom ' + p.poziom + ': za mało klatek z przeszkodą');
    assert.equal(r.ruchy.odGracza, 0, 'poziom ' + p.poziom + ': przeszkoda stała albo jechała od gracza w ' + r.ruchy.odGracza + ' klatkach');
    assert.ok(r.slad.rysowane > 100, 'poziom ' + p.poziom + ': przeszkody nie poszły na ekran');
    assert.equal(r.slad.wLustrze, 0, 'poziom ' + p.poziom + ': przeszkoda narysowana w lustrze');
    for (const t of r.rodzaje) assert.ok(RODZAJE.includes(t), 'nieznana przeszkoda ' + t);
  }
});

test('trasa: przeszkody stawiane po kolei, żadna przed rozbiegiem; luz liczony od ostatniej przeszkody', async () => {
  const w = await pomiar();
  for (const p of w) for (const r of p.rundy) {
    assert.ok(r.poKolei, 'poziom ' + p.poziom + ': przeszkoda postawiona przed poprzednią');
    assert.ok(r.pierwsza >= ROZBIEG, 'poziom ' + p.poziom + ': pierwsza przeszkoda w ' + r.pierwsza + ' px');
  }
  const s = czytaj('js/cegielki.js').replace(/\r/g, '');
  assert.match(s, /G\.fala = L\.nastepnaFala\(G\.fala, G\.poziom, G\.predBaza, G\.fala\.sek \? Math\.max\(0, G\.nastPrzeszkoda - G\.ostPrzerwa\) : G\.nastPrzeszkoda, Math\.random\(\)\);/);
});
