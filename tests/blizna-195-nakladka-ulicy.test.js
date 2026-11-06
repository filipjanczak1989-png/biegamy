/* BLIZNA 195 / NAKŁADKA ULICY NAD TABLICAMI FIRM (Filip 6.11 wieczór, przed startem 7.11). Na pierwszym ekranie (kamera przy maszynach, 1 900 km) licznik km i panel
   „Mur graczy” w lewym górnym rogu zasłaniały tablice firm, a przy przesuwaniu także szyld i tablicę wieżowca. Firmy płacą, więc ma być widać.
   - licznik km i „Mur: 40 000 / 1,25 mln” (jedna linia, cienki pasek, półprzezroczyste tło) w jednym niskim pasku u góry, głośnik mniejszy;
   - pasek kończy się nad najwyższą tablicą (domek-1 w pierwszym rzędzie, y ≈ 32,5 px) z zapasem, więc nic nie wisi nad tablicami przy żadnym położeniu kamery
     (wariant „chowaj przy przesuwaniu” niepotrzebny; „Mur graczy” na dole kolidowałby z podpowiedzią i rowerzystą);
   - pełne zdanie muru zostaje w aria-label i title, „Pierwsze cegły: Szef” pod sceną.
   Po skutku: Chrome 360 i 412 px, dzień i noc, 3 firmy: przed 8 × zasłonięte, po 0 (pierwszy ekran i każdy budynek przy lewej i prawej krawędzi). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const S = czytaj('js/ulica-scena.mjs'), U = czytaj('js/ulica.mjs');
const liczba = (re, t, n) => { const m = re.exec(t); assert.ok(m, 'brak: ' + re); return Number(m[n || 1]); };

function ulica() {
  const c = { console }; c.globalThis = c; c.window = c; c.document = { createElement: () => ({ getContext: () => null }) }; vm.createContext(c);
  vm.runInContext(U, c);
  return c.BM_ULICA;
}

test('mur w jednej linii: „Mur: 40 000 / 1,25 mln”, pełne zdanie bez zmian', () => {
  const L = ulica(), pl = (x) => x.toLocaleString('pl-PL');
  assert.equal(L.tekstMuruKrotko(40000, 1250000), 'Mur: ' + pl(40000) + ' / ' + pl(1.25) + ' mln');
  assert.equal(L.tekstMuruKrotko(48210, 12500000), 'Mur: ' + pl(48210) + ' / ' + pl(12.5) + ' mln');
  assert.equal(L.tekstMuruKrotko(1500000, 12500000), 'Mur: ' + pl(1.5) + ' mln / ' + pl(12.5) + ' mln');
  assert.equal(L.tekstMuruKrotko(1), 'Mur: 1 cegła'); assert.equal(L.tekstMuruKrotko(3), 'Mur: 3 cegły'); assert.equal(L.tekstMuruKrotko(12), 'Mur: 12 cegieł');
  assert.equal(L.tekstMuruKrotko(0, 100), ''); assert.equal(L.tekstMuruKrotko('śmieć'), '');
  assert.doesNotMatch(L.tekstMuruKrotko(5, 10), /(?<!\p{L})zł(?!\p{L})/u, 'cegły to nie pieniądze');
  assert.equal(L.tekstMuru(48210, 12500000), 'Mur graczy: ' + pl(48210) + ' z ' + pl(12500000) + ' cegieł', 'pełne zdanie (aria-label, gra) bez zmian');
});

test('nakładka: licznik i mur w jednym pasku, pełne zdanie w aria-label, Szef pod sceną', () => {
  assert.match(S, /hud = el\("div", "us-hud", ui\);\n\s+var l = el\("div", "us-licznik", hud\);/);
  const m = S.slice(S.indexOf('var m = el("a", "us-mur-graczy"'), S.indexOf('/* Zdanie o zbiórce zaraz pod sceną'));
  assert.match(m, /var m = el\("a", "us-mur-graczy", hud \|\| ui\);/);
  assert.match(m, /el\("span", "us-mur-tekst", m, U\.tekstMuruKrotko\(d\.mur, d\.mur_cel\)\);/);
  assert.match(m, /m\.setAttribute\("aria-label", t \+ "\. Zagraj w Cegiełki\."\);/, 'czytnik ekranu dostaje pełne zdanie');
  assert.doesNotMatch(m, /Pierwsze cegły/, 'w nakładce jedna linia');
  assert.match(S, /if \(d\.pierwsze_cegly != null\) \{ var ps = el\("p", "us-opis us-mur-szef", korzen\);[^\n]*korzen\.insertBefore\(ps, zd\); \}/);
  assert.doesNotMatch(S, /\.us-mur-graczy\{position:absolute/, 'mur nie wisi osobno nad sceną');
});

test('pasek nakładki i głośnik kończą się nad najwyższą tablicą i najwyższym szyldem, z zapasem', () => {
  const hudTop = liczba(/\.us-hud\{[^}]*top:(\d+)px/, S);
  const licz = hudTop + 2 * liczba(/\.us-licznik\{[^}]*padding:(\d+)px \d+px;/, S) + liczba(/\.us-licznik b\{font:400 (\d+)px\/1 /, S);
  const mm = /\.us-mur-graczy\{[^}]*gap:(\d+)px;padding:(\d+)px \d+px (\d+)px;[^}]*border:(\d+)px solid[^}]*font:700 (\d+)px\/([\d.]+) /.exec(S);
  assert.ok(mm, 'styl muru');
  const mur = hudTop + 2 * Number(mm[4]) + Number(mm[2]) + Number(mm[3]) + Number(mm[5]) * Number(mm[6]) + Number(mm[1]) + liczba(/\.us-mur-pasek\{display:block;height:(\d+)px/, S);
  const gl = /\.us-glosnik\{[^}]*top:(\d+)px;width:(\d+)px;height:(\d+)px/.exec(S), glosnik = Number(gl[1]) + Number(gl[3]);
  assert.ok(Number(gl[2]) >= 24 && Number(gl[3]) >= 24, 'głośnik dalej da się dotknąć (WCAG 2.5.8: co najmniej 24 px)');
  const dol = Math.max(licz, mur, glosnik);
  /* tablice: pierwszy rząd domków, najwyższy domek (najmniejsza proporcja), te same stałe co scena */
  const POZIOM = liczba(/POZIOM_DOMKU = (\d+)/, S), ZA_DROGA = liczba(/ZA_DROGA = (\d+)/, S);
  const T = /var TABLICA = \{ bok: ([\d.]+), nadDachem: ([\d.]+),/.exec(S), bok = Number(T[1]), nad = Number(T[2]);
  const proporcje = [...U.matchAll(/"domek-\d": \{ szyld: \[[^\]]+\], proporcja: ([\d.]+) \}/g)].map((x) => Number(x[1]));
  assert.equal(proporcje.length, 7);
  const w = 160, h0 = w / Math.min(...proporcje), tablica = POZIOM - h0 - (Math.round(w * bok) + w * nad);
  const wz = /"wiezowiec": \{ szyld: \[[\d.]+, ([\d.]+), [\d.]+, ([\d.]+)\], proporcja: ([\d.]+) \}/.exec(U), hw = 118 / Number(wz[3]);
  const szyldWiez = POZIOM - ZA_DROGA - hw + Number(wz[1]) * hw + Number(wz[2]) * hw / 2 - (2 * 9.5 * 1.12 + 6) / 2;   // dwulinijkowa deska na środku namalowanej
  assert.ok(dol + 2 <= Math.min(tablica, szyldWiez), 'nakładka do y=' + dol.toFixed(1) + ', najwyższa tablica od y=' + tablica.toFixed(1) + ', szyld wieżowca od y=' + szyldWiez.toFixed(1));
});
