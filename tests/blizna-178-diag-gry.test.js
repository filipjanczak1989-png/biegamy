/* BLIZNA 178 / DIAGNOSTYKA GRY (Filip 5.11): liczby z końca rundy („przemiana maks… klatek…”) to narzędzie do pomiaru na telefonie, nie tekst dla gracza.
   Było: parametry.has("diag"), więc pokazywały się na produkcji każdemu z ?diag w adresie, także przy ?diag=0.
   Jest: tylko dokładnie ?diag=1 i nigdy na stronie publicznej. Po skutku: przeglądarka z fałszywym hostem (narzędzie poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;

test('diagnostyka: tylko ?diag=1 i tylko poza stroną publiczną', () => {
  assert.equal(typeof L.diagWlaczony, 'function');
  for (const [adres, host, wynik] of [
    ['?diag=1', '127.0.0.1', true],
    ['?diag=1', 'localhost', true],
    ['?diag=1', '192.168.8.101', true],
    ['?test&poziom=20&diag=1', '192.168.8.101', true],
    ['', '127.0.0.1', false],
    ['?diag', '127.0.0.1', false],
    ['?diag=0', '127.0.0.1', false],
    ['?diag=true', '127.0.0.1', false],
    ['?diag=1', 'biegamy.run', false],
    ['?diag=1', 'www.biegamy.run', false],
    ['?diag=1', 'run.biegamy.app', false],
    ['?diag', 'biegamy.run', false],
    ['', 'biegamy.run', false],
    ['?diag=1', '', true],
  ]) assert.equal(L.diagWlaczony(adres, host), wynik, JSON.stringify([adres, host]));
});

test('gra: licznik i tekst włącza tylko ta bramka, tekst idzie tylko na koniec rundy', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /var DIAG = L\.diagWlaczony\(location\.search, location\.hostname\) \?/);
  assert.doesNotMatch(s, /parametry\.(has|get)\("diag"\)/, 'żadnej drugiej drogi do włączenia');
  assert.equal(s.match(/diagTekst\(\)/g).length, 2, 'definicja i jedno użycie');
  assert.match(s, /\$\("k-info"\)\.textContent = DIAG \? diagTekst\(\) : "";/);
  assert.equal(s.match(/"Diag: /g).length, 1, 'napis diagnostyczny w jednym miejscu');
  assert.match(czytaj('gra-cegielki.html'), /<p id="k-info" role="status"><\/p>/, 'na starcie pusto');
});
