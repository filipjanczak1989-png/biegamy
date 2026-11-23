/* BLIZNA 344 (23.11): Wyniki (wyniki.html) nie miały dolnego paska — z karty zawodnika czy ekranu imprezy do aplikacji wracało się tylko „‹ Wstecz”.
   Teraz pasek jak w Kalendarzu Startów (blizna-339): window.NAV z sb.js, bez podświetlenia (Wyników nie ma w menu), rola jak w races.html, montowany
   po rozpoznaniu roli — także gdy maszyna wyników jest niedostępna. Koniec treści (tabela imprezy, „‹ Poprzednie / Następne ›”, „Usuń moje wyniki”)
   i toast stoją nad paskiem: window.showToast z sb.js rysuje toast na bottom:24px, czyli na pasku, więc Wyniki mają własny w tym samym wyglądzie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const funkcja = (zrodlo, nazwa) => { const i = zrodlo.indexOf('function ' + nazwa + '('); assert.ok(i >= 0, 'brak ' + nazwa); let g = 0, j = zrodlo.indexOf('{', i);
  for (; j < zrodlo.length; j++) { if (zrodlo[j] === '{') g++; else if (zrodlo[j] === '}' && --g === 0) break; } return zrodlo.slice(i, j + 1); };
const W = czytaj('wyniki.html');

test('wyniki.html: jeden korzeń paska przed skryptem strony; montowanie po rozpoznaniu roli, przed sprawdzeniem maszyny wyników', () => {
  assert.equal((W.match(/<div id="nav-mount"><\/div>/g) || []).length, 1);
  assert.ok(W.indexOf('<div id="nav-mount"></div>') < W.indexOf('<script>\n(function () {'), 'korzeń istnieje, zanim init go szuka');
  const rola = W.indexOf("_isCoach = !!(c && c.data);"), mont = W.indexOf('    mountNav();   // 23.11'), maszyna = W.indexOf("window.wynikiApiDostepne())) { ekran.innerHTML");
  assert.ok(rola > 0 && mont > rola, 'pasek po rozpoznaniu roli');
  assert.equal((W.match(/(^|[^\w])mountNav\(\);/gm) || []).length, 1, 'dokładnie jedno montowanie (bez paska „na zapas” przed rolą)');
  assert.ok(maszyna > mont, 'pasek także przy niedostępnej maszynie wyników');
  assert.ok(W.indexOf("if (!sesja) {") < rola, 'bez sesji strona idzie na logowanie, zanim cokolwiek czyta');
});

test('mountNav: pasek zawodnika albo trenera jak w races.html, bez podświetlenia; bez NAV i bez korzenia nic się nie psuje', () => {
  const sbCtx = zaladujSb();
  sbCtx.location = { pathname: '/wyniki.html', search: '' };   // NAV._here() czyta adres bieżącej strony
  const NAV = sbCtx.NAV, KOD = funkcja(W, 'mountNav');
  const uruchom = ({ isCoach = false, athleteId = null, referrer = '', bezNav = false, bezKorzenia = false }) => {
    const m = { innerHTML: '' };
    const ctx = { window: bezNav ? {} : { NAV }, document: { referrer }, URL, $: (id) => (id === 'nav-mount' && !bezKorzenia ? m : null), _isCoach: isCoach, _athleteId: athleteId };
    vm.runInNewContext(KOD + '\nmountNav();', ctx);
    return m.innerHTML;
  };
  const zaw = uruchom({ athleteId: 'a1' });
  assert.match(zaw, /^<nav class="bottom-nav">/); assert.match(zaw, /href="zawodnik\.html"/); assert.match(zaw, /href="profil\.html\?id=a1"/);
  assert.doesNotMatch(zaw, / active|trener\.html/, 'bez podświetlenia, pasek zawodnika');
  assert.match(uruchom({ isCoach: true }), /href="trener\.html"/, 'trener bez wiersza zawodnika');
  assert.match(uruchom({ isCoach: true, athleteId: 'a1', referrer: 'https://biegamy.run/races.html' }), /href="profil\.html\?id=a1"/, 'trener + zawodnik z Kalendarza Startów → zawodnik');
  const zTrenera = uruchom({ isCoach: true, athleteId: 'a1', referrer: 'https://biegamy.run/trener.html' });
  assert.match(zTrenera, /href="trener\.html"/); assert.doesNotMatch(zTrenera, /profil\.html\?id=a1/, 'z panelu trenera → pasek trenera, bez id');
  assert.equal(uruchom({ athleteId: 'a1', bezNav: true }), '', 'bez NAV — pusto, bez wyjątku');
  assert.equal(uruchom({ athleteId: 'a1', bezKorzenia: true }), '', 'bez korzenia — nic');
});

test('koniec treści i toast nad paskiem: odstęp 112 px, własny toast na 116 px (window.showToast z sb.js stoi na pasku)', () => {
  assert.match(W, /#content\{padding:12px 16px calc\(112px \+ env\(safe-area-inset-bottom, 0px\)\);max-width:640px;margin:0 auto;\}/);
  assert.match(W, /\.toast\{position:fixed;bottom:calc\(116px \+ env\(safe-area-inset-bottom, 0px\)\);[^}]*z-index:99999;[^}]*opacity:0;/, 'nad paskiem (~89 px) i nad poświatą logo „Log” (przy 100 px toast jej dotykał)');
  assert.match(W, /\.toast\.show\{opacity:1;/);
  assert.match(W, /<div class="toast" id="toast" role="status"><\/div>/);
  assert.doesNotMatch(W, /window\.showToast\(/, 'Wyniki nie wołają toastu z sb.js');
  const zegar = [], el = { textContent: '', klasy: new Set() };
  el.classList = { add: (k) => el.klasy.add(k), remove: (k) => el.klasy.delete(k) };
  const ctx = { $: (id) => (id === 'toast' ? el : null), setTimeout: (f) => { zegar.push(f); return zegar.length; }, clearTimeout() {} };
  vm.runInNewContext('var _toastCzas = null;\n' + funkcja(W, 'showToast') + '\nshowToast("Link skopiowany.");', ctx);
  assert.equal(el.textContent, 'Link skopiowany.'); assert.ok(el.klasy.has('show'), 'widoczny');
  zegar.forEach((f) => f()); assert.ok(!el.klasy.has('show'), 'znika sam');
});
