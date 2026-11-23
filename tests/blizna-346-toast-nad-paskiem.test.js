/* BLIZNA 346 (23.11): toast z sb.js (window.showToast) stał na bottom:24px — na stronach z dolnym paskiem (Dziś) leżał na pasku; lokalny toast
   Kalendarza Startów (100 px) dotykał poświaty logo „Log”. Teraz JEDNO miejsce w sb.js: przy każdym toaście, gdy na stronie jest WIDOCZNY .bottom-nav,
   toast idzie na 116 px + safe area (pasek ~89 px; kółko logo wystaje nad pasek ~3 px, jego poświata — cień 20 px — wyżej), jak w Wynikach (blizna-344).
   Strona bez paska albo z ukrytym paskiem: 24 px jak dotąd. Zmierzone 23.11 na atrapie 360×800: pasek od 711 px, kółko logo od 708, toast po zmianie do 684.
   Kalendarz Startów: lokalny toast też 116 px. Wyniki zostają przy swoim. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb, zamrozTimery } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const NAD = 'bottom:calc(116px + env(safe-area-inset-bottom, 0px));';

function toast({ paski = [], bladDom = false, typ } = {}) {
  const ctx = zamrozTimery(zaladujSb());
  const dodane = [];
  ctx.document = {
    createElement: (tag) => ({ tag, style: {}, textContent: '', remove() {} }),
    body: { appendChild: (e) => { dodane.push(e); return e; } },
    querySelectorAll: (s) => { if (bladDom && s === '.bottom-nav') throw new Error('atrapa: błąd odczytu paska'); return s === '.bottom-nav' ? paski.map((widoczny) => ({ getClientRects: () => (widoczny ? [{}] : []) })) : []; },
    querySelector: () => null, getElementById: () => null, addEventListener() {}, removeEventListener() {},
  };
  ctx.showToast('Zapisano.', typ);
  assert.equal(dodane.length, 1, 'jeden toast w DOM');
  return dodane[0];
}

test('sb.js window.showToast: nad widocznym paskiem 116 px + safe area; bez paska, z ukrytym paskiem i przy błędzie odczytu 24 px', () => {
  assert.match(toast().style.cssText, /^position:fixed;bottom:24px;left:50%;/, 'strona bez paska — bez zmian');
  assert.ok(toast({ paski: [true] }).style.cssText.startsWith('position:fixed;' + NAD), 'widoczny pasek');
  assert.match(toast({ paski: [false] }).style.cssText, /bottom:24px;/, 'ukryty pasek (np. w pełnoekranowym widoku)');
  assert.ok(toast({ paski: [false, true] }).style.cssText.includes(NAD), 'mini-pasek ukryty, główny widoczny');
  assert.match(toast({ bladDom: true }).style.cssText, /bottom:24px;/, 'błąd odczytu DOM — po staremu, bez wyjątku');
  const t = toast({ paski: [true], typ: 'error' });
  assert.equal(t.textContent, 'Zapisano.'); assert.match(t.style.cssText, /background:rgba\(232,86,30,0\.95\)/, 'kolor typu bez zmian');
  assert.match(t.style.cssText, /z-index:99999;/);
});

test('sb.js: wysokość liczona przy każdym toaście z widocznego .bottom-nav; Kalendarz Startów 116 px; Wyniki przy swoim toaście', () => {
  const SB = czytaj('sb.js');
  assert.ok(SB.includes("'position:fixed;bottom:' + dol + ';left:50%;transform:translateX(-50%);'"));
  assert.ok(SB.includes("document.querySelectorAll('.bottom-nav'), function(n){ return n.getClientRects().length > 0; })) dol = 'calc(116px + env(safe-area-inset-bottom, 0px))';"));
  assert.match(czytaj('races.html'), /\.toast\{\n  position:fixed;bottom:calc\(116px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  const W = czytaj('wyniki.html');
  assert.match(W, /\.toast\{position:fixed;bottom:calc\(116px \+ env\(safe-area-inset-bottom, 0px\)\);/); assert.doesNotMatch(W, /window\.showToast\(/);
});
