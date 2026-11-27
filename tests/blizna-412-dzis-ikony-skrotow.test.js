// Blizna #412 (27.11.2026) — nowe Dziś, paczka I1: ikony skrótów jednym językiem z dolnym menu.
//
// Skróty (Ciało, Odżywianie, Starty, Wyzwania, Odznaki, Radio, Czat, Gra) były kolorowymi obrazkami-emotkami (8 plików .webp,
// ok. 23 kB na pierwszym ekranie), a dolne menu rysuje kreską (ścieżki Feather w window.NAV, siatka 24, zaokrąglone końce i łączenia,
// 22 px, kreska 1,7). Teraz skróty to inline SVG z Lucide 1.72.0 (kontynuacja Feathera; licencja ISC, „radio” z Feather na MIT,
// tekst w LICENSES/lucide.txt): zero plików i zapytań, kreska 1,6 przy 24 px = na ekranie ta sama grubość co menu.
// Bez powtórek z menu: jabłko ma „Jedzenie”, więc Odżywianie dostaje sztućce; Czat to okrągły dymek, menu ma kwadratowy.
// Stare pliki .webp zostają w repo (decyzja Filipa: nie kasujemy), nowe Dziś pobiera z nich tylko dzwonek.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { strona, czytaj, MODUL } = require('./_dzis-nowy-strona.js');

const KLIENT = czytaj('s' + 'b.js');
const MAPA = /  var IKONY_SVG = \{\n([\s\S]*?)\n  \};/.exec(MODUL);
const IKONY = Object.fromEntries([...MAPA[1].matchAll(/^    ([a-z]+): '([^']*)'/gm)].map((m) => [m[1], m[2]]));
const NAV = (() => { const m = /_ic: \{([\s\S]*?)\n    \},/.exec(KLIENT); return Object.fromEntries([...m[1].matchAll(/([a-z]+):'([^']*)'/g)].map((x) => [x[1], x[2]])); })();
const GLOWA = '<svg class="dn-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';

test('(1) osiem skrótów to inline SVG w kółku, w tej kolejności; żadnego obrazka w skrótach', () => {
  const s = strona(); s.B.start();
  const nav = /<nav class="dn-skroty"[\s\S]*?<\/nav>/.exec(s.korzen.innerHTML)[0];
  assert.doesNotMatch(nav, /<img|\.webp/, 'zero plików w skrótach');
  const ikony = [...nav.matchAll(/<span class="dn-krazek">(<svg [^>]*>)[\s\S]*?<\/svg><\/span><span>([^<]+)<\/span>/g)];
  assert.deepEqual(ikony.map((m) => m[2]), ['Ciało', 'Odżywianie', 'Starty', 'Wyzwania', 'Odznaki', 'Radio', 'Czat', 'Gra'], 'podpisy bez zmian');
  for (const m of ikony) assert.equal(m[1], GLOWA, m[2] + ': siatka 24, kreska 1,6, zaokrąglone końce i łączenia, kolor z CSS, ukryta dla czytnika');
  assert.deepEqual(JSON.parse(JSON.stringify(s.B.SKROTY)).map((x) => x[2]), ['biceps', 'sztucce', 'flaga', 'puchar', 'medal', 'radio', 'dymek', 'pad']);
});

test('(2) ścieżki: Lucide 1.72.0 bez zmian (przypięte skrótem), same kształty, nic aktywnego', () => {
  assert.equal(crypto.createHash('sha256').update(MAPA[1]).digest('hex').slice(0, 16), 'c028d285f54ed363', 'zmiana ścieżek = świadoma decyzja i nowy skrót');
  assert.deepEqual(Object.keys(IKONY), ['biceps', 'sztucce', 'flaga', 'puchar', 'medal', 'radio', 'dymek', 'pad']);
  for (const [k, v] of Object.entries(IKONY)) {
    assert.match(v, /^(<(path|circle|line|rect|polyline) [^<>]*\/>)+$/, k + ': same proste kształty');
    for (const a of v.matchAll(/ ([a-z0-9-]+)="/g)) assert.ok(['d', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'rx', 'points'].includes(a[1]), k + ': atrybut ' + a[1]);
  }
  const B = strona().B; assert.equal(typeof B.ikonaSvg, 'undefined', 'funkcja wewnętrzna');
  assert.match(MODUL, /return Object\.prototype\.hasOwnProperty\.call\(IKONY_SVG, nazwa\) \?/, 'nieznana nazwa (także __proto__) = pusty napis');
});

test('(3) jeden język z dolnym menu: te same założenia rysunku, ta sama grubość kreski na ekranie, bez powtórek ikon menu', () => {
  assert.match(KLIENT, /_svg: function\(k\)\{ return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">'/, 'menu: siatka 24, zaokrąglenia');
  const css = czytaj('theme.css'), m = /\.nav-it svg\{width:22px;height:22px;stroke:var\(--muted\);stroke-width:([0-9.]+);/.exec(css);
  assert.ok(m, 'kreska menu w theme.css');
  assert.ok(Math.abs(1.6 - Number(m[1]) * 22 / 24) < 0.05, 'na ekranie: ' + (Number(m[1]) * 22 / 24).toFixed(2) + ' px w menu, 1,6 px w skrótach');
  for (const [k, v] of Object.entries(IKONY)) for (const [n, w] of Object.entries(NAV)) assert.notEqual(v, w, k + ' powtarza ikonę menu ' + n);
  assert.notEqual(IKONY.sztucce, NAV.food, 'Odżywianie nie powtarza jabłka z „Jedzenie”');
  assert.notEqual(IKONY.dymek, NAV.msgs, 'Czat: okrągły dymek, nie kwadratowy z menu');
});

test('(4) wygląd: kółko 48 px jak dotąd, tło #17161b, obwódka 1 px rgba(255,255,255,.08), ikona 24 px #f5f3ef; dotknięcie = obwódka akcentu; cel ≥ 44 px', () => {
  assert.match(MODUL, /#dzis-nowy \.dn-skrot \.dn-krazek\{width:48px;height:48px;box-sizing:border-box;border-radius:50%;background:#17161b;border:1px solid rgba\(255,255,255,\.08\);display:flex;align-items:center;justify-content:center;color:#f5f3ef;transition:border-color \.15s\}/);
  assert.match(MODUL, /#dzis-nowy \.dn-skrot:active \.dn-krazek,#dzis-nowy \.dn-skrot:focus-visible \.dn-krazek\{border-color:#ff7a45\}/);
  assert.match(MODUL, /#dzis-nowy \.dn-svg\{display:block;width:24px;height:24px;flex:none\}/);
  assert.match(MODUL, /#dzis-nowy \.dn-skrot\{min-width:0;min-height:72px;/, 'cel dotyku 72 px wysokości');
  const s = strona(); s.B.start();
  assert.equal(typeof s.korzen._zd.touchstart, 'function', 'iOS pokazuje :active tylko przy nasłuchu dotyku');
});

test('(5) Społeczność: medal w wierszu odznaki to ten sam SVG (zero plików)', () => {
  const h = strona().B.spolHtml({ osob: 0, km: 0, miasta: [], biegi: [], odznaka: { id: '00000003-1111-4222-8333-444444444443', imie: 'Tomek', odznaka: 'x', kiedy: new Date().toISOString() } });
  assert.ok(h.includes('<span class="dn-sp-av dn-sp-medal" aria-hidden="true">' + GLOWA + IKONY.medal + '</svg></span>'));
  assert.doesNotMatch(h, /\.webp/);
});

test('(6) licencja: ISC Lucide i MIT Feather (radio) w LICENSES/lucide.txt, wersja paczki w komentarzu modułu', () => {
  const l = czytaj('LICENSES/lucide.txt');
  assert.match(l, /lucide-static@1\.72\.0/);
  assert.match(l, /^ISC License$/m); assert.match(l, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
  assert.match(l, /Permission to use, copy, modify, and\/or distribute this software for any\npurpose with or without fee is hereby granted, provided that the above\ncopyright notice and this permission notice appear in all copies\./);
  assert.match(l, /derived from the Feather project:[\s\S]*\bradio\b/); assert.match(l, /The MIT License \(MIT\)/); assert.match(l, /Cole Bemis/);
  assert.match(MODUL, /Lucide 1\.72\.0 \(lucide\.dev\), licencja ISC; „radio” Lucide wywodzi z Feather \(MIT\)\.\n\s+Tekst obu licencji: LICENSES\/lucide\.txt\./);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets/ui/dzis/ikony/hantla-64.webp')), 'stare pliki zostają (nie kasujemy)');
});
