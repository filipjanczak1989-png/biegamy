// Blizna #355 (25.11.2026) — radio zgłasza, gdy przestaje grać z właściwego źródła.
//
// Po przeniesieniu radia na m3 (blizna-351) odtwarzacz sam przełącza źródło: uszkodzona kopia na urządzeniu → m3,
// m3 bez pliku albo bez odpowiedzi → zapas z Supabase. Robił to po cichu, więc nie było widać, czy radio gra z m3, czy
// na koszt Supabase (kontrola po pushu 25.11: 0 wpisów w client_errors, ale ten kod niczego tam nie pisał).
// Teraz jeden wpis kind 'radio' z samym etapem, który zawiódł: kopia, m3, zapas, zapis. Bez adresu utworu, tytułu,
// sluga i ID (adres strony bez parametrów: radio.html?utwor=<id> niosłoby ID). Każdy etap raz na załadowanie strony.
'use strict';
const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const SB = czytaj('sb.js');
const RADIO_HTML = czytaj('radio.html');
const SB_URL = 'https://afqojgkaveykxbltxzwm.supabase.co';
const M3 = 'https://radio.biegamy.run/';
const ZAPAS = SB_URL + '/storage/v1/object/public/radio-audio/';
const ID_UTWORU = '0a1b2c3d-1111-4222-8333-444455556666';
const STRONA = { pathname: '/radio.html', search: '?utwor=' + ID_UTWORU };

function atrapaCaches(opcje = {}) {
  const sklep = new Map();
  const klucz = (k) => (typeof k === 'string' ? k : k.url);
  const cache = {
    match: async (k) => { const w = sklep.get(klucz(k)); return w ? new Response(w.blob, { headers: w.h }) : undefined; },
    put: async (k, r) => { if (opcje.brakMiejsca) throw new Error('QuotaExceededError'); const b = await r.blob(); sklep.set(klucz(k), { blob: b, h: Object.fromEntries(r.headers) }); },
    delete: async (k) => sklep.delete(klucz(k)),
    keys: async () => [...sklep.keys()].map((url) => ({ url })),
  };
  return { open: async () => cache, sklep };
}
const dobra = (n = 10) => ({ status: 200, body: 'x'.repeat(n), headers: { 'content-type': 'audio/mpeg', 'content-length': String(n) } });
function atrapaSieci(odpowiedz) {
  return async (u) => { const x = odpowiedz(u); if (x === 'siec') throw new TypeError('Failed to fetch'); return new Response(x.body, { status: x.status, headers: x.headers }); };
}
const zaChwile = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

/** window.RADIO ze źródła sb.js; wpisy, które poszłyby do loggera, lądują w `wpisy` */
function radioZSb({ caches = atrapaCaches(), fetch = atrapaSieci(() => dobra()), navigator = {}, logger = true, srodowisko } = {}) {
  const od = SB.indexOf('  const _radioZM3');
  const doK = SB.indexOf('\n  };\n', od);
  assert.ok(od > 0 && doK > od, 'brak bloku window.RADIO w sb.js');
  const wpisy = [];
  const okno = { SB_URL, BM_SRODOWISKO: srodowisko, caches, sb: {} };
  if (logger) okno._logKlienta = (o) => { wpisy.push(o); };
  let n = 0;
  const U = { createObjectURL: () => 'blob:test-' + (++n), revokeObjectURL: () => {} };
  new Function('window', 'caches', 'fetch', 'navigator', 'URL', 'location', SB.slice(od, doK + 5))(okno, caches, fetch, navigator, U, STRONA);
  okno.RADIO._atrapaCaches = caches;
  return { R: okno.RADIO, wpisy };
}

test('(1) RADIO.zglos: cztery etapy, każdy raz na stronę, w treści sam etap, adres strony bez parametrów', () => {
  const { R, wpisy } = radioZSb();
  assert.deepEqual(R.ETAPY, ['kopia', 'm3', 'zapas', 'zapis']);
  assert.equal(R.zglos('m3'), true); assert.equal(R.zglos('m3'), false); assert.equal(R.zglos('m3'), false);
  assert.equal(R.zglos('kopia'), true); assert.equal(R.zglos('zapas'), true); assert.equal(R.zglos('zapis'), true);
  for (const zly of ['', 'M3', 'inne', undefined, 'https://radio.biegamy.run/park-wolnosci.mp3', 'm3 park-wolnosci']) assert.equal(R.zglos(zly), false, 'spoza listy: ' + zly);
  for (let i = 0; i < 90; i++) R.zglos('m3');
  assert.deepEqual(wpisy, [
    { kind: 'radio', message: 'm3', url: '/radio.html' }, { kind: 'radio', message: 'kopia', url: '/radio.html' },
    { kind: 'radio', message: 'zapas', url: '/radio.html' }, { kind: 'radio', message: 'zapis', url: '/radio.html' }], 'dokładnie 4 wpisy, tylko te pola');
  const bez = radioZSb({ logger: false });
  assert.equal(bez.R.zglos('m3'), true, 'bez loggera nie rzuca');
});

test('(2) przez prawdziwy logger z sb.js: wiersz kind=radio bez ID utworu z adresu; inne rodzaje błędów dalej z parametrami; niezalogowany nic nie pisze', () => {
  const od = SB.indexOf('    var _seen = new Map();'), doK = SB.indexOf('window._logKlienta = _logClientError;');
  assert.ok(od > 0 && doK > od, 'brak loggera client_errors w sb.js');
  const zbuduj = (uid) => {
    const wiersze = [];
    const okno = { _authUid: uid, _appVersion: 'biegamy-2026-11-25-test' };
    const sb = { from: (t) => ({ insert: (w) => { wiersze.push([t, w]); return { then: () => {} }; } }) };
    new Function('window', 'sb', 'location', 'navigator', SB.slice(od, doK) + 'window._logKlienta = _logClientError;')(okno, sb, STRONA, { userAgent: 'test' });
    return { okno, wiersze };
  };
  const { okno, wiersze } = zbuduj('uid-testowy');
  okno._logKlienta({ kind: 'radio', message: 'm3', url: '/radio.html' });
  okno._logKlienta({ kind: 'error', message: 'x is not defined', source: 'radio.html', lineno: 5 });
  assert.equal(wiersze.length, 2);
  const [tabela, radio] = wiersze[0];
  assert.equal(tabela, 'client_errors');
  assert.deepEqual({ kind: radio.kind, message: radio.message, url: radio.url, source: radio.source, stack: radio.stack, lineno: radio.lineno }, { kind: 'radio', message: 'm3', url: '/radio.html', source: '', stack: '', lineno: null });
  assert.doesNotMatch(JSON.stringify(radio), new RegExp(ID_UTWORU + '|utwor=|radio\\.biegamy\\.run|supabase\\.co|\\.mp3'), 'wpis radia bez ID, adresu utworu i sluga');
  assert.equal(wiersze[1][1].url, '/radio.html?utwor=' + ID_UTWORU, 'pozostali wołający: adres jak dotąd (pathname + search)');
  const anon = zbuduj(null);
  anon.okno._logKlienta({ kind: 'radio', message: 'm3', url: '/radio.html' });
  assert.equal(anon.wiersze.length, 0);
});

test('(3) nieudany zapis na urządzeniu → jeden wpis „zapis” na stronę; udany zapis i zapis, którego nie próbowano, bez wpisu', async () => {
  const fetch = atrapaSieci((u) => (u.includes('brak') ? { status: 404, body: '', headers: {} } : u.includes('typ') ? { status: 200, body: '<html>', headers: { 'content-type': 'text/html' } }
    : u.includes('urwany') ? { status: 200, body: 'x'.repeat(10), headers: { 'content-type': 'audio/mpeg', 'content-length': '100' } } : u.includes('siec') ? 'siec' : dobra()));
  const { R, wpisy } = radioZSb({ fetch });
  assert.equal(await R.zapiszNaUrzadzeniu(M3 + 'dobry.mp3'), true);
  assert.equal(await R.zapiszNaUrzadzeniu(M3 + 'dobry.mp3'), true, 'już zapisany');
  assert.equal(await R.zapiszNaUrzadzeniu(ZAPAS + 'x.mp3'), false, 'adres spoza m3: bez próby');
  assert.equal(await R.zapiszNaUrzadzeniu(''), false);
  assert.deepEqual(wpisy, [], 'sukces i brak próby nie zostawiają śladu');
  for (const n of ['brak.mp3', 'typ.mp3', 'urwany.mp3', 'siec.mp3', 'brak2.mp3']) assert.equal(await R.zapiszNaUrzadzeniu(M3 + n), false, n);
  assert.deepEqual(wpisy, [{ kind: 'radio', message: 'zapis', url: '/radio.html' }], 'pięć nieudanych prób = jeden wpis');
  const pelny = radioZSb({ caches: atrapaCaches({ brakMiejsca: true }) });
  assert.equal(await pelny.R.zapiszNaUrzadzeniu(M3 + 'a.mp3'), false);
  assert.deepEqual(pelny.wpisy.map((w) => w.message), ['zapis'], 'brak miejsca na urządzeniu też jest nieudanym zapisem');
  const oszczedny = radioZSb({ navigator: { connection: { saveData: true } } });
  assert.equal(await oszczedny.R.zapiszNaUrzadzeniu(M3 + 'a.mp3'), false);
  assert.deepEqual(oszczedny.wpisy, [], 'tryb oszczędzania danych: nie próbujemy, więc nie zgłaszamy');
});

// ── radio.html: odtwarzacz z atrapą DOM ─────────────────────────────────────────────────────────────────────
function element() {
  const e = { style: {}, textContent: '', zdarzenia: {}, historia: [], paused: true, _src: '' };
  Object.defineProperty(e, 'src', { get() { return this._src; }, set(v) { this._src = v; this.historia.push(v); } });
  e.addEventListener = (n, f) => { e.zdarzenia[n] = f; };
  e.removeAttribute = (a) => { if (a === 'src') e._src = ''; };
  e.load = () => {}; e.pause = () => { e.paused = true; };
  e.play = () => { e.paused = false; return Promise.resolve(); };
  return e;
}
function odtwarzacz(RADIO) {
  const lety = RADIO_HTML.match(/let _radioUid = null;[\s\S]*?let _radioZapisTimer = null;[^\n]*\n/);
  const iife = RADIO_HTML.match(/\(function\(\)\{\n {2}\/\/ ikony statyczne[\s\S]*?\n\}\)\(\);\n/);
  const funkcje = ['radioPlayAt', 'radioUstawZrodlo', 'radioPrzygotujNastepny', 'radioNext'].map((n) => RADIO_HTML.match(new RegExp('function ' + n + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'))[0]);
  assert.ok(lety && iife, 'brak stanu albo słuchaczy <audio> w radio.html');
  const el = {}; ['rad-player', 'rad-video', 'rad-audio', 'rad-np-title', 'rad-np-cover', 'rad-np-ph'].forEach((id) => { el[id] = element(); });
  const U = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  const api = new Function('window', 'document', 'sb', 'alert', 'caches', 'URL', 'navigator', 'setTimeout', 'clearTimeout',
    lety[0] + 'function radioUpdateMediaSession(){}\n' + funkcje.join('') + iife[0] + 'return { radioPlayAt, kolejka: (q) => { _radioQueue = q; } };')(
    { RADIO, safeUrlAttr: (u) => (u && u.startsWith('https://') ? u : '') }, { getElementById: (id) => el[id] || null, querySelectorAll: () => [] },
    { rpc: () => Promise.resolve({}) }, () => {}, RADIO._atrapaCaches, U, {}, setTimeout, clearTimeout);
  return { api, aud: el['rad-audio'] };
}
const utwor = (slug) => ({ id: ID_UTWORU, slug, media_ext: 'mp3', title: 'Tytuł ' + slug });

test('(4) radio.html: m3 zawodzi → wpis „m3” i zapas; zapas zawodzi → „zapas”; kolejne utwory tej samej strony bez nowych wpisów; kopia → „kopia”', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { R, wpisy } = radioZSb();
  const { api, aud } = odtwarzacz(R);
  api.kolejka([utwor('park-wolnosci'), utwor('drugi-utwor'), utwor('trzeci-utwor')]);

  api.radioPlayAt(0);
  aud.zdarzenia.error();
  assert.equal(aud.src, ZAPAS + 'park-wolnosci.mp3', 'przełączenie na zapas jak dotąd');
  assert.deepEqual(wpisy.map((w) => w.message), ['m3']);
  aud.zdarzenia.error();
  assert.deepEqual(wpisy.map((w) => w.message), ['m3', 'zapas'], 'zapas też nie zagrał');

  for (const i of [1, 2]) { api.radioPlayAt(i); aud.zdarzenia.error(); aud.zdarzenia.error(); }
  assert.deepEqual(wpisy.map((w) => w.message), ['m3', 'zapas'], 'awaria m3 na trzech utworach = dalej dwa wpisy');
  assert.equal(aud.src, ZAPAS + 'trzeci-utwor.mp3', 'przełączanie działa dalej, tylko bez nowych wpisów');

  await R.zapiszNaUrzadzeniu(M3 + 'drugi-utwor.mp3');
  api.radioPlayAt(1); await zaChwile();
  assert.match(aud.src, /^blob:/);
  aud.zdarzenia.error(); await zaChwile();
  assert.equal(aud.src, M3 + 'drugi-utwor.mp3', 'uszkodzona kopia → m3 jak dotąd');
  assert.deepEqual(wpisy.map((w) => w.message), ['m3', 'zapas', 'kopia']);
  assert.deepEqual([...new Set(wpisy.map((w) => JSON.stringify(Object.keys(w).sort())))], ['["kind","message","url"]'], 'żadnych dodatkowych pól');
  assert.doesNotMatch(JSON.stringify(wpisy), /park-wolnosci|drugi-utwor|Tytuł|0a1b2c3d|\.mp3|https:/, 'bez sluga, tytułu, ID i adresów');
});

test('(5) radio.html ze STARYM sb.js (bez RADIO.zglos, z cache SW po deployu): przełącza jak dotąd, bez wyjątku', () => {
  const stary = { MEDIA_BASE: M3, COVER_BASE: M3, ZAPAS_BASE: ZAPAS, zapisane: new Set(), _atrapaCaches: atrapaCaches(),
    mediaUrl(t) { return this.MEDIA_BASE + t.slug + '.mp3'; }, mediaUrlZapas(t) { return this.ZAPAS_BASE + t.slug + '.mp3'; }, coverUrl() { return ''; },
    zUrzadzenia: async () => '', zapiszNaUrzadzeniu: async () => false };
  const { api, aud } = odtwarzacz(stary);
  api.kolejka([utwor('a')]);
  api.radioPlayAt(0);
  aud.zdarzenia.error();
  assert.equal(aud.src, ZAPAS + 'a.mp3');
  aud.zdarzenia.error();
  assert.equal(aud.src, ZAPAS + 'a.mp3');
});
