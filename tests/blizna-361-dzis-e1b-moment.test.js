// Blizna #361 (25.11.2026) — nowe Dziś, E1b: Silnik Momentu bez wejścia.
//
// Animacja momentu (silnik-anim.js) i karta momentu dopinają się do body i działają na każdym ekranie. Wejście do nich jest
// jedno: przycisk „Nowy moment!” (#moment-baner) w górnym pasku starego ekranu, odsłaniany przez loadMomenty po initAuth.
// Nowe Dziś chowa ten pasek, więc konto z nowym Dziś miało zatwierdzony moment i żadnego sposobu, żeby go na Dziś zobaczyć.
// Poprawka: pasek zdarzenia pod nagłówkiem odbija stan starego przycisku, a dotknięcie woła jego kliknięcie. Logika kolejki,
// animacji i zapisu shown_at zostaje w jednym miejscu, zero nowych zapytań.
// Lekcja z awarii 25.11: stary przycisk bywa odsłonięty PÓŹNIEJ niż start modułu (initAuth) albo wcześniej; test sprawdza obie kolejności.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const MODUL = czytaj('js/dzis-nowy.mjs');
const HTML = czytaj('zawodnik.html');
const PASEK_ZEGARKA = '<div class="wc-pasek" data-klucz="k"><span>⌚ Połączenie wygasło.</span><button type="button">✕</button></div>';

function strona({ search = '', display = 'none', bezPrzycisku = false } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, obserwowane = [], zapytania = [];
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: /zegarek|zdarzenie|licznik/.test(sel), _a: {}, removeAttribute() {}, querySelector(s2) { return wezel(sel + ' ' + s2); } });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; } };
  const przycisk = { style: { display }, klikniec: 0, click() { this.klikniec++; this.style.display = 'none'; if (this.poKliknieciu) this.poKliknieciu(); } };   // stary onclick chowa przycisk od razu
  const staryPasek = { innerHTML: '' };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'watch-pasek-slot': staryPasek };
  if (!bezPrzycisku) el['moment-baner'] = przycisk;
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {}, showSection(n) { this._currentSection = n; }, _logKlienta() {},
    MutationObserver: function (f) { this.observe = (cel, opcje) => obserwowane.push([cel, f, opcje]); },
    sb: { from: () => { zapytania.push('from'); return new Promise(() => {}); }, rpc: () => { zapytania.push('rpc'); return new Promise(() => {}); }, auth: { getSession: () => new Promise(() => {}) } } };
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date, Promise });
  const pasek = wezel('[data-dn="zdarzenie"]');
  const zmiana = (cel) => obserwowane.filter(([c]) => c === cel).forEach(([, f]) => f());
  const dotknij = (co) => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : null) } : null) } });
  return { w, korzen, przycisk, staryPasek, pasek, obserwowane, zapytania, zmiana, dotknij, B: w.BM_DZIS };
}

test('(1) stary przycisk „Nowy moment!” odsłonięty po starcie modułu (zwykła kolejność: initAuth dochodzi później) → pasek pod nagłówkiem', () => {
  const s = strona();
  s.B.start();
  assert.equal(s.pasek.hidden, true, 'bez momentu paska nie ma');
  const obs = s.obserwowane.find(([cel]) => cel === s.przycisk);
  assert.ok(obs, 'nasłuch na #moment-baner');
  assert.deepEqual(JSON.parse(JSON.stringify(obs[2])), { attributes: true, attributeFilter: ['style'] }, 'stary kod steruje przyciskiem przez style.display');
  s.przycisk.style.display = 'inline-flex'; s.zmiana(s.przycisk);
  assert.equal(s.pasek.hidden, false);
  assert.match(s.pasek.innerHTML, /^<button type="button" class="dn-moment" data-dn="moment">.*<span>Nowy moment!<small>Dotknij, żeby zobaczyć<\/small><\/span>.*<\/button>$/);
  assert.match(HTML, /<button id="moment-baner" style="display:none;[^>]*>.*Nowy moment!<\/button>/, 'ten sam napis co stary przycisk; przycisk startuje jako display:none');
  assert.equal(s.zapytania.length, 0, 'pasek momentu nie pyta bazy');
});

test('(2) przycisk odsłonięty, zanim moduł wystartował → pasek od razu; dotknięcie = kliknięcie starego przycisku, pasek znika, następny moment wraca', () => {
  const s = strona({ display: 'inline-flex' });
  s.B.start();
  assert.equal(s.pasek.hidden, false, 'bez czekania na zmianę stylu');
  s.dotknij('moment');
  assert.equal(s.przycisk.klikniec, 1, 'cała logika (animacja albo karta, shown_at, kolejka) zostaje w starym onclick');
  assert.equal(s.pasek.hidden, true, 'pasek znika od razu, nie wisi pod animacją');
  assert.equal(s.pasek.innerHTML, '');
  s.przycisk.style.display = 'inline-flex'; s.zmiana(s.przycisk);   // loadMomenty po zamknięciu animacji: kolejny moment z kolejki
  assert.equal(s.pasek.hidden, false, 'drugi moment z kolejki');
  s.dotknij('moment'); assert.equal(s.przycisk.klikniec, 2);
  s.zmiana(s.przycisk); assert.equal(s.pasek.hidden, true, 'kolejka pusta: paska nie ma');
});

test('(3) jedna rzecz naraz: problem z zegarkiem przed momentem; po zamknięciu paska zegarka pokazuje się moment', () => {
  const s = strona({ display: 'inline-flex' });
  s.staryPasek.innerHTML = PASEK_ZEGARKA;
  s.B.start();
  assert.equal(s.pasek.innerHTML, PASEK_ZEGARKA); assert.doesNotMatch(s.pasek.innerHTML, /dn-moment/);
  s.korzen._zd.click({ target: { closest: (sel) => (sel === '.wc-pasek button' ? {} : null) } });   // „✕” paska zegarka
  assert.match(s.pasek.innerHTML, /dn-moment/, 'moment czekał w kolejce'); assert.equal(s.pasek.hidden, false);
  assert.equal(s.przycisk.klikniec, 0, 'zamknięcie paska zegarka nie odpala momentu');
});

test('(4) bez przycisku w stronie, przy pustym display i w podglądzie trenera: nic się nie pokazuje i nic się nie wywraca', () => {
  const bez = strona({ bezPrzycisku: true }); bez.B.start();
  assert.equal(bez.pasek.hidden, true); bez.dotknij('moment'); assert.equal(bez.korzen.hidden, false);
  const pusty = strona({ display: '' }); pusty.B.start();
  assert.equal(pusty.pasek.hidden, true, 'pusty display to nie „odsłonięty”: stary kod zawsze ustawia inline-flex albo none');
  const trener = strona({ display: 'inline-flex', search: '?from=trener' }); trener.B.start();
  assert.equal(trener.korzen.hidden, true, 'podgląd trenera zostaje na starym ekranie, tam działa stary przycisk');
  assert.equal(trener.korzen.innerHTML, '');
});

test('(5) pasek momentu jest przyciskiem z prawdziwym celem dotyku i stylami tylko pod #dzis-nowy', () => {
  const css = MODUL.match(/#dzis-nowy \.dn-moment\{[^}]*\}/)[0];
  assert.match(css, /min-height:56px/); assert.match(css, /width:100%/); assert.match(css, /cursor:pointer/);
  assert.match(MODUL, /prefers-reduced-motion:reduce\)\{[^}]*#dzis-nowy \.dn-moment:active\{transform:none\}/);
  for (const sel of MODUL.match(/[^"{}]*\.dn-moment[^{]*\{/g)) assert.match(sel, /^#dzis-nowy /, 'selektor poza nowym Dziś: ' + sel);
});
