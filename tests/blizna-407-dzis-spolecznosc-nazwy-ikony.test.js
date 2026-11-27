// Blizna #407 (27.11.2026) — nowe Dziś, kafel „Społeczność” (K3): nazwy odznak z katalogów, ikony rodzajów, miejsce kafla.
//
// Nazwa odznaki nie może być surowym kodem („zly_kod”, „akcja-100”): bierzemy ją z katalogów, które już są:
//   bieg wirtualny (bieg-…) i akcja (akcja-…) z js/odznaki-akcji.mjs (BM_ODZNAKI_AKCJI.biegDef / nazwa), osobiste z BADGES w zawodnik.html.
//   Nieznana = „nowa odznaka”. Ikona rodzaju (rysunek z pigułki renderTypePill) była przed imieniem do blizna-414: na telefonie wyglądała
//   jak buźka, więc rodzaj zostaje samym słowem. Kafel stoi przed „Twoimi ostatnimi treningami” (makieta r5: kafel 6 z 7).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { strona, czytaj, MODUL } = require('./_dzis-nowy-strona.js');

const U = (n) => '0000000' + n + '-1111-4222-8333-44444444444' + n;
const odznakiAkcji = () => { const g = { console, Date, JSON, Math, String, Number, Object, Array, RegExp, encodeURIComponent, localStorage: { getItem: () => null } }; vm.createContext(g); vm.runInContext(czytaj('js/odznaki-akcji.mjs'), g); return g.BM_ODZNAKI_AKCJI; };
/** Prawdziwa renderTypePill wycięta z klienta (jak funkcje tygodnia w harnessie). */
const pigulka = () => {
  const k = czytaj('s' + 'b.js'), m = /  function renderTypePill\(type, opts\) \{[\s\S]*?\n  \}\n/.exec(k);
  if (!m) throw new Error('nie ma renderTypePill w kliencie');
  const g = { window: { escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';') } }; vm.createContext(g); vm.runInContext(m[0] + '\nwindow.renderTypePill = renderTypePill;', g); return g.window.renderTypePill;
};
const BADGES = (() => { const h = czytaj('zawodnik.html'), m = /\{id:'pierwszy_krok',\s*name:'([^']+)'/.exec(h); return [{ id: 'pierwszy_krok', name: m ? m[1] : null }, { id: 'zla_nazwa', name: '<img src=x>' }]; })();
const wiersz = (s, odznaka) => s.B.spolHtml({ osob: 0, km: 0, miasta: [], biegi: [], odznaka: { id: U(3), imie: 'Tomek', odznaka, kiedy: new Date().toISOString() } });

test('(1) kafel „Społeczność” stoi przed „Twoimi ostatnimi treningami”, po „Ten tydzień”', () => {
  const s = strona(); s.B.start();
  const kolej = [...s.korzen.innerHTML.matchAll(/data-kafel="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(kolej.slice(-3), ['tydzien', 'spol', 'lista']);
  assert.match(MODUL, /\["tydzien", "Ten tydzień"\], \["spol", "Społeczność"\], \["lista", "Twoje ostatnie treningi"\]\]/);
});

test('(2) nazwy odznak z katalogów: osobista z BADGES, akcja i bieg wirtualny z odznaki-akcji; nieznana = „nowa odznaka”, nigdy surowy kod', () => {
  assert.equal(BADGES[0].name, 'Pierwszy krok', 'BADGES w zawodnik.html ma tę odznakę');
  const s = strona(); s.w.BADGES = BADGES; s.w.BM_ODZNAKI_AKCJI = odznakiAkcji();
  assert.match(wiersz(s, 'pierwszy_krok'), /<b>Tomek<\/b> · odznaka „Pierwszy krok”/);
  assert.match(wiersz(s, 'akcja-100'), /odznaka „100 km akcji”/, 'nazwa z js/odznaki-akcji.mjs');
  assert.match(wiersz(s, 'bieg-bieg-mikolajki'), /odznaka „Bieg wirtualny”/, 'bieg wirtualny bez zapamiętanej nazwy biegu');
  for (const kod of ['zly_kod', 'akcja-nieznana', '']) {
    const h = wiersz(s, kod); assert.match(h, /<b>Tomek<\/b> · nowa odznaka/); if (kod) assert.doesNotMatch(h, new RegExp(kod));
  }
  assert.match(wiersz(s, 'zla_nazwa'), /odznaka „&lt;img src=x&gt;”/, 'nazwa z katalogu też przez esc');
  const bez = strona();   // bez katalogów (np. w atrapie): tylko „nowa odznaka”
  assert.match(wiersz(bez, 'pierwszy_krok'), /nowa odznaka/);
});

test('(3) od blizna-414 bez ikony rodzaju: nawet z pigułką w kliencie wiersz zaczyna się od imienia, rodzaj zostaje słowem', () => {
  const s = strona(); let wolania = 0; const p = pigulka(); s.w.renderTypePill = (...a) => { wolania++; return p(...a); };
  const h = s.B.spolHtml({ osob: 1, km: 5, miasta: [], biegi: [{ id: U(1), imie: 'Kasia', miasto: null, rodzaj: 'Wybieganie', km: 10.2, kiedy: new Date().toISOString() }] });
  assert.match(h, /<span class="dn-sp-t"><b>Kasia<\/b> · wybieganie 10,2 km/);
  assert.doesNotMatch(h, /<svg(?! class="dn-svg")/, 'jedyny rysunek w kaflu to medal odznaki (tu go nie ma)');
  assert.equal(wolania, 0, 'kafel nie woła pigułki rodzaju');
  const zly = s.B.spolHtml({ osob: 1, km: 5, miasta: [], biegi: [{ id: U(1), imie: 'K', miasto: null, rodzaj: '<b>"x', km: 1, kiedy: new Date().toISOString() }] });
  assert.match(zly, /<b>K<\/b> · &lt;b&gt;&quot;x 1,0 km/, 'rodzaj od ludzi tylko jako tekst przez esc');
});

test('(4) „x temu”: przed chwilą, minuty, godziny, wczoraj, dni', () => {
  const T = strona().B.temu, t0 = Date.UTC(2026, 10, 27, 12, 0, 0), iso = (ms) => new Date(t0 - ms).toISOString();
  assert.equal(T(iso(30e3), t0), 'przed chwilą'); assert.equal(T(iso(5 * 60e3), t0), '5 min temu'); assert.equal(T(iso(125 * 60e3), t0), '2 h temu');
  assert.equal(T(iso(30 * 3600e3), t0), 'wczoraj'); assert.equal(T(iso(3 * 86400e3), t0), '3 dni temu'); assert.equal(T('zle', t0), '');
});
