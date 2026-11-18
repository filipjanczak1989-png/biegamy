/* BLIZNA 219 (11.11.2026, część 9; 18.11 kamienie co 1000 km z bazy, migracja 20261210) — PRÓG KILOMETRÓW RAZEM bez filmu. Zwiad 11.11: licznik minął 1 000 km (1 117,76 km o 16:50) i nic się nie wydarzyło:
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
/* 18.11 (migracja 20261210): kamień i 48 h liczy baza; licznik oddaje pole prog = {km, at, cel} tylko dla ostatniego kamienia w ciągu 48 h od przekroczenia */
const PROG = (km, cel) => ({ km, at: '2026-11-18T12:00:00+00:00', cel: !!cel });
const D = (suma, prog) => ({ nazwa: 'Ulica', imie: 'Imię', suma_km: suma, cel_km: 12500, pct: Math.floor(suma / 125) / 100, wystartowala: true, prog: prog === undefined ? null : prog });

test('kamień z licznika (pole prog), bez liczenia progów w przeglądarce; tekst kamienia i celu', async () => {
  const A = await modul();
  assert.equal(A.PROGI_KM, undefined, 'stałe progi 1000/2500/5000… zdjęte'); assert.equal(A.progiAkcji, undefined);
  assert.equal(A.progPrzekroczony(D(2325.31)), null, 'suma bez pola prog: nic (baza decyduje)');
  assert.equal(A.progPrzekroczony(D(2325.31, PROG(2000))), 2000); assert.equal(A.progPrzekroczony(D(12500, PROG(12500, true))), 12500);
  for (const zly of [null, 'x', { km: 'abc' }, { km: -1000 }, { km: 0 }, [1000]]) assert.equal(A.progPrzekroczony(D(3000, zly)), null, JSON.stringify(zly));
  assert.equal(zw(A.tekstProgu(1000, D(1000))), '1 000 km razem'); assert.equal(zw(A.tekstProgu(3000, D(3000))), '3 000 km razem'); assert.equal(zw(A.tekstProgu(12500, D(12500))), '12 500 km. Cel osiągnięty razem.');
});

test('baner: tylko z polem prog; przed startem i bez pola nic; przeglądarka nie zapamiętuje „pierwszego zobaczenia”', async () => {
  const A = await modul();
  assert.equal(A.banerProguHtml(D(2325.31)), '', 'przy 2 325 km bez świeżego kamienia: nic (dotąd „1 000 km razem”)');
  assert.equal(A.banerProguHtml({ ...D(3100, PROG(3000)), wystartowala: false }), '');
  const h = zw(A.banerProguHtml(D(3100, PROG(3000))));
  assert.match(h, /<div class="akcja-prog" role="status"><b>3 000 km razem<\/b><span>Razem, krok po kroku\. Dziękujemy\.<\/span><button type="button" class="akcja-link akcja-prog-udostepnij" data-prog-udostepnij="3000">Udostępnij<\/button><\/div>/);
  assert.match(zw(A.banerProguHtml(D(12500, PROG(12500, true)))), /<b>12 500 km\. Cel osiągnięty razem\.<\/b>/);
  assert.deepEqual([...globalThis.localStorage._m.keys()].filter((k) => !/_konfetti$/.test(k)), [], 'tylko znacznik konfetti, bez zapisu chwili zobaczenia');
  assert.doesNotMatch(h, /zł|Fabian/i);
  const kod = czytaj('js/akcja.mjs'), blok = kod.slice(kod.indexOf('PRÓG KILOMETRÓW RAZEM (11.11'), kod.indexOf('function konfettiProgu'));
  assert.doesNotMatch(blok, /BANER_PROGU_MS|Date\.now\(\)|teraz/, 'czasu 48 h nie liczy przeglądarka');
});

test('kafel (daneKaflaHtml) i strona/centrum (pasekHtml) dostają baner tylko z polem prog; dla-fabianka.html i zawodnik.html bez zmian', async () => {
  const A = await modul();
  assert.match(A.pasekHtml(D(3100, PROG(3000))), /^<div class="akcja-prog"/); assert.doesNotMatch(A.pasekHtml(D(3100)), /akcja-prog/);
  assert.match(A.daneKaflaHtml(D(3100, PROG(3000))), /^<div class="akcja-prog"/); assert.doesNotMatch(A.daneKaflaHtml(D(3100)), /akcja-prog/);
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
