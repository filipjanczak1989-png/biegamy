/* blizna-241 (14.11, przegląd frontu biegu wirtualnego przed 18.11: Downloads/biegamy-podglady/noc-1311/bieg/przeglad-frontu.md). Numery = usterki z przeglądu.
   1  bramka zapisu: przy TEKSTY_GOTOWE = false i bez ?proba=1 strona nigdy nie pokazuje zapisu (stanStrony + bieg.html w atrapie przeglądarki), na ?proba=1 zapis działa;
   2  link „Bieg wirtualny ›” na dla-fabianka.html tylko przy obiekcie bieg w liczniku; powrót na bieg po zalogowaniu znacznikiem w localStorage (bieg.html → js/akcja.mjs na zawodnik.html);
   4  błąd licznika ≠ szkic, błąd listy ≠ pusta lista;   5  polskie komunikaty, surowy błąd nie trafia na ekran;   6  każdy kod odmowy z migracji ma tekst, „Wycofaj” raz na raz i odświeża;
   7  jeden escape linku zbiórki (prawdziwe escapeHtml i safeExternalHref z sb.js);   8  zgoda na e-mail tylko w fazie zapisy;   9  pola karty zostają po przerysowaniu;
   10 rada przy zapisie 10 km;   12 limit czasu licznika próby;   14 role alert/status;   16 „w tym dziecko”;   19 data biegu na dyplomie;   21 rezygnacja: 503 ≠ link nieaktualny;
   22 imię z profilu w polu;   25 wylogowany po zapisach widzi „zamknięte”, kontakt przy wyniku;   26 og:title, różne id gradientów odznak;   27 tekst ranking_wiek w karcie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb, blokiSkryptow, zamrozTimery, atrapaPrzegladarki } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const kod = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const MIG1 = 'supabase/migrations/20261120_akcja_bieg.sql', MIG2 = 'supabase/migrations/20261126_akcja_bieg_wyniki.sql';
const BIEG = (faza, x) => Object.assign({ slug: 'mikolajki', nazwa: 'Bieg na Mikołajki', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', dystanse_km: [5, 10], faza, regulamin_wersja: 'v1',
  wsparcie_kwoty_zl: [20, 30, 50], limit_dzieci: 6, zapisani: 0, zapisani_na: {}, dzieci: 0, ukonczyli_n: 0 }, x || {});
const LICZNIK = (bieg) => ({ wystartowala: true, nazwa: 'Akcja', suma_km: 10, cel_km: 100, pct: 10, start: '2026-11-07', koniec: null, zamknieta: false, url_zbiorki: 'https://www.siepomaga.pl/x', stawka_filip_gr: 10, filip_gr: 100, filip_max_gr: 125000, bieg });
const czekaj = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
let B, A, SB;

test.before(async () => {
  SB = zaladujSb();   // PRAWDZIWE helpery z sb.js (vm), nie atrapy: usterka 7 wymaga prawdziwego escape
  for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  A = globalThis.BM_AKCJA; B = globalThis.BM_BIEG_REAL;
});

/* ── ATRAPA PRZEGLĄDARKI DLA STRONY: sb.js, js/akcja.mjs, js/bieg.mjs i blok <script> strony w vm; elementy z id i [data-stan] z HTML strony ── */
function magazyn(start) { const m = new Map(Object.entries(start || {})); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; }
function nowyElement(id, attrs) {
  const h = {};
  const e = { id, hidden: false, textContent: '', innerHTML: '', className: '', href: '', value: '', checked: false, disabled: false, style: {}, attrs: Object.assign({}, attrs || {}), _h: h,
    addEventListener(t, f) { (h[t] = h[t] || []).push(f); }, getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; }, appendChild(c) { (this.dzieci = this.dzieci || []).push(c); return c; }, remove() {},
    querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {}, focus() {}, closest: () => null,
    klik() { (h.click || []).forEach((f) => f.call(e, { target: e, preventDefault() {} })); } };
  let tekst = ''; Object.defineProperty(e, 'textContent', { get: () => tekst, set: (v) => { tekst = String(v); e.dzieci = []; }, enumerable: true });   // jak w przeglądarce: nowy tekst usuwa dzieci
  return e;
}
function domStrony(ctx, plik) {
  const html = czytaj(plik).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), rej = new Map(), stany = [], zdarzenia = {};
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const a = m[2], id = /\bid="([^"]+)"/.exec(a), ds = /\bdata-stan="([^"]+)"/.exec(a), ukryty = /\shidden(?=[\s>]|$)/.test(a);
    const e = nowyElement(id ? id[1] : '', ds ? { 'data-stan': ds[1] } : {}); e.hidden = ukryty; e.href = (/\bhref="([^"]*)"/.exec(a) || [])[1] || '';
    if (/\bdata-powrot\b/.test(a)) e.attrs['data-powrot'] = '';
    if (/\bdata-polityka\b/.test(a)) { e.attrs['data-polityka'] = ''; stany.polityka = (stany.polityka || []).concat([e]); }
    if (id) rej.set(id[1], e); else if (ds) stany.push(e);
  }
  const daj = (id) => { if (!rej.has(id)) rej.set(id, nowyElement(id)); return rej.get(id); };
  if (rej.has('bw-cta')) rej.get('bw-cta').querySelectorAll = (s) => (s === '[data-stan]' ? stany : []);
  Object.assign(ctx.document, {
    getElementById: daj, querySelector: () => null, createElement: (t) => Object.assign(nowyElement(''), { tag: t }), createTextNode: (t) => ({ textContent: t }), head: nowyElement('head'), body: nowyElement('body'), readyState: 'interactive',
    querySelectorAll: (s) => (s === '[data-powrot]' ? [...rej.values()].filter((e) => 'data-powrot' in e.attrs) : s === '[data-polityka]' ? (stany.polityka || []) : []),
    addEventListener: (t, f) => { (zdarzenia[t] = zdarzenia[t] || []).push(f); },
  });
  return { daj, stany, zdarzenia, widoczny: () => stany.filter((e) => !e.hidden).map((e) => e.attrs['data-stan']) };
}
async function stronaBiegu({ search = '', licznik = LICZNIK(BIEG('zapisy')), licznikProby = null, sesja = null, moi = [], fetchBlad = false, rpc = {} } = {}) {
  const ctx = zamrozTimery(zaladujSb());
  const ls = magazyn();
  Object.assign(ctx.location, { pathname: '/bieg.html', search, origin: 'https://biegamy.run' });
  ctx.localStorage = ls;
  const dom = domStrony(ctx, 'bieg.html');
  const wywolania = [], stanSieci = { blad: fetchBlad };
  ctx.fetch = async (url) => {
    if (stanSieci.blad) throw new TypeError('Failed to fetch');
    if (/akcja-licznik/.test(url)) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(licznik)) };
    if (/bieg-ukonczyli/.test(url)) return { ok: true, status: 200, json: async () => ({ razem: 0, lista: [] }) };
    return { ok: false, status: 404, json: async () => null };
  };
  for (const p of ['js/akcja.mjs', 'js/bieg.mjs']) vm.runInContext(kod(p), ctx, { filename: p });
  if (licznikProby) ctx.BM_AKCJA.zUlica = (cb) => cb({ licznikProby: () => Promise.resolve(JSON.parse(JSON.stringify(licznikProby))) });   // ?proba=1: licznik próby z js/ulica.mjs
  ctx.sb = { auth: { getSession: async () => ({ data: { session: sesja } }) }, rpc: async (n, a) => { wywolania.push([n, a]); return rpc[n] ? rpc[n](a) : n === 'akcja_bieg_moi' ? { data: moi, error: null } : { data: null, error: null }; } };
  blokiSkryptow('bieg.html').forEach((k, i) => vm.runInContext(k, ctx, { filename: 'bieg.html#' + i }));
  (dom.zdarzenia.DOMContentLoaded || []).forEach((f) => f());
  await czekaj();
  return { ctx, dom, ls, wywolania, stanSieci };
}

test('1 BLOKUJE: bramka zapisu (teksty 14.11): bez kompletu wartości do tekstów stanStrony nigdy nie daje stanu zapisu (każda faza, sesja i zapisy); z kompletem i na ?proba=1 zapis jak dotąd', () => {
  assert.equal(B.TEKSTY_GOTOWE, true);
  const W = B.wartosciTekstow(BIEG('zapisy', { regulamin_wersja: '2026-11-v2', regulamin_od: '2026-11-18' }), { imie: 'Janek' }, 'https://example.org/z'); assert.ok(W, 'komplet wartości');
  const zapisowe = ['przed', 'po', 'dzieci', 'niezalogowany'];
  for (const faza of ['szkic', 'zapisy', 'trwa', 'wyniki', 'zakonczony']) for (const sesja of [null, { user: {} }]) for (const moi of [[], [{ rodzaj: 'ja', id: 'a' }], [{ rodzaj: 'dziecko', id: 'b' }]]) {
    const s = B.stanStrony(BIEG(faza), sesja, moi, {});
    assert.ok(!zapisowe.includes(s.stan), faza + ' ' + !!sesja + ' ' + moi.length + ': ' + s.stan);
    assert.equal(s.ja, null); assert.deepEqual(s.dzieci, [], 'bez karty „Twój bieg”, więc bez „Dopisz dziecko” i „Zapisz też siebie”');
    assert.equal(B.stanStrony(BIEG(faza), sesja, moi).stan, s.stan, 'bez opcji = bramka (domyślnie zamknięte)');
  }
  assert.equal(B.stanStrony(BIEG('zapisy'), { user: {} }, [], { proba: true }).stan, 'przed', 'próba Filipa');
  assert.equal(B.stanStrony(BIEG('zapisy'), { user: {} }, [], { teksty: W }).stan, 'przed', 'komplet wartości: zapis otwarty');
  assert.equal(B.stanStrony(BIEG('zapisy'), { user: {} }, [], { teksty: null }).stan, 'wkrotce', 'brak wartości: WKRÓTCE');
  assert.equal(B.zapisZablokowany(false), true); assert.equal(B.zapisZablokowany(false, W), false); assert.equal(B.zapisZablokowany(true), false); assert.equal(B.zapisZablokowany(false, null), true);
  assert.deepEqual(B.naglowekStanu(BIEG('zapisy'), 'wkrotce'), B.FAZY.szkic, 'przy bramce chip „WKRÓTCE”, nie „ZAPISY OTWARTE”');
  const h = czytaj('bieg.html');
  assert.match(h, /wartosci = B\.wartosciTekstow\(bieg, licznik, A\.linkZbiorki\(licznik \|\| \{\}\)\); rysujRegulamin\(\);/);
  assert.match(h, /stan = B\.stanStrony\(bieg, sesja, moi, \{ blad: !licznik, proba: PROBA, teksty: wartosci \}\);/);
  assert.match(h, /<div data-stan="przed" hidden>\n\s*<button type="button" class="bw-przycisk" id="bw-zapisz">/, '#bw-zapisz tylko w stanie „przed”');
  assert.match(h, /function otworzZapis\(\) \{\n\s*if \(!moznaZapisac\(\)\) return;/); assert.match(h, /function otworzDziecko\(\) \{\n\s*if \(!moznaZapisac\(\)\) return;/);
  assert.match(h, /function moznaZapisac\(\) \{ return !!stan && \['przed', 'po', 'dzieci'\]\.indexOf\(stan\.stan\) >= 0 && !B\.zapisZablokowany\(PROBA, wartosci\); \}/);
});

test('1 BLOKUJE: bieg.html w atrapie: otwarty bieg bez ?proba=1 = „wkrótce”, bez #bw-zapisz, bez karty i bez okna zapisu; z ?proba=1 zapis działa', async () => {
  const s = await stronaBiegu({ sesja: { user: { user_metadata: { full_name: 'anna kowalska' } } }, moi: [{ id: 'u1', rodzaj: 'ja', numer: 7, imie: 'Ola', dystans_km: 5 }] });
  assert.deepEqual(s.dom.widoczny(), ['wkrotce']);
  assert.equal(s.dom.daj('bw-chip-faza').textContent, 'WKRÓTCE'); assert.equal(s.dom.daj('bw-moj').hidden, true, 'karta „Twój bieg” (z „Dopisz dziecko”) schowana');
  assert.ok(!s.wywolania.some((w) => w[0] === 'akcja_bieg_moi'), 'za bramką strona nawet nie pyta o zapisy');
  s.dom.daj('bw-zapisz').klik(); s.dom.daj('bw-dziecko-od-razu').klik(); s.dom.daj('bw-dziecko').klik();
  assert.equal(s.dom.daj('bw-okno-zapis').getAttribute('open'), null, 'okno zapisu się nie otwiera'); assert.equal(s.dom.daj('bw-okno-dziecko').getAttribute('open'), null);
  const p = await stronaBiegu({ search: '?proba=1', licznikProby: LICZNIK(BIEG('zapisy', { slug: 'proba-bieg' })), sesja: { user: { user_metadata: { full_name: 'anna kowalska' } } } });
  assert.deepEqual(p.dom.widoczny(), ['przed']); assert.equal(p.dom.daj('bw-chip-faza').textContent, 'ZAPISY OTWARTE');
  p.dom.daj('bw-zapisz').klik();
  assert.equal(p.dom.daj('bw-okno-zapis').getAttribute('open'), '', 'na próbie okno zapisu działa');
  assert.equal(p.dom.daj('bw-imie').value, 'Anna', '22: imię z profilu z wielkiej litery');
  assert.equal(p.dom.daj('bw-zgoda-email-pole').hidden, false, '8: w fazie zapisy pole zgody na e-mail jest');
});

test('2: dla-fabianka.html: „Bieg wirtualny ›” stały w HTML, widoczny tylko przy obiekcie bieg w liczniku; bez innerHTML z danych biegu', async () => {
  const h = czytaj('dla-fabianka.html');
  assert.match(h, /<a class="przycisk przycisk--zbiorka" id="bieg-link" href="bieg\.html" hidden>Bieg wirtualny ›<\/a>/);
  assert.match(h, /bl\.hidden = !\(d\.bieg && typeof d\.bieg === 'object'\);/); assert.doesNotMatch(h, /innerHTML[^;\n]*\bd\.bieg/);
  async function strona(licznik) {
    const ctx = zamrozTimery(zaladujSb());
    Object.assign(ctx.location, { pathname: '/dla-fabianka.html', search: '' }); ctx.localStorage = magazyn();
    const dom = domStrony(ctx, 'dla-fabianka.html');
    ctx.fetch = async (url) => (/akcja-licznik/.test(url) ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(licznik)) } : { ok: false, status: 404, json: async () => null });
    vm.runInContext(kod('js/akcja.mjs'), ctx, { filename: 'js/akcja.mjs' });
    blokiSkryptow('dla-fabianka.html').forEach((k, i) => vm.runInContext(k, ctx, { filename: 'dla-fabianka.html#' + i }));
    (dom.zdarzenia.DOMContentLoaded || []).forEach((f) => f()); await czekaj();
    return dom;
  }
  const z = await strona(LICZNIK(BIEG('zapisy')));
  assert.equal(z.daj('pelna').hidden, false, 'strona po starcie narysowana'); assert.equal(z.daj('bieg-link').hidden, false); assert.equal(z.daj('bieg-link').href, 'bieg.html');
  const bez = await strona(LICZNIK(null));
  assert.equal(bez.daj('pelna').hidden, false); assert.equal(bez.daj('bieg-link').hidden, true, 'bieg w szkicu (licznik bez pola bieg): bez linku');
  assert.equal((await strona(LICZNIK('<b>x</b>'))).daj('bieg-link').hidden, true, 'pole bieg nie-obiekt: bez linku');
});

test('2: powrót po logowaniu: bieg.html zapisuje znacznik przy „Zaloguj się” i „Załóż konto”; index.html (zamrożony) bez hasha = zakładka Logowanie', async () => {
  const idx = czytaj('index.html');
  assert.match(idx, /<button class="tab active" onclick="switchTab\('login'\)">Logowanie<\/button>/, 'index.html bez hasha otwiera Logowanie (domyślna zakładka)');
  assert.match(idx, /if \(location\.hash === '#dolacz'\) \{\s+\/\/ nowa osoba z dla-fabianka\.html → zakładka Rejestracja/, '#dolacz = Rejestracja');
  const h = czytaj('bieg.html');
  assert.match(h, /<a class="bw-przycisk" id="bw-zaloguj" href="index\.html" data-powrot>Zaloguj się, żeby się zapisać ›<\/a>/);
  assert.match(h, /<a class="bw-link-maly" id="bw-zaloz" href="index\.html#dolacz" data-powrot>Nie masz konta\? Załóż je ›<\/a>/);
  assert.doesNotMatch(h, /index\.html#sponsor/, '#sponsor otworzyłby formularz sponsora na Dziś');
  const p = await stronaBiegu({ search: '?proba=1', licznikProby: LICZNIK(BIEG('zapisy', { slug: 'proba-bieg' })) });
  assert.deepEqual(p.dom.widoczny(), ['niezalogowany']);
  p.dom.daj('bw-zaloguj').klik();
  const z = JSON.parse(p.ls.getItem(A.KLUCZ_POWROTU)); assert.equal(z.cel, 'bieg.html?proba=1'); assert.ok(Math.abs(Date.now() - z.t) < 5000);
  const s = await stronaBiegu({ licznik: LICZNIK(BIEG('zapisy')) });
  s.dom.daj('bw-zaloz').klik(); assert.equal(JSON.parse(s.ls.getItem(A.KLUCZ_POWROTU)).cel, 'bieg.html');
});

test('2: js/akcja.mjs na zawodnik.html: świeży znacznik z białej listy, sesja i Dziś prosto z logowania → location.replace(cel); znacznik jednorazowy, inaczej bez przejścia', async () => {
  assert.deepEqual([...A.CELE_POWROTU], ['bieg.html', 'bieg.html?proba=1']);
  const T = 1_800_000_000_000, sesja = { auth: { getSession: async () => ({ data: { session: { user: { id: 'x' } } } }) } }, bezSesji = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const przebieg = async ({ znacznik, search = '', sb = sesja, teraz = T, onboarding = false, pathname = '/zawodnik.html', referrer = 'https://biegamy.run/index.html' }) => {
    const ls = magazyn(onboarding ? { biegamy_needs_onboarding: '1' } : {}); if (znacznik !== undefined) ls.setItem(A.KLUCZ_POWROTU, typeof znacznik === 'string' ? znacznik : JSON.stringify(znacznik));
    const skoki = [], location = { origin: 'https://biegamy.run', pathname, search, replace: (u) => skoki.push(u) };
    const cel = await A.powrotPoLogowaniu({ localStorage: ls, location, document: { referrer }, sb, teraz });
    return { cel, skoki, zostal: ls.getItem(A.KLUCZ_POWROTU) };
  };
  let r = await przebieg({ znacznik: { cel: 'bieg.html', t: T - 60_000 } });
  assert.deepEqual(r.skoki, ['bieg.html']); assert.equal(r.zostal, null, 'po użyciu znacznik znika');
  r = await przebieg({ znacznik: { cel: 'bieg.html?proba=1', t: T - 29 * 60_000 } }); assert.deepEqual(r.skoki, ['bieg.html?proba=1']);
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T - 31 * 60_000 } }); assert.deepEqual(r.skoki, []); assert.equal(r.zostal, null, 'przeterminowany usunięty');
  for (const zly of ['https://zly.example/bieg.html', '//zly.example', 'bieg.html#x', 'bieg.html?proba=1&x=1', 'javascript:alert(1)', 'zawodnik.html']) {
    r = await przebieg({ znacznik: { cel: zly, t: T } }); assert.deepEqual(r.skoki, [], zly); assert.equal(r.zostal, null, 'cel spoza listy usunięty: ' + zly);
  }
  r = await przebieg({ znacznik: 'nie-json' }); assert.deepEqual(r.skoki, []); assert.equal(r.zostal, null);
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T + 60_000 } }); assert.deepEqual(r.skoki, [], 'znacznik z przyszłości'); assert.equal(r.zostal, null);
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T }, sb: bezSesji }); assert.deepEqual(r.skoki, []); assert.notEqual(r.zostal, null, 'bez sesji czeka (zawodnik.html odeśle do logowania)');
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T }, search: '?onboarding=1' }); assert.deepEqual(r.skoki, [], 'onboarding: profil zawodnika jeszcze nie istnieje'); assert.equal(r.zostal, null, 'onboarding: znacznik zużyty, później nic nie przerzuci z Dziś');
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T }, onboarding: true }); assert.deepEqual(r.skoki, []); assert.equal(r.zostal, null);
  /* przegląd 14.11: przejście tylko przy Dziś otwartym prosto z logowania; każde inne wejście na Dziś zużywa znacznik bez przejścia */
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T }, referrer: 'https://biegamy.run/' }); assert.deepEqual(r.skoki, ['bieg.html'], 'logowanie z /');
  for (const ref of ['', 'https://biegamy.run/profil.html', 'https://biegamy.run/zawodnik.html?tab=social', 'https://zly.example/index.html', 'https://biegamy.run.zly.example/index.html', 'http://biegamy.run/index.html']) {
    r = await przebieg({ znacznik: { cel: 'bieg.html', t: T }, referrer: ref }); assert.deepEqual(r.skoki, [], 'bez przejścia: ' + (ref || 'brak referrera')); assert.equal(r.zostal, null, 'znacznik zużyty: ' + (ref || 'brak referrera'));
  }
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T }, pathname: '/index.html' }); assert.deepEqual(r.skoki, [], 'tylko na zawodnik.html'); assert.notEqual(r.zostal, null, 'świeży czeka na Dziś');
  r = await przebieg({ znacznik: { cel: 'bieg.html', t: T - 31 * 60_000 }, pathname: '/index.html' }); assert.equal(r.zostal, null, 'każda strona sprząta stary znacznik');
  assert.equal(A.zapiszPowrot('https://zly.example', { localStorage: magazyn() }), false, 'zapis tylko celu z listy');
  /* wpięcie: akcja.mjs stoi w zawodnik.html przed sb.js, więc działa na DOMContentLoaded, kiedy window.sb już jest */
  const ctx = atrapaPrzegladarki(); vm.createContext(ctx);
  const ls = magazyn({ [A.KLUCZ_POWROTU]: JSON.stringify({ cel: 'bieg.html', t: Date.now() - 1000 }) }), skoki = [], dcl = [];
  Object.assign(ctx.location, { origin: 'https://biegamy.run', pathname: '/zawodnik.html', search: '', replace: (u) => skoki.push(u) }); ctx.localStorage = ls;
  Object.assign(ctx.document, { referrer: 'https://biegamy.run/index.html', readyState: 'loading', addEventListener: (t, f) => { if (t === 'DOMContentLoaded') dcl.push(f); } });
  vm.runInContext(kod('js/akcja.mjs'), ctx, { filename: 'js/akcja.mjs' });
  await czekaj(); assert.deepEqual(skoki, [], 'przed DOMContentLoaded nic (sb.js jeszcze nie wczytany)');
  ctx.sb = sesja; dcl.forEach((f) => { try { f(); } catch (e) {} }); await czekaj();
  assert.deepEqual(skoki, ['bieg.html']); assert.equal(ls.getItem(A.KLUCZ_POWROTU), null);
  const src = czytaj('js/akcja.mjs');
  assert.match(src, /POWRÓT NA BIEG PO ZALOGOWANIU/); assert.match(src, /if \(g\.document && g\.document\.addEventListener\) \{ if \(g\.document\.readyState === "loading"\)/, 'w Deno (EF okienko) bez document nic się nie dzieje');
});

test('4: błąd licznika (fetch odrzucony) = osobny stan z „Spróbuj ponownie”, nie „wkrótce”; lista przy błędzie „chwilowo niedostępna”', async () => {
  assert.equal(B.stanStrony(null, { user: {} }, [], { blad: true }).stan, 'blad'); assert.equal(B.stanStrony(null, null, [], {}).stan, 'wkrotce', 'licznik bez pola bieg = szkic');
  assert.deepEqual(B.naglowekStanu(null, 'blad'), { chip: '', klasa: '', zdanie: '' });
  assert.match(B.ukonczyliHtml({ blad: true }), /Lista chwilowo niedostępna/); assert.doesNotMatch(B.ukonczyliHtml({ blad: true }), /nikt nie dopisał/);
  const s = await stronaBiegu({ fetchBlad: true });
  assert.deepEqual(s.dom.widoczny(), ['blad']);
  assert.equal(s.dom.daj('bw-chip-faza').hidden, true, 'bez chipu „WKRÓTCE”'); assert.equal(s.dom.daj('bw-nazwa').textContent, 'Bieg wirtualny', 'nagłówek nie jest pusty');
  assert.match(s.dom.daj('bw-ukonczyli').innerHTML, /Lista chwilowo niedostępna/);
  const h = czytaj('bieg.html');
  assert.match(h, /<div data-stan="blad" hidden>\n\s*<p class="bw-blad" role="alert">Nie udało się wczytać biegu\. Sprawdź internet\.<\/p>\n\s*<button type="button" class="bw-przycisk" id="bw-ponow">Spróbuj ponownie<\/button>/);
  s.stanSieci.blad = false; s.dom.daj('bw-ponow').klik(); await czekaj();
  assert.deepEqual(s.dom.widoczny(), ['wkrotce'], 'po „Spróbuj ponownie” z siecią: licznik wczytany (za bramką = wkrótce)');
  s.stanSieci.blad = true; (s.dom.zdarzenia.visibilitychange || []).forEach((f) => f()); await czekaj();
  assert.deepEqual(s.dom.widoczny(), ['wkrotce'], 'nieudane odświeżenie po powrocie do karty zostawia ostatni dobry licznik');
  assert.match(h, /licznik = r\[0\] \|\| licznik;/); assert.match(h, /moi = m \|\| \(sesja \? moi : \[\]\);/, 'błąd odczytu zapisów nie chowa numeru');
});

test('5: polskie komunikaty: sieć, 42501, inne; bez „TypeError” i nazw funkcji SQL na ekranie; surowa treść tylko do client_errors', () => {
  const siec = B.bladRpc({ message: 'TypeError: Failed to fetch', code: '' }), safari = B.bladRpc({ message: 'Load failed' }), fx = B.bladRpc(new TypeError('NetworkError when attempting to fetch resource.'));
  const zaloguj = B.bladRpc({ message: 'akcja_bieg_zapisz: zaloguj się', code: '42501' }), inny = B.bladRpc({ message: 'akcja_bieg_zapisz: coś poszło nie tak', code: 'P0001' });
  for (const r of [siec, safari, fx]) { assert.equal(r.siec, true); assert.equal(B.komunikat(r), 'Brak połączenia. Sprawdź internet i spróbuj jeszcze raz.'); assert.equal(B.komunikatWyniku(r), B.komunikat(r)); }
  assert.equal(B.bladRpc({ message: 'cokolwiek' }, true).siec, true, 'navigator.onLine === false');
  const TZ = 'Potrzebne konto zawodnika: dokończ zakładanie konta w aplikacji albo zaloguj się na konto zawodnika.'; assert.equal(B.komunikat(zaloguj), TZ); assert.equal(B.komunikatWyniku(zaloguj), TZ);
  assert.equal(B.komunikat(inny), 'Nie udało się. Spróbuj za chwilę.');
  for (const r of [siec, zaloguj, inny, { powod: 'blad', blad: 'TypeError: Failed to fetch' }, null, undefined, {}]) for (const t of [B.komunikat(r), B.komunikatWyniku(r)]) {
    assert.doesNotMatch(t, /TypeError|akcja_bieg|Failed|undefined|null/, JSON.stringify(r) + ' → ' + t);
  }
  assert.ok(!('blad' in siec) && !('message' in zaloguj), 'treść błędu nie wychodzi z bladRpc');
  const h = czytaj('bieg.html');
  assert.doesNotMatch(h, /r\.error\.message|'Nie udało się: '/, 'strona nie składa tekstu z błędu'); assert.doesNotMatch(czytaj('js/bieg.mjs'), /"Nie udało się: "/);
  assert.match(h, /window\._logKlienta\(\{ kind: 'bieg_rpc', source: 'bieg\.html ' \+ nazwa, message: nazwa \+ ' · ' \+ \(\(e && e\.code\) \|\| 'brak-kodu'\) \+ ' · ' \+ String\(\(e && e\.message\) \|\| e \|\| 'brak odpowiedzi'\)\.slice\(0, 300\) \}\)/, 'surowa treść do client_errors (bez details i hint)');
  assert.match(h, /function komunikat\(r, miejsce\) \{ return B\.komunikat\(r, miejsce, bieg\); \}/);
});

test('6: każdy kod odmowy z funkcji wołanych przez stronę ma własny tekst (kody wyciągnięte z migracji); teksty wycofania', () => {
  const sql = czytaj(MIG1) + '\n' + czytaj(MIG2);
  const kody = (n) => { const out = new Set(); for (const m of sql.matchAll(new RegExp('create (?:or replace )?function public\\.' + n + '\\([\\s\\S]*?\\$function\\$;', 'g'))) for (const k of m[0].matchAll(/'powod', '([a-z_]+)'/g)) out.add(k[1]); return [...out]; };
  const ZAPISY = ['akcja_bieg_zapisz', 'akcja_bieg_dopisz_dziecko', 'akcja_bieg_wycofaj', 'akcja_bieg_ranking_zgoda', 'akcja_bieg_zgoda_email'], WYNIKI = ['akcja_bieg_wynik_ustal', 'akcja_bieg_wynik_z_treningu', 'akcja_bieg_dziecko_ukoncz'];
  const OGOLNE = new Set([B.komunikat({}), B.komunikat({ siec: true }), B.komunikat({ kod: '42501' })]);
  let n = 0;
  for (const f of ZAPISY) { const k = kody(f); assert.ok(k.length, f + ': kody znalezione'); for (const p of k) { n++; assert.ok(!OGOLNE.has(B.komunikat({ ok: false, powod: p, numer: 7, limit: 6 })), f + ': ' + p + ' bez własnego tekstu'); } }
  for (const f of WYNIKI) { const k = kody(f); assert.ok(k.length, f + ': kody znalezione'); for (const p of k) { n++; assert.ok(!OGOLNE.has(B.komunikatWyniku({ ok: false, powod: p })), f + ': ' + p + ' bez własnego tekstu'); } }
  assert.ok(n >= 25, 'sprawdzonych kodów: ' + n);
  const strona = czytaj('bieg.html') + czytaj('js/bieg.mjs'), wolane = new Set([...strona.matchAll(/rpc\(\s*['"](akcja_bieg_[a-z_]+)['"]/g)].map((m) => m[1]));
  for (const f of wolane) assert.ok(ZAPISY.includes(f) || WYNIKI.includes(f) || ['akcja_bieg_moi', 'akcja_bieg_moja_zgoda', 'akcja_bieg_treningi_z_okna'].includes(f), 'nowa funkcja na stronie bez mapy kodów: ' + f);
  assert.equal(B.komunikat({ powod: 'ukonczony' }), 'Ten zapis ma już wynik, nie można go wycofać.'); assert.equal(B.komunikat({ powod: 'juz_wycofany' }), 'Ten zapis jest już wycofany.'); assert.equal(B.komunikat({ powod: 'nie_twoj' }), 'To nie jest Twój zapis.');
});

test('6: „Wycofaj”: jedno zapytanie na raz, tekst odmowy, odświeżenie także po odmowie, anulowanie bez zapytania', async () => {
  const proba = (odp, potwierdz = true) => { const z = { rpc: [], pokaz: [], odswiez: 0 }; let pusc; const czeka = new Promise((r) => { pusc = r; });
    const zal = { potwierdz: () => potwierdz, rpc: (n, a) => { z.rpc.push([n, a]); return czeka.then(() => odp); }, pokaz: (t) => z.pokaz.push(t), odswiez: () => { z.odswiez++; return Promise.resolve(); } };
    return { z, zal, pusc }; };
  const a = proba({ ok: false, powod: 'ukonczony' });
  const p1 = B.wycofaj('u1', a.zal), p2 = B.wycofaj('u1', a.zal);
  assert.equal((await p2).powod, 'w_toku', 'drugie kliknięcie w trakcie nic nie wysyła');
  a.pusc(); await p1;
  assert.deepEqual(a.z.rpc, [['akcja_bieg_wycofaj', { p_id: 'u1' }]]); assert.deepEqual(a.z.pokaz, ['Ten zapis ma już wynik, nie można go wycofać.']); assert.equal(a.z.odswiez, 1, 'po odmowie strona się odświeża');
  const b = proba({ ok: true }); b.pusc(); await B.wycofaj('u1', b.zal); assert.equal(b.z.rpc.length, 1, 'po odpowiedzi link znów działa'); assert.deepEqual(b.z.pokaz, []); assert.equal(b.z.odswiez, 1);
  const c = proba({ ok: true }, false); assert.equal((await B.wycofaj('u2', c.zal)).powod, 'anulowane'); assert.equal(c.z.rpc.length, 0);
  const d = proba(null); d.zal.rpc = () => Promise.reject(new TypeError('Failed to fetch')); await B.wycofaj('u3', d.zal); assert.deepEqual(d.z.pokaz, ['Brak połączenia. Sprawdź internet i spróbuj jeszcze raz.']);
  const h = czytaj('bieg.html');
  assert.match(h, /B\.wycofaj\(w\.getAttribute\('data-wycofaj'\), \{ potwierdz: function \(t\) \{ return window\.confirm\(t\); \}, rpc: rpc, pokaz: function \(t\) \{ alert\(t\); \}, odswiez: odswiez \}, mojZapis\(w\.getAttribute\('data-wycofaj'\)\)\)/);
  assert.match(h, /if \(w\.getAttribute\('aria-disabled'\) === 'true'\) return;\n\s*w\.setAttribute\('aria-disabled', 'true'\);/);
});

test('7: link zbiórki escapowany raz (prawdziwe escapeHtml i safeExternalHref z sb.js): href z & ma dokładnie jedno &amp;', () => {
  const link = A.linkZbiorki({ url_zbiorki: 'https://x.example/a?b=1&c=2' });
  assert.equal(link, 'https://x.example/a?b=1&amp;c=2', 'sito z akcja.mjs (sb.js) escapuje raz');
  const w = B.wsparcieHtml(BIEG('zapisy'), link);
  assert.equal((w.match(/href="https:\/\/x\.example\/a\?b=1&amp;c=2"/g) || []).length, 4, 'cztery przyciski, każdy z jednym escape'); assert.doesNotMatch(w, /&amp;amp;/);
  assert.equal(B.wsparcieHtml(BIEG('zapisy'), A.linkZbiorki({ url_zbiorki: 'http://x.example/a' })), '', 'tylko https');
  assert.equal(B.wsparcieHtml(BIEG('zapisy'), 'https://x.example/"onmouseover="alert(1)'), '', 'surowy adres z cudzysłowem (bez sita) odpada');
  const q = B.wsparcieHtml(BIEG('zapisy'), A.linkZbiorki({ url_zbiorki: "https://x.example/a'b\"c" }));
  assert.doesNotMatch(q, /href="[^"]*'|"c"/, 'cudzysłowy z bazy tylko jako encje'); assert.equal(B.wsparcieHtml(BIEG('zapisy'), A.linkZbiorki({ url_zbiorki: 'javascript:alert(1)' })), '');
});

test('8: zgoda na e-mail w oknie zapisu przed wysyłką (faza zapisy, w trakcie biegu do dnia zaległych: 20261207) i bez zgody konta; ten sam warunek w oknie dziecka', () => {
  assert.equal(B.poleEmailaWidoczne(BIEG('zapisy'), null), true);
  for (const f of ['wyniki', 'zakonczony', 'szkic']) assert.equal(B.poleEmailaWidoczne(BIEG(f), null), false, f);
  const t = Object.assign(BIEG('trwa'), { dzien_od: '2026-11-18', dzien_do: '2026-12-06' });
  assert.equal(B.poleEmailaWidoczne(t, null, '2026-11-18'), true, 'pierwszy dzień biegu'); assert.equal(B.poleEmailaWidoczne(t, null, '2026-12-04'), true, 'dzień zaległych (dzien_do - 2)');
  assert.equal(B.poleEmailaWidoczne(t, null, '2026-12-05'), false, 'po wysyłce'); assert.equal(B.przedMailem(t, '2026-12-03'), true);
  assert.equal(B.poleEmailaWidoczne(BIEG('zapisy'), { zgoda_email: true }), false, 'konto już ma zgodę'); assert.equal(B.poleEmailaWidoczne(BIEG('zapisy'), { zgoda_email: false }), true);
  const h = czytaj('bieg.html');
  assert.match(h, /<label class="bw-zgoda" id="bw-zgoda-email-pole"><input type="checkbox" id="bw-zgoda-email">/);
  assert.match(h, /\$\('bw-zgoda-email-pole'\)\.hidden = !B\.poleEmailaWidoczne\(bieg, zgodaKonta\);/);
  assert.match(h, /\$\('bw-dziecko-email-pole'\)\.hidden = !!\(stan && stan\.ja\) \|\| !B\.poleEmailaWidoczne\(bieg, zgodaKonta\);/);
});

test('9: wpisany dystans dziecka i status rankingu zostają po przerysowaniu; stare komunikaty błędów NIE wracają pod nowy stan; ten sam stan = bez przerysowania', () => {
  const pole = (a, id, w) => ({ getAttribute: (n) => (n === a ? id : null), value: a === 'data-dziecko-km' ? w : '', textContent: a === 'data-dziecko-km' ? '' : w });
  const korzen = (lista) => ({ querySelectorAll: (s) => lista.filter((e) => e.getAttribute(s.slice(1, -1)) != null) });
  const stare = [pole('data-dziecko-km', 'd1', '1,5'), pole('data-dziecko-blad', 'd1', 'Wpisz dystans od 0,1 do 100 km, np. 1,5.'), pole('data-wynik-blad', 'j1', 'To nie jest Twój zapis.'), pole('data-ranking-stan', 'j1', 'Na liście będziesz bez czasu.'), pole('data-dziecko-km', 'd2', '')];
  const zapis = B.zapiszPola(korzen(stare));
  assert.deepEqual(Object.keys(zapis).sort(), ['data-dziecko-km=d1', 'data-ranking-stan=j1'], 'błędy nie są przenoszone (przegląd 14.11: „Brak połączenia” wracał pod „Nie widzimy jeszcze treningu”)');
  const nowe = [pole('data-dziecko-km', 'd1', ''), pole('data-dziecko-blad', 'd1', ''), pole('data-wynik-blad', 'j1', ''), pole('data-ranking-stan', 'j1', ''), pole('data-dziecko-km', 'd3', '')];
  B.odtworzPola(korzen(nowe), zapis);
  assert.equal(nowe[0].value, '1,5'); assert.equal(nowe[1].textContent, ''); assert.equal(nowe[2].textContent, ''); assert.equal(nowe[3].textContent, 'Na liście będziesz bez czasu.');
  assert.equal(nowe[4].value, '', 'inny uczestnik bez cudzej wartości');
  const h = czytaj('bieg.html');
  assert.match(h, /if \(klucz !== ostatniaKarta\) \{\n\s*var pola = B\.zapiszPola\(t\);\n\s*t\.innerHTML = html; ostatniaKarta = klucz;\n\s*B\.odtworzPola\(t, pola\);/);
  assert.match(h, /data-ranking-stan="' \+ B\.esc\(u\.id\) \+ '"/, 'status rankingu przypisany do uczestnika');
  assert.match(B.wynikHtml({ id: 'd1', rodzaj: 'dziecko', imie: 'Zosia', numer: 3 }, BIEG('wyniki')), /data-dziecko-km="d1"[\s\S]*data-dziecko-blad="d1"/);
  assert.match(h, /document\.addEventListener\('visibilitychange', function \(\) \{ if \(document\.visibilityState === 'visible'\) \{ probowane = \{\}; odswiez\(\); \} \}\);/, 'powrót do karty nadal odświeża dane');
});

test('9: bieg.html w atrapie: powrót do karty z tym samym stanem nie przerysowuje karty (pole dystansu dziecka zostaje w DOM); zmiana stanu przerysowuje', async () => {
  const dz = { id: 'd1', rodzaj: 'dziecko', imie: 'Zosia', numer: 3 }, moi = [dz];
  const s = await stronaBiegu({ search: '?proba=1', licznikProby: LICZNIK(BIEG('wyniki', { slug: 'proba-bieg' })), sesja: { user: {} }, moi });
  const t = s.dom.daj('bw-moj-tresc'); let html = t.innerHTML, zapisy = 0;
  Object.defineProperty(t, 'innerHTML', { get: () => html, set: (v) => { zapisy++; html = v; } });
  assert.deepEqual(s.dom.widoczny(), ['po dzieci']); assert.match(html, /data-dziecko-km="d1"/);
  for (let i = 0; i < 3; i++) { (s.dom.zdarzenia.visibilitychange || []).forEach((f) => f()); await czekaj(); }
  assert.equal(zapisy, 0, 'trzy powroty do karty, ten sam stan: innerHTML karty nietknięty');
  moi[0] = { ...dz, ukonczony_at: '2026-12-06T10:00:00Z', dystans_wlasny_km: 1.5, odznaka: 'zwykla' };
  (s.dom.zdarzenia.visibilitychange || []).forEach((f) => f()); await czekaj();
  assert.equal(zapisy, 1, 'nowy stan (dystans zapisany): karta przerysowana'); assert.match(html, /Ukończone: <b>1,5 km · swój dystans<\/b>/);
});

test('10: brak treningu przy zapisie na 10 km: rada „Masz mniej kilometrów? Wycofaj zapis i zapisz się na 5 km.”; przy 5 km bez rady', () => {
  const ja = (d) => ({ id: 'j1', rodzaj: 'ja', imie: 'Ola', numer: 12, dystans_km: d });
  assert.match(B.wynikHtml(ja(10), BIEG('wyniki'), { brakTreningu: true }), /<p class="bw-drobne" data-rada-dystans>Masz mniej kilometrów\? Wycofaj zapis i zapisz się na 5 km\.<\/p>/);
  assert.doesNotMatch(B.wynikHtml(ja(5), BIEG('wyniki'), { brakTreningu: true }), /Masz mniej kilometrów/);
  assert.doesNotMatch(B.wynikHtml(ja(10), BIEG('trwa'), {}), /Masz mniej kilometrów/, 'tylko gdy automat nie znalazł treningu');
  assert.doesNotMatch(czytaj('js/bieg.mjs'), /Zrobiłeś|zrobiłeś/, 'bez rodzaju męskiego');
  assert.equal(B.krotszyDystans(BIEG('wyniki'), 10), 5); assert.equal(B.krotszyDystans(BIEG('wyniki'), 5), null); assert.equal(B.krotszyDystans(BIEG('wyniki', { dystanse_km: [3, 5, 10, 21] }), 21), 10);
});

test('12: limit czasu licznika próby: zUlica, które nie woła callbacku (brak js/ulica.mjs), daje null w limicie', async () => {
  const nigdy = { zUlica() {} }, t0 = Date.now();
  const r = await B.zLimitem(new Promise((ok) => { nigdy.zUlica((U) => U.licznikProby().then(ok)); }), 40);
  assert.equal(r, null); assert.ok(Date.now() - t0 < 2000);
  assert.equal(await B.zLimitem(new Promise((ok) => { A.zUlica(() => ok('x')); }), 40), null, 'prawdziwe zUlica bez document nie woła callbacku');
  assert.deepEqual(await B.zLimitem(Promise.resolve({ bieg: 1 }), 1000), { bieg: 1 }); assert.equal(await B.zLimitem(Promise.reject(new Error('x')), 1000), null);
  assert.match(czytaj('bieg.html'), /return B\.zLimitem\(new Promise\(function \(ok\) \{\n\s*A\.zUlica\(function \(U\) \{ U\.licznikProby\(\)\.then\(ok, function \(\) \{ ok\(null\); \}\); \}\);\n\s*\}\), 8000\);/);
});

test('14: każdy .bw-blad ma role="alert", status rankingu role="status"', () => {
  for (const p of ['bieg.html', 'js/bieg.mjs']) {
    const tagi = [...czytaj(p).matchAll(/<p class="bw-blad"[^>]*>/g)].map((m) => m[0]);
    assert.ok(tagi.length >= (p === 'bieg.html' ? 4 : 2), p + ': ' + tagi.length);
    for (const t of tagi) assert.match(t, /role="alert"/, p + ': ' + t);
  }
  assert.match(czytaj('bieg.html'), /<p class="bw-drobne" role="status" data-ranking-stan=/);
});

test('16, 19, 21, 22, 25, 26, 27: liczby, data na dyplomie, rezygnacja, imię z profilu, wylogowany po zapisach, og:title i id odznak, ranking_wiek w karcie', () => {
  const l = B.liczbyHtml({ zapisani: 3, dzieci: 1, ukonczyli_n: 0 }); assert.match(l, /<b>3<\/b><span>zapisane osoby<\/span>/); assert.match(l, /<b>1<\/b><span>w tym dzieci<\/span>/, '16: dzieci w liczbie zapisanych');
  assert.match(B.liczbyHtml({ zapisani: 5, dzieci: 2 }), /<span>w tym dzieci<\/span>/);
  assert.equal(B.dataNaDyplomie({ ukonczony_at: '2026-12-08T10:00:00Z' }, BIEG('zakonczony')), 'Data biegu: 5–6 grudnia 2026', '19');
  assert.equal(B.dataNaDyplomie({}, BIEG('zakonczony', { dzien_do: '2026-12-05' })), 'Data biegu: 5 grudnia 2026');
  assert.equal(B.dataNaDyplomie({}, BIEG('zakonczony', { dzien_od: '2026-11-18', dzien_do: '2026-12-06' })), 'Termin biegu: 18.11–6.12.2026', '17.11: okres 19 dni krótko, bez nachodzenia na medal');
  const teksty = [], c2d = new Proxy({}, { get(t, k) { if (k === 'fillText') return (s) => teksty.push(String(s)); if (k === 'measureText') return (s) => ({ width: String(s).length * 5 }); if (k === 'createLinearGradient') return () => ({ addColorStop() {} }); if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => c2d }) };
  try { B.dyplom({ imie: 'Ola', numer: 12, rodzaj: 'ja', dystans_km: 5, wynik_s: 1500, wynik_dystans_km: 5, ukonczony_at: '2026-12-08T10:00:00Z' }, BIEG('zakonczony'), 'telefon', {}); } finally { delete globalThis.document; }
  assert.ok(teksty.includes('Data biegu: 5–6 grudnia 2026'), '19: na płótnie ' + teksty.filter((t) => /Data/.test(t))); assert.ok(!teksty.some((t) => /8 grudnia/.test(t)), 'chwila zaliczenia nie jest datą biegu');
  assert.match(B.komunikatRezygnacji(503, { ok: false, powod: 'blad' }), /^Nie udało się teraz\./, '21'); assert.match(B.komunikatRezygnacji(502, null), /^Nie udało się teraz\./);
  assert.equal(B.komunikatRezygnacji(404, { ok: false, powod: 'nie_ma' }), 'Ten link jest nieaktualny. Zgodę zmienisz też po zalogowaniu, w sekcji „Twój bieg”.');
  assert.equal(B.komunikatRezygnacji(200, { ok: true, nazwa: 'Bieg' }), 'Gotowe. Nie wyślemy już e-maili o biegu „Bieg”.');
  assert.doesNotMatch(czytaj('bieg.html') + czytaj('js/bieg.mjs'), /albo już użyty/); assert.match(czytaj('bieg.html'), /baner\.textContent = B\.komunikatRezygnacji\(w\.status, w\.d\);/);
  assert.equal(B.imieZProfilu('anna kowalska'), 'Anna', '22'); assert.equal(B.imieDoPola({ user: { user_metadata: { full_name: 'łucja nowak' } } }), 'Łucja'); assert.equal(B.imieDoPola(null), ''); assert.equal(B.imieDoPola({ user: { user_metadata: { full_name: 'jan2 x' } } }), '');
  assert.match(czytaj('bieg.html'), /if \(!\$\('bw-imie'\)\.value\.trim\(\)\) \$\('bw-imie'\)\.value = B\.imieDoPola\(sesja\);/);
  assert.equal(B.stanStrony(BIEG('zakonczony'), null, [], { proba: true }).stan, 'zamkniete', '25'); assert.equal(B.stanStrony({ faza: 'zakonczony', slug: 'x' }, null, [], { proba: true }).stan, 'zamkniete');
  assert.equal(B.stanStrony(BIEG('wyniki'), null, [], { proba: true }).stan, 'niezalogowany', 'w fazie wyniki zapis jeszcze trwa');
  assert.match(B.wynikHtml({ id: 'j1', rodzaj: 'ja', imie: 'Ola', numer: 1, dystans_km: 5 }, BIEG('zakonczony')), /napisz do organizatora: <a href="mailto:biegamy\.run@gmail\.com">biegamy\.run@gmail\.com<\/a>\./);
  assert.match(czytaj('dla-fabianka.html'), /mailto:biegamy\.run@gmail\.com/, 'ten sam publiczny adres co na stronie akcji');
  const h = czytaj('bieg.html');
  assert.match(h, /<meta property="og:title" content="Bieg wirtualny · BiegaMy">\n<meta property="og:description" content="[^"]+">\n<meta property="og:type" content="website">/, '26');
  const id = (s) => [...s.matchAll(/linearGradient id="([^"]+)"/g)].map((m) => m[1]);
  const o1 = B.odznakaSvg('zwykla', { nazwa: 'Bieg', id: 'u-1' }), o2 = B.odznakaSvg('zwykla', { nazwa: 'Bieg', id: 'u-2' });
  assert.notDeepEqual(id(o1), id(o2), 'dwóch uczestników = różne id'); assert.equal(B.odznakaSvg('zwykla', { nazwa: 'Bieg', id: 'u-1' }), o1, 'ta sama karta rysuje się tak samo');
  assert.notDeepEqual(id(B.odznakaSvg('zlota', { nazwa: 'X' })), id(B.odznakaSvg('zlota', { nazwa: 'X' })), 'bez id: kolejny numer');
  assert.match(B.odznakaSvg('zwykla', { id: '"><script>' }), /id="bo-zwykla-script-g"/, 'id z dozwolonych znaków');
  const w1 = B.wynikHtml({ id: 'a1', rodzaj: 'ja', imie: 'Ola', numer: 1, dystans_km: 5, ukonczony_at: 'x', odznaka: 'zwykla' }, BIEG('zakonczony')), w2 = B.wynikHtml({ id: 'a2', rodzaj: 'dziecko', imie: 'Zosia', numer: 2, dystans_wlasny_km: 1, ukonczony_at: 'x', odznaka: 'zwykla' }, BIEG('zakonczony'));
  assert.notDeepEqual(id(w1), id(w2), 'odznaki w dwóch kartach na jednej stronie');
  assert.equal(B.komunikat({ powod: 'ranking_wiek' }, 'karta'), 'Ranking jest tylko dla osób pełnoletnich.', '27'); assert.equal(B.komunikat({ powod: 'ranking_wiek' }), 'Ranking jest tylko dla osób pełnoletnich. Odznacz zgodę na ranking.');
  assert.match(h, /st\.textContent = komunikat\(r, 'karta'\);/);
});

test('zasady: bez słów zakazanych, bez imienia dziecka, bez JS w atrybutach; powrót po logowaniu przechodzi wyłącznie na cel ze znacznika z białej listy', () => {
  for (const p of ['bieg.html', 'js/bieg.mjs', 'dla-fabianka.html']) assert.doesNotMatch(czytaj(p).replace('BiegaMy nie jest partnerem tej organizacji i nie działa w jej imieniu.', ''), /[Pp]artner|[Ss]karbon|nicjator|[Oo]perator/, p);   // wyjątek: przeczenie w regulaminie (14.11)
  for (const p of ['bieg.html', 'js/bieg.mjs']) assert.doesNotMatch(czytaj(p).replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, p);
  assert.doesNotMatch(czytaj('bieg.html'), /\son[a-z]+="/i);
  const ak = czytaj('js/akcja.mjs'), pw = ak.slice(ak.indexOf('POWRÓT NA BIEG PO ZALOGOWANIU'), ak.indexOf('/** Dane karty okienka'));
  assert.ok(pw.length > 500); assert.doesNotMatch(pw, /innerHTML|\.href\s*=|\.assign\(/);
  assert.equal((pw.match(/\bloc\.replace\(/g) || []).length, 1, 'jedno przejście');
  assert.match(pw, /var c = celPowrotu\(\{ localStorage: m, teraz: o\.teraz, zuzyj: true \}\);\n\s*if \(c\) loc\.replace\(c\);/, 'cel tylko z celPowrotu (biała lista), nigdy z adresu');
});

test('przegląd 14.11: wysyłka zapisu i dziecka za bramką; zgoda konta z tekstem odmowy; schowane pole e-mail przy zgodzie konta wysyła true', () => {
  const h = czytaj('bieg.html');
  assert.match(h, /\$\('bw-zapis-ok'\)\.addEventListener\('click', function \(\) \{\r?\n\s*if \(!moznaZapisac\(\)\) return;/, 'zapis: bramka także w przycisku wysyłki');
  assert.match(h, /\$\('bw-dziecko-ok'\)\.addEventListener\('click', function \(\) \{\r?\n\s*if \(!moznaZapisac\(\)\) return;/, 'dziecko: bramka także w przycisku wysyłki');
  assert.match(h, /rpc\('akcja_bieg_zgoda_email', \{ p_slug: bieg\.slug, p_zgoda: ch \}\)\.then\(function \(r\) \{\r?\n\s*if \(!r\.ok\) \{ \$\('bw-zgoda-konto'\)\.checked = !ch; st\.textContent = komunikat\(r\); return; \}/, 'zgoda konta: tekst odmowy z mapy kodów');
  assert.match(h, /p_zgoda_email: \$\('bw-zgoda-email-pole'\)\.hidden \? !!\(zgodaKonta && zgodaKonta\.zgoda_email === true\) : \$\('bw-zgoda-email'\)\.checked,/, 'wiersz „ja” zgodny ze zgodą konta');
});


/* 14.11 (teksty Filipa): strona z kompletem wartości z bazy otwiera zapis bez ?proba=1; okno regulaminu z bloków (h4, h5, p, ul > li) przez textContent,
   bez żadnego {…}; przycisk pobrania widoczny; zdanie o polityce z linkiem pod zgodami. Brak jednej wartości (np. regulamin_od) = „WKRÓTCE”. */
test('teksty 14.11 w atrapie strony: komplet z bazy = zapis; okno regulaminu z akapitami i zgodą na ranking; brak regulamin_od = WKRÓTCE', async () => {
  const pelny = Object.assign(LICZNIK(BIEG('zapisy', { regulamin_wersja: '2026-11-v2', regulamin_od: '2026-11-18' })), { imie: 'Janek' });
  const s = await stronaBiegu({ licznik: pelny, sesja: { user: { user_metadata: { full_name: 'anna kowalska' } } } });
  assert.deepEqual(s.dom.widoczny(), ['przed'], 'bez ?proba=1, bo wartości są w bazie');
  const okno = s.dom.daj('bw-regulamin-tresc'), el = okno.dzieci || [];
  const tagi = el.map((e) => e.tag), tekst = el.map((e) => e.tag === 'ul' ? (e.dzieci || []).map((x) => x.textContent).join(' | ') : e.textContent).join('\n');
  assert.equal(tagi[0], 'h4'); assert.equal(tagi.filter((t) => t === 'h5').length, 15, '13 paragrafów + oświadczenie + zgody');
  assert.ok(tagi.includes('ul'), 'zgody jako lista');
  assert.match(tekst, /^Regulamin biegu wirtualnego „Bieg na Mikołajki”/);
  assert.match(tekst, /dziecka o imieniu Janek, dla którego organizacja pożytku publicznego prowadzi zbiórkę pod adresem https:\/\/www\.siepomaga\.pl\/x/);
  assert.match(tekst, /Bieg trwa od soboty, 5 grudnia 2026 do niedzieli, 6 grudnia 2026\./); assert.match(tekst, /do wtorku, 8 grudnia 2026, godz\. 23:59/);
  assert.match(tekst, /Wersja regulaminu: 2026-11-v2, obowiązuje od 18 listopada 2026\./);
  assert.match(tekst, /Ranking: Pokaż mnie w rankingu z czasem i miejscem\./, 'zgoda na ranking w oknie regulaminu');
  assert.doesNotMatch(tekst, /\{[a-z_]+\}/, 'żaden znacznik nie zostaje');
  assert.equal(s.dom.daj('bw-regulamin-pobierz').hidden, false, 'przycisk pobrania widoczny');
  const pol = (s.dom.stany.polityka || []);
  assert.equal(pol.length, 3, 'zdanie o polityce: Zasady, okno zapisu, okno dziecka');
  for (const e of pol) { assert.match(e.textContent, /^Administratorem danych jest BiegaMy\./); assert.equal((e.dzieci || [])[0].href, 'privacy.html#bieg'); assert.equal(e.dzieci[0].target, '_blank'); }
  const brak = await stronaBiegu({ licznik: Object.assign(LICZNIK(BIEG('zapisy', { regulamin_wersja: '2026-11-v2', regulamin_od: null })), { imie: 'Janek' }), sesja: { user: {} } });
  assert.deepEqual(brak.dom.widoczny(), ['wkrotce'], 'brak regulamin_od w bazie = WKRÓTCE');
  assert.equal(brak.dom.daj('bw-regulamin-pobierz').hidden, true);
  assert.match((brak.dom.daj('bw-regulamin-tresc').dzieci || [])[0].textContent, /Regulamin pojawi się razem z otwarciem zapisów/);
  const proba = await stronaBiegu({ search: '?proba=1', licznikProby: LICZNIK(BIEG('zapisy', { slug: 'proba-bieg', regulamin_wersja: '2026-11-v2' })), sesja: { user: {} } });
  assert.match((proba.dom.daj('bw-regulamin-tresc').dzieci || [])[0].textContent, /^Próba: w bazie brakuje danych do regulaminu: imie, od_kiedy\./, 'próba mówi, czego brakuje');
  const h = czytaj('bieg.html');
  assert.match(h, /el\.textContent = x\.tekst;/); assert.doesNotMatch(h, /bw-regulamin-tresc'\)\.innerHTML/, 'regulamin bez innerHTML');
  assert.match(h, /new Blob\(\[B\.regulaminTekst\(wartosci\)\], \{ type: 'text\/plain;charset=utf-8' \}\)/);
});
