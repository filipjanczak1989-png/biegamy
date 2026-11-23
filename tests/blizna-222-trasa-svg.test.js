/* BLIZNA 222 (11.11.2026, E1a „Dziś najpierw dane”): js/trasa-svg.mjs — kształt biegu jako SVG bez kafli, bez biblioteki, bez sieci.
   Pilnuje czystych funkcji: rzut równokątny (proporcje przez cos szerokości), dopasowanie do pudełka z marginesem, przerzedzanie,
   puste i krótkie dane (żadnej „przykładowej” pętli: < 2 punkty = pusty napis), kropki startu/mety tylko na prośbę, kolor tylko
   z białej listy, brak NaN w wyjściu. Moduł bez import/export (globalThis.BM_TRASA); nic nie zapisuje i nic nie wysyła. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const kod = fs.readFileSync(path.join(KORZEN, 'js', 'trasa-svg.mjs'), 'utf8');
const g = {}; g.globalThis = g; vm.runInNewContext(kod, g);
const T = g.BM_TRASA;

/* pętla ~ 2 km wokół (52,23 N; 21,01 E): prostokąt 0,9 km × 0,45 km po 20 punktów na bok */
function petla(n) {
  const out = []; n = n || 20;
  for (let i = 0; i < n; i++) out.push([52.23, 21.01 + i / n * 0.0132]);
  for (let i = 0; i < n; i++) out.push([52.23 + i / n * 0.004, 21.0232]);
  for (let i = 0; i < n; i++) out.push([52.234, 21.0232 - i / n * 0.0132]);
  for (let i = 0; i < n; i++) out.push([52.234 - i / n * 0.004, 21.01]);
  out.push([52.23, 21.01]);
  return out;
}

test('moduł bez import/export, bez sieci i bez zapisu', () => {
  assert.doesNotMatch(kod, /^\s*(import|export)\b/m);
  assert.doesNotMatch(kod, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|supabase/);
});

test('oczyszczanie: tylko poprawne pary [lat, lon]; [0,0] i NaN odpadają', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(T.oczysc([[52.2, 21.0], [0, 0], [NaN, 21], ['52.3', '21.1'], [91, 0], null, [52.4]]))), [[52.2, 21.0], [52.3, 21.1]]);   // JSON: tablice z obcego realmu vm
  assert.equal(T.oczysc(null).length, 0);
});

test('odległość i długość: 1° szerokości ≈ 111 km; pętla ≈ 2,7 km', () => {
  assert.ok(Math.abs(T.odlegloscM([52, 21], [53, 21]) - 111195) < 300);
  const d = T.dlugoscM(petla());
  assert.ok(d > 2500 && d < 2900, 'długość pętli: ' + Math.round(d));
});

test('rzut: x rośnie na wschód, y na południe; skala cos(lat) — 0,01° lon jest krótsze niż 0,01° lat', () => {
  const r = T.rzutuj([[52.0, 21.0], [52.0, 21.01], [52.01, 21.0]]);
  assert.ok(r[1].x > r[0].x && r[2].y < r[0].y);
  const dx = r[1].x - r[0].x, dy = r[0].y - r[2].y;
  assert.ok(Math.abs(dx / dy - Math.cos(52.0033 * Math.PI / 180)) < 0.01);
});

test('dopasowanie: mieści się w pudełku z marginesem 8 %, proporcje zachowane, kształt wyśrodkowany', () => {
  const dop = T.dopasuj(T.rzutuj(petla()), 96, 96);
  const xs = dop.punkty.map((p) => p.x), ys = dop.punkty.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  assert.ok(minX >= 96 * 0.08 - 1e-6 && maxX <= 96 * 0.92 + 1e-6 && minY >= 96 * 0.08 - 1e-6 && maxY <= 96 * 0.92 + 1e-6);
  assert.ok(Math.abs((minX + maxX) / 2 - 48) < 1e-6 && Math.abs((minY + maxY) / 2 - 48) < 1e-6, 'środek');
  /* prostokąt 0,9 × 0,45 km → po rzucie szerszy niż wyższy, w pudełku szerokość = 80,64, wysokość mniejsza */
  assert.ok(Math.abs((maxX - minX) - 96 * 0.84) < 1e-6 && (maxY - minY) < 96 * 0.84 * 0.6);
  assert.ok(!dop.pusty);
  /* prostokątne pudełko: krótszy bok liczy margines */
  const d2 = T.dopasuj(T.rzutuj(petla()), 320, 200);
  assert.ok(d2.punkty.every((p) => p.x >= 16 - 1e-6 && p.x <= 304 + 1e-6 && p.y >= 16 - 1e-6 && p.y <= 184 + 1e-6));
});

test('jeden punkt / zerowy rozrzut: środek pudełka i flaga pusty; brak punktów: null', () => {
  const d = T.dopasuj(T.rzutuj([[52.2, 21.0], [52.2, 21.0]]), 96, 96);
  assert.ok(d.pusty && d.punkty.every((p) => p.x === 48 && p.y === 48));
  assert.equal(T.dopasuj([], 96, 96), null);
});

test('przerzedzanie: pierwszy i ostatni zostają, co najwyżej maks punktów, mniej = bez zmian', () => {
  const p = petla(50), r = T.przerzedz(p, 100);
  assert.equal(r.length, 100); assert.deepEqual([...r[0]], p[0]); assert.deepEqual([...r[99]], p[p.length - 1]);
  assert.equal(T.przerzedz(p.slice(0, 10), 100).length, 10);
});

test('svg: polyline z punktów, viewBox pudełka, non-scaling-stroke, bez NaN; < 2 punkty = pusty napis', () => {
  const s = T.miniatura(petla());
  assert.match(s, /^<svg [^>]*viewBox="0 0 96 96"/);
  assert.match(s, /<polyline points="[\d., ]+" fill="none" stroke="var\(--accent\)"/);
  assert.match(s, /vector-effect="non-scaling-stroke"/);
  assert.doesNotMatch(s, /NaN|undefined/);
  assert.doesNotMatch(s, /<circle/, 'miniatura bez kropek startu i mety (domyślnie)');
  assert.equal(T.miniatura([[52.2, 21.0]]), '');
  assert.equal(T.miniatura([]), '');
  assert.equal(T.miniatura('nie tablica'), '');
});

test('pełny widok: 320×200, kropki startu (zielona) i mety (akcent) tylko z opcją kropki', () => {
  const s = T.pelny(petla());
  assert.match(s, /viewBox="0 0 320 200"/);
  assert.equal((s.match(/<circle/g) || []).length, 2);
  assert.match(s, /fill="#4ade80"/);
  assert.doesNotMatch(T.pelny(petla(), { kropki: false }), /<circle/);
});

test('kolor i klasa tylko z białej listy: cudzy tekst nie wchodzi do SVG', () => {
  assert.equal(T.kolorOk('#ff6a1f'), '#ff6a1f');
  assert.equal(T.kolorOk('var(--accent-2)'), 'var(--accent-2)');
  assert.equal(T.kolorOk('red" onload="alert(1)'), 'var(--accent)');
  const s = T.miniatura(petla(), { kolor: '"><script>', klasa: 'x" onclick="y', tytul: '<b>' });
  assert.doesNotMatch(s, /<script|onclick/);
  assert.match(s, /aria-label="Kształt trasy"/);
});

test('bardzo długa trasa (maraton, 8 400 punktów): miniatura ≤ 120 punktów, pełny ≤ 400, w rozsądnym czasie', () => {
  const p = []; for (let i = 0; i < 8400; i++) p.push([52.2 + Math.sin(i / 300) * 0.05, 21.0 + i / 8400 * 0.3]);
  const t0 = Date.now(), m = T.miniatura(p), f = T.pelny(p);
  assert.ok((m.match(/[\d.]+,[\d.]+/g) || []).length <= 120);
  assert.ok((f.match(/[\d.]+,[\d.]+/g) || []).length <= 402);
  assert.ok(Date.now() - t0 < 500);
});
