// Blizna #46 (08.10.2026) — aktualizacja Service Workera z nieudanym precache nie może zabrać Planu offline.
//
// Smoke Filipa po 830f760: „Dziś" offline działa, Plan (kalendarz.html?role=athlete) — ekran braku połączenia.
// Hipoteza z polecenia („kalendarz.html nie był w STATIC_CACHE") OBALONA pomiarem: po czystej instalacji jest.
// Odtworzone (tools/smoke-offline.js, SMOKE_SW=1): przy AKTUALIZACJI precache tolerował każdy błąd
// (allSettled), a activate kasował stary cache — jedno zerwane pobranie kalendarz.html zostawiało nową
// wersję bez Planu i bez starej kopii → offline.html (scenariusz C), a sieć zerwana w trakcie całej
// instalacji → 503 (D). Osobno: js/dzis-offline.js nie był w precache → Plan offline bez trybu offline (A).
//
// Od 8.10: PRECACHE_KRYTYCZNE muszą przyjść z sieci w całości, inaczej instalacja jest odrzucona i zostaje
// stara wersja SW z pełnym cache. Strony niekrytyczne: sieć, a gdy się nie uda — kopia z poprzedniej wersji.
//
// Test ładuje PRAWDZIWY sw.js do piaskownicy (vm) z atrapami self/caches/fetch i odpala zdarzenie install.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const SW = czytaj('sw.js');

function atrapaCaches() {
  const magazyn = new Map();
  const otworz = (n) => {
    if (!magazyn.has(n)) {
      const m = new Map();
      magazyn.set(n, { m, async put(k, r) { m.set(new URL(String(k), 'https://biegamy.run').pathname, r); },
        async match(k) { return m.get(new URL(String(k.url || k), 'https://biegamy.run').pathname); }, async keys() { return [...m.keys()]; } });
    }
    return magazyn.get(n);
  };
  return { magazyn, open: async (n) => otworz(n), keys: async () => [...magazyn.keys()], delete: async (n) => magazyn.delete(n),
           match: async (k) => { for (const c of magazyn.values()) { const r = await c.match(k); if (r) return r; } } };
}

// Ładuje sw.js; `odpowiedz(url)` zwraca Response albo rzuca (zerwane połączenie).
function zaladujSW(caches, odpowiedz) {
  const handlery = {};
  const self = { addEventListener: (t, f) => { handlery[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, registration: {} };
  const fetch = async (req) => odpowiedz(new URL(String(req.url || req), 'https://biegamy.run').pathname);
  const ctx = vm.createContext({ self, caches, fetch, Request: class { constructor(u, o) { this.url = u; this.opts = o; } }, Response, Headers, URL,
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise });
  vm.runInContext(SW, ctx);
  const stale = vm.runInContext('({ PRECACHE_URLS, PRECACHE_KRYTYCZNE, STATIC_CACHE })', ctx);
  async function install() {
    let p; handlery.install({ waitUntil: (x) => { p = x; } });
    return p;
  }
  return { ...stale, install };
}
const ok = (p) => new Response(p.endsWith('.html') || p === '/' ? '<html>' + p + '</html>' : 'x' + p, { status: 200, headers: { 'content-type': p.endsWith('.html') || p === '/' ? 'text/html' : 'application/javascript' } });

test('krytyczne ⊂ PRECACHE_URLS; każdy plik istnieje w repo; obejmują strony „Dziś" i Plan z zależnościami', () => {
  const caches = atrapaCaches();
  const { PRECACHE_URLS, PRECACHE_KRYTYCZNE } = zaladujSW(caches, ok);
  for (const k of PRECACHE_KRYTYCZNE) assert.ok(PRECACHE_URLS.includes(k), 'krytyczny spoza PRECACHE_URLS: ' + k);
  for (const u of PRECACHE_URLS) {
    const plik = u === '/' ? 'index.html' : u.slice(1);
    assert.ok(fs.existsSync(path.join(KORZEN, plik)), 'precache wskazuje nieistniejący plik (każdy install by go ponawiał, krytyczny zablokowałby aktualizacje): ' + u);
  }
  for (const k of ['/zawodnik.html', '/kalendarz.html', '/offline.html', '/sb.js', '/vendor/supabase-js-2.112.4.min.js', '/theme.css', '/js/dzis-offline.js']) {
    assert.ok(PRECACHE_KRYTYCZNE.includes(k), 'brak krytycznego: ' + k);
  }
});

test('każdy skrypt i arkusz z własnego originu w zawodnik.html i kalendarz.html jest w precache', () => {
  const { PRECACHE_URLS } = zaladujSW(atrapaCaches(), ok);
  for (const strona of ['zawodnik.html', 'kalendarz.html']) {
    const zasoby = [...czytaj(strona).matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"#:$]+\.(?:js|css))"/g)].map((m) => '/' + m[1].replace(/^\.?\//, ''));
    assert.ok(zasoby.length >= 3, strona + ': za mało zasobów — wzorzec przestał działać');
    const brak = zasoby.filter((z) => !PRECACHE_URLS.includes(z));
    assert.deepEqual(brak, [], strona + ' ładuje pliki spoza precache (offline po deployu ich nie będzie): ' + brak.join(', '));
  }
});

test('pierwsza instalacja, sieć działa: wszystko w nowym STATIC_CACHE', async () => {
  const caches = atrapaCaches();
  const sw = zaladujSW(caches, ok);
  await sw.install();
  const klucze = await (await caches.open(sw.STATIC_CACHE)).keys();
  for (const u of sw.PRECACHE_URLS) assert.ok(klucze.includes(u), 'brak w cache: ' + u);
});

test('krytyczny nie przychodzi (zerwany albo urwany HTML) → instalacja ODRZUCONA, stary cache nietknięty', async () => {
  for (const [opis, odp] of [
    ['zerwane połączenie', (p) => { if (p === '/kalendarz.html') throw new TypeError('Failed to fetch'); return ok(p); }],
    ['urwany HTML bez </html>', (p) => (p === '/kalendarz.html' ? new Response('<html><body>', { status: 200, headers: { 'content-type': 'text/html' } }) : ok(p))],
    ['404', (p) => (p === '/js/dzis-offline.js' ? new Response('', { status: 404 }) : ok(p))],
  ]) {
    const caches = atrapaCaches();
    const stary = await caches.open('biegamy-STARA-static');
    await stary.put('/kalendarz.html', ok('/kalendarz.html'));
    const sw = zaladujSW(caches, odp);
    await assert.rejects(sw.install(), /krytyczny nieudany/, opis + ': instalacja miała zostać odrzucona');
    assert.ok(await stary.match('/kalendarz.html'), opis + ': stara kopia Planu zniknęła');
  }
});

test('krytyczny: druga próba wystarcza (chwilowe zerwanie)', async () => {
  const caches = atrapaCaches();
  let raz = true;
  const sw = zaladujSW(caches, (p) => { if (p === '/zawodnik.html' && raz) { raz = false; throw new TypeError('Failed to fetch'); } return ok(p); });
  await sw.install();
  assert.ok(await (await caches.open(sw.STATIC_CACHE)).match('/zawodnik.html'));
});

test('niekrytyczny nie przychodzi → kopia z poprzedniej wersji; bez kopii → pominięty, instalacja przechodzi', async () => {
  const caches = atrapaCaches();
  const stary = await caches.open('biegamy-STARA-static');
  await stary.put('/profil.html', new Response('<html>stary profil</html>', { headers: { 'content-type': 'text/html' } }));
  const sw = zaladujSW(caches, (p) => { if (p === '/profil.html' || p === '/trener.html') throw new TypeError('Failed to fetch'); return ok(p); });
  await sw.install();
  const nowy = await caches.open(sw.STATIC_CACHE);
  assert.match(await (await nowy.match('/profil.html')).text(), /stary profil/, 'profil.html z poprzedniej wersji');
  assert.equal(await nowy.match('/trener.html'), undefined, 'trener.html bez kopii — pominięty, nie blokuje');
});

test('krytycznego NIE kopiujemy ze starej wersji (stary zawodnik.html z nowym sb.js — mieszanka nietestowana)', async () => {
  const caches = atrapaCaches();
  const stary = await caches.open('biegamy-STARA-static');
  await stary.put('/zawodnik.html', ok('/zawodnik.html'));
  const sw = zaladujSW(caches, (p) => { if (p === '/zawodnik.html') throw new TypeError('Failed to fetch'); return ok(p); });
  await assert.rejects(sw.install());
  assert.equal(await (await caches.open(sw.STATIC_CACHE)).match('/zawodnik.html'), undefined);
});

test('tools/smoke-offline.js ma tryb z Service Workerem (SMOKE_SW) i scenariusze A–E', () => {
  const t = czytaj('tools/smoke-offline.js');
  assert.match(t, /process\.env\.SMOKE_SW/);
  assert.match(t, /serviceWorkers: 'allow'/);
  assert.match(t, /ctx\.setOffline\(true\)/);
  for (const s of ['SW A:', 'SW B:', "'SW ' + et + ': Plan offline po deployu", 'SW E:']) assert.ok(t.includes(s), 'brak scenariusza: ' + s);
  assert.match(t, /--host-resolver-rules=MAP \* ~NOTFOUND/, 'obce hosty nierozwiązywalne — smoke nie może dotykać produkcji');
});
