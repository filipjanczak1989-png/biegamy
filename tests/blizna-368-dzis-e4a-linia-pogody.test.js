// Blizna #368 (25.11.2026) — nowe Dziś, E4a: linia pogody przy treningu.
//
// Stare Dziś ma kafel pogody na 3 dni; nowe nie pokazywało pogody wcale. Decyzja Filipa 25.11: jedna linia przy treningu,
// jako lustro starego kafla, BEZ własnego wołania funkcji get-weather (stary kod i tak ją woła i zostawia wynik
// w window._weatherCache; funkcja bywała zawodna, rano 25.11 odpowiadała 401).
// Kształt danych wzięty z supabase/functions/get-weather/index.ts: { city, days: [{ date, label, temp_min, temp_max,
// precip_pct, wind_kmh, weather_code, is_bad, … }] }, temperatury zaokrąglone do całych stopni.
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
const EF = czytaj('supabase/functions/get-weather/index.ts');
const tik = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const D0 = new Date(2026, 10, 25, 12, 0, 0);
const dzien = (data, z) => Object.assign({ date: data, icon: '⛅', label: 'Częściowe zachmurzenie', weather_code: 2, cloud_pct: 40, temp_min: 3, temp_max: 8, precip_mm: 0, precip_pct: 10, wind_kmh: 12, is_bad: false }, z);
const pogoda = (...dni) => ({ ok: true, city: 'Poznań', days: dni });

function strona({ cache = undefined, treningi = [{ id: 't1', type: 'Spokojny', distance_km: 6, status: 'planned', description: 'Luźno.', coach_id: 'c-1' }], search = '', zRender = true } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], st = { zegar: D0.getTime(), rysowan: 0 };
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: false, _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k] || null; }, removeAttribute(k) { delete this._a[k]; }, querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll: () => [] });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } } };
  const DANE = { athletes: { id: 'a-1', full_name: 'Ola Nowak', coach_id: null }, trainings: treningi, training_logs: [] };
  const lancuch = (t) => { let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || new Promise((ok) => { zapytania.push(t); ok({ data: DANE[t], error: null, status: 200 }); })).then(a, b); return () => q; } }); return q; };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {}, showSection(n) { this._currentSection = n; }, _logKlienta() {},
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' },
    sb: { from: lancuch, rpc: (n) => ({ then: (a, b) => { zapytania.push('rpc ' + n); return Promise.resolve({ data: { wystartowala: false }, error: null }).then(a, b); } }), auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } },
    fetch() { zapytania.push('FETCH'); return Promise.reject(new Error('moduł nie ma prawa wołać sieci sam')); } };
  if (cache !== undefined) w._weatherCache = cache;
  if (zRender) w._renderWeather = function (data) { st.rysowan++; w._weatherCache = data; return 'wynik starej'; };   // jak w zawodnik.html: zapamiętuje dane i rysuje swój kafel
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(st.zegar); } static now() { return st.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  return { w, korzen, zapytania, st, tik, B: w.BM_DZIS, trening: wezel('[data-kafel="trening"]') };
}
const kto = (html) => (html.match(/<div class="dn-kto">([^<]*)<\/div>/) || [])[1] || '';

test('(1) linia z dzisiejszego dnia starego kafla: zakres temperatur i opis z funkcji pogody; doklejona do podtytułu treningu', async () => {
  const B = strona().B, t = (c) => { const s = strona({ cache: c }); return s.B.pogodaTekst(D0); };
  assert.equal(t(pogoda(dzien('2026-11-25'))), 'dziś 3–8 °C, częściowe zachmurzenie');
  assert.equal(t(pogoda(dzien('2026-11-25', { label: 'Deszcz', temp_min: 1, temp_max: 4 }))), 'dziś 1–4 °C, deszcz');
  assert.equal(t(pogoda(dzien('2026-11-25', { temp_min: 5, temp_max: 5, label: 'Pochmurno' }))), 'dziś 5 °C, pochmurno');
  assert.equal(t(pogoda(dzien('2026-11-25', { temp_min: -6, temp_max: -1, label: 'Śnieg' }))), 'dziś od −6 do −1 °C, śnieg', 'mróz: bez zbitki „-6–-1”');
  assert.equal(t(pogoda(dzien('2026-11-25', { temp_min: -2, temp_max: 3 }))), 'dziś od −2 do 3 °C, częściowe zachmurzenie');
  assert.equal(t(pogoda(dzien('2026-11-25', { temp_min: 0, temp_max: 0, label: 'Mgła' }))), 'dziś 0 °C, mgła');
  assert.equal(t(pogoda(dzien('2026-11-25', { label: 'Pogoda' }))), 'dziś 3–8 °C', '„Pogoda” to zaślepka funkcji dla nieznanego kodu: nie powtarzamy jej');
  assert.equal(t(pogoda(dzien('2026-11-25', { label: undefined }))), 'dziś 3–8 °C');
  assert.equal(t(pogoda(dzien('2026-11-24'), dzien('2026-11-25', { temp_min: 2, temp_max: 6, label: 'Mżawka' }), dzien('2026-11-26'))), 'dziś 2–6 °C, mżawka', 'bierzemy dzień o dzisiejszej dacie, nie pierwszy z listy');
  assert.equal(B.treningHtml([], 'dziś 3–8 °C, deszcz').includes('<div class="dn-kto">bez planu · dziś 3–8 °C, deszcz</div>'), true);
  assert.equal(kto(B.treningHtml([{ type: 'Tempo', coach_id: 'c' }], 'dziś 5 °C')), 'od trenera · dziś 5 °C');
  assert.equal(kto(B.treningHtml([{ type: 'Tempo', plan_source: 'generator' }], 'dziś 5 °C')), 'z generatora · dziś 5 °C');
  assert.equal(kto(B.treningHtml([{ type: 'Tempo' }], 'dziś 5 °C')), 'dziś 5 °C', 'plan bez źródła: sama pogoda, bez wiszącej kropki');
  assert.equal(kto(B.treningHtml([{ type: 'Tempo', coach_id: 'c' }], '')), 'od trenera'); assert.equal(kto(B.treningHtml([{ type: 'Tempo', coach_id: 'c' }])), 'od trenera', 'bez pogody podtytuł jak dotąd');
  // kształt danych z funkcji pogody
  for (const pole of ['date,', 'label: info.label,', 'temp_min: tempMin,', 'temp_max: tempMax,']) assert.ok(EF.includes(pole), 'pole w odpowiedzi get-weather: ' + pole);
  assert.match(EF, /const tempMax = Math\.round\(/); assert.match(HTML, /try \{ window\._weatherCache = data; \} catch\(_\) \{\}/, 'stary kafel zostawia dane w window._weatherCache');
});

test('(2) nie zgadujemy: bez danych, bez dzisiejszego dnia, przy zepsutych liczbach i bez miasta linii nie ma', () => {
  const t = (c) => strona({ cache: c }).B.pogodaTekst(D0);
  for (const zly of [undefined, null, {}, { days: null }, { days: [] }, { days: 'x' }, pogoda(dzien('2026-11-24')), pogoda(dzien('2026-11-26')), pogoda(null), pogoda({}),
    pogoda(dzien('2026-11-25', { temp_min: null })), pogoda(dzien('2026-11-25', { temp_max: '8' })), pogoda(dzien('2026-11-25', { temp_min: NaN })), pogoda(dzien('2026-11-25', { temp_max: Infinity }))])
    assert.equal(t(zly), '', JSON.stringify(zly));
  assert.equal(t(pogoda(dzien('2026-11-25', { label: 'x'.repeat(60) }))), 'dziś 3–8 °C', 'nienaturalnie długi opis pominięty');
  assert.equal(t(pogoda(dzien('2026-11-25', { temp_min: 9, temp_max: 2 }))), 'dziś 2–9 °C, częściowe zachmurzenie', 'odwrócone min i max nie dają „9–2”');
  const xss = strona({ cache: pogoda(dzien('2026-11-25', { label: '<img src=x>' })) });
  assert.doesNotMatch(xss.B.treningHtml([{ type: 'Tempo' }], xss.B.pogodaTekst(D0)), /<img src=x>/, 'opis z funkcji escapowany w podtytule');
});

test('(3) lustro, nie własne wołanie: dane dochodzą po starcie modułu → kafel dostaje linię; moduł nie woła get-weather ani żadnej sieci', async () => {
  const s = strona(); s.B.start(); await s.tik();
  assert.equal(kto(s.trening.innerHTML), 'od trenera', 'pogody jeszcze nie ma: podtytuł bez niej');
  const przed = s.zapytania.slice();
  const wynik = s.w._renderWeather(pogoda(dzien('2026-11-25', { label: 'Deszcz', temp_min: 1, temp_max: 4 })));   // stary loadWeather skończył
  assert.equal(wynik, 'wynik starej'); assert.equal(s.st.rysowan, 1, 'stara funkcja wołana raz i oddaje swój wynik');
  assert.equal(kto(s.trening.innerHTML), 'od trenera · dziś 1–4 °C, deszcz');
  assert.deepEqual(s.zapytania, przed, 'pojawienie się pogody nie wysyła niczego z modułu');
  s.B.start(); s.B.start();
  let rysowanKafla = 0, tresc = s.trening.innerHTML; Object.defineProperty(s.trening, 'innerHTML', { get: () => tresc, set: (v) => { rysowanKafla++; tresc = v; } });
  s.w._renderWeather(pogoda(dzien('2026-11-25')));
  assert.equal(rysowanKafla, 1, 'jedno przerysowanie kafla na jedno przyjście danych (funkcja owinięta wielokrotnie rysowałaby wiele razy)');
  assert.equal(s.st.rysowan, 2, 'kolejne starty nie owijają funkcji drugi raz');
  assert.equal(kto(s.trening.innerHTML), 'od trenera · dziś 3–8 °C, częściowe zachmurzenie', 'nowsze dane zastępują starsze');
  const wczesniej = strona({ cache: pogoda(dzien('2026-11-25')) }); wczesniej.B.start(); await wczesniej.tik();
  assert.equal(kto(wczesniej.trening.innerHTML), 'od trenera · dziś 3–8 °C, częściowe zachmurzenie', 'dane były przed startem modułu (pamięć karty): linia od razu');
  const bezPlanu = strona({ cache: pogoda(dzien('2026-11-25')), treningi: [] }); bezPlanu.B.start(); await bezPlanu.tik();
  assert.equal(kto(bezPlanu.trening.innerHTML), 'bez planu · dziś 3–8 °C, częściowe zachmurzenie');
  const bezStarej = strona({ cache: pogoda(dzien('2026-11-25')), zRender: false }); bezStarej.B.start(); await bezStarej.tik();
  assert.equal(kto(bezStarej.trening.innerHTML), 'od trenera · dziś 3–8 °C, częściowe zachmurzenie', 'brak starej funkcji nie psuje ekranu');
  for (const x of [s, wczesniej, bezPlanu]) assert.equal(x.zapytania.includes('FETCH'), false);
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /get-weather|SB_FN_URL|loadWeather|fetch\(|open-meteo/, 'moduł nie woła funkcji pogody');
  const pozno = strona({ zRender: false }); pozno.B.start(); await pozno.tik();
  pozno.w._weatherCache = pogoda(dzien('2026-11-25'));   // dane wpadły bez starej funkcji pod ręką (nie było czego owinąć)
  assert.equal(kto(pozno.trening.innerHTML), 'od trenera'); const ileZap = pozno.zapytania.length;
  pozno.B.start();   // kolejny start z initAuth
  assert.equal(kto(pozno.trening.innerHTML), 'od trenera · dziś 3–8 °C, częściowe zachmurzenie', 'następny start dopisuje linię');
  assert.equal(pozno.zapytania.length, ileZap, 'bez nowych zapytań');
  const przedDanymi = strona(); przedDanymi.w._renderWeather(pogoda(dzien('2026-11-25')));   // stara funkcja wołana, zanim moduł cokolwiek narysował
  assert.equal(przedDanymi.trening.innerHTML, '', 'sama pogoda nie rysuje kafla bez planu');
});
