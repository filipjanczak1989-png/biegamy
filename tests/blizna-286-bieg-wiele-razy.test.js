/* BLIZNA 286 / 18.11: na bieg.html w „Jak to działa” (krok 3) zdanie o wielu startach:
   „Możesz biec wiele razy. Liczy się Twój najlepszy wynik z czasu biegu, a każdy kilometr idzie dla <imię>.”
   Imię zbiórki tylko z bazy (nazwa biegu „… dla <imię w dopełniaczu>”), nigdy w pliku strony ani modułu (blizna-235); bez niego zdanie bez imienia. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B;
test.before(async () => { await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL; });

test('zdanie z imieniem z nazwy biegu; bez imienia zdanie neutralne', () => {
  assert.equal(B.zdanieWieleRazy({ nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka' }), 'Możesz biec wiele razy. Liczy się Twój najlepszy wynik z czasu biegu, a każdy kilometr idzie dla Fabianka.');
  for (const b of [{ nazwa: 'Bieg próbny' }, null, {}, { nazwa: 'dla' }]) assert.equal(B.zdanieWieleRazy(b), 'Możesz biec wiele razy. Liczy się Twój najlepszy wynik z czasu biegu, a każdy kilometr liczy się do akcji.', JSON.stringify(b));
});

test('bieg.html: zdanie w kroku 3 „Jak to działa”, tylko textContent, imię nie w pliku', () => {
  const h = czytaj('bieg.html');
  assert.match(h, /<b>3\. Pobiegnij albo przejdź dystans, kiedy chcesz w czasie biegu<\/b><span>[^<]*<span id="bw-wiele-razy"><\/span><\/span>/);
  assert.match(h, /\$\('bw-wiele-razy'\)\.textContent = B\.zdanieWieleRazy\(bieg\);/);
  assert.doesNotMatch(h.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i);
});
