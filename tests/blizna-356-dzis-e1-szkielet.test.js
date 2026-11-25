// Blizna #356 (25.11.2026) — nowe Dziś, etap E1, commit 1: szkielet i zasady.
//
// Decyzje Filipa 25.11: nowy ekran ZASTĘPUJE stare Dziś dla kont z listy (link „stare Dziś ›” zostaje), ikony tymczasowo
// z makiety r5 w repo aplikacji, menu r5 z Logiem, pasek biegu zostaje, podgląd trenera (?from=trener) na starym ekranie
// do E8, zgłoszenia w client_errors z kind 'dzis-nowy'. Decyzje 13.11: #sponsor i historia Okienka (#log-list) też stary ekran.
// Ten commit nie pyta jeszcze bazy (dane w commicie 2): imię i licznik dzwonka bierze z tego, co stary kod wpisał w stronę.
// Bez przełącznika nic się nie zmienia: pilnuje tego blizna-336 (zawodnik.html poza blokami bajt w bajt, klasa tylko dla „nowy”).
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
const plain = (x) => JSON.parse(JSON.stringify(x));

/* Atrapa strony: tylko to, czego dotyka moduł. Elementy nagłówka zwracane z querySelector trzymają textContent/hidden. */
function strona({ search = '', hash = '', sekcja = 'home', imie = 'Ola Nowak', dzwonek = '2', nowy = true } = {}) {
  const klasy = new Set(nowy ? ['dzis-nowy'] : []);
  const czesci = {};
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; },
    querySelector(s) { const m = /data-dn="([a-z]+)"/.exec(s); if (!m) return null; return (czesci[m[1]] = czesci[m[1]] || { textContent: '', hidden: true }); },
    addEventListener(n, f) { this._zd[n] = f; } };
  const pozycja = (id, ikona) => { const a = { _a: { 'data-navid': id }, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, hasAttribute(k) { return k in this._a; }, removeAttribute(k) { delete this._a[k]; } };
    a.firstElementChild = { outerHTML: ikona }; return a; };
  const menu = ['home', 'plan', 'food', 'log', 'forma', 'social', 'profil'].map((id) => pozycja(id, id === 'log' ? '<div class="stary-log"></div>' : '<svg data-stare="' + id + '"></svg>'));
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: imie }, 'zawodnik-bell-dot': { textContent: dzwonek, style: { display: dzwonek ? 'flex' : 'none' } },
    'okienko-pole': { klikniec: 0, click() { this.klikniec++; } }, 'nav-mount': { querySelectorAll: () => menu } };
  const style = [], wpisy = [], sekcje = [], obserwowane = [];
  const w = { _currentSection: sekcja, location: { search, hash, pathname: '/zawodnik.html' }, URLSearchParams, showSection(n) { sekcje.push(n); this._currentSection = n; },
    openNotifications() { w._dzwonek = (w._dzwonek || 0) + 1; }, _logKlienta(o) { wpisy.push(o); },
    MutationObserver: function (f) { this.observe = (cel) => obserwowane.push([cel, f]); } };
  const d = { documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || (id === 'dzis-nowy-css' ? (style[0] || null) : null), createElement: () => ({}), head: { appendChild: (s) => style.push(s) } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date });
  return { w, d, klasy, korzen, czesci, menu, el, style, wpisy, sekcje, obserwowane, B: w.BM_DZIS };
}

test('(1) szkielet: nowy ekran zastępuje stare Dziś; nagłówek, kafle w kolejności makiety, 7 skrótów, link „stare Dziś ›”', () => {
  const s = strona();
  assert.equal(s.B.etap, 'E1');
  s.B.start();
  assert.equal(s.korzen.hidden, false);
  assert.deepEqual([...s.klasy].sort(), ['dzis-gotowy', 'dzis-na-dzis', 'dzis-nowy'], 'dzis-gotowy uruchamia chowanie starego Dziś z bloku DZIS-E0 2');
  const h = s.korzen.innerHTML;
  assert.deepEqual([...h.matchAll(/data-kafel="([a-z]+)"/g)].map((m) => m[1]), ['ulica', 'trening', 'skroty', 'ostatni', 'lista']);
  assert.deepEqual([...h.matchAll(/class="dn-etykieta">([^<]*)</g)].map((m) => m[1]), ['Ulica', 'Trening na dziś', 'Ostatni trening', 'Twoje ostatnie treningi']);
  assert.deepEqual([...h.matchAll(/data-skrot="([a-z]+)"/g)].map((m) => m[1]), ['cialo', 'starty', 'wyzwania', 'odznaki', 'radio', 'czat', 'gra']);
  assert.deepEqual([...h.matchAll(/<a class="dn-skrot" href="([^"]+)"/g)].map((m) => m[1]), ['races.html', 'wyzwania.html', 'odznaki.html', 'radio.html', 'gra.html']);
  assert.deepEqual([...h.matchAll(/data-sekcja="([a-z]+)"/g)].map((m) => m[1]), ['cwiczenia', 'msgs']);
  assert.match(h, /<a class="dn-stare" href="zawodnik\.html\?dzis=stary">stare Dziś ›<\/a>$/);
  assert.match(h, /aria-label="Zapytaj"/); assert.match(h, /aria-label="Powiadomienia"/);
  assert.equal((h.match(/aria-busy="true"/g) || []).length, 4, 'kafle z danymi czekają na commit 2');
  assert.equal(s.korzen._a['data-etap'], 'E1');
  const przed = s.korzen.innerHTML; s.B.start(); s.B.start();
  assert.equal(s.korzen.innerHTML, przed, 'ponowny start nie rysuje od nowa');
  // stare elementy, które ten commit chowa dodatkowo (tylko na Dziś), istnieją w stronie
  assert.match(HTML, /<div class="topbar">/); assert.match(HTML, /id="okienko-pole"/); assert.match(HTML, /id="topbar-name"/); assert.match(HTML, /id="zawodnik-bell-dot"/);
  assert.doesNotMatch(s.style[0].textContent, /bieg-pasek/, 'pasek biegu zostaje do 6.12');
});

test('(2) nagłówek: data z lokalnego zegara, imię i licznik dzwonka z tego, co wpisał stary kod; Okienko, dzwonek i skróty wołają stare funkcje', () => {
  const s = strona();
  assert.equal(s.B.dataDzis(new Date(2026, 10, 25, 23, 30)), 'środa · 25 listopada');
  assert.equal(s.B.dataDzis(new Date(2026, 11, 6, 0, 10)), 'niedziela · 6 grudnia');
  s.B.start();
  assert.equal(s.czesci.powitanie.textContent, 'Cześć, Ola');
  assert.equal(s.czesci.licznik.textContent, '2'); assert.equal(s.czesci.licznik.hidden, false);
  s.el['topbar-name'].textContent = '—'; s.el['zawodnik-bell-dot'].style.display = 'none';
  for (const [, f] of s.obserwowane) f();   // stary kod zmienił pasek → obserwator odświeża nagłówek
  assert.equal(s.czesci.powitanie.textContent, 'Cześć', 'bez imienia samo „Cześć”');
  assert.equal(s.czesci.licznik.hidden, true);
  const klik = (atr, v) => s.korzen._zd.click({ target: { closest: () => ({ getAttribute: (k) => (k === atr ? v : null) }) } });
  klik('data-dn', 'okienko'); assert.equal(s.el['okienko-pole'].klikniec, 1);
  klik('data-dn', 'dzwonek'); assert.equal(s.w._dzwonek, 1);
  klik('data-sekcja', 'cwiczenia'); assert.deepEqual(s.sekcje, ['cwiczenia']);
  assert.equal(s.korzen.hidden, true, 'po przejściu do innej sekcji korzeń ukryty');
  assert.equal(s.klasy.has('dzis-na-dzis'), false, 'pasek starego ekranu wraca poza Dziś');
  assert.equal(s.klasy.has('dzis-gotowy'), true);
  s.w.showSection('home'); assert.equal(s.korzen.hidden, false);
  const xss = strona({ imie: '<b>x</b>"\'& Nowak' }); xss.B.start();
  assert.doesNotMatch(xss.korzen.innerHTML, /<b>x<\/b>/, 'imię escapowane');
  assert.match(xss.korzen.innerHTML, /data-dn="powitanie">Cześć, &lt;b&gt;x&lt;\/b&gt;&quot;&#39;&amp;<\/h1>/);
});

test('(3) zasady: podgląd trenera, #sponsor i historia Okienka zostają na starym ekranie; bez przełącznika nic; stop() cofa wszystko', () => {
  for (const [o, powod] of [[{ search: '?from=trener' }, 'trener'], [{ search: '?role=athlete&from=trener' }, 'trener'], [{ hash: '#sponsor' }, 'sponsor'], [{ hash: '#log-list' }, 'historia']]) {
    const s = strona(o);
    assert.equal(s.B.ustepuje(), powod);
    s.B.start();
    assert.equal(s.korzen.hidden, true, powod); assert.equal(s.korzen.innerHTML, '', powod + ': nic nie rysuje');
    assert.equal(s.klasy.has('dzis-gotowy'), false, powod + ': stare Dziś nie jest chowane');
    assert.equal(s.menu.every((a) => !a.hasAttribute('data-dn-menu')), true, powod + ': stare menu');
    assert.deepEqual(s.wpisy, [], 'ustąpienie to nie błąd');
  }
  assert.equal(strona({ search: '?log=1', hash: '#inne' }).B.ustepuje(), '');
  const bez = strona({ nowy: false }); bez.B.start();
  assert.equal(bez.korzen.hidden, true); assert.equal(bez.klasy.size, 0, 'bez klasy dzis-nowy moduł niczego nie włącza');
  const s = strona(); s.B.start(); s.B.stop();
  assert.equal(s.korzen.hidden, true); assert.deepEqual([...s.klasy], ['dzis-nowy'], 'stop zdejmuje dzis-gotowy i dzis-na-dzis');
  assert.deepEqual(s.menu.map((a) => a.firstElementChild.outerHTML), ['home', 'plan', 'food'].map((id) => '<svg data-stare="' + id + '"></svg>').concat(['<div class="stary-log"></div>'], ['forma', 'social', 'profil'].map((id) => '<svg data-stare="' + id + '"></svg>')), 'stare ikony menu wracają');
});

test('(4) menu r5: sześć ikon z kompletu i krążek Log; pliki ikon są w repo w obu rozmiarach', () => {
  const s = strona(); s.B.start();
  const ik = Object.fromEntries(s.menu.map((a) => [a.getAttribute('data-navid'), a.firstElementChild.outerHTML]));
  for (const [id, nazwa] of Object.entries({ home: 'dom', plan: 'kalendarz', food: 'jablko', forma: 'wykres', social: 'spolecznosc', profil: 'profil' })) {
    assert.match(ik[id], new RegExp('^<img class="dn-ik" src="assets/ui/dzis/ikony/' + nazwa + '-64\\.webp" srcset="[^"]*' + nazwa + '-128\\.webp 128w"'), id);
  }
  assert.equal(ik.log, '<span class="dn-log"><img src="assets/ui/logo-b-biale-alfa.webp" alt=""></span>');
  const uzyte = new Set([...Object.values(plain(s.B.MENU)), ...plain(s.B.SKROTY).map((x) => x[2]), 'okienko', 'dzwonek']);
  assert.equal(uzyte.size, 15);
  for (const n of uzyte) for (const r of ['64', '128']) assert.ok(fs.statSync(path.join(KORZEN, 'assets/ui/dzis/ikony', n + '-' + r + '.webp')).size > 500, 'brak ikony ' + n + '-' + r);
  assert.deepEqual(fs.readdirSync(path.join(KORZEN, 'assets/ui/dzis/ikony')).sort(), [...uzyte].flatMap((n) => [n + '-128.webp', n + '-64.webp']).sort(), 'w katalogu tylko używane ikony');
  assert.ok(fs.existsSync(path.join(KORZEN, 'assets/ui/logo-b-biale-alfa.webp')));
  for (const m of s.korzen.innerHTML.matchAll(/src="(assets\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(KORZEN, m[1])), 'brak pliku ' + m[1]);
});

test('(5) zgłoszenia: kind dzis-nowy, sam etap, raz na stronę, adres bez parametrów; błąd startu wraca do starego ekranu', () => {
  const s = strona({ search: '?log=1&x=tajne' });
  assert.deepEqual(plain(s.B.ETAPY), ['modul', 'start', 'render', 'menu']);
  assert.equal(s.B.zglos('render'), true); assert.equal(s.B.zglos('render'), false);
  for (const zly of ['', 'inne', 'render?x=1', undefined]) assert.equal(s.B.zglos(zly), false);
  for (let i = 0; i < 50; i++) s.B.zglos('menu');
  assert.deepEqual(plain(s.wpisy), [{ kind: 'dzis-nowy', message: 'render', url: '/zawodnik.html' }, { kind: 'dzis-nowy', message: 'menu', url: '/zawodnik.html' }]);
  const zepsuty = strona();
  zepsuty.el['nav-mount'].querySelectorAll = () => { throw new Error('x'); };
  zepsuty.B.start();
  assert.deepEqual(plain(zepsuty.wpisy).map((x) => x.message), ['menu'], 'błąd menu nie wywraca ekranu');
  assert.equal(zepsuty.korzen.hidden, false);
  const bezKorzenia = strona(); bezKorzenia.el['dzis-nowy'] = null;
  bezKorzenia.B.start();
  assert.deepEqual(plain(bezKorzenia.wpisy).map((x) => x.message), ['start']);
  const wybuch = strona(); wybuch.korzen.setAttribute = () => { throw new Error('x'); };
  assert.throws(() => wybuch.B.start(), 'wyjątek idzie do bloku DZIS-E0 1, który wraca do starego ekranu');
  assert.deepEqual(plain(wybuch.wpisy).map((x) => x.message), ['start']);
  assert.equal(wybuch.klasy.has('dzis-gotowy'), false); assert.equal(wybuch.korzen.hidden, true);
});

test('(6) granice: moduł bez zapytań i bez pamięci telefonu (commit 1); cały CSS tylko pod #dzis-nowy albo html.dzis-gotowy', () => {
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /fetch\(|XMLHttpRequest|supabase|\bsb\.|\.rpc\(|\.from\(|localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon/, 'dane wchodzą dopiero w commicie 2');
  const s = strona(); s.B.start();
  const css = s.style[0].textContent;
  assert.equal(s.style.length, 1); s.B.start(); assert.equal(s.style.length, 1, 'arkusz wstawiany raz');
  const selektory = css.replace(/@media[^{]*\{/g, '').replace(/\{[^}]*\}/g, ',').split(',').map((x) => x.trim()).filter((x) => x && x !== '}');
  assert.ok(selektory.length >= 25);
  for (const x of selektory) assert.ok(/^(#dzis-nowy\b|html\.dzis-gotowy(\.dzis-na-dzis)? )/.test(x), 'selektor poza nowym Dziś: ' + x);
  assert.match(css, /html\.dzis-gotowy\.dzis-na-dzis body > \.topbar,html\.dzis-gotowy\.dzis-na-dzis body > #okienko-pole\{display:none!important\}/, 'stary pasek i pole Zapytaj schowane tylko na Dziś');
});
