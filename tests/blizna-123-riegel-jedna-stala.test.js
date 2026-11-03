/* BLIZNA 123 (3.11.2026, Filip): wykładnik Riegela w JEDNYM module (js/riegel.js) — generator planu, wyniki-lista, predyktor w zawodnik.html
   i (w przyszłości) okienko korzystają z BM_RIEGEL; w repo nie ma drugiego literału wykładnika. Wartość 1,06 = decyzja Filipa (docs/riegel-zwiad).
   Powód: projekt W1 mówił „1,091 jak w aplikacji”, a aplikacja ma 1,06 — rozjazd między dokumentem a kodem; teraz źródło jest jedno. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

test('js/riegel.js: jedno źródło — require, globalThis i import dają tę samą stałą; przelicz = T1·(D2/D1)^k', async () => {
  const R = require('../js/riegel.js');
  assert.equal(R.WYKLADNIK, 1.06, 'wartość do decyzji Filipa — zmiana TYLKO w js/riegel.js (i tu świadomie)');
  assert.equal(globalThis.BM_RIEGEL, R);
  assert.equal(R.przelicz(2400, 10, 21.0975), 2400 * Math.pow(21.0975 / 10, 1.06));
  assert.equal(R.ekwiwalent10(1200, 5), 1200 * Math.pow(2, 1.06));
  await import(pathToFileURL(path.join(KORZEN, 'js/riegel.js')).href);   // jak w EF (Deno): plik bez import/export, side-effect na globalThis
  assert.equal(globalThis.BM_RIEGEL.WYKLADNIK, 1.06);
  const src = czytaj('js/riegel.js');
  assert.doesNotMatch(bezKomentarzy(src), /^\s*(import|export)\s/m, 'bez import/export — <script src>, require i import jednocześnie');
});

test('konsumenci korzystają z modułu, nie z własnego literału; strony i środowisko testów ładują js/riegel.js przed nimi', () => {
  const gen = bezKomentarzy(czytaj('js/generator-planu.js'));
  assert.match(gen, /var RIEGEL = \(typeof module !== 'undefined' && typeof require === 'function' \? require\('\.\/riegel\.js'\) : globalThis\.BM_RIEGEL\)\.WYKLADNIK;/);
  assert.doesNotMatch(gen, /RIEGEL\s*=\s*1\.\d/, 'generator: literał wykładnika');
  const wyn = bezKomentarzy(czytaj('js/wyniki-lista.mjs'));
  assert.match(wyn, /var RIEGEL = g\.BM_RIEGEL\.WYKLADNIK;/); assert.doesNotMatch(wyn, /RIEGEL\s*=\s*1\.\d/);
  const zaw = czytaj('zawodnik.html');
  assert.match(zaw, /const K_DOLNA = window\.BM_RIEGEL\.WYKLADNIK;/); assert.doesNotMatch(bezKomentarzy(zaw), /K_DOLNA = 1\.\d/);
  for (const p of ['zawodnik.html', 'wyniki.html']) {
    const h = czytaj(p), i = h.indexOf('<script src="js/riegel.js"></script>');
    assert.ok(i > 0, p + ': ładuje js/riegel.js');
    const pierwszyKonsument = Math.min(...['js/generator-planu.js', 'js/wyniki-lista.mjs'].map((s) => { const k = h.indexOf('<script src="' + s + '"'); return k < 0 ? Infinity : k; }));
    assert.ok(i < pierwszyKonsument, p + ': riegel.js PRZED konsumentem');
  }
  assert.match(czytaj('tests/_srodowisko.js'), /js', 'riegel\.js'/, 'zaladujSb ładuje riegel.js (predyktor w zawodnik.html czyta window.BM_RIEGEL)');
});

test('w repo jest DOKŁADNIE JEDEN literał wykładnika Riegela (js/riegel.js); testy pilnujące liczby są świadome', () => {
  const pliki = [];
  const idz = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name === 'vendor' || f.name === '.git' || f.name === 'docs' || f.name === 'tests') continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) idz(p); else if (/\.(js|mjs|ts|html)$/.test(f.name) && !/\.min\./.test(f.name)) pliki.push(p);
  } };
  idz(KORZEN);
  const zLiteralem = pliki.filter((p) => /(RIEGEL|K_DOLNA|WYKLADNIK)\s*=\s*1\.\d+|Math\.pow\([^)]*,\s*1\.0\d+\s*\)/.test(bezKomentarzy(fs.readFileSync(p, 'utf8'))))
    .map((p) => path.relative(KORZEN, p).replace(/\\/g, '/'));
  assert.deepEqual(zLiteralem, ['js/riegel.js'], 'literał wykładnika poza js/riegel.js: ' + zLiteralem.join(', '));
});
