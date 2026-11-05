/* BLIZNA 168 / FIGURY W POWIETRZU (Filip 5.11): Lot (dawniej „Superman”) i Nożyce wyglądały źle nisko nad ziemią, klatka figury stała nawet na ziemi po lądowaniu.
   - nisko zwykła klatka skoku albo krok w machnięciu; pełna figura od 60% pełnego łuku;
   - Gwiazda wyłączona (decyzja Filipa 5.11), nazwy cudzych postaci w napisach nie ma;
   - napis nazywa to, co było widać; bez figury „Salto!”;
   - przesunięcie i pochylenie to samo rysowanie: kolizje i zbieranie się nie ruszają.
   Po skutku: nagrania przed/po (narzędzie poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const F = L.FIZYKA, NOZYCE = 0, GWIAZDA = 1, SUPERMAN = 2, MACHNIECIE = 4;
const CZAS_SALTA = 0.4;
const poSalcie = (y0) => y0 + F.SALTO_V * CZAS_SALTA - F.GRAW * CZAS_SALTA * CZAS_SALTA / 2;
const wyniki = (y, szczyt) => { const s = new Set(); for (let i = 0; i < 1000; i++) s.add(L.figuraPoSalcie(y, szczyt, i / 1000)); return s; };

test('próg: 60% pełnego łuku; salto spod szczytu sięga figury, salto tuż nad ziemią nie', () => {
  const pelny = (F.SKOK * F.SKOK + F.SALTO_V * F.SALTO_V) / (2 * F.GRAW);
  assert.ok(Math.abs(L.progFigury() - pelny * 0.6) < 1e-9);
  const szczytSkoku = F.SKOK * F.SKOK / (2 * F.GRAW);
  assert.ok(poSalcie(szczytSkoku) > L.progFigury(), 'drugi dotyk na szczycie: figura');
  assert.ok(poSalcie(22) < L.progFigury(), 'drugi dotyk nisko: bez figury');
});

test('wybór: nisko bez Lotu i Nożyc; wysoko pełny wybór; Gwiazdy nie ma nigdy, napis bez cudzej postaci', () => {
  const nisko = wyniki(L.progFigury() - 1, 200);
  assert.deepEqual([...nisko].sort(), [-1, MACHNIECIE].sort(), 'nisko: zwykła klatka albo krok');
  const wysokoBezGwiazdy = wyniki(L.progFigury() + 5, 180);
  assert.ok(!wysokoBezGwiazdy.has(GWIAZDA) && !wysokoBezGwiazdy.has(-1) && wysokoBezGwiazdy.has(SUPERMAN) && wysokoBezGwiazdy.has(NOZYCE));
  const szczyt = wyniki(200, 210);
  assert.ok(!szczyt.has(GWIAZDA) && szczyt.has(SUPERMAN) && !szczyt.has(-1), 'Gwiazda wyłączona');
  assert.equal(L.NAZWY_TRIKOW[SUPERMAN], 'Lot'); assert.ok(!L.NAZWY_TRIKOW.includes('Superman'));
});

test('lot: tylko gdy lądowanie i chwila po nim są wolne od przeszkód; figury bez lotu zostają', () => {
  const v = 600, t = L.czasDoZiemi(200, -280, 0.25), bez = L.czasDoZiemi(200, -280, 0);
  assert.ok(t > bez + 0.05, 'lot wydłuża skok: ' + bez + ' → ' + t);
  assert.equal(L.miejsceNaLot(200, -280, 0.25, [], v), true);
  assert.equal(L.miejsceNaLot(200, -280, 0.25, [v * t], v), false, 'przeszkoda na lądowaniu');
  assert.equal(L.miejsceNaLot(200, -280, 0.25, [v * (t + 0.25)], v), false, 'za mało czasu po lądowaniu');
  assert.equal(L.miejsceNaLot(200, -280, 0.25, [v * (t + 0.6)], v), true, 'daleko za lądowaniem');
  assert.equal(L.miejsceNaLot(200, -280, 0.25, [10], v), true, 'przeszkoda pod lotem: wyżej znaczy bezpieczniej');
  const s = new Set(); for (let i = 0; i < 1000; i++) s.add(L.figuraPoSalcie(200, 210, i / 1000, true));
  assert.ok(!s.has(SUPERMAN) && !s.has(NOZYCE) && s.has(MACHNIECIE) && !s.has(-1), [...s].join());
  const k = czytaj('js/cegielki.js');
  assert.match(k, /L\.figuraPoSalcie\(g\.y, g\.szczyt, Math\.random\(\), !L\.miejsceNaLot\(g\.y, g\.vy, 0\.25, przed, g\.v\)\)/);
});

test('czasy i lot: Lot 0,25 s, Nożyce 0,2 s z wolniejszym opadaniem; Gwiazda waga 0; krok w przód o 6–10% postaci, z pochyleniem', () => {
  const f = L.FIGURY;
  assert.equal(f[SUPERMAN].czas, 0.25); assert.equal(f[SUPERMAN].lot, true); assert.ok(f[SUPERMAN].kat > 0);
  assert.equal(f[NOZYCE].czas, 0.2); assert.equal(f[NOZYCE].lot, true);
  assert.equal(f[GWIAZDA].waga, 0, 'wyłączona');
  assert.ok(f[MACHNIECIE].przod >= 0.06 && f[MACHNIECIE].przod <= 0.1); assert.ok(f[MACHNIECIE].kat > 0);
  assert.ok(L.LOT_OPAD < F.SALTO_V / 2, 'opadanie wyraźnie wolniejsze');
});

test('silnik: figura tylko w powietrzu, po lądowaniu przysiad, napis zgodny z tym, co było widać', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /CZAS_SALTA = 0\.4,/);
  assert.match(s, /if \(g\.saltoT >= 1\) zacznijFigure\(g\); \}/);
  assert.match(s, /if \(g\.bud > 0 \|\| cechy\(\)\.wlasne\) return;/, 'kask i rower bez figur');
  assert.match(s, /if \(g\.trik >= 0 && L\.FIGURY\[g\.trik\]\.lot && g\.vy < -L\.LOT_OPAD\) g\.vy = -L\.LOT_OPAD;/);
  assert.doesNotMatch(s, /ustawPoze\("C"/, 'klatka figury nigdy na ziemi');
  assert.doesNotMatch(s, /Math\.floor\(Math\.random\(\) \* 5\)/, 'bez losowej nazwy czegoś, czego nie było');
  assert.match(s, /nrTriku >= 0 \? L\.NAZWY_TRIKOW\[nrTriku\] : "Salto"/);
  assert.match(s, /if \(!cechy\(\)\.wlasne\) g\.przysiad = CZAS_PRZYSIADU;/);
  assert.match(s, /x\.scale\(1 \+ 0\.05 \* pr, 1 - 0\.1 \* pr\)/);
  assert.match(s, /PRZENIK_S = 0\.07/);
});

test('przesunięcie figury to samo rysowanie: kolizje i zbieranie liczą dalej od graczX', () => {
  const s = czytaj('js/cegielki.js'), uzycia = s.split('\n').filter((l) => /efDx|efKat/.test(l));
  assert.ok(uzycia.length <= 4, uzycia.join('\n'));
  for (const l of uzycia) assert.doesNotMatch(l, /roznica|zuzyta|zaliczona|przeszkody|przedmioty/, l);
  assert.match(s, /xr = xs \+ g\.efDx;/);
});
