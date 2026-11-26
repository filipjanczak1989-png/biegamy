// Blizna #392 (26.11.2026) — nowe Dziś, audyt A3: pomarańczowy był wszędzie.
//
// Etykiety kafli, linki, przyciski, słupki, wybrana mina, nazwa trenera: wszystko tym samym pomarańczem, więc kolor
// niczego nie wyróżniał. Decyzja Filipa 26.11: etykiety kafli szare (#8f8c97), pomarańcz tylko dla linków
// i przycisków. Do tego „Zapisz raport” w „Jak poszło?”: pełny dopiero po wyborze miny, wcześniej obrys. Pełny
// pomarańczowy przycisk, którego jeszcze nie da się użyć, był najgłośniejszą rzeczą w kaflu „Ostatni trening”.
// Przycisk w obrysie musi dalej wyglądać na przycisk i dalej reagować (dotknięty bez miny mówi, czego brakuje).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, MODUL } = require('./_dzis-nowy-strona.js');

const regula = (sel) => { const i = MODUL.indexOf(sel + '{'); assert.ok(i >= 0, 'brak reguły ' + sel); return MODUL.slice(i, MODUL.indexOf('}', i) + 1); };
const czeka = { wpisy: [wpis('l1', 5), wpis('l2', 30, { feel: 'good' })] };

test('(1) etykiety kafli szare; linki i przyciski dalej pomarańczowe', () => {
  assert.match(regula('#dzis-nowy .dn-etykieta'), /color:#8f8c97;/, 'etykieta kafla („Trening na dziś”, „Ulica”, „Ostatni trening”…)');
  assert.match(regula('#dzis-nowy .dn-jp-t'), /color:#8f8c97;/, 'etykieta „Jak poszło?” wewnątrz kafla');
  for (const s of ['#dzis-nowy .dn-etykieta', '#dzis-nowy .dn-jp-t']) assert.doesNotMatch(regula(s), /#ff7a45|#c44a13/, s);
  assert.match(regula('#dzis-nowy .dn-link'), /color:#ff7a45;/, 'link w nagłówku kafla („Plan ›”, „Kalendarz ›”, „Zobacz ulicę ›”)');
  assert.match(regula('#dzis-nowy .dn-rada-w'), /color:#ff7a45;/, '„Czytaj ›”');
  assert.ok(MODUL.includes('#dzis-nowy .dn-glowny{border:0;background:#c44a13;color:#fff}'), 'główny przycisk');
  // szary #8f8c97 na tle kafla #0f0f13: kontrast liczony tu, żeby zmiana koloru tła albo etykiety nie zeszła poniżej 4,5:1
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }, L = (h) => 0.2126 * lin(parseInt(h.slice(1, 3), 16)) + 0.7152 * lin(parseInt(h.slice(3, 5), 16)) + 0.0722 * lin(parseInt(h.slice(5, 7), 16));
  const kontrast = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  assert.ok(MODUL.includes('#dzis-nowy .dn-kafel{background:#0f0f13;'));
  assert.ok(kontrast('#8f8c97', '#0f0f13') >= 4.5, 'etykieta 11 px: ' + kontrast('#8f8c97', '#0f0f13').toFixed(2));
  assert.ok(kontrast('#ff7a45', '#0f0f13') >= 4.5, 'napis przycisku w obrysie'); assert.ok(kontrast('#c44a13', '#0f0f13') >= 3, 'obrys przycisku (element niebędący tekstem: 3:1)');
});

test('(2) „Zapisz raport”: przed wyborem miny obrys, po wyborze pełny; w obu stanach to ten sam przycisk tej samej wielkości', async () => {
  const s = strona(czeka); s.B.start(); await s.doKonca();
  assert.match(s.kafel('ostatni').innerHTML, /<button type="button" class="dn-jp-zapisz" data-dn="jp-zapisz">Zapisz raport<\/button>/, 'na starcie bez klasy „pełny”');
  const obrys = regula('#dzis-nowy .dn-jp-zapisz');
  assert.match(obrys, /min-height:48px;box-sizing:border-box;border:1\.5px solid #c44a13;border-radius:12px;background:transparent;color:#ff7a45;/, 'obrys: wyraźna ramka, pomarańczowy napis, ta sama wysokość 48 px');
  assert.match(obrys, /cursor:pointer/, 'dalej wygląda i zachowuje się jak przycisk');
  assert.equal(regula('#dzis-nowy .dn-jp-zapisz.dn-pelny'), '#dzis-nowy .dn-jp-zapisz.dn-pelny{background:#c44a13;color:#fff}', 'pełny: zmienia się tylko tło i kolor napisu, nie rozmiar');
  s.dotknij('jp-mina', 'good');
  assert.equal(s.jp('jp-zapisz').className, 'dn-jp-zapisz dn-pelny', 'po wyborze miny przycisk robi się pełny');
  s.dotknij('jp-mina', 'bad'); assert.equal(s.jp('jp-zapisz').className, 'dn-jp-zapisz dn-pelny', 'zmiana miny go nie cofa');
});

test('(3) przycisk w obrysie dalej reaguje: dotknięty bez miny mówi, czego brakuje, i niczego nie zapisuje', async () => {
  const s = strona(czeka); s.B.start(); await s.doKonca();
  const przed = s.zapytania.length;
  s.dotknij('jp-zapisz'); await s.tik();
  assert.equal(s.jp('jp-kom').textContent, 'Wybierz, jak poszło.'); assert.equal(s.jp('jp-kom').hidden, false);
  assert.equal(s.zapytania.length, przed, 'bez zapytania do bazy');
  assert.notEqual(s.jp('jp-zapisz').className, 'dn-jp-zapisz dn-pelny', 'samo dotknięcie nie robi go pełnym');
  assert.doesNotMatch(MODUL, /class="dn-jp-zapisz"[^>]*disabled/, 'przycisk nie jest wyłączony przed wyborem miny: wyłączony nie mógłby podpowiedzieć');
});

test('(4) po błędzie zapisu przycisk zostaje pełny (mina jest dalej wybrana); nowe pytanie o inny wpis zaczyna od obrysu', async () => {
  const s = strona(Object.assign({ awaria: { training_logs: null } }, czeka)); s.B.start(); await s.doKonca();
  s.dotknij('jp-mina', 'mid'); s.st.awaria = { training_logs: 'odmowa' }; s.dotknij('jp-zapisz'); await s.doKonca();
  assert.equal(s.jp('jp-zapisz').className, 'dn-jp-zapisz dn-pelny'); assert.equal(s.jp('jp-zapisz').disabled, false);
  // „Pomiń” i ponowne wczytanie: bloku nie ma; nowa strona z tym samym pytaniem rysuje przycisk od nowa, w obrysie
  const nowa = strona(czeka); nowa.B.start(); await nowa.doKonca();
  assert.match(nowa.kafel('ostatni').innerHTML, /class="dn-jp-zapisz" data-dn="jp-zapisz"/);
});
