// Blizna #356 (25.11.2026) — nowe Dziś, etap E1, commit 1: szkielet i zasady.
//
// Decyzje Filipa 25.11: nowy ekran ZASTĘPUJE stare Dziś dla kont z listy (link „stare Dziś ›” zostaje), ikony tymczasowo
// z makiety r5 w repo aplikacji, pasek biegu zostaje, podgląd trenera (?from=trener) na starym ekranie
// do E8, zgłoszenia w client_errors z kind 'dzis-nowy'. Decyzje 13.11: #sponsor i historia Okienka (#log-list) też stary ekran.
// Szkielet stoi bez sieci; dane (commit 2) pilnuje blizna-357. Tu klient bazy w atrapie nigdy nie odpowiada, więc ekran zostaje szkieletem.
// Uwagi Filipa po zrzutach (25.11): MENU ZOSTAJE STARE (ikony z makiety tylko w rzędzie skrótów), a Okienko otwiera pigułka „Zapytaj”
// w stylu starego pola, bo chmurka myliła się z ikoną Czatu.
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
  const menu = { dotkniec: 0 };   // moduł nie ma prawa sięgać po #nav-mount
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: imie }, 'zawodnik-bell-dot': { textContent: dzwonek, style: { display: dzwonek ? 'flex' : 'none' } },
    'okienko-pole': { klikniec: 0, click() { this.klikniec++; } }, };
  const style = [], wpisy = [], sekcje = [], obserwowane = [];
  const w = { _currentSection: sekcja, location: { search, hash, pathname: '/zawodnik.html' }, URLSearchParams, showSection(n) { sekcje.push(n); this._currentSection = n; },
    openNotifications() { w._dzwonek = (w._dzwonek || 0) + 1; }, _logKlienta(o) { wpisy.push(o); }, setTimeout: () => 0, clearTimeout() {},
    sb: { rpc: () => new Promise(() => {}), from: () => { throw new Error('szkielet nie pyta'); }, auth: { getSession: () => new Promise(() => {}) } },   // klient, który nigdy nie odpowiada: ekran zostaje szkieletem
    MutationObserver: function (f) { this.observe = (cel) => obserwowane.push([cel, f]); } };
  const d = { documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => { if (id === 'nav-mount') menu.dotkniec++; return el[id] || (id === 'dzis-nowy-css' ? (style[0] || null) : null); }, createElement: () => ({}), head: { appendChild: (s) => style.push(s) } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date });
  return { w, d, klasy, korzen, czesci, menu, el, style, wpisy, sekcje, obserwowane, B: w.BM_DZIS };
}

test('(1) szkielet: nowy ekran zastępuje stare Dziś; nagłówek, kafle w kolejności makiety, 8 skrótów, link „stare Dziś ›”', () => {
  const s = strona();
  assert.equal(s.B.etap, 'E1');
  s.B.start();
  assert.equal(s.korzen.hidden, false);
  assert.deepEqual([...s.klasy].sort(), ['dzis-gotowy', 'dzis-na-dzis', 'dzis-nowy'], 'dzis-gotowy uruchamia chowanie starego Dziś z bloku DZIS-E0 2');
  const h = s.korzen.innerHTML;
  assert.deepEqual([...h.matchAll(/data-kafel="([a-z]+)"/g)].map((m) => m[1]), ['trening', 'ulica', 'skroty', 'ostatni', 'tydzien', 'lista']);   // trening nad Ulicą od blizna-381
  assert.deepEqual([...h.matchAll(/class="dn-etykieta">([^<]*)</g)].map((m) => m[1]), ['Trening na dziś', 'Ulica', 'Ostatni trening', 'Ten tydzień', 'Twoje ostatnie treningi']);
  assert.deepEqual([...h.matchAll(/data-skrot="([a-z]+)"/g)].map((m) => m[1]), ['cialo', 'jedzenie', 'starty', 'wyzwania', 'odznaki', 'radio', 'czat', 'gra']);
  assert.deepEqual([...h.matchAll(/<a class="dn-skrot" href="([^"]+)"/g)].map((m) => m[1]), ['nutrition.html', 'races.html', 'wyzwania.html', 'odznaki.html', 'radio.html', 'gra.html']);
  assert.match(h, /<a class="dn-skrot" href="nutrition\.html" data-skrot="jedzenie">.*?jablko-64\.webp.*?<span>Odżywianie<\/span><\/a>/, 'decyzja Filipa 25.11: odżywianie jako skrót (stare Dziś miało kafel „Odżywianie dziś”)');
  assert.ok(fs.existsSync(path.join(KORZEN, 'nutrition.html')));
  assert.deepEqual([...h.matchAll(/data-sekcja="([a-z]+)"/g)].map((m) => m[1]), ['cwiczenia', 'msgs']);
  assert.match(h, /<a class="dn-stare" href="zawodnik\.html\?dzis=stary">stare Dziś ›<\/a>$/);
  assert.match(h, /<button type="button" class="dn-zapytaj" data-dn="okienko" aria-haspopup="dialog"><svg [^>]*aria-hidden="true">.*?<\/svg><span>Zapytaj<\/span><\/button>/, 'Okienko = pigułka z napisem, nie sama ikona');
  assert.doesNotMatch(h, /okienko-64\.webp/, 'chmurka Okienka wycofana: myliła się z Czatem');
  assert.match(h, /aria-label="Powiadomienia"/);
  assert.equal((h.match(/aria-busy="true"/g) || []).length, 5, 'pięć kafli na szkielecie (od blizna-378 także „Ten tydzień”)');
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
    assert.deepEqual(s.wpisy, [], 'ustąpienie to nie błąd');
  }
  assert.equal(strona({ search: '?log=1', hash: '#inne' }).B.ustepuje(), '');
  const bez = strona({ nowy: false }); bez.B.start();
  assert.equal(bez.korzen.hidden, true); assert.equal(bez.klasy.size, 0, 'bez klasy dzis-nowy moduł niczego nie włącza');
  const s = strona(); s.B.start(); s.B.stop();
  assert.equal(s.korzen.hidden, true); assert.deepEqual([...s.klasy], ['dzis-nowy'], 'stop zdejmuje dzis-gotowy i dzis-na-dzis');
});

test('(4) menu zostaje stare: moduł nie dotyka #nav-mount ani przy starcie, ani przy zmianie sekcji, ani przy stop(); ikony z makiety tylko w skrótach i na dzwonku', () => {
  const s = strona(); s.B.start(); s.w.showSection('forma'); s.w.showSection('home'); for (const [, f] of s.obserwowane) f(); s.B.stop(); s.B.start();
  assert.equal(s.menu.dotkniec, 0, 'menu rysuje i podświetla wyłącznie stary kod (NAV w sb.js)');
  assert.equal(s.obserwowane.length, 2, 'obserwowane tylko imię i kropka dzwonka');
  assert.doesNotMatch(MODUL, /nav-mount|nav-it|data-navid|dn-log/, 'w module nie ma ani słowa o menu');
  assert.doesNotMatch(s.style[0].textContent, /nav/);
  assert.equal(s.B.MENU, undefined);
  const uzyte = new Set([...plain(s.B.SKROTY).map((x) => x[2]), 'dzwonek']);
  assert.deepEqual([...uzyte].sort(), ['dymek', 'dzwonek', 'flaga', 'hantla', 'jablko', 'medal', 'pad', 'puchar', 'radio']);
  for (const n of uzyte) for (const r of ['64', '128']) assert.ok(fs.statSync(path.join(KORZEN, 'assets/ui/dzis/ikony', n + '-' + r + '.webp')).size > 500, 'brak ikony ' + n + '-' + r);
  assert.deepEqual(fs.readdirSync(path.join(KORZEN, 'assets/ui/dzis/ikony')).sort(), [...uzyte].flatMap((n) => [n + '-128.webp', n + '-64.webp']).sort(), 'w katalogu tylko używane ikony (bez ikon menu i chmurki Okienka)');
  const obrazy = [...s.korzen.innerHTML.matchAll(/src="(assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(obrazy.length, 9, 'osiem skrótów i dzwonek');
  for (const p of obrazy) assert.ok(fs.existsSync(path.join(KORZEN, p)), 'brak pliku ' + p);
});

test('(5) zgłoszenia: kind dzis-nowy, sam etap, raz na stronę, adres bez parametrów; błąd startu wraca do starego ekranu', () => {
  const s = strona({ search: '?log=1&x=tajne' });
  assert.deepEqual(plain(s.B.ETAPY), ['modul', 'start', 'render', 'klient', 'profil', 'akcja', 'trening', 'wpisy', 'sesja', 'odczucie', 'wiadomosc', 'tydzien']);
  assert.equal(s.B.zglos('render'), true); assert.equal(s.B.zglos('render'), false);
  for (const zly of ['', 'inne', 'menu', 'render?x=1', undefined]) assert.equal(s.B.zglos(zly), false);
  for (let i = 0; i < 50; i++) s.B.zglos('start');
  assert.deepEqual(plain(s.wpisy), [{ kind: 'dzis-nowy', message: 'render', url: '/zawodnik.html' }, { kind: 'dzis-nowy', message: 'start', url: '/zawodnik.html' }]);
  const bezKorzenia = strona(); bezKorzenia.el['dzis-nowy'] = null;
  bezKorzenia.B.start();
  assert.deepEqual(plain(bezKorzenia.wpisy).map((x) => x.message), ['start']);
  const wybuch = strona(); wybuch.korzen.setAttribute = () => { throw new Error('x'); };
  assert.throws(() => wybuch.B.start(), 'wyjątek idzie do bloku DZIS-E0 1, który wraca do starego ekranu');
  assert.deepEqual(plain(wybuch.wpisy).map((x) => x.message), ['start']);
  assert.equal(wybuch.klasy.has('dzis-gotowy'), false); assert.equal(wybuch.korzen.hidden, true);
});

test('(6) granice: moduł czyta przez klienta bazy; DWA wyjątki od „tylko odczyt” (blizna-363): jeden update odczucia i jeden klucz pamięci telefonu; cały CSS tylko pod #dzis-nowy albo html.dzis-gotowy', () => {
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /fetch\(|XMLHttpRequest|sessionStorage\.(setItem|removeItem|clear)|indexedDB|\.cookie|sendBeacon|\.(insert|upsert|delete)\(|\.rpc\("(?!akcja_licznik|akcja_moj_wklad)/, 'żadnych własnych żądań, żadnego dopisywania ani kasowania');
  assert.deepEqual(kod.match(/\.update\([^\n]*/g), ['.update(zmiana).eq("id", stan.id).select("id")).then(function (wiersze) {'],'jedyny zapis: jeden wiersz po id, z odesłaniem id');
  assert.match(kod, /pytaj\(sb\.from\("training_logs"\)\.update\(zmiana\)/, 'i tylko w training_logs');
  assert.match(kod, /var zmiana = \{ feel: stan\.kod \};\s*if \(notatka && !stan\.maKomentarz\) zmiana\.comment = notatka;/, 'zapisywane pola: feel i (bez nadpisywania) comment');
  assert.deepEqual((kod.match(/localStorage\.[a-zA-Z]+\("[^"]*"/g) || []).sort(), ['localStorage.getItem("dn_kadr"', 'localStorage.getItem("fr_skip_"', 'localStorage.setItem("dn_kadr"', 'localStorage.setItem("fr_skip_"'],
    'dwa klucze pamięci telefonu: fr_skip_<id wpisu> (wspólny ze starym Dziś) i od blizna-384 dn_kadr (które kadry już były)');
  assert.equal((kod.match(/localStorage/g) || []).length, 4);
  assert.deepEqual([...new Set(kod.match(/\bss\.[a-zA-Z]+|sessionStorage\.[a-zA-Z]+/g) || [])].sort(), ['ss.getItem', 'ss.key', 'ss.length'], 'pamięć karty tylko do ODCZYTU pogody (wpisy „weather:” starego Dziś), blizna-384');
  assert.equal((kod.match(/sessionStorage/g) || []).length, 1);
  const s = strona(); s.B.start();
  const css = s.style[0].textContent;
  assert.equal(s.style.length, 1); s.B.start(); assert.equal(s.style.length, 1, 'arkusz wstawiany raz');
  const klatki = css.match(/@keyframes [^{]+/g) || [];
  for (const k of klatki) assert.match(k, /^@keyframes dn-[a-z-]+$/, 'animacja spoza nowego Dziś: ' + k);   // nazwy animacji są globalne, więc z własnym przedrostkiem
  const selektory = css.replace(/@keyframes [^{]+\{(?:[^{}]*\{[^}]*\})*\}/g, '').replace(/@media[^{]*\{/g, '').replace(/\{[^}]*\}/g, ',').split(',').map((x) => x.trim().replace(/^\}/, '')).filter(Boolean);   // „}” na początku = koniec reguły @media
  assert.ok(selektory.length >= 25);
  for (const x of selektory) assert.ok(/^(#dzis-nowy\b|html\.dzis-gotowy(\.dzis-na-dzis)? )/.test(x), 'selektor poza nowym Dziś: ' + x);
  assert.match(css, /html\.dzis-gotowy\.dzis-na-dzis body > \.topbar,html\.dzis-gotowy\.dzis-na-dzis body > #okienko-pole\{display:none!important\}/, 'stary pasek i pole Zapytaj schowane tylko na Dziś');
});
