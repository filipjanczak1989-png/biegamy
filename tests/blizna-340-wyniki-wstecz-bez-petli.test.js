/* BLIZNA 340 (Filip 23.11): pętla Kalendarz Startów ↔ Wyniki. „‹ Wstecz” w wyniki.html był linkiem href="races.html" (od 2.11) — dopisywał Kalendarz
   Startów do historii, a jego „‹” (history.back) wracał do Wyników (karta zawodnika / ekran imprezy otwarte z Okienka) → w kółko.
   Teraz reguła jak „← Powrót” w kalendarz.html (blizna-339): widok otwarty W Wynikach (głębokość d > 0 z naszego pushState) albo wejście z naszej
   strony → history.back(); wejście z zewnątrz → location.replace('races.html'), bez nowego wpisu.
   Do tego role=athlete w pozostałych linkach do kalendarza: dwa w sb.js (Forma) i link „popraw czas” w js/bieg.mjs. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const funkcja = (zrodlo, nazwa) => { const i = zrodlo.indexOf('function ' + nazwa + '('); assert.ok(i >= 0, 'brak ' + nazwa); let g = 0, j = zrodlo.indexOf('{', i);
  for (; j < zrodlo.length; j++) { if (zrodlo[j] === '{') g++; else if (zrodlo[j] === '}' && --g === 0) break; } return zrodlo.slice(i, j + 1); };
const WYNIKI = czytaj('wyniki.html');
const ZRODLO_WSTECZ = funkcja(WYNIKI, 'glebokosc') + '\n' + funkcja(WYNIKI, 'wstecz');

/* Atrapa przeglądarki: stos historii (adres, referrer, stan), back, pushState, replace. Strona „wyniki” woła prawdziwe wstecz() z wyniki.html,
   „races” robi history.back() (jak „‹” w races.html), „zawodnik” to Dziś. */
function przegladarka(start) {
  const stos = [{ url: start, referrer: '', stan: null }]; let i = 0;
  const h = {
    get length() { return stos.length; }, get state() { return stos[i].stan; },
    back() { if (i > 0) i--; },
    pushState(stan, _t, hash) { stos.splice(i + 1); stos.push({ url: stos[i].url.split('#')[0] + hash, referrer: stos[i].referrer, stan }); i++; },
  };
  const idzDo = (url) => { const ref = 'https://biegamy.run/' + stos[i].url.split('#')[0]; stos.splice(i + 1); stos.push({ url, referrer: ref, stan: null }); i++; };
  const zastap = (url) => { stos[i] = { url, referrer: stos[i].referrer, stan: null }; };
  const wsteczWynikow = () => {
    const ctx = { history: h, document: { referrer: stos[i].referrer }, URL, location: { origin: 'https://biegamy.run', replace: zastap } };
    vm.runInNewContext(ZRODLO_WSTECZ + '\nwstecz({ preventDefault() {} });', ctx);
  };
  return { stos, h, idzDo, wsteczWynikow, get adres() { return stos[i].url; }, get i() { return i; } };
}
/* Klikanie „wstecz” w aplikacji tak długo, aż wrócimy na Dziś (albo wykryjemy pętlę): zwraca odwiedzone adresy. */
function wracaj(b, limit = 8) {
  const trasa = [];
  for (let n = 0; n < limit && !b.adres.startsWith('zawodnik.html'); n++) {
    if (b.adres.startsWith('wyniki.html')) b.wsteczWynikow(); else if (b.adres.startsWith('races.html')) b.h.back(); else break;
    trasa.push(b.adres);
  }
  return trasa;
}

test('wyniki.html: „‹ Wstecz” obsługuje skrypt (href zostaje bez JS); pushState niesie głębokość widoku', () => {
  assert.match(WYNIKI, /<a class="top-back-btn" href="races\.html" id="w-wstecz">‹ Wstecz<\/a>/);
  assert.match(WYNIKI, /\$\('w-wstecz'\)\.addEventListener\('click', wstecz\);/);
  assert.match(WYNIKI, /history\.pushState\(\{ h: h, y: window\.scrollY, d: glebokosc\(\) \+ 1 \}, '', h\)/);
  assert.match(WYNIKI, /history\.replaceState\(\{ h: h, d: glebokosc\(\) \}, '', h\)/);
});

test('wstecz(): widok w Wynikach albo wejście z naszej strony → back; z zewnątrz → replace races.html; zawsze bez nowego wpisu', () => {
  const uruchom = ({ referrer, dlugosc, stan }) => {
    const zd = [];
    const ctx = { history: { length: dlugosc, state: stan, back: () => zd.push('back'), pushState: () => zd.push('PUSH') }, document: { referrer }, URL,
      location: { origin: 'https://biegamy.run', replace: (u) => zd.push('replace:' + u), set href(u) { zd.push('HREF:' + u); } } };
    vm.runInNewContext(ZRODLO_WSTECZ + '\nwstecz({ preventDefault() { } });', ctx);
    return zd.join(',');
  };
  assert.equal(uruchom({ referrer: 'https://biegamy.run/zawodnik.html', dlugosc: 3, stan: null }), 'back', 'z Okienka → Dziś');
  assert.equal(uruchom({ referrer: 'https://biegamy.run/races.html', dlugosc: 4, stan: { h: '#/' } }), 'back', 'z kalendarza → kalendarz');
  assert.equal(uruchom({ referrer: '', dlugosc: 5, stan: { h: '#/zawodnik/x', d: 1 } }), 'back', 'widok otwarty w Wynikach → zamyka widok (nawet z zewnątrz)');
  assert.equal(uruchom({ referrer: '', dlugosc: 1, stan: null }), 'replace:races.html', 'z zewnątrz → zastąp');
  assert.equal(uruchom({ referrer: 'https://facebook.com/x', dlugosc: 3, stan: { h: '#/' } }), 'replace:races.html', 'obca strona → zastąp');
  assert.equal(uruchom({ referrer: 'https://biegamy.run/races.html', dlugosc: 1, stan: null }), 'replace:races.html', 'bez historii → zastąp');
  assert.equal(uruchom({ referrer: 'nie-adres', dlugosc: 3, stan: { d: 'x' } }), 'replace:races.html', 'zepsute wejście → zastąp');
});

test('pętla Kalendarz Startów ↔ Wyniki znikła: wejście z Okienka, z kalendarza i z widoku w Wynikach — „wstecz” w aplikacji prowadzi na Dziś, historia nie rośnie', () => {
  // 1) Okienko na Dziś → karta zawodnika w Wynikach → „‹ Wstecz” → Dziś
  let b = przegladarka('zawodnik.html'); b.idzDo('wyniki.html#/zawodnik/datasport%3A1');
  assert.deepEqual(wracaj(b), ['zawodnik.html'], 'z Okienka: jeden krok na Dziś');
  assert.equal(b.stos.length, 2, 'bez nowego wpisu');
  // 2) Dziś → kafel „Starty” → wyszukiwarka → karta zawodnika (osobna strona) → „‹ Wstecz” → „‹” → Dziś
  b = przegladarka('zawodnik.html'); b.idzDo('races.html'); b.idzDo('wyniki.html#/zawodnik/datasport%3A1');
  assert.deepEqual(wracaj(b), ['races.html', 'zawodnik.html']); assert.equal(b.stos.length, 3);
  // 3) Kalendarz → „Otwórz wyniki ›” (#/) → karta zawodnika w Wynikach (pushState, d = 1) → „‹ Wstecz” zamyka widok, potem kalendarz, potem Dziś
  b = przegladarka('zawodnik.html'); b.idzDo('races.html'); b.idzDo('wyniki.html#/');
  b.h.pushState({ h: '#/zawodnik/x', y: 0, d: 1 }, '', '#/zawodnik/x');
  assert.deepEqual(wracaj(b), ['wyniki.html#/', 'races.html', 'zawodnik.html']); assert.equal(b.stos.length, 4);
  // 4) Okienko „Wyniki ›” → ekran imprezy → rok z chipa (pushState) → „‹ Wstecz” ×2 → Dziś
  b = przegladarka('zawodnik.html'); b.idzDo('wyniki.html#/impreza/kalendarz%3Aabc/2024');
  b.h.pushState({ h: '#/impreza/kalendarz%3Aabc/2023', y: 0, d: 1 }, '', '#/impreza/kalendarz%3Aabc/2023');
  assert.deepEqual(wracaj(b), ['wyniki.html#/impreza/kalendarz%3Aabc/2024', 'zawodnik.html']);
});

test('role=athlete w pozostałych linkach do kalendarza: dwa w sb.js (Forma) i „popraw czas” w js/bieg.mjs; żadnego linku zawodnika bez roli', () => {
  const SB = czytaj('sb.js');
  assert.equal((SB.match(/: 'kalendarz\.html\?role=athlete&openDay=' \+ dateStr;/g) || []).length, 2, 'dwa linki Formy');
  assert.doesNotMatch(SB, /'kalendarz\.html\?openDay=/, 'sb.js: openDay bez roli');
  const BIEG = czytaj('js/bieg.mjs');
  assert.match(BIEG, /if \(!l\.length\) return "kalendarz\.html\?role=athlete";/);
  assert.match(BIEG, /return "kalendarz\.html\?role=athlete&openDay=" \+ l\[0\]\.dzien;/);
  assert.equal((BIEG.match(/class="bw-link-maly" href="kalendarz\.html\?role=athlete"/g) || []).length, 2, 'dwa początkowe hrefy');
  const kodBiegu = BIEG.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  assert.doesNotMatch(kodBiegu, /kalendarz\.html(?!\?role=athlete)["?]/, 'bieg.mjs: link do kalendarza bez roli');
});
