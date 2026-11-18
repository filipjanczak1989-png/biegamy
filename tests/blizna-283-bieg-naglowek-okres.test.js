/* BLIZNA 283 / 18.11: bieg trwa 19 dni (18.11–6.12), nie weekend.
   - zdanie pod datą w fazie „trwa”: „Bieg trwa do <dzien_do>. Zapisz się i pobiegnij, kiedy chcesz.” (data z bazy; bez daty: bez daty);
   - nagłówek bieg.html bez grafiki START·META (jesienna, biegacze „płynęli”): sam ciemny pasek z „‹ Ulica akcji”; zimowa/mikołajkowa później;
   - żaden tekst dla ludzi w bieg.html i js/bieg.mjs nie mówi o weekendzie ani o sobocie–niedzieli (komentarze się nie liczą). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const bezKomentarzy = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
let B;
test.before(async () => { await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL; });

test('faza „trwa”: zdanie z końcem biegu z bazy', () => {
  const n = B.naglowekStanu({ faza: 'trwa', dzien_od: '2026-11-18', dzien_do: '2026-12-06' }, 'przed');
  assert.equal(n.chip, 'BIEG TRWA');
  assert.equal(n.zdanie, 'Bieg trwa do 6 grudnia. Zapisz się i pobiegnij, kiedy chcesz.');
  assert.equal(B.naglowekStanu({ faza: 'trwa' }, 'przed').zdanie, 'Bieg trwa. Zapisz się i pobiegnij, kiedy chcesz.', 'bez daty: bez daty');
  assert.equal(B.naglowekStanu({ faza: 'zapisy', dzien_do: '2026-12-06' }, 'przed').zdanie, 'Zapisy trwają. Dołącz, zanim ruszy bieg.', 'inne fazy bez zmian');
  assert.equal(B.naglowekStanu({ faza: 'trwa', dzien_do: '2026-12-06' }, 'blad').zdanie, '', 'błąd licznika: bez zdania');
});

test('nagłówek bieg.html: bez grafiki, sam przycisk „‹ Ulica akcji”', () => {
  const h = czytaj('bieg.html');
  const hero = (/<div class="bw-hero">([\s\S]*?)<\/div>/.exec(h) || [])[1] || '';
  assert.equal(hero, '<a class="bw-wroc" id="bw-wroc" href="dla-fabianka.html">‹ Ulica akcji</a>');
  assert.doesNotMatch(bezKomentarzy(h), /bw-wzgorza|bw-droga|bw-przod|bw-kibice|bieg-kibice\.svg|assets\/ulica\//, 'bez jesiennej sceny w nagłówku');
  assert.match(h, /obrazek\('assets\/bieg\/bieg-brama\.svg'\)/, 'brama zostaje na numerze startowym (canvas)');
});

test('bez „weekendu” i „soboty–niedzieli” w tekstach strony i modułu', () => {
  for (const p of ['bieg.html', 'js/bieg.mjs']) assert.doesNotMatch(bezKomentarzy(czytaj(p)), /weekend|sobot[aęy]\s*[–-]\s*niedziel|w sobotę i niedzielę/i, p);
});
