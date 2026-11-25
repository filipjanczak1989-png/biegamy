// Blizna #364 (25.11.2026) — nowe Dziś, E4a: „Zaloguj wynik” w kaflu „Trening na dziś”.
//
// Tabela porównania z 25.11: trening na dziś to główne zadanie ekranu, a w nowym Dziś był tylko do czytania.
// Kto chciał wpisać wynik, musiał wiedzieć, że służy do tego krążek Log w menu, albo wracać na stare Dziś.
// Zasada Filipa: zapisy tylko przez istniejące stare funkcje. Przycisk woła więc globalną openModal() (ten sam formularz
// co Log; zapis robi stara saveLog), a moduł niczego nie zapisuje. Po udanym zapisie (formularz zamknięty) kafle
// wczytują się od nowa; po nieudanym (walidacja zostawia formularz otwarty) nie.
// Wiersze planu w kształcie z bazy: trainings.status to 'planned' | 'done' | 'missed', type bywa 'Odpoczynek' / 'Wolne'.
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
const plan = (z) => Object.assign({ id: 't1', date: '2026-11-25', type: 'Interwały', distance_km: 8, duration_min: null, pace: '4:30', description: 'Rozgrzewka 2 km.', status: 'planned', plan_source: null, coach_id: null }, z);

function strona({ treningi = [plan()], search = '', zOpenModal = true } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], stan = { zegar: 1e12, otwarc: 0, zapisow: 0, formularzOtwarty: false, wynikZapisu: 'ok', pytanOSesje: 0, zgloszenia: [] };
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: false, _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k] || null; }, removeAttribute(k) { delete this._a[k]; }, querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll: () => [] });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'modal-bg': { classList: { contains: (c) => c === 'open' && stan.formularzOtwarty } } };
  const DANE = { athletes: { id: 'a-1', full_name: 'Ola Nowak', coach_id: null }, 'rpc akcja_licznik': { wystartowala: false }, 'rpc akcja_moj_wklad': { km: 0 }, trainings: treningi, training_logs: [] };
  const wyslij = (nazwa) => { const zq = { nazwa, stan: 'czeka' }; zapytania.push(zq); return new Promise((ok) => { zq.odpowiedz = () => { if (zq.stan !== 'czeka') return; zq.stan = 'jest'; ok({ data: DANE[nazwa], error: null, status: 200 }); }; }); };
  const lancuch = (t) => { let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || wyslij(t)).then(a, b); return () => q; } }); return q; };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {}, showSection(n) { this._currentSection = n; }, _logKlienta(o) { stan.zgloszenia.push(o.message); },
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' },
    async saveLog() { stan.zapisow++; if (stan.wynikZapisu === 'ok') stan.formularzOtwarty = false; if (stan.wynikZapisu === 'wyjatek') throw new Error('x'); return undefined; },
    sb: { from: lancuch, rpc: (n) => { let p = null; return { then: (a, b) => (p = p || wyslij('rpc ' + n)).then(a, b) }; }, auth: { getSession: async () => { stan.pytanOSesje++; return { data: { session: { user: { id: 'u-1' } } } }; } } } };
  if (zOpenModal) w.openModal = async () => { stan.otwarc++; stan.formularzOtwarty = true; };
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(2026, 10, 25, 12, 0, 0); } static now() { return stan.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  async function doKonca() { await tik(); for (let i = 0; i < 12 && zapytania.some((x) => x.stan === 'czeka'); i++) { for (const x of zapytania.filter((y) => y.stan === 'czeka')) x.odpowiedz(); await tik(); } }
  const dotknij = (co) => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : null) } : null) } });
  return { w, korzen, zapytania, stan, doKonca, tik, dotknij, B: w.BM_DZIS, trening: wezel('[data-kafel="trening"]') };
}
const przycisk = (html) => { const m = html.match(/<button type="button" class="(dn-glowny|dn-drugi)" data-dn="zaloguj">([^<]+)<\/button>/g) || []; return m.map((x) => x.replace(/<button type="button" class="|" data-dn="zaloguj">|<\/button>/g, ' ').trim()); };

test('(1) przycisk w kaflu: z niezrobionym planem główny „Zaloguj wynik”; bez planu, w dzień wolny i po zrobionym planie mniejszy „Dodaj trening”; zawsze dokładnie jeden', () => {
  const B = strona().B;
  assert.deepEqual(przycisk(B.treningHtml([plan()])), ['dn-glowny Zaloguj wynik']);
  assert.match(B.treningHtml([plan()]), /<p class="dn-tekst">Rozgrzewka 2 km\.<\/p><button type="button" class="dn-glowny" data-dn="zaloguj">Zaloguj wynik<\/button>$/, 'pod opisem treningu, na końcu kafla');
  assert.deepEqual(przycisk(B.treningHtml([plan({ status: 'missed' })])), ['dn-glowny Zaloguj wynik'], '„nie zrobione” można jeszcze nadrobić');
  assert.deepEqual(przycisk(B.treningHtml([plan({ status: 'done' })])), ['dn-drugi Dodaj trening']);
  assert.deepEqual(przycisk(B.treningHtml([plan({ status: 'done' }), plan({ id: 't2', type: 'Wzmacniający' })])), ['dn-glowny Zaloguj wynik'], 'dwa treningi, jeden czeka');
  for (const typ of ['Odpoczynek', 'Wolne', 'Dzień wolny', 'Rest']) assert.deepEqual(przycisk(B.treningHtml([plan({ type: typ, description: '' })])), ['dn-drugi Dodaj trening'], typ);
  assert.deepEqual(przycisk(B.treningHtml([])), ['dn-drugi Dodaj trening']); assert.deepEqual(przycisk(B.treningHtml(null)), ['dn-drugi Dodaj trening']);
  assert.match(HTML, /<button class="btn btn-primary" onclick="openModal\(\)"[^>]*>Zaloguj wynik<\/button>/, 'ten sam napis i ta sama funkcja co w starej karcie');
});

test('(2) dotknięcie woła stare openModal() i nic więcej: moduł nie pyta bazy i niczego nie zapisuje', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  assert.match(s.trening.innerHTML, /data-dn="zaloguj">Zaloguj wynik</);
  const przed = s.zapytania.length;
  s.dotknij('zaloguj'); await s.tik();
  assert.equal(s.stan.otwarc, 1); assert.equal(s.zapytania.length, przed, 'samo otwarcie formularza nie pyta');
  const bez = strona({ zOpenModal: false }); bez.B.start(); await bez.doKonca();
  bez.dotknij('zaloguj'); assert.equal(bez.korzen.hidden, false, 'brak funkcji starego ekranu nie wywraca nowego');
  assert.deepEqual(bez.stan.zgloszenia, [], 'i nie jest zgłaszany jako błąd rysowania');
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /from\("training_logs"\)\.insert|\.insert\(/, 'wpis treningu robi wyłącznie stara saveLog');
});

test('(3) po udanym zapisie (formularz zamknięty) kafle wczytują się od nowa; po nieudanym nie; saveLog owinięta raz i dalej oddaje swój wynik', async () => {
  const s = strona(); s.B.start(); s.B.start(); await s.doKonca();
  assert.equal(s.zapytania.length, 5);
  s.dotknij('zaloguj'); await s.tik();
  s.stan.wynikZapisu = 'walidacja';   // „Podaj dystans”: stara funkcja wraca, formularz zostaje
  await s.w.saveLog(); await s.doKonca();
  assert.equal(s.stan.zapisow, 1); assert.equal(s.zapytania.length, 5, 'nieudany zapis nie odświeża');
  s.stan.wynikZapisu = 'ok';
  const wynik = s.w.saveLog(); assert.equal(typeof wynik.then, 'function', 'owinięta funkcja dalej oddaje obietnicę starej');
  await wynik; await s.doKonca();
  assert.equal(s.stan.zapisow, 2, 'stara funkcja wołana raz na dotknięcie (owinięcie tylko jedno)');
  assert.equal(s.zapytania.length, 10, 'jedno ponowne wczytanie mimo okna 60 s');
  assert.equal(s.stan.pytanOSesje, 2, 'jedno wczytanie na jeden zapis (funkcja owinięta dwa razy startowałaby je podwójnie)');
  s.stan.formularzOtwarty = true; s.stan.wynikZapisu = 'wyjatek';
  await assert.rejects(() => s.w.saveLog(), 'wyjątek starej funkcji idzie dalej do jej wołającego');
  await s.doKonca(); assert.equal(s.zapytania.length, 10);
  const trener = strona({ search: '?from=trener' }); trener.B.start(); await trener.doKonca();
  await trener.w.saveLog(); await trener.doKonca();
  assert.equal(trener.zapytania.length, 0, 'podgląd trenera: nowe Dziś ustępuje i po zapisie też nie pyta');
  const sponsor = strona(); sponsor.B.start(); await sponsor.doKonca();
  sponsor.w.location.hash = '#sponsor';   // ekran ustąpił staremu już po starcie modułu
  await sponsor.w.saveLog(); await sponsor.doKonca();
  assert.equal(sponsor.zapytania.length, 5, 'gdy nowe Dziś ustąpiło w trakcie, zapis go nie budzi');
});

test('(4) cel dotyku i styl: przyciski 48 px, tylko pod #dzis-nowy', () => {
  assert.match(MODUL, /#dzis-nowy \.dn-glowny,#dzis-nowy \.dn-drugi\{[^}]*min-height:48px/);
  for (const sel of MODUL.match(/[^"{}]*\.dn-(glowny|drugi)[^{]*\{/g)) for (const jeden of sel.replace(/\{$/, '').split(',')) assert.match(jeden.trim(), /^#dzis-nowy /, 'selektor poza nowym Dziś: ' + jeden);
});
