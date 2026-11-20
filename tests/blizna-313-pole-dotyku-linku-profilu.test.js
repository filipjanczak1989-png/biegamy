/* BLIZNA 313 / 20.11: pole dotyku linku do profilu na liście „Ukończyli” miało 35 px (padding 8 px). Teraz ≥ 44 px bez zmiany wyglądu wiersza:
   padding pionowy P i ujemny margines −M, gdzie P − M = 8 px (wiersz zajmuje tyle co przy 8 px), plus min-height 44 px przy box-sizing: border-box.
   Pomiar w przeglądarce (360 px, Downloads\biegamy-podglady\kolejka-1611\29-v8\pole-dotyku.cjs): link 45 px, wiersze tej samej wysokości,
   zrzut sekcji bajt w bajt jak z main (kontrola main z main: 0 różnic), góra i dół pola trafiają w link. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('link do profilu: min-height 44 px, padding − margines = 8 px (wiersz bez zmian), reszta wyglądu jak w v8', () => {
  const css = (czytaj('bieg.html').match(/\.bw-imie-link \{([^}]*)\}/) || [])[1];
  assert.ok(css, 'reguła .bw-imie-link');
  const w = (nazwa) => { const m = new RegExp('(?:^|;)\\s*' + nazwa + ':\\s*([^;]+)').exec(css); return m ? m[1].trim() : null; };
  assert.equal(w('display'), 'inline-block'); assert.equal(w('box-sizing'), 'border-box'); assert.equal(w('min-height'), '44px');
  const p = /^(\d+)px 0$/.exec(w('padding')), m = /^-(\d+)px 0$/.exec(w('margin'));
  assert.ok(p && m, 'padding „Npx 0” i margines „-Mpx 0”: ' + w('padding') + ' / ' + w('margin'));
  assert.equal(Number(p[1]) - Number(m[1]), 8, 'wiersz zajmuje tyle co przy padding 8 px');
  assert.ok(19 + 2 * Number(p[1]) >= 44, 'przy linii 19 px (Inter 14 px, zmierzone) pole ≥ 44 px bez udziału min-height');
  assert.equal(w('color'), 'inherit'); assert.equal(w('text-decoration'), 'underline'); assert.equal(w('text-underline-offset'), '3px');
  assert.match(czytaj('js/bieg.mjs'), /<a class="bw-imie-link" href="' \+ linkProfilu\(u\) \+ '" data-profil>/);
});
