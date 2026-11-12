/* BLIZNA 219 (11.11.2026, część 9) — PRÓG KILOMETRÓW RAZEM bez filmu. Zwiad 11.11: licznik minął 1 000 km (1 117,76 km o 16:50) i nic się nie wydarzyło:
   filmy progów prawdziwej akcji = 0 (próba: 1), odznaka 1000 km zdjęta 2.11 (zostały 1/100/200/500 km własnych), kafel i strona akcji bez obsługi progów,
   push tylko start / niedziela / zamknięcie. Wariant (js/akcja.mjs + js/akcja-wklad-karta.mjs):
   - baner „X km razem” w kaflu (daneKaflaHtml) i na stronie akcji / w centrum (pasekHtml) przez 48 h od PIERWSZEGO zobaczenia na urządzeniu (licznik nie zna chwili przekroczenia);
   - działa dla każdego progu z PROGI_KM i dla celu („Cel osiągnięty razem”), tylko najwyższy przekroczony; poniżej 1 000 km nic;
   - konfetti raz na konto/urządzenie, nic przy prefers-reduced-motion, ustępuje czekającemu filmowi akcji (film ma pierwszeństwo; baner zostaje);
   - „Udostępnij” → grafika progu z modułu karty (po dotknięciu), bez osób i bez kwot; zero zapytań do bazy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zw = (s) => String(s).replace(/\s/g, ' ');   // liczby mają twardą spację (akcja.mjs liczba): każdy odstęp Unicode → zwykła spacja

function pamiec() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; }
async function modul() {
  globalThis.escapeHtml = (s) => String(s);
  globalThis.localStorage = pamiec();
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  return globalThis.BM_AKCJA;
}
const D = (suma) => ({ nazwa: 'Ulica', imie: 'Imię', suma_km: suma, cel_km: 12500, pct: Math.floor(suma / 125) / 100, wystartowala: true });

test('progi: lista z celem, najwyższy przekroczony, poniżej 1 000 km nic; tekst progu i celu', async () => {
  const A = await modul();
  assert.deepEqual([...A.PROGI_KM], [1000, 2500, 5000, 7500, 10000]);
  assert.deepEqual([...A.progiAkcji(D(0))], [1000, 2500, 5000, 7500, 10000, 12500], 'cel na końcu');
  assert.deepEqual([...A.progiAkcji({ cel_km: 3000 })], [1000, 2500, 3000], 'progi powyżej celu odpadają');
  assert.equal(A.progPrzekroczony(D(999.9)), null); assert.equal(A.progPrzekroczony(D(1000)), 1000); assert.equal(A.progPrzekroczony(D(1117.76)), 1000); assert.equal(A.progPrzekroczony(D(2500)), 2500); assert.equal(A.progPrzekroczony(D(12500)), 12500);
  assert.equal(zw(A.tekstProgu(1000, D(1000))), '1 000 km razem'); assert.equal(zw(A.tekstProgu(12500, D(12500))), '12 500 km. Cel osiągnięty razem.');
});

test('baner: 48 h od pierwszego zobaczenia, potem nic; przed startem i poniżej progu nic; próba ma własny klucz', async () => {
  const A = await modul(); const t0 = 1_800_000_000_000;
  assert.equal(A.banerProguHtml(D(999), t0), ''); assert.equal(A.banerProguHtml({ ...D(1200), wystartowala: false }, t0), '');
  const h = zw(A.banerProguHtml(D(1117.76), t0));
  assert.match(h, /<div class="akcja-prog" role="status"><b>1 000 km razem<\/b><span>Razem, krok po kroku\. Dziękujemy\.<\/span><button type="button" class="akcja-link akcja-prog-udostepnij" data-prog-udostepnij="1000">Udostępnij<\/button><\/div>/);
  assert.equal(globalThis.localStorage.getItem('bm_akcja_prog_dla-fabianka_1000'), String(t0), 'pierwsze zobaczenie zapisane');
  assert.ok(A.banerProguHtml(D(1300), t0 + 47 * 3600e3), 'po 47 h nadal'); assert.equal(A.banerProguHtml(D(1300), t0 + 48 * 3600e3), '', 'po 48 h koniec');
  assert.ok(A.banerProguHtml(D(2600), t0 + 60 * 3600e3), 'następny próg: nowy baner'); assert.match(zw(A.banerProguHtml(D(2600), t0 + 60 * 3600e3)), /2 500 km razem/);
  A.banerProguHtml({ ...D(1117), testowa: true }, t0); assert.equal(globalThis.localStorage.getItem('bm_akcja_prog_proba_1000'), String(t0), 'próba osobno');
  assert.doesNotMatch(h, /zł|Fabian/i);
});

test('kafel (daneKaflaHtml) i strona/centrum (pasekHtml) dostają baner tylko po progu; dla-fabianka.html i zawodnik.html bez zmian', async () => {
  const A = await modul();
  assert.match(A.pasekHtml(D(1117.76)), /^<div class="akcja-prog"/); assert.doesNotMatch(A.pasekHtml(D(900)), /akcja-prog/);
  assert.match(A.daneKaflaHtml(D(1117.76)), /^<div class="akcja-prog"/); assert.doesNotMatch(A.daneKaflaHtml(D(900)), /akcja-prog/);
  assert.match(czytaj('dla-fabianka.html'), /\$\('pasek'\)\.innerHTML = A\.pasekHtml\(d, \{ krotko: true \}\);/, 'strona akcji bierze sam pasek z modułu (12.11, punkt 5: liczby km tylko w scenie)');
  assert.match(czytaj('dla-fabianka.html'), /\$\('prog'\)\.innerHTML = A\.banerProguHtml\(d\);/, 'baner progu z modułu jako wąski pasek pod sceną');
  assert.ok(czytaj('dla-fabianka.html').indexOf('id="prog"') < czytaj('dla-fabianka.html').indexOf('id="pasek"'), 'pasek progu nad paskiem postępu');
  /* 12.11 (punkt 5): strona akcji ma własny wąski pasek progu pod sceną (banerProguHtml + CSS .akcja-prog), ale logika progów zostaje w module */
  assert.doesNotMatch(czytaj('dla-fabianka.html'), /progPrzekroczony|PROGI_KM|KLUCZ_PROGU/); assert.doesNotMatch(czytaj('zawodnik.html'), /akcja-prog|progPrzekroczony/); assert.doesNotMatch(czytaj('sw.js'), /akcja-prog/);
});

test('konfetti: raz na urządzenie, nic przy reduced-motion, ustępuje czekającemu filmowi; udostępnianie ładuje moduł karty po dotknięciu', async () => {
  const A = await modul();
  const dodane = []; const doc = { body: { appendChild: (x) => dodane.push(x) }, createElement: () => ({ style: {}, setAttribute() {}, getContext: () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {} }), remove() {} }) };
  globalThis.document = doc; globalThis.requestAnimationFrame = () => 1; globalThis.matchMedia = () => ({ matches: false }); globalThis.innerWidth = 360; globalThis.innerHeight = 640;
  try {
    assert.equal(A.konfettiProgu('dla-fabianka', 1000), true, 'pierwszy raz: konfetti');
    assert.equal(A.konfettiProgu('dla-fabianka', 1000), false, 'drugi raz: nie'); assert.equal(dodane.length, 1);
    assert.ok(globalThis.localStorage.getItem('bm_akcja_prog_dla-fabianka_1000_konfetti'));
    globalThis.matchMedia = () => ({ matches: true }); assert.equal(A.konfettiProgu('dla-fabianka', 2500), false, 'reduced-motion: bez ruchu'); assert.ok(globalThis.localStorage.getItem('bm_akcja_prog_dla-fabianka_2500_konfetti'), 'ale znacznik zapisany: nie wróci po zmianie ustawienia');
    globalThis.matchMedia = () => ({ matches: false }); globalThis.FILM_DZIS = { czekaFilmAkcji: () => true };
    assert.equal(A.konfettiProgu('dla-fabianka', 5000), false, 'film czeka: film ma pierwszeństwo'); assert.equal(globalThis.localStorage.getItem('bm_akcja_prog_dla-fabianka_5000_konfetti'), null, 'bez znacznika: po filmie konfetti jeszcze może zagrać');
    globalThis.FILM_DZIS = null; assert.equal(A.konfettiProgu('dla-fabianka', 5000), true);
  } finally { delete globalThis.document; delete globalThis.requestAnimationFrame; delete globalThis.matchMedia; delete globalThis.FILM_DZIS; }
  const kod = czytaj('js/akcja.mjs');
  assert.match(kod, /closest\("\[data-prog-udostepnij\]"\)/); assert.match(kod, /BM_WKLAD_KARTA\.pokazProg\(d, p, adresStrony\(d\)\)/);
  const blok = kod.slice(kod.indexOf('PRÓG KILOMETRÓW RAZEM (11.11'), kod.indexOf('function pasekHtml'));
  assert.ok(blok.length > 2000); assert.doesNotMatch(blok, /\.rpc\(|fetch\(|sendBeacon|\.from\(/, 'zero zapytań');
});

test('grafika progu: 1080×1350, „1 000” i „KM RAZEM”, nazwa ulicy z licznika, bez osób i kwot; cel → „KM. CEL OSIĄGNIĘTY”', () => {
  const napisy = [];
  const ctx = { font: '', fillStyle: '', textAlign: '', textBaseline: '', fillRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, createLinearGradient: () => ({ addColorStop() {} }), measureText: (t) => ({ width: String(t).length * (Number((/(\d+)px/.exec(ctx.font) || [])[1]) || 16) * 0.55 }), fillText: (t) => napisy.push(String(t)), drawImage() {} };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:,' };
  const g = { document: { createElement: (t) => (t === 'canvas' ? canvas : { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }), getElementById: () => null, head: { appendChild() {} }, body: { appendChild() {} } }, Image: function () {}, setTimeout, Promise, URL: {}, navigator: {}, BM_AKCJA: { dopelniacz: (i) => i + 'a' } };
  g.globalThis = g; g.window = g; vm.createContext(g); vm.runInContext(czytaj('js/akcja-wklad-karta.mjs'), g);
  const K = g.BM_WKLAD_KARTA;
  K.obrazProgu({ imie: 'Imię', suma_km: 1117.76, cel_km: 12500, pct: 8.94 }, 1000, 'biegamy.run/dla-fabianka.html', {});
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1350);
  assert.ok(napisy.map(zw).includes('1 000') && napisy.includes('KM RAZEM') && napisy.includes('BIEGAMY · ULICA IMIĘA') && napisy.map(zw).includes('cała ulica: 1 118 z 12 500 km · 8,9 %') && napisy.includes('biegamy.run/dla-fabianka.html'), napisy.join(' | '));
  assert.ok(!napisy.some((t) => /zł|@|Twój/i.test(t)));
  napisy.length = 0; K.obrazProgu({ imie: 'Imię', suma_km: 12500, cel_km: 12500, pct: 100 }, 12500, 'x', {});
  assert.ok(napisy.map(zw).includes('12 500') && napisy.includes('KM. CEL OSIĄGNIĘTY'));
  assert.ok(typeof K.pokazProg === 'function');
});
