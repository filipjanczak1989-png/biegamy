// Blizna #44 (07.10.2026) — urwany dokument HTML nie trafia do cache Service Workera.
//
// Zmierzone (client_errors, 60 dni): „Uncaught SyntaxError: Unexpected end of input" w zawodnik.html:1 —
// 11 wierszy, 5 osób, wyłącznie Android, nie skupione wokół deployów. Dokument (913 kB, gzip 256 kB) urwany
// w trakcie pobierania. sw.js wkładał do cache każdą odpowiedź po `response.ok`, a `ok` mówi o nagłówkach,
// nie o ciele. Od 7.10: text/html idzie do cache TYLKO, gdy tekst kończy się na </html>; inne typy bez zmian.
//
// Test wyciąga `wlozDoCache` i `czyKompletnyHtml` ze źródła sw.js (SW nie jest modułem) i uruchamia je
// z atrapą cache i prawdziwym Response z Node. Pilnuje też, że KAŻDA nasza strona kończy się na </html>
// (inaczej bramka odrzucałaby własny, kompletny dokument — jak zawodnik.html przed 7.10, gdzie
// </body></html> stały 1234 linie przed końcem) i że w sw.js nie został żaden goły cache.put.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const sw = czytaj('sw.js').replace(/\r/g, '');   // sw.js ma CRLF (autocrlf) — wzorce poniżej liczą na \n

function wyciagnij() {
  const a = sw.match(/async function wlozDoCache\([\s\S]*?\n\}\n/);
  const b = sw.match(/function czyKompletnyHtml\([\s\S]*?\n\}\n/);
  assert.ok(a && b, 'brak wlozDoCache / czyKompletnyHtml w sw.js');
  return new Function('Response', a[0] + b[0] + ' return { wlozDoCache, czyKompletnyHtml };')(Response);
}

function atrapaCache() {
  const mapa = new Map(), naglowki = new Map();
  return { mapa, naglowki, async put(k, r) { mapa.set(String(k), await r.text()); naglowki.set(String(k), r.headers); }, async match(k) { return mapa.get(String(k)); } };
}
const html = (tekst) => new Response(tekst, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

test('urwany HTML (bez </html>) NIE trafia do cache i nie nadpisuje dobrej kopii', async () => {
  const { wlozDoCache } = wyciagnij();
  const cache = atrapaCache();
  cache.mapa.set('/zawodnik.html', '<!doctype html><html><body>dobra kopia</body></html>');
  const ok = await wlozDoCache(cache, '/zawodnik.html', html('<!doctype html><html><body><script>const x = {'));
  assert.equal(ok, false);
  assert.equal(cache.mapa.get('/zawodnik.html'), '<!doctype html><html><body>dobra kopia</body></html>', 'dobra kopia nadpisana urwaną');
});

test('kompletny HTML trafia do cache (także z białymi znakami i CRLF po </html>)', async () => {
  const { wlozDoCache, czyKompletnyHtml } = wyciagnij();
  const cache = atrapaCache();
  assert.equal(await wlozDoCache(cache, '/zawodnik.html', html('<!doctype html><html><body>x</body></html>\r\n\r\n')), true);
  assert.match(cache.mapa.get('/zawodnik.html'), /<\/html>\s*$/);
  // nagłówki z sieci (gzip, długość SKOMPRESOWANA) nie mogą wejść do cache razem ze zdekodowanym ciałem
  const zGzip = new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip', 'content-length': '255822', 'etag': '"x"' } });
  assert.equal(await wlozDoCache(cache, '/z.html', zGzip), true);
  const h = cache.naglowki.get('/z.html');
  assert.equal(h.get('content-encoding'), null, 'content-encoding ma być zdjęte');
  assert.equal(h.get('content-length'), null, 'content-length ma być zdjęte');
  assert.equal(h.get('etag'), '"x"', 'reszta nagłówków zostaje');
  assert.equal(czyKompletnyHtml('<html></HTML>  \n'), true, 'wielkość liter nie ma znaczenia');
  assert.equal(czyKompletnyHtml('<html></html><script>'), false);
  assert.equal(czyKompletnyHtml(''), false);
});

test('zasób inny niż text/html wchodzi bez zmian (JS, CSS, JSON, obrazki)', async () => {
  const { wlozDoCache } = wyciagnij();
  const cache = atrapaCache();
  const js = new Response('const a = 1;', { status: 200, headers: { 'content-type': 'application/javascript' } });
  assert.equal(await wlozDoCache(cache, '/sb.js', js), true);
  assert.equal(cache.mapa.get('/sb.js'), 'const a = 1;');
});

test('urwany strumień z błędem (text() odrzuca) — nic nie wchodzi, brak wyjątku', async () => {
  const { wlozDoCache } = wyciagnij();
  const cache = atrapaCache();
  const zepsuty = { headers: new Headers({ 'content-type': 'text/html' }), status: 200, statusText: 'OK', text: async () => { throw new TypeError('network error'); } };
  assert.equal(await wlozDoCache(cache, '/x.html', zepsuty), false);
  assert.equal(cache.mapa.size, 0);
});

test('sw.js: każde wkładanie do cache idzie przez wlozDoCache (żaden goły cache.put poza pomocnikiem)', () => {
  const golych = (sw.match(/cache\.put\(/g) || []).length;
  assert.equal(golych, 3, 'cache.put ma występować tylko 3× — dwa wewnątrz wlozDoCache, jeden w wlozObraz (obrazy, blizna-45)');
  for (const wz of [/return wlozDoCache\(cache, url, res\.clone\(\)\)/, /wlozDoCache\(cache, request, response\.clone\(\)\)\.catch/]) {
    assert.match(sw, wz, 'brak wywołania pomocnika: ' + wz);
  }
  // 08.10.2026: networkFirst usunięte razem z cachowaniem Supabase REST (blizna-45) — zostają SWR, cacheFirst, navigationHandler
  assert.equal((sw.match(/wlozDoCache\(cache, request, response\.clone\(\)\)\.catch/g) || []).length, 3, 'SWR, cacheFirst, navigationHandler');
});

// ── NAWIGACJE: network-first z limitem (07.10.2026) ───────────────────────────────────────
function wyciagnijNawigacje(fetchAtrapa, cacheAtrapa, offlineAtrapa) {
  const h = sw.match(/const LIMIT_NAWIGACJI_MS = \d+;\nasync function navigationHandler\([\s\S]*?\n\}\n/);
  const a = sw.match(/async function wlozDoCache\([\s\S]*?\n\}\n/);
  const b = sw.match(/function czyKompletnyHtml\([\s\S]*?\n\}\n/);
  assert.ok(h && a && b, 'brak navigationHandler/wlozDoCache w sw.js');
  const caches = { open: async () => cacheAtrapa, match: async (k) => (String(k) === '/offline.html' ? offlineAtrapa : undefined) };
  return new Function('Response', 'fetch', 'caches', 'STATIC_CACHE', a[0] + b[0] + h[0] + ' return navigationHandler;')(Response, fetchAtrapa, caches, 'static-test');
}
const kopia = () => '<html><body>z cache</body></html>';   // atrapa trzyma TEKST, match() opakowuje w Response
function atrapaNawigacji(zCache) {
  const mapa = new Map(); if (zCache) mapa.set('/zawodnik.html', zCache);
  return { mapa, async put(k, r) { mapa.set(String(k), await r.text()); },
           async match(k, o) { const u = String(k); const klucz = o && o.ignoreSearch ? u.replace(/\?.*$/, '') : u; const v = mapa.get(klucz); return typeof v === 'string' ? new Response(v, { headers: { 'content-type': 'text/html' } }) : v; } };
}

test('routing: nawigacja idzie do navigationHandler PRZED isStaticAsset (dotąd .html trafiał w stale-while-revalidate)', () => {
  const iNav = sw.indexOf("if (request.mode === 'navigate')"), iStat = sw.indexOf('isStaticAsset(request, url))');
  assert.ok(iNav > 0 && iStat > iNav, 'gałąź navigate ma stać przed isStaticAsset');
  assert.match(sw, /const LIMIT_NAWIGACJI_MS = 3000;/);
});

test('nawigacja (a): sieć odpowiada w limicie → świeża treść wraca i trafia do cache', async () => {
  const cache = atrapaNawigacji(kopia());
  const fetchOk = async () => new Response('<html><body>świeże</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  const nav = wyciagnijNawigacje(fetchOk, cache, null);
  const r = await nav('/zawodnik.html?tab=social', 200);
  assert.match(await r.text(), /świeże/);
  await new Promise((res) => setTimeout(res, 20));
  assert.match(cache.mapa.get('/zawodnik.html?tab=social'), /świeże/, 'udana odpowiedź ma wejść do cache przez wlozDoCache');
});

test('nawigacja (b): sieć wolniejsza niż limit → kopia z cache (ignoreSearch), a spóźniona odpowiedź i tak odświeża cache', async () => {
  const cache = atrapaNawigacji(kopia());
  const fetchWolny = () => new Promise((res) => setTimeout(() => res(new Response('<html><body>spóźnione</body></html>', { status: 200, headers: { 'content-type': 'text/html' } })), 120));
  const nav = wyciagnijNawigacje(fetchWolny, cache, null);
  const t0 = Date.now();
  const r = await nav('/zawodnik.html?tab=social', 40);
  assert.ok(Date.now() - t0 < 110, 'odpowiedź ma wrócić po limicie, nie po sieci');
  assert.match(await r.text(), /z cache/);
  await new Promise((res) => setTimeout(res, 150));
  assert.match(cache.mapa.get('/zawodnik.html?tab=social'), /spóźnione/, 'spóźniona odpowiedź sieci ma odświeżyć cache');
});

test('nawigacja (c): brak sieci i brak cache → offline.html; bez offline.html → 503', async () => {
  const fetchPadl = async () => { throw new TypeError('Failed to fetch'); };
  const nav1 = wyciagnijNawigacje(fetchPadl, atrapaNawigacji(null), new Response('<html>offline</html>', { status: 200 }));
  assert.match(await (await nav1('/zawodnik.html', 50)).text(), /offline/);
  const nav2 = wyciagnijNawigacje(fetchPadl, atrapaNawigacji(null), undefined);
  assert.equal((await nav2('/zawodnik.html', 50)).status, 503);
});

test('nawigacja: urwany HTML z sieci wraca do przeglądarki (nie da się go cofnąć), ale NIE nadpisuje dobrej kopii w cache', async () => {
  const cache = atrapaNawigacji(kopia());
  const fetchUrwany = async () => new Response('<html><body><script>const x = {', { status: 200, headers: { 'content-type': 'text/html' } });
  const nav = wyciagnijNawigacje(fetchUrwany, cache, null);
  await nav('/zawodnik.html', 200);
  await new Promise((res) => setTimeout(res, 20));
  assert.match(cache.mapa.get('/zawodnik.html'), /z cache/, 'urwany dokument nadpisał dobrą kopię');
});

test('każda śledzona strona kończy się na </html> — inaczej bramka SW odrzuciłaby własny dokument', () => {
  const strony = execSync('git ls-files "*.html"', { cwd: KORZEN }).toString().split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.includes('/'));
  assert.ok(strony.length >= 20, 'za mało stron: ' + strony.length);
  const zle = strony.filter((f) => !/<\/html>\s*$/i.test(czytaj(f)));
  assert.deepEqual(zle, [], 'strony bez </html> na końcu (zawodnik.html miał 1234 linie po </html> do 7.10): ' + zle.join(', '));
});
