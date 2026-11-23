/* BLIZNA 342 (23.11): index.html przekierowywał zalogowanego przez location.href — strona startowa zostawała w historii, a wstecz z Dziś wracało na
   index.html, który z sesją znowu przekierowywał na Dziś. Pułapka przy wyjściu z polityki prywatności, regulaminu i 404 („Wróć do strony głównej”,
   „Wróć na trasę”), po logowaniu i po rejestracji. Teraz redirectUser i przekierowanie po rejestracji idą przez location.replace. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const IX = czytaj('index.html');
function funkcja(zrodlo, nazwa) {
  let i = zrodlo.indexOf('function ' + nazwa + '('); assert.ok(i >= 0, 'brak ' + nazwa);
  if (zrodlo.slice(i - 6, i) === 'async ') i -= 6;
  let g = 0, j = zrodlo.indexOf('{', i);
  for (; j < zrodlo.length; j++) { if (zrodlo[j] === '{') g++; else if (zrodlo[j] === '}' && --g === 0) break; }
  return zrodlo.slice(i, j + 1);
}
const KOD = funkcja(IX, 'celZawodnika') + '\n' + funkcja(IX, 'redirectUser');

async function przekieruj({ rola = null, trener = false, hash = '', bladTabeli = false } = {}) {
  const zd = [];
  const location = { hash, replace: (u) => zd.push('replace:' + u), assign: (u) => zd.push('ASSIGN:' + u) };
  Object.defineProperty(location, 'href', { set: (u) => zd.push('HREF:' + u), get: () => 'https://biegamy.run/index.html' + hash });
  const ch = { select() { return ch; }, eq() { return ch; }, maybeSingle: async () => { if (bladTabeli) throw new Error('x'); return { data: trener ? { id: 'u1' } : null }; } };
  const ctx = { window: { location }, location, sb: { from: () => ch } };
  vm.runInNewContext(KOD + '\nthis.wynik = redirectUser({ id: "u1", user_metadata: ' + JSON.stringify(rola ? { role: rola } : {}) + ' });', ctx);
  await ctx.wynik;
  return zd.join(',');
}

test('redirectUser: zawodnik, trener (metadane i tabela), #sponsor — zawsze location.replace, nigdy nowy wpis', async () => {
  assert.equal(await przekieruj(), 'replace:zawodnik.html', 'zawodnik');
  assert.equal(await przekieruj({ hash: '#sponsor' }), 'replace:zawodnik.html#sponsor', 'sponsor z hashem (blizna-106)');
  assert.equal(await przekieruj({ rola: 'coach' }), 'replace:trener.html', 'trener z metadanych');
  assert.equal(await przekieruj({ rola: 'trener' }), 'replace:trener.html');
  assert.equal(await przekieruj({ trener: true }), 'replace:trener.html', 'trener z tabeli coaches');
  assert.equal(await przekieruj({ bladTabeli: true }), 'replace:zawodnik.html', 'błąd odczytu → zawodnik, też bez wpisu');
});

test('index.html: sesja, logowanie, reset hasła i baner „kontynuuj” idą przez redirectUser; rejestracja też przez replace; zero location.href na Dziś/panel', () => {
  assert.match(IX, /if \(session\) \{\n\s*\/\/[^\n]*\n\s*redirectUser\(session\.user\);/, 'sesja przy wejściu');
  assert.match(IX, /\n  redirectUser\(data\.user\);\n\}/, 'po logowaniu');
  assert.match(IX, /setTimeout\(\(\) => redirectUser\(data && data\.user \? data\.user : \{\}\), 900\);/, 'po resecie hasła');
  assert.match(IX, /if \(window\._activeSession\) redirectUser\(window\._activeSession\.user\);/, 'baner „kontynuuj”');
  assert.match(IX, /window\.location\.replace\(selectedRole === 'coach' \? 'trener\.html' : celZawodnika\(true\)\);/, 'rejestracja z automatycznym logowaniem');
  assert.doesNotMatch(IX, /location\.href\s*=\s*(celZawodnika|'trener\.html'|'zawodnik\.html|selectedRole)/, 'żadnego przekierowania zalogowanego z nowym wpisem');
});

/* Model historii: wyjście z polityki prywatności / regulaminu / 404 na stronę startową i wstecz w telefonie z Dziś. */
test('wyjście na stronę startową i wstecz z Dziś: bez pułapki index ↔ Dziś', async () => {
  const kierunek = await przekieruj();
  assert.match(kierunek, /^replace:/);
  for (const skad of ['privacy.html', 'privacy-en.html', 'terms.html', '404.html']) {
    const stos = ['zawodnik.html', skad]; let i = 1;
    stos.splice(i + 1); stos.push('index.html'); i++;                           // „‹” / „Wróć do strony głównej” / „Wróć na trasę” = link na index.html
    stos[i] = kierunek.slice('replace:'.length);                                 // index z sesją: replace na Dziś
    assert.deepEqual(stos, ['zawodnik.html', skad, 'zawodnik.html'], skad + ': index nie został w historii');
    i--; assert.equal(stos[i], skad, skad + ': wstecz z Dziś wraca na stronę, z której wyszliśmy, nie na index');
  }
  for (const [plik, wzor] of [['privacy.html', /<a class="back-btn" href="index\.html">‹<\/a>/], ['privacy-en.html', /<a class="back-btn" href="index\.html">‹<\/a>/],
    ['terms.html', /<a class="back-home" href="index\.html">/], ['404.html', /<a class="btn" href="\/index\.html">Wróć na trasę<\/a>/]]) assert.match(czytaj(plik), wzor, plik + ': wyjście prowadzi na stronę startową');
});
