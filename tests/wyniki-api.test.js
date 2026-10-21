// ─────────────────────────────────────────────────────────────────────────────
// KLIENT API WYNIKÓW (js/wyniki-api.js) — https://api.biegamy.run (F6), offline z atrapą fetch.
//
// Pilnuje: flaga WYNIKI_API_WLACZONE=false → zero zapytań; tylko środowisko prod (tokenu TEST nie wysyłamy);
// token wyłącznie w nagłówku Authorization, nigdzie nie zapisany i nie w błędach; 401 → jedno odświeżenie sesji;
// 429 z Retry-After; komunikat serwera tylko z funkcji 012 (PT4xx); sieć/timeout/offline → status 0.
// Flagę na czas testu włączamy podmianą w ŹRÓDLE (w repo zostaje false — pilnuje tego blizna-53).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ZRODLO = fs.readFileSync(path.join(__dirname, '..', 'js', 'wyniki-api.js'), 'utf8');
const TOKEN = 'eyJ.TOKEN-FIKCYJNY.sig';
const TOKEN2 = 'eyJ.TOKEN-ODSWIEZONY.sig';

function odp(status, body, naglowki = {}) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => naglowki[k] ?? null }, json: async () => { if (body === undefined) throw new SyntaxError('x'); return body; } };
}

function srodowisko({ wlaczone = true, srod = 'prod', sesja = true, online = true, odpowiedzi = [], fetchImpl = null } = {}) {
  const zapisy = [];
  const magazyn = { setItem: (k, v) => zapisy.push([k, v]), getItem: () => null, removeItem() {} };
  const logi = [];
  const konsola = { log: (...a) => logi.push(a.join(' ')), warn: (...a) => logi.push(a.join(' ')), error: (...a) => logi.push(a.join(' ')), info() {}, debug() {} };
  const wolania = [];
  let odswiezenia = 0;
  let aktualny = sesja ? TOKEN : null;
  const sb = { auth: {
    getSession: async () => ({ data: { session: aktualny ? { access_token: aktualny } : null } }),
    refreshSession: async () => { odswiezenia++; if (aktualny) aktualny = TOKEN2; return {}; },
  } };
  const okno = { BM_SRODOWISKO: srod, localStorage: magazyn, sessionStorage: magazyn, console: konsola };
  const ctx = vm.createContext({ window: okno, navigator: { onLine: online }, console: konsola, setTimeout, clearTimeout, AbortController, JSON, Number, Object, Promise });
  const f = fetchImpl || (async (url, init) => { wolania.push({ url, init }); const o = odpowiedzi[Math.min(wolania.length - 1, odpowiedzi.length - 1)]; return typeof o === 'function' ? o(init) : o; });
  vm.runInContext(wlaczone ? ZRODLO.replace('var WYNIKI_API_WLACZONE = false;', 'var WYNIKI_API_WLACZONE = true;') : ZRODLO, ctx);
  const api = okno.wynikiApi(sb, { fetchImpl: async (u, i) => { if (fetchImpl) wolania.push({ url: u, init: i }); return f(u, i); }, timeoutMs: 50 });
  return { api, okno, wolania, zapisy, logi, odswiezenia: () => odswiezenia };
}

test('flaga false: zero zapytań, error.kod "wylaczone"; wynikiApiDostepne() = false', async () => {
  const s = srodowisko({ wlaczone: false, odpowiedzi: [odp(200, [])] });
  const r = await s.api.rpc('search_runners', { q: 'abc' });
  assert.deepEqual([r.data, r.error.kod, r.error.status], [null, 'wylaczone', 0]);
  assert.equal(s.wolania.length, 0);
  assert.equal(s.okno.wynikiApiDostepne(), false);
  assert.equal(s.okno.WYNIKI_API_WLACZONE, false);
});

test('środowisko inne niż prod: tokenu nie wysyłamy (kod "srodowisko"); nieznane RPC nie wychodzi', async () => {
  for (const srod of ['test', 'test-bez-konfiguracji', null]) {
    const s = srodowisko({ srod, odpowiedzi: [odp(200, [])] });
    assert.equal((await s.api.rpc('search_runners', { q: 'abc' })).error.kod, 'srodowisko', String(srod));
    assert.equal(s.wolania.length, 0);
  }
  const s = srodowisko({ odpowiedzi: [odp(200, [])] });
  assert.equal((await s.api.rpc('resolve_runners', {})).error.kod, 'nieznane_rpc');
  assert.equal((await s.api.rpc('erasure_finalize', {})).error.kod, 'nieznane_rpc', 'funkcje operatora nie są dla UI');
  assert.equal(s.wolania.length, 0);
  assert.equal(s.okno.wynikiApiDostepne(), true);
});

test('zapytanie: POST na https://api.biegamy.run/rpc/<nazwa>, Bearer z sesji, credentials omit, no-store, body JSON', async () => {
  const s = srodowisko({ odpowiedzi: [odp(200, [{ runner_key: 'k1' }])] });
  const r = await s.api.rpc('search_runners', { q: 'Jan Testowy' });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { data: [{ runner_key: 'k1' }], error: null });
  const { url, init } = s.wolania[0];
  assert.equal(url, 'https://api.biegamy.run/rpc/search_runners');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, 'Bearer ' + TOKEN);
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.body, JSON.stringify({ q: 'Jan Testowy' }));
  assert.ok(init.signal, 'timeout przez AbortController');
});

test('brak sesji: kod "brak_sesji", bez zapytania', async () => {
  const s = srodowisko({ sesja: false, odpowiedzi: [odp(200, [])] });
  assert.deepEqual([(await s.api.rpc('erasure_status', {})).error.kod, s.wolania.length], ['brak_sesji', 0]);
});

test('401 → jedno refreshSession() i ponowienie z nowym tokenem; drugie 401 → "nieautoryzowany"', async () => {
  const s = srodowisko({ odpowiedzi: [odp(401, { message: 'JWT expired' }), odp(200, [])] });
  const r = await s.api.rpc('upcoming_races', {});
  assert.equal(r.error, null);
  assert.equal(s.odswiezenia(), 1);
  assert.equal(s.wolania[1].init.headers.Authorization, 'Bearer ' + TOKEN2);
  const s2 = srodowisko({ odpowiedzi: [odp(401, {}), odp(401, {})] });
  const r2 = await s2.api.rpc('upcoming_races', {});
  assert.deepEqual([r2.error.status, r2.error.kod, s2.wolania.length, s2.odswiezenia()], [401, 'nieautoryzowany', 2, 1]);
});

test('429: Retry-After w sekundach (60 dla wyszukiwania, 3600 dla usuwania); 404, 403, 413, 5xx', async () => {
  const a = await srodowisko({ odpowiedzi: [odp(429, undefined, { 'Retry-After': '3600' })] }).api.rpc('erasure_status', {});
  assert.deepEqual([a.error.status, a.error.kod, a.error.retryAfter], [429, 'limit', 3600]);
  const b = await srodowisko({ odpowiedzi: [odp(429, undefined, { 'Retry-After': '60' })] }).api.rpc('search_runners', { q: 'abc' });
  assert.equal(b.error.retryAfter, 60);
  const c = await srodowisko({ odpowiedzi: [odp(429, { code: 'PT429', message: 'Limit wniosków dla konta' })] }).api.rpc('erasure_request', { p_result_ids: [] });
  assert.deepEqual([c.error.kod, c.error.retryAfter, c.error.komunikat], ['limit', null, 'Limit wniosków dla konta']);
  assert.equal((await srodowisko({ odpowiedzi: [odp(404, 'Not found')] }).api.rpc('runner_results', {})).error.kod, 'brak');
  assert.equal((await srodowisko({ odpowiedzi: [odp(413, undefined)] }).api.rpc('erasure_request', {})).error.kod, 'za_duze');
  assert.equal((await srodowisko({ odpowiedzi: [odp(502, undefined)] }).api.rpc('search_runners', {})).error.kod, 'serwer');
});

test('komunikat tylko z funkcji 012 (PT4xx); inne treści odpowiedzi nie wychodzą do UI', async () => {
  const pt = await srodowisko({ odpowiedzi: [odp(403, { code: 'PT403', message: 'Zaloguj się kodem albo linkiem z maila (ważne 15 min)' })] }).api.rpc('erasure_request', {});
  assert.deepEqual([pt.error.kod, pt.error.komunikat], ['odmowa', 'Zaloguj się kodem albo linkiem z maila (ważne 15 min)']);
  const inne = await srodowisko({ odpowiedzi: [odp(400, { code: '22P02', message: 'invalid input syntax', details: 'Failing row contains (Jan Testowy, 1980)' })] }).api.rpc('erasure_request', {});
  assert.equal(inne.error.komunikat, null);
  assert.ok(!JSON.stringify(inne).includes('Jan Testowy'));
});

test('sieć: wyjątek fetch → "siec", przekroczony czas → "timeout", navigator.onLine=false → "offline" bez zapytania', async () => {
  const s = srodowisko({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.deepEqual([(await s.api.rpc('search_runners', {})).error.kod, (await s.api.rpc('search_runners', {})).error.status], ['siec', 0]);
  const wolny = srodowisko({ fetchImpl: (u, init) => new Promise((_, nie) => init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; nie(e); })) });
  assert.equal((await wolny.api.rpc('search_runners', {})).error.kod, 'timeout');
  const off = srodowisko({ online: false, odpowiedzi: [odp(200, [])] });
  assert.deepEqual([(await off.api.rpc('search_runners', {})).error.kod, off.wolania.length], ['offline', 0]);
});

test('token: nie trafia do magazynów, logów ani do obiektu błędu', async () => {
  const s = srodowisko({ odpowiedzi: [odp(401, {}), odp(403, { code: 'PT403', message: 'x' })] });
  const r = await s.api.rpc('erasure_status', {});
  assert.deepEqual(s.zapisy, []);
  assert.deepEqual(s.logi, []);
  assert.ok(!JSON.stringify(r).includes('TOKEN'));
  assert.ok(!/localStorage|sessionStorage|console\./.test(ZRODLO.replace(/\/\*[\s\S]*?\*\//g, '')), 'klient nie dotyka magazynów ani konsoli');
});
