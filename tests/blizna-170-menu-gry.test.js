/* BLIZNA 170 / MENU GŁÓWNE GRY (Filip 5.11): obok gry Magazyn Szefa, Rankingi, Mur i Dziennik, wszystko bez rozgrywania rundy.
   Ranking to jeden blok przenoszony między ekranami: dwie kopie miałyby te same identyfikatory, a poRundzie szuka go po identyfikatorze.
   Po skutku: przeglądarka (narzędzie poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;

test('menu: cztery przyciski, trzy ekrany z powrotem', () => {
  const h = czytaj('gra-cegielki.html'), m = h.slice(h.indexOf('<div class="m-guziki">'), h.indexOf('<label class="maly"><input type="checkbox" id="m-maly">'));
  for (const [id, t] of [['m-sklep', 'Magazyn Szefa'], ['m-rankingi', 'Rankingi'], ['m-mur-guzik', 'Mur'], ['m-dziennik', 'Dziennik']]) assert.match(m, new RegExp('id="' + id + '">' + t), id);
  for (const id of ['e-rankingi', 'e-mur', 'e-dziennik']) { const e = h.slice(h.indexOf('<div id="' + id + '"')); assert.match(e.slice(0, e.indexOf('</div>\n<div id=') + 1 || 800), /data-wroc/, id); }
  assert.match(h, /body\.gra-zamknieta \.e-pod/, 'zamknięta gra zamyka też nowe ekrany');
});

test('ranking: ten sam blok wraca pod koniec rundy', () => {
  const k = czytaj('js/cegielki-konto.js'), h = czytaj('gra-cegielki.html');
  assert.equal((h.match(/id="k-ranking"/g) || []).length, 1);
  assert.match(k, /\$\("e-rankingi-miejsce"\)\.appendChild\(\$\("k-ranking"\)\)/);
  assert.match(k, /if \(id === "e-rankingi"\) \$\("k-ranking-miejsce"\)\.appendChild\(\$\("k-ranking"\)\);/);
  assert.match(k, /budujRanking\(\); \$\("e-rankingi-miejsce"\)/, 'bez rozgrywania rundy');
});

test('dziennik: zebrane do poziomu, kartka 1 po pierwszej rundzie', () => {
  assert.deepEqual(L.zebraneKartki(1, false), [], 'przed pierwszą rundą pusto');
  assert.deepEqual(L.zebraneKartki(1, true).map((k) => k.nr), [1]);
  assert.deepEqual(L.zebraneKartki(4, false).map((k) => k.nr), [1, 2, 3, 4], 'nowe urządzenie z kontem: kartki do poziomu');
  assert.equal(L.zebraneKartki(20, true).length, 20); assert.equal(L.zebraneKartki(99, true).length, 20);
  assert.equal(L.zebraneKartki(2, false)[1].tekst, L.KARTKI[1]);
});
