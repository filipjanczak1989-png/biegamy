// Blizna #351 (24.11.2026) — radio z m3 (radio.biegamy.run) i utwór pobierany na urządzenie raz.
//
// Panel Usage 24.11: Cached Egress 6,0 z 5 GB (120 %), drugi okres z rzędu → od 21.12 ograniczenie projektu. Pliki radia
// (kubełek radio-audio, 94 mp3 po ok. 4,5 MB) przenosimy na m3 (Caddy). Kubełek zostaje jako ZAPAS dla utworu, którego
// na m3 jeszcze nie ma. Utwór słuchany ≥ 20 s aplikacja pobiera raz w całości do Cache API i odtąd gra go przez blob:
// (bez sieci, także offline i w tle). Service Worker mediów dalej nie przechwytuje (tło iOS, sw.js), tylko nie kasuje
// tego cache przy deployu.
//
// Test wyciąga window.RADIO z sb.js i funkcje odtwarzacza z radio.html i uruchamia je z atrapą Cache API, sieci i <audio>.
'use strict';
const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8').replace(/\r/g, '');
const SB = czytaj('sb.js');
const SW = czytaj('sw.js');
const RADIO_HTML = czytaj('radio.html');
const SB_URL = 'https://afqojgkaveykxbltxzwm.supabase.co';
const M3 = 'https://radio.biegamy.run/';
const ZAPAS = SB_URL + '/storage/v1/object/public/radio-audio/';

function atrapaCaches() {
  const sklep = new Map();
  const klucz = (k) => (typeof k === 'string' ? k : k.url);
  const cache = {
    match: async (k) => { const w = sklep.get(klucz(k)); return w ? new Response(w.blob, { headers: w.h }) : undefined; },
    put: async (k, r) => { const b = await r.blob(); sklep.delete(klucz(k)); sklep.set(klucz(k), { blob: b, h: Object.fromEntries(r.headers) }); },
    delete: async (k) => sklep.delete(klucz(k)),
    keys: async () => [...sklep.keys()].map((url) => ({ url })),
  };
  return { open: async () => cache, sklep };
}
function atrapaSieci(odpowiedz) {
  const f = async (u, o) => { f.wywolania.push({ u, o }); const x = odpowiedz(u); return new Response(x.body, { status: x.status, headers: x.headers }); };
  f.wywolania = [];
  return f;
}
const dobraOdpowiedz = (n = 10) => ({ status: 200, body: 'x'.repeat(n), headers: { 'content-type': 'audio/mpeg', 'content-length': String(n) } });
function atrapaURL() {
  let n = 0;
  return { utworzone: [], cofniete: [], createObjectURL(b) { const u = 'blob:test-' + (++n); this.utworzone.push(u); return u; }, revokeObjectURL(u) { this.cofniete.push(u); } };
}
const zaChwile = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

function radioZSb({ srodowisko, caches, fetch, navigator = {}, URL: U = atrapaURL() } = {}) {
  const od = SB.indexOf('  const _radioZM3');
  const doK = SB.indexOf('\n  };\n', od);
  assert.ok(od > 0 && doK > od, 'brak bloku window.RADIO z _radioZM3 w sb.js');
  const okno = { SB_URL, BM_SRODOWISKO: srodowisko, caches: caches || atrapaCaches(), sb: {} };
  new Function('window', 'caches', 'fetch', 'navigator', 'URL', SB.slice(od, doK + 5))(okno, okno.caches, fetch, navigator, U);
  return okno.RADIO;
}

test('(1) adresy: produkcja gra z radio.biegamy.run, zapas z Supabase; środowisko testowe zostaje przy swoim magazynie', () => {
  const R = radioZSb();
  const t = { slug: 'park-wolnosci', media_ext: 'mp3', cover_slug: 'cover-park-wolnosci' };
  assert.equal(R.mediaUrl(t), M3 + 'park-wolnosci.mp3');
  assert.equal(R.coverUrl(t), M3 + 'cover-park-wolnosci.webp');
  assert.equal(R.mediaUrlZapas(t), ZAPAS + 'park-wolnosci.mp3');
  assert.equal(R.CACHE, 'biegamy-radio-v1');
  const T = radioZSb({ srodowisko: 'test' });
  assert.equal(T.mediaUrl(t), ZAPAS + 'park-wolnosci.mp3');
  assert.equal(T.mediaUrlZapas(t), '', 'na teście nie ma zapasu: inaczej błąd przełączałby na ten sam adres');
});

test('(2) radio.biegamy.run na liście hostów mediów (safeUrlAttr), tylko https i dokładna nazwa', () => {
  const kod = SB.match(/function _isSafeMediaUrl\(url\) \{[\s\S]*?\n {2}\}\n/);
  assert.ok(kod, 'brak _isSafeMediaUrl w sb.js');
  const ok = new Function('window', kod[0] + '\nreturn _isSafeMediaUrl;')({ SB_URL });
  assert.equal(ok(M3 + 'utwor.mp3'), true);
  assert.equal(ok('http://radio.biegamy.run/utwor.mp3'), false);
  assert.equal(ok('https://radio.biegamy.run.zly.pl/utwor.mp3'), false);
  assert.equal(ok('https://zleradio.biegamy.run/utwor.mp3'), false);
});

test('(3) zapis na urządzeniu: tylko cała odpowiedź 200 audio/* o zgodnym rozmiarze, z CORS, raz', async () => {
  const caches = atrapaCaches();
  const fetch = atrapaSieci((u) => (u.includes('zly-typ') ? { status: 200, body: '<html>', headers: { 'content-type': 'text/html' } }
    : u.includes('urwany') ? { status: 200, body: 'x'.repeat(10), headers: { 'content-type': 'audio/mpeg', 'content-length': '100' } }
    : u.includes('zakres') ? { status: 206, body: 'x', headers: { 'content-type': 'audio/mpeg' } }
    : u.includes('brak') ? { status: 404, body: '', headers: {} } : dobraOdpowiedz()));
  const R = radioZSb({ caches, fetch });
  const [a, b] = await Promise.all([R.zapiszNaUrzadzeniu(M3 + 'a.mp3'), R.zapiszNaUrzadzeniu(M3 + 'a.mp3')]);
  assert.equal(a && b, true);
  assert.equal(fetch.wywolania.length, 1, 'dwa jednoczesne zapisy = jedno pobranie');
  assert.deepEqual(fetch.wywolania[0].o, { mode: 'cors', credentials: 'omit' });
  assert.equal(await R.zapiszNaUrzadzeniu(M3 + 'a.mp3'), true);
  assert.equal(fetch.wywolania.length, 1, 'utwór już na urządzeniu: bez sieci');
  assert.ok(R.zapisane.has(M3 + 'a.mp3'));
  for (const n of ['zly-typ.mp3', 'urwany.mp3', 'zakres.mp3', 'brak.mp3']) assert.equal(await R.zapiszNaUrzadzeniu(M3 + n), false, n);
  assert.equal(await R.zapiszNaUrzadzeniu(ZAPAS + 'a.mp3'), false, 'zapas z Supabase nigdy nie idzie na urządzenie');
  assert.deepEqual([...caches.sklep.keys()], [M3 + 'a.mp3']);
  const oszczedny = radioZSb({ caches: atrapaCaches(), fetch, navigator: { connection: { saveData: true } } });
  assert.equal(await oszczedny.zapiszNaUrzadzeniu(M3 + 'b.mp3'), false, 'tryb oszczędzania danych: bez pobierania');
  const testowy = radioZSb({ srodowisko: 'test', caches: atrapaCaches(), fetch });
  assert.equal(await testowy.zapiszNaUrzadzeniu(ZAPAS + 'a.mp3'), false, 'środowisko testowe: bez zapisu');
});

test('(4) odczyt z urządzenia (blob:), spis po starcie strony i limit: najstarsze wylatują', async () => {
  const caches = atrapaCaches();
  const U = atrapaURL();
  const R = radioZSb({ caches, fetch: atrapaSieci(() => dobraOdpowiedz(10)), URL: U });
  R.LIMIT = 3; R.LIMIT_B = 1000;
  for (const n of ['1', '2', '3', '4']) await R.zapiszNaUrzadzeniu(M3 + n + '.mp3');
  assert.deepEqual([...caches.sklep.keys()], [M3 + '2.mp3', M3 + '3.mp3', M3 + '4.mp3']);
  assert.equal(R.zapisane.has(M3 + '1.mp3'), false);
  R.LIMIT_B = 25;
  await R.zapiszNaUrzadzeniu(M3 + '5.mp3');
  assert.deepEqual([...caches.sklep.keys()], [M3 + '4.mp3', M3 + '5.mp3'], 'limit bajtów: 2 × 10 B ≤ 25 B');
  assert.match(await R.zUrzadzenia(M3 + '5.mp3'), /^blob:/);
  assert.equal(await R.zUrzadzenia(M3 + '1.mp3'), '');
  const poStarcie = radioZSb({ caches, fetch: atrapaSieci(() => dobraOdpowiedz()) });
  await poStarcie.wczytajSpis();
  assert.deepEqual([...poStarcie.zapisane], [M3 + '4.mp3', M3 + '5.mp3']);
});

test('(5) sw.js: cache radia przeżywa deploy (ta sama nazwa co w sb.js), a media z m3 dalej idą prosto do sieci', () => {
  assert.match(SW, /const RADIO_CACHE = 'biegamy-radio-v1';/);
  assert.match(SW, /name !== FILMY_CACHE && name !== RADIO_CACHE\)/);
  const film = SW.match(/function isFilmPromo\([\s\S]*?\n\}\n/)[0];
  const isFilmPromo = new Function(film + '\nreturn isFilmPromo;')();
  assert.equal(isFilmPromo(new URL(M3 + 'utwor.mp3')), false);
  assert.match(SW, /if \(\/\\\.\(mp4\|m4a\|mp3\|webm\|ogg\|wav\|aac\|mov\|m4v\)\$\/i\.test\(url\.pathname\)\) return;/);
});

// ── radio.html: odtwarzacz z atrapą DOM ─────────────────────────────────────────────────────────────────────
function element(nazwa) {
  const e = { nazwa, style: {}, textContent: '', zdarzenia: {}, wywolania: [], historia: [], paused: true, _src: '' };
  Object.defineProperty(e, 'src', { get() { return this._src; }, set(v) { this._src = v; this.historia.push(v); } });
  e.addEventListener = (n, f) => { e.zdarzenia[n] = f; };
  e.removeAttribute = (a) => { e.wywolania.push('removeAttribute:' + a); if (a === 'src') e._src = ''; };
  e.load = () => { e.wywolania.push('load'); };
  e.play = () => { e.wywolania.push('play:' + e._src); e.paused = false; return Promise.resolve(); };
  e.pause = () => { e.paused = true; };
  return e;
}
function odtwarzacz(RADIO, U) {
  const lety = RADIO_HTML.match(/let _radioUid = null;[\s\S]*?let _radioZapisTimer = null;[^\n]*\n/);
  const iife = RADIO_HTML.match(/\(function\(\)\{\n {2}\/\/ ikony statyczne[\s\S]*?\n\}\)\(\);\n/);
  const funkcje = ['radioPlayAt', 'radioUstawZrodlo', 'radioPrzygotujNastepny', 'radioNext', 'radioClosePlayer']
    .map((n) => { const m = RADIO_HTML.match(new RegExp('function ' + n + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n')); assert.ok(m, 'brak ' + n + ' w radio.html'); return m[0]; });
  assert.ok(lety && iife, 'brak zmiennych stanu albo IIFE ze słuchaczami <audio> w radio.html');
  const el = {}; ['rad-player', 'rad-video', 'rad-audio', 'rad-np-title', 'rad-np-cover', 'rad-np-ph'].forEach((id) => { el[id] = element(id); });
  const document = { getElementById: (id) => el[id] || null, querySelectorAll: () => [] };
  const okno = { RADIO, safeUrlAttr: (u) => (u && u.startsWith('https://') ? u : '') };
  const rpc = [];
  const sb = { rpc: (n, a) => { rpc.push(a); return Promise.resolve({}); } };
  const kod = lety[0] + 'function radioUpdateMediaSession(){}\n' + funkcje.join('') + iife[0] +
    'return { radioPlayAt, radioNext, radioClosePlayer, kolejka: (q) => { _radioQueue = q; }, stan: () => ({ biezacy: _radioBiezacy, przygotowany: _radioPrzygotowany, idx: _radioIdx }) };';
  const api = new Function('window', 'document', 'sb', 'alert', 'caches', 'URL', 'navigator', 'setTimeout', 'clearTimeout', kod)(
    okno, document, sb, () => { throw new Error('alert'); }, RADIO ? RADIO._atrapaCaches : undefined, U, {}, setTimeout, clearTimeout);
  return { api, aud: el['rad-audio'], el };
}
const utwor = (slug) => ({ id: slug, slug, media_ext: 'mp3', title: slug });

test('(6) radio.html: z sieci od razu (m3), po 20 s słuchania zapis; potem z urządzenia bez sieci, następny gotowy przed końcem', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const caches = atrapaCaches();
  const fetch = atrapaSieci(() => dobraOdpowiedz());
  const U = atrapaURL();
  const R = radioZSb({ caches, fetch, URL: U });
  R._atrapaCaches = caches;
  const { api, aud } = odtwarzacz(R, U);
  api.kolejka([utwor('jeden'), utwor('dwa')]);

  api.radioPlayAt(0);
  assert.equal(aud.src, M3 + 'jeden.mp3', 'bez kopii: m3 od razu, synchronicznie');
  assert.ok(aud.wywolania.includes('play:' + M3 + 'jeden.mp3'));
  mock.timers.tick(19000); await zaChwile();
  assert.equal(fetch.wywolania.length, 0, 'przed 20 s nic nie pobieramy');
  mock.timers.tick(1000); await zaChwile();
  assert.deepEqual(fetch.wywolania.map((w) => w.u), [M3 + 'jeden.mp3']);
  assert.ok(R.zapisane.has(M3 + 'jeden.mp3'));

  aud.wywolania.length = 0;
  api.radioPlayAt(0);
  assert.deepEqual(aud.wywolania.slice(0, 2), ['removeAttribute:src', 'load'], 'kopia jest, blob: niegotowy: load() w geście (iOS)');
  await zaChwile();
  assert.match(aud.src, /^blob:test-/, 'gra z urządzenia');
  mock.timers.tick(30000); await zaChwile();
  assert.equal(fetch.wywolania.length, 1, 'z urządzenia: zero pobrań');

  await R.zapiszNaUrzadzeniu(M3 + 'dwa.mp3');
  api.radioPlayAt(0); await zaChwile();
  const przyg = api.stan().przygotowany;
  assert.equal(przyg && przyg.url, M3 + 'dwa.mp3', 'następny z urządzenia przygotowany zawczasu');
  aud.zdarzenia.ended();
  assert.equal(aud.src, przyg.src, "'ended' zmienia utwór od razu (tło), bez czekania na odczyt");
  const jedenBlob = aud.historia.filter((s) => s.startsWith('blob:'))[0];
  assert.ok(U.cofniete.includes(jedenBlob), 'poprzedni blob: zwolniony');

  api.radioClosePlayer();
  assert.ok(U.cofniete.includes(przyg.src), 'zamknięcie odtwarzacza zwalnia bieżący blob:');
  assert.equal(api.stan().biezacy, null);
});

test('(7) radio.html: błąd na m3 → ten utwór z Supabase (raz, bez zapisu na urządzeniu); uszkodzona kopia → wyrzucona, gra m3', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const caches = atrapaCaches();
  const fetch = atrapaSieci(() => dobraOdpowiedz());
  const R = radioZSb({ caches, fetch });
  R._atrapaCaches = caches;
  const { api, aud } = odtwarzacz(R, atrapaURL());
  api.kolejka([utwor('nowy'), utwor('stary')]);

  api.radioPlayAt(0);
  aud.zdarzenia.error();
  assert.equal(aud.src, ZAPAS + 'nowy.mp3', 'nowy utwór, jeszcze nie na m3: zapas z Supabase');
  const ustawien = aud.historia.length;
  aud.zdarzenia.error();
  assert.equal(aud.historia.length, ustawien, 'drugi błąd: bez pętli (źródło nie jest ustawiane ponownie)');
  mock.timers.tick(25000); await zaChwile();
  assert.equal(fetch.wywolania.length, 0, 'zapasu nie zapisujemy (to byłby drugi transfer z Supabase)');

  await R.zapiszNaUrzadzeniu(M3 + 'stary.mp3');
  api.radioPlayAt(1); await zaChwile();
  assert.match(aud.src, /^blob:/);
  aud.zdarzenia.error(); await zaChwile();
  assert.equal(aud.src, M3 + 'stary.mp3', 'kopia nie gra: m3');
  assert.equal(caches.sklep.has(M3 + 'stary.mp3'), false, 'uszkodzona kopia wyrzucona');
  assert.equal(R.zapisane.has(M3 + 'stary.mp3'), false);
});

test('(8) radio.html ze STARYM sb.js (z cache SW po deployu): gra jak dotąd, bez wyjątków', () => {
  const stary = {
    MEDIA_BASE: ZAPAS, COVER_BASE: ZAPAS,
    mediaUrl(t) { return this.MEDIA_BASE + t.slug + '.' + (t.media_ext || 'mp4'); },
    coverUrl() { return ''; },
  };
  const { api, aud } = odtwarzacz(stary, atrapaURL());
  api.kolejka([utwor('a')]);
  api.radioPlayAt(0);
  assert.equal(aud.src, ZAPAS + 'a.mp3');
  aud.zdarzenia.error();
  assert.equal(aud.src, ZAPAS + 'a.mp3', 'bez mediaUrlZapas: nic nie przełącza');
});
