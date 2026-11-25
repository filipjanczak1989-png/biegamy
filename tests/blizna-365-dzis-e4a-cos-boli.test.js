// Blizna #365 (25.11.2026) — nowe Dziś, E4a: „Coś boli”.
//
// Zgłoszenie bólu ma w aplikacji JEDNO wejście: pudełko #today-bol w karcie „Dzisiejszy trening” starego Dziś.
// Nowe Dziś chowa tę kartę, więc konto z nowym ekranem nie miało jak zgłosić bólu ani zamknąć zgłoszenia
// („Już nie boli”), a aktywne zgłoszenie znikało z oczu.
// Zasada Filipa: zapisy tylko przez istniejące stare funkcje. Stary kod dalej wypełnia schowane pudełko i wiesza
// działania na jego przyciskach; nowy kafel pokazuje ten sam stan i KLIKA STARE PRZYCISKI po id z krótkiej listy.
// Moduł sam nie pisze do injuries i nie dotyka pamięci odroczenia. Te same zapisy przeszły próbę na prawdziwej bazie
// w wycofanej transakcji (własne zgłoszenie i zamknięcie: 1 wiersz; cudze: 0 wierszy; poziom 4 i zgłoszenie za kogoś: odmowa).
// Zgłoszenie w kształcie z bazy: injuries(id, poziom 1–3, miejsce ze słownika BOL, notatka, created_at, resolved_at).
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
const SB = czytaj('sb' + '.js');
const tik = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const TERAZ = new Date(2026, 10, 25, 12, 0, 0).getTime();
const zgloszenie = (dniTemu, z) => Object.assign({ id: 'i-1', poziom: 2, miejsce: 'kolano', notatka: null, created_at: new Date(TERAZ - dniTemu * 864e5).toISOString() }, z);

/* stan starej karty: 'nieustalony' (pudełko puste), 'brak' (bez zgłoszenia), 'brak-trener' (bez zgłoszenia, konto z trenerem), 'aktywne', 'stare' (po 30 dniach) */
function strona({ stan = 'brak', akt = zgloszenie(1), search = '' } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], obserwowane = [], klikniecia = [], st = { zegar: TERAZ };
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: false, _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k] || null; }, removeAttribute(k) { delete this._a[k]; }, querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll: () => [] });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  const pudelko = { innerHTML: '' };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'today-bol': pudelko };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {}, showSection(n) { this._currentSection = n; }, _logKlienta() {},
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' }, MutationObserver: function (f) { this.observe = (cel, o) => obserwowane.push([cel, f, o]); },
    BOL: { nazwaPoziomu: (v) => ({ 1: 'Boli lekko', 2: 'Boli mocno', 3: 'Nie mogę biegać' }[Number(v)] || 'poziom ' + v), nazwaMiejsca: (v) => ({ kolano: 'Kolano', stopa: 'Stopa', inne: 'Inne' }[v] || String(v)) },
    _bolCoDalej: (pauza) => (pauza ? 'Zapisane u Ciebie. Ból uniemożliwiający bieganie warto skonsultować.' : 'Zapisane u Ciebie — zamknij, gdy przestanie boleć.'),
    sb: { from: () => { let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || new Promise((ok) => { zapytania.push('from'); ok({ data: k === 'x' ? null : [], error: null }); })).then(a, b); return () => q; } }); return q; },
      rpc: () => ({ then: (a, b) => Promise.resolve({ data: { wystartowala: false }, error: null }).then(a, b) }), auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } };
  function ustaw(nowy, a) {   // to, co robi stary _odswiezBol(): ustawia window._aktywnaKontuzja i przerysowuje pudełko z przyciskami o stałych id
    for (const id of ['today-bol-btn', 'today-bol-czat', 'today-bol-koniec', 'today-bol-nadal']) delete el[id];
    const guzik = (id) => (el[id] = { click() { klikniecia.push(id); } });
    if (nowy === 'nieustalony') { pudelko.innerHTML = ''; delete w._aktywnaKontuzja; return; }
    if (nowy === 'brak' || nowy === 'brak-trener') { w._aktywnaKontuzja = null; guzik('today-bol-btn'); if (nowy === 'brak-trener') guzik('today-bol-czat'); pudelko.innerHTML = '<button id="today-bol-btn">Coś boli</button>'; return; }
    w._aktywnaKontuzja = a; guzik('today-bol-koniec'); if (nowy === 'stare') guzik('today-bol-nadal'); pudelko.innerHTML = '<div>🩹 …</div><button id="today-bol-koniec">Już nie boli</button>';
  }
  ustaw(stan, akt);
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(st.zegar); } static now() { return st.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  const pas = wezel('[data-dn="dzialania"]');
  const zmiana = () => obserwowane.filter(([c]) => c === pudelko).forEach(([, f]) => f());
  const dotknij = (staryId, co = 'stary') => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : k === 'data-stary' ? staryId : null) } : null) } });
  return { w, el, korzen, pudelko, pas, obserwowane, klikniecia, zapytania, ustaw, zmiana, dotknij, tik, B: w.BM_DZIS, trening: wezel('[data-kafel="trening"]') };
}
const przyciski = (html) => [...html.matchAll(/data-dn="stary" data-stary="([a-z-]+)">([^<]+)</g)].map((m) => m[1] + ' ' + m[2]);

test('(1) bez zgłoszenia: ciche „Coś boli” w kaflu treningu; z trenerem także „Napisz do trenera”; zanim stary kod ustali stan, nie ma nic', async () => {
  const s = strona({ stan: 'brak' }); s.B.start(); await s.tik();
  assert.match(s.trening.innerHTML, /<div class="dn-dzialania" data-dn="dzialania"><\/div>$/, 'pas działań na końcu kafla treningu');
  assert.deepEqual(przyciski(s.pas.innerHTML), ['today-bol-btn Coś boli']);
  assert.match(s.pas.innerHTML, /^<div class="dn-ciche"><button type="button" class="dn-cichy" data-dn="stary" data-stary="today-bol-btn">Coś boli<\/button><\/div>$/);
  const zT = strona({ stan: 'brak-trener' }); zT.B.start(); await zT.tik();
  assert.deepEqual(przyciski(zT.pas.innerHTML), ['today-bol-btn Coś boli', 'today-bol-czat Napisz do trenera'], 'konto z trenerem: obie drogi, jak w starej karcie');
  const wczesnie = strona({ stan: 'nieustalony' }); wczesnie.B.start(); await wczesnie.tik();
  assert.equal(wczesnie.pas.innerHTML, '', 'stary kod jeszcze nie sprawdził zgłoszeń: nie pokazujemy „Coś boli” na ślepo');
  assert.ok(wczesnie.obserwowane.some(([c, , o]) => c === wczesnie.pudelko && o.childList && o.subtree), 'nasłuch na stare pudełko');
  wczesnie.ustaw('brak'); wczesnie.zmiana();   // _odswiezBol() dochodzi po module
  assert.deepEqual(przyciski(wczesnie.pas.innerHTML), ['today-bol-btn Coś boli']);
  assert.match(HTML, /<div id="today-bol"><\/div>/); assert.match(HTML, /id="today-bol-btn"/); assert.match(HTML, /id="today-bol-czat"/); assert.match(HTML, /id="today-bol-koniec"/); assert.match(HTML, /id="today-bol-nadal"/);
});

test('(2) dotknięcie klika stary przycisk: zgłoszenie, zamknięcie i odroczenie robi stary kod; moduł nie pisze do injuries ani do pamięci telefonu', async () => {
  const s = strona({ stan: 'brak-trener' }); s.B.start(); await s.tik();
  const przed = s.zapytania.length;
  s.dotknij('today-bol-btn'); s.dotknij('today-bol-czat');
  assert.deepEqual(s.klikniecia, ['today-bol-btn', 'today-bol-czat']);
  assert.equal(s.zapytania.length, przed, 'kliknięcie nie wysyła nic z modułu');
  for (const obcy of ['today-nie-istnieje', 'av-btn', 'save-btn', 'modal-bg', '', null, 'today-bol']) { s.el[obcy || 'x'] = { click() { s.klikniecia.push('OBCY ' + obcy); } }; s.dotknij(obcy); }
  assert.deepEqual(s.klikniecia, ['today-bol-btn', 'today-bol-czat'], 'klikalne są tylko id z listy, nie dowolny element strony');
  assert.deepEqual(JSON.parse(JSON.stringify(s.B.STARE_PRZYCISKI)).filter((x) => /bol/.test(x)), ['today-bol-btn', 'today-bol-czat', 'today-bol-koniec', 'today-bol-nadal']);
  s.ustaw('aktywne', zgloszenie(0)); delete s.el['today-bol-btn'];
  s.dotknij('today-bol-btn'); assert.equal(s.klikniecia.length, 2, 'przycisk, którego stara karta już nie ma, nic nie robi');
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /injuries|bol_nadal|BOL\.(zglos|zamknij)/, 'zapis i odroczenie tylko w starych funkcjach');
  assert.match(SB, /zglos: async function \(athleteId, poziom, miejsce, notatka\) \{[\s\S]{0,200}from\('injuries'\)\.insert/); assert.match(SB, /zamknij: async function \(id\) \{[\s\S]{0,200}update\(\{ resolved_at:/);
});

test('(3) aktywne zgłoszenie: ramka z poziomem, miejscem, od kiedy i zdaniem starej karty; „Już nie boli”; po 30 dniach „Nadal boli?” z drugim przyciskiem', async () => {
  const s = strona({ stan: 'aktywne', akt: zgloszenie(1) }); s.B.start(); await s.tik();
  assert.equal(s.pas.innerHTML, '<div class="dn-bol" data-dn="bol"><b>Boli mocno · Kolano</b><p>Zgłoszone od wczoraj. Zapisane u Ciebie — zamknij, gdy przestanie boleć.</p><div class="dn-bol-akcje"><button type="button" data-dn="stary" data-stary="today-bol-koniec">Już nie boli</button></div></div>');
  for (const [dni, napis] of [[0, 'Zgłoszone dziś.'], [1, 'Zgłoszone od wczoraj.'], [5, 'Zgłoszone od 5 dni.']]) assert.match(s.B.bolHtml.call(null, TERAZ) && (s.w._aktywnaKontuzja = zgloszenie(dni), s.B.bolHtml(TERAZ).ramka), new RegExp('<p>' + napis.replace('.', '\\.')), String(dni));
  s.w._aktywnaKontuzja = zgloszenie(2, { poziom: 3, miejsce: 'stopa' });
  assert.match(s.B.bolHtml(TERAZ).ramka, /<b>Nie mogę biegać · Stopa<\/b><p>Zgłoszone od 2 dni\. Zapisane u Ciebie\. Ból uniemożliwiający bieganie warto skonsultować\.<\/p>/, 'poziom 3: zdanie o konsultacji ze starej funkcji, bez straszenia');
  s.dotknij('today-bol-koniec'); assert.deepEqual(s.klikniecia, ['today-bol-koniec']);
  s.ustaw('brak'); s.zmiana();   // stary kod po zamknięciu przerysował pudełko
  assert.deepEqual(przyciski(s.pas.innerHTML), ['today-bol-btn Coś boli'], 'po zamknięciu wraca ciche „Coś boli”'); assert.doesNotMatch(s.pas.innerHTML, /dn-bol"/);
  const stare = strona({ stan: 'stare', akt: zgloszenie(34) }); stare.B.start(); await stare.tik();
  assert.match(stare.pas.innerHTML, /<p>Zgłoszone od 34 dni\. Nadal boli\?<\/p>/);
  assert.deepEqual(przyciski(stare.pas.innerHTML), ['today-bol-koniec Już nie boli', 'today-bol-nadal Nadal boli']);
  stare.dotknij('today-bol-nadal'); assert.deepEqual(stare.klikniecia, ['today-bol-nadal'], 'odroczenie zapisuje stary kod (klucz bol_nadal_ w telefonie)');
  const xss = strona({ stan: 'aktywne', akt: zgloszenie(1, { miejsce: '<img src=x>', poziom: '<b>9</b>' }) }); xss.B.start(); await xss.tik();
  assert.doesNotMatch(xss.pas.innerHTML, /<img|<b>9/, 'wartości z bazy escapowane');
  const bezBol = strona({ stan: 'aktywne' }); delete bezBol.w.BOL; delete bezBol.w._bolCoDalej; bezBol.B.start(); await bezBol.tik();
  assert.match(bezBol.pas.innerHTML, /<b>Zgłoszony ból<\/b><p>Zgłoszone od wczoraj\.<\/p>/, 'bez słownika starego ekranu ramka dalej jest i da się zamknąć');
});

test('(4) pas działań przeżywa ponowne wczytanie kafla; błąd treningu i podgląd trenera go nie pokazują', async () => {
  const s = strona({ stan: 'aktywne' }); s.B.start(); await s.tik();
  const pierwszy = s.pas.innerHTML; assert.match(pierwszy, /dn-bol/);
  s.pas.innerHTML = ''; s.B.wczytaj(true); await s.tik();
  assert.equal(s.pas.innerHTML, pierwszy, 'po przerysowaniu kafla pas wraca (nie polegamy na pamięci poprzedniego HTML)');
  const trener = strona({ stan: 'aktywne', search: '?from=trener' }); trener.B.start(); await trener.tik();
  assert.equal(trener.pas.innerHTML, ''); assert.equal(trener.korzen.innerHTML, '');
  for (const sel of MODUL.match(/[^"{}]*\.dn-(bol|cich[ye]|dzialania)[^{]*\{/g)) for (const jeden of sel.replace(/\{$/, '').split(',')) assert.match(jeden.trim(), /^#dzis-nowy /, 'selektor poza nowym Dziś: ' + jeden);
  assert.match(MODUL, /#dzis-nowy \.dn-cichy\{min-height:44px/); assert.match(MODUL, /#dzis-nowy \.dn-bol-akcje button\{[^}]*min-height:44px/);
});
