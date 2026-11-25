// Blizna #366 (25.11.2026) — nowe Dziś, E4a: „Wczoraj nie zrobiłem”.
//
// Stare Dziś ma w karcie treningu przycisk, którym zawodnik rozlicza WCZORAJSZY plan („nie zrobiłem”, z cofnięciem).
// Stoi tam świadomie: w kalendarzu nikt go nie znajdował (0 wierszy „missed” na 2207, komentarz w zawodnik.html).
// Nowe Dziś chowało kartę razem z przyciskiem. Decyzja Filipa 25.11: zostaje jak w starym, czyli wczorajszy plan;
// „Nie dziś” dla DZISIEJSZEGO treningu (makieta r5) to osobna funkcja na później.
// Stary kod sam decyduje, czy przycisk pokazać (jeden wczorajszy plan, nie odpoczynek, nie zrobiony) i jaki ma napis.
// Nowy kafel przepisuje napis i klika stary przycisk: zapis (update trainings.status planned ↔ missed) robi stara
// oznaczNieZrobione. Ten zapis przeszedł próbę na prawdziwej bazie w wycofanej transakcji (własny plan od trenera:
// 1 wiersz w obie strony; cudzy: 0 wierszy).
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
const tik = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function strona({ display = 'none', napis = '', bol = 'brak', search = '' } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, obserwowane = [], klikniecia = [], zapytania = [];
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: false, _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k] || null; }, removeAttribute(k) { delete this._a[k]; }, querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll: () => [] });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  /* stary przycisk: oznaczNieZrobione(this) przełącza stan i napis, jak w zawodnik.html */
  const stary = { style: { display }, textContent: napis, dataset: { stan: 'planned' }, click() { klikniecia.push('today-nie-zrobilem'); const m = this.dataset.stan === 'missed'; this.dataset.stan = m ? 'planned' : 'missed'; this.textContent = m ? 'Wczoraj nie zrobiłem' : 'Wczoraj: nie zrobione ✓ · cofnij'; } };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'today-nie-zrobilem': stary, 'today-bol': { innerHTML: bol === 'brak' ? '<button id="today-bol-btn"></button>' : '' } };
  if (bol === 'brak') el['today-bol-btn'] = { click() { klikniecia.push('today-bol-btn'); } };
  const w = { _currentSection: 'home', _aktywnaKontuzja: null, location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {}, showSection(n) { this._currentSection = n; }, _logKlienta() {},
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' }, MutationObserver: function (f) { this.observe = (cel, o) => obserwowane.push([cel, f, o]); },
    sb: { from: () => { let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || new Promise((ok) => { zapytania.push('from'); ok({ data: [], error: null }); })).then(a, b); return () => q; } }); return q; },
      rpc: () => ({ then: (a, b) => Promise.resolve({ data: { wystartowala: false }, error: null }).then(a, b) }), auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } };
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date, Promise, encodeURIComponent });
  const pas = wezel('[data-dn="dzialania"]');
  const zmiana = () => obserwowane.filter(([c]) => c === stary).forEach(([, f]) => f());
  const dotknij = (id) => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? 'stary' : k === 'data-stary' ? id : null) } : null) } });
  return { w, korzen, stary, pas, obserwowane, klikniecia, zapytania, zmiana, dotknij, tik, B: w.BM_DZIS };
}
const przyciski = (html) => [...html.matchAll(/data-dn="stary" data-stary="([a-z-]+)">([^<]+)</g)].map((m) => m[1] + ' | ' + m[2]);

test('(1) przycisk pokazuje się tylko wtedy, gdy stary kod odsłonił swój; napis jest jego; stoi przed „Coś boli”', async () => {
  const ukryty = strona(); ukryty.B.start(); await ukryty.tik();
  assert.deepEqual(przyciski(ukryty.pas.innerHTML), ['today-bol-btn | Coś boli'], 'wczoraj bez planu, dwa plany, odpoczynek albo zrobione: stary przycisk schowany, nowego też nie ma');
  const s = strona({ display: 'block', napis: 'Wczoraj nie zrobiłem' }); s.B.start(); await s.tik();
  assert.deepEqual(przyciski(s.pas.innerHTML), ['today-nie-zrobilem | Wczoraj nie zrobiłem', 'today-bol-btn | Coś boli']);
  assert.equal(s.B.wczorajHtml(), '<button type="button" class="dn-cichy" data-dn="stary" data-stary="today-nie-zrobilem">Wczoraj nie zrobiłem</button>');
  assert.equal(strona({ display: '', napis: 'Wczoraj nie zrobiłem' }).B.wczorajHtml(), '', 'pusty display to nie „odsłonięty”: stary kod ustawia block albo none');
  assert.equal(strona({ display: 'block', napis: '   ' }).B.wczorajHtml(), '', 'bez napisu nie ma pustego przycisku');
  assert.equal(strona({ display: 'block', napis: '<b>x</b>' }).B.wczorajHtml().includes('<b>x</b>'), false, 'napis escapowany');
  assert.match(HTML, /<button id="today-nie-zrobilem" onclick="oznaczNieZrobione\(this\)"/, 'stary przycisk sam woła oznaczNieZrobione(this)');
  assert.match(HTML, /btn\.textContent = zrobione \? 'Wczoraj: nie zrobione ✓ · cofnij' : 'Wczoraj nie zrobiłem';/);
  assert.match(HTML, /btn\.style\.display = 'block';/); assert.match(HTML, /const t = \(data && data\.length === 1\) \? data\[0\] : null;/, 'przy dwóch planach stary kod milczy');
});

test('(2) stary przycisk odsłonięty po starcie modułu (zwykła kolejność) → pojawia się; dotknięcie klika stary przycisk; napis zmienia się na „cofnij” i z powrotem', async () => {
  const s = strona(); s.B.start(); await s.tik();
  assert.ok(s.obserwowane.some(([c, , o]) => c === s.stary && o.attributes && o.childList), 'nasłuch na styl i napis starego przycisku');
  s.stary.style.display = 'block'; s.stary.textContent = 'Wczoraj nie zrobiłem'; s.zmiana();
  assert.deepEqual(przyciski(s.pas.innerHTML)[0], 'today-nie-zrobilem | Wczoraj nie zrobiłem');
  const przed = s.zapytania.length;
  s.dotknij('today-nie-zrobilem'); s.zmiana();
  assert.deepEqual(s.klikniecia, ['today-nie-zrobilem'], 'zapis robi stara oznaczNieZrobione');
  assert.deepEqual(przyciski(s.pas.innerHTML)[0], 'today-nie-zrobilem | Wczoraj: nie zrobione ✓ · cofnij');
  s.dotknij('today-nie-zrobilem'); s.zmiana();
  assert.deepEqual(przyciski(s.pas.innerHTML)[0], 'today-nie-zrobilem | Wczoraj nie zrobiłem', 'cofnięcie');
  assert.equal(s.zapytania.length, przed, 'moduł sam o nic nie pyta i nic nie zapisuje');
  s.stary.style.display = 'none'; s.zmiana();
  assert.deepEqual(przyciski(s.pas.innerHTML), ['today-bol-btn | Coś boli'], 'stary schował przycisk: nowy znika');
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /from\("trainings"\)\.update|status: *"missed"|oznaczNieZrobione\(/, 'status treningu zmienia wyłącznie stara funkcja, przez swój przycisk');
});

test('(3) z aktywnym zgłoszeniem bólu przycisk dalej jest; podgląd trenera go nie pokazuje', async () => {
  const s = strona({ display: 'block', napis: 'Wczoraj nie zrobiłem', bol: 'nieustalony' }); s.B.start(); await s.tik();
  assert.deepEqual(przyciski(s.pas.innerHTML), ['today-nie-zrobilem | Wczoraj nie zrobiłem'], 'niezależny od stanu bólu');
  const trener = strona({ display: 'block', napis: 'Wczoraj nie zrobiłem', search: '?from=trener' }); trener.B.start(); await trener.tik();
  assert.equal(trener.pas.innerHTML, '');
  assert.ok(JSON.parse(JSON.stringify(s.B.STARE_PRZYCISKI)).includes('today-nie-zrobilem'));
});
