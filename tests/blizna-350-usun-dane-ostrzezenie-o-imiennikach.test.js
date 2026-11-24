/* BLIZNA 350 (Filip 24.11): „Usuń moje wyniki” nie uprzedzał o imiennikach. Migracja 013 (nazwisko0) działa na maszynie wyników od 27.10: wniosek
   o wynik bez roku urodzenia ukrywa też NIEZAZNACZONE wyniki bez roku urodzenia z tym samym imieniem i nazwiskiem (także innej osoby) i blokuje nowe
   na 3 lata; Caddy przepuszcza /rpc/erasure_preview_nazwisko0. Ekran z ostrzeżeniem powstał 27.10 (31f9a097, gałąź feat/usuwanie-bez-rocznika-ui),
   ale nie trafił na main: front nie pytał o liczbę imienników, a RPC nie było na liście klienta (js/wyniki-api.js odrzuciłby je jako nieznane).
   Ta blizna przechodzi PRAWDZIWY ekran (js/usun-dane.js) z PRAWDZIWYM klientem (js/wyniki-api.js, flaga z repo, prawdziwy sb.js → prod) —
   atrapą jest tylko fetch do api.biegamy.run. Pilnuje:
   (1) wynik bez roku urodzenia: przed „Złóż wniosek” jedno zapytanie erasure_preview_nazwisko0 z zaznaczonymi id i ostrzeżenie z liczbą imienników;
   (2) bez liczby imienników (błąd podglądu, np. 404 gdyby serwer nie przepuszczał) — nie ma przycisku wniosku;
   (3) wynik z rocznikiem bez blokady — bez zbędnego zapytania, wniosek jak dotąd;
   (4) każde RPC, które woła ekran, jest na liście dozwolonych klienta; próg ręcznego sprawdzenia = 30 jak w erasure_confirm na serwerze. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');

function miniDom() {
  class Wezel { constructor(doc) { this.ownerDocument = doc; this.children = []; } }
  class Tekst extends Wezel { constructor(doc, t) { super(doc); this.data = String(t); } get textContent() { return this.data; } }
  class Element extends Wezel {
    constructor(doc, tag) { super(doc); this.tagName = tag.toUpperCase(); this.attrs = {}; this.className = ''; this.sluchacze = {}; this.value = ''; this.checked = false; this.disabled = false; }
    append(...w) { for (const x of w) this.children.push(typeof x === 'string' ? new Tekst(this.ownerDocument, x) : x); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.sluchacze[t] = this.sluchacze[t] || []).push(f); }
    async wyzwol(t) { for (const f of this.sluchacze[t] || []) await f.call(this, { type: t }); }
    get textContent() { return this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children = []; if (v !== '' && v != null) this.append(new Tekst(this.ownerDocument, v)); }
    get innerHTML() { throw new Error('innerHTML zabronione'); }
    set innerHTML(v) { throw new Error('innerHTML zabronione'); }
    wszystkie(tag) { const out = []; const idz = (n) => { for (const c of n.children) { if (c.tagName === tag) out.push(c); if (c.children) idz(c); } }; idz(this); return out; }
  }
  const doc = { createElement: (t) => new Element(doc, t), createTextNode: (t) => new Tekst(doc, t) };
  return { root: new Element(doc, 'div') };
}

const T0 = Date.parse('2026-11-24T09:00:00Z');
const jwt = (claims) => 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s';
const sesja = () => ({ access_token: jwt({ amr: [{ method: 'otp', timestamp: Math.floor((T0 - 60000) / 1000) }] }), user: { email: 'jan.testowy@example.org' } });
const czekaj = () => new Promise((r) => setImmediate(r));

const BEZ_ROCZNIKA = { kandydat: { runner_key: 'n:testowy jan', display_name: 'Jan Testowy', yob: null, results_count: 2, last_event: 'Bieg Fikcyjny' },
  wiersze: [{ result_id: 'b1', event_name: 'Bieg Fikcyjny 4', event_date: '2025-06-01', distance_km: 10, source: 'b4sport', ma_id_zrodla: false, dopasowanie: 'nazwisko' },
    { result_id: 'b2', event_name: 'Bieg Fikcyjny 5', event_date: '2024-06-01', distance_km: 5, source: 'elektroniczne-zapisy', ma_id_zrodla: false, dopasowanie: 'nazwisko' }],
  etykieta: /rocznik nieznany/ };
const Z_ROCZNIKIEM = { kandydat: { runner_key: 'k:testowy jan|1980', display_name: 'Jan Testowy', yob: 1980, results_count: 1, last_event: 'Bieg Fikcyjny' },
  wiersze: [{ result_id: 'a1', event_name: 'Bieg Fikcyjny 1', event_date: '2025-05-01', distance_km: 10, source: 'datasport', ma_id_zrodla: true, dopasowanie: 'id_zrodla' }],
  etykieta: /1980/ };

/* prawdziwy klient i ekran; serwer: odpowiedzi per RPC ({ status, json }), domyślnie 200 + [] */
async function ekranDoPodsumowania(przypadek, serwer = {}) {
  const ctx = zaladujSb();
  if (typeof ctx.atob !== 'function') ctx.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  if (typeof ctx.TextDecoder !== 'function') ctx.TextDecoder = TextDecoder;
  vm.runInContext(czytaj('js/wyniki-api.js'), ctx, { filename: 'js/wyniki-api.js' });
  vm.runInContext(czytaj('js/usun-dane.js'), ctx, { filename: 'js/usun-dane.js' });
  const zapytania = [];
  const domyslne = { search_runners: { json: [przypadek.kandydat] }, erasure_preview: { json: przypadek.wiersze }, erasure_request: { json: 'w-1' } };
  const fetchImpl = async (url, init) => {
    const nazwa = String(url).split('/rpc/')[1];
    zapytania.push({ url: String(url), nazwa, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const o = serwer[nazwa] || domyslne[nazwa] || { json: [] };
    const status = o.status || 200;
    return { ok: status >= 200 && status < 300, status, json: async () => o.json, headers: { get: () => null } };
  };
  const sb = { auth: { getSession: async () => ({ data: { session: sesja() } }), refreshSession: async () => ({}) } };
  assert.equal(ctx.wynikiApiDostepne(), true, 'prod + flaga z repo: usługa dostępna');
  const { root } = miniDom();
  ctx.initUsunDane({ sb, api: ctx.wynikiApi(sb, { fetchImpl }), root, dostepne: true, podglad: false, teraz: () => T0,
    setInterval: () => 1, clearInterval() {}, location: { hash: '', search: '', pathname: '/usun-dane.html' }, history: { replaceState() {} } });
  await czekaj();
  const tekst = () => root.textContent;
  const przycisk = (re) => root.wszystkie('BUTTON').find((b) => re.test(b.textContent));
  const klik = async (re) => { const b = przycisk(re); assert.ok(b, 'brak przycisku ' + re + ' w: ' + tekst()); await b.wyzwol('click'); await czekaj(); await czekaj(); };
  root.wszystkie('INPUT')[0].value = 'Jan Testowy';
  await klik(/^Szukaj$/); await klik(przypadek.etykieta); await klik(/Dalej – podsumowanie/);
  return { tekst, przycisk, klik, zapytania, ile: (n) => zapytania.filter((z) => z.nazwa === n).length };
}

test('wynik bez roku urodzenia: przed „Złóż wniosek” prawdziwy klient pyta api.biegamy.run o imienników i ekran ostrzega z liczbą', async () => {
  const e = await ekranDoPodsumowania(BEZ_ROCZNIKA, { erasure_preview_nazwisko0: { json: 4 } });
  assert.equal(e.ile('erasure_preview_nazwisko0'), 1, 'jedno zapytanie o imienników');
  const z = e.zapytania.find((x) => x.nazwa === 'erasure_preview_nazwisko0');
  assert.equal(z.url, 'https://api.biegamy.run/rpc/erasure_preview_nazwisko0');
  assert.deepEqual(z.body, { p_result_ids: ['b1', 'b2'], p_blokuj_nazwisko: false });
  assert.match(z.auth, /^Bearer h\./, 'token w nagłówku');
  assert.match(e.tekst(), /Razem z zaznaczonymi zostaną ukryte jeszcze 4 inne wyniki bez roku urodzenia z tym samym imieniem i nazwiskiem – mogą należeć do innej osoby, która tak samo się nazywa\./);
  assert.match(e.tekst(), /Przez 3 lata nowe wyniki bez roku urodzenia z tym imieniem i nazwiskiem będziemy od razu ukrywać – także wyniki innej osoby/);
  assert.ok(e.przycisk(/Złóż wniosek/), 'wniosek dopiero po liczbie imienników');
  assert.equal(e.ile('erasure_request'), 0, 'samo podsumowanie niczego nie składa');
  await e.klik(/Złóż wniosek/);
  assert.deepEqual(e.zapytania.find((x) => x.nazwa === 'erasure_request').body, { p_result_ids: ['b1', 'b2'], p_blokuj_nazwisko: false });
});

test('bez liczby imienników nie ma wniosku: 404 (serwer nie przepuszcza podglądu) i 500 — komunikat, bez „Złóż wniosek”', async () => {
  for (const status of [404, 500]) {
    const e = await ekranDoPodsumowania(BEZ_ROCZNIKA, { erasure_preview_nazwisko0: { status, json: {} } });
    assert.equal(e.ile('erasure_preview_nazwisko0'), 1, String(status));
    assert.equal(e.przycisk(/Złóż wniosek/), undefined, status + ': bez przycisku wniosku');
    assert.equal(e.ile('erasure_request'), 0);
  }
});

test('wynik z rocznikiem bez blokady: bez zapytania o imienników, bez ostrzeżenia, wniosek jak dotąd', async () => {
  const e = await ekranDoPodsumowania(Z_ROCZNIKIEM);
  assert.equal(e.ile('erasure_preview_nazwisko0'), 0);
  assert.doesNotMatch(e.tekst(), /innej osoby, która tak samo się nazywa/);
  assert.ok(e.przycisk(/Złóż wniosek/));
});

test('każde RPC ekranu jest na liście klienta (inaczej „nieznane_rpc” bez zapytania); próg ręcznego sprawdzenia 30 jak na serwerze', () => {
  const ctx = zaladujSb();
  vm.runInContext(czytaj('js/wyniki-api.js'), ctx, { filename: 'js/wyniki-api.js' });
  vm.runInContext(czytaj('js/usun-dane.js'), ctx, { filename: 'js/usun-dane.js' });
  const lista = ctx._wynikiApi.RPC_DOZWOLONE;
  const wolane = [...new Set([...czytaj('js/usun-dane.js').matchAll(/api\.rpc\('([a-z_0-9]+)'/g)].map((m) => m[1]))].sort();
  assert.ok(wolane.includes('erasure_preview_nazwisko0'), 'ekran woła podgląd imienników');
  for (const n of wolane) assert.ok(lista.includes(n), n + ' na liście RPC_DOZWOLONE (js/wyniki-api.js)');
  // erasure_confirm na maszynie wyników (odczyt 24.11): prywatne.wierszy_do_ukrycia(p_id) > 30 → 'wstrzymane'
  assert.equal(ctx._usunDane.PROG_RECZNY, 30);
});
