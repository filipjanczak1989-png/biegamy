// Blizna #45 (07.10.2026) — „Dziś" offline: migawka ostatniego udanego ładowania + cache obrazów z limitem.
//
// Bez sieci karta „Dziś" mówiła nieprawdę: supabase-js zwraca { data: null, error } przy braku sieci, a loadery
// traktowały null jak „nie ma” → „Brak zaplanowanego treningu na dziś.”, „Brak planu na ten tydzień.”, pusta
// lista. Od 7.10: js/dzis-offline.js zapisuje części widoku po UDANYM odczycie (localStorage, klucz per user_id,
// znacznik czasu, limit 200 kB — pomiar prod 7.10: mediana 5,8 kB, p90 33 kB), a przy błędzie SIECI rysuje
// z migawki + pasek „Offline · dane z HH:MM”. sw.js: obrazy z biegamy-assets cache-first w cache niezależnym
// od CACHE_VERSION, limit 150 wpisów / 30 MB (najstarsze wylatują).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
const D = require('../js/dzis-offline.js');

function atrapaStorage() {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null),
           setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const U = 'c3356f0a-7611-4c2a-b251-4dd6f42dd0af';
function swiezy() { D._storage = atrapaStorage(); D._userIdCache = null; return D._storage; }

test('migawka zapisuje się po sukcesie: części, user, znacznik czasu; odczyt wraca 1:1', () => {
  const s = swiezy();
  const t0 = Date.now();
  assert.equal(D.zapisz(U, 'logi', [{ id: 1, distance_km: 10 }]), true);
  assert.equal(D.zapisz(U, 'dzis', null), true, 'null = „nie było treningu” — też jest informacją');
  assert.equal(D.zapisz(U, 'tydzien', [{ date: '2026-10-08', type: 'Tempo' }]), true);
  const m = D.odczytaj(U);
  assert.equal(m.userId, U);
  assert.ok(m.ts >= t0);
  assert.deepEqual(m.czesci.logi, [{ id: 1, distance_km: 10 }]);
  assert.equal(m.czesci.dzis, null);
  assert.ok('dzis' in m.czesci);
  assert.equal(s.length, 1, 'jeden klucz na użytkownika');
  assert.equal([...s._m.keys()][0], D.PREFIX + U);
});

test('awaryjnie(): tylko przy błędzie SIECI i tylko dla części obecnej w migawce; inne błędy → null', () => {
  swiezy();
  D.zapisz(U, 'logi', [{ id: 1 }]);
  assert.ok(D.awaryjnie(U, 'logi', { message: 'TypeError: Failed to fetch' }), 'Failed to fetch = sieć');
  assert.ok(D.awaryjnie(U, 'logi', new TypeError('Load failed')), 'Safari: Load failed');
  assert.equal(D.awaryjnie(U, 'logi', { code: '42501', message: 'permission denied for table training_logs' }), null, '42501 to NIE sieć — stare dane ukryłyby usterkę');
  assert.equal(D.awaryjnie(U, 'tydzien', { message: 'Failed to fetch' }), null, 'części „tydzien” nie ma w migawce → nie wiadomo, nie zgadujemy');
  assert.equal(D.awaryjnie('inny-user', 'logi', { message: 'Failed to fetch' }), null, 'cudzy user nie dostaje cudzej migawki');
});

test('nie zapisuje po błędzie (loadery wołają zapisz tylko przy !error) i nie zapisuje w widoku trenera', () => {
  const z = czytaj('zawodnik.html');
  for (const fn of ['loadLogs', 'loadTodayTraining', 'loadWeekPlan']) {
    const i = z.indexOf('async function ' + fn + '(');
    assert.ok(i > 0, 'brak ' + fn);
    const cialo = z.slice(i, i + 4000);
    const iZapis = cialo.indexOf('DzisOffline.zapisz(');
    assert.ok(iZapis > 0, fn + ': brak zapisu migawki');
    const przed = cialo.slice(Math.max(0, iZapis - 80), iZapis);
    assert.match(przed, /if \(!error\) \{ $/, fn + ': zapisz ma stać bezpośrednio za `if (!error)`');
    assert.ok(cialo.indexOf("DzisOffline.awaryjnie(") > iZapis, fn + ': brak odczytu awaryjnego po błędzie');
  }
  // widok trenera: moduł odmawia zapisu
  swiezy();
  const stary = D.widokTrenera; D.widokTrenera = () => true;
  try { assert.equal(D.zapisz(U, 'logi', [1]), false); assert.equal(D.odczytaj(U), null); }
  finally { D.widokTrenera = stary; }
});

test('render z migawki offline: zawodnik.html podmienia data na dane z migawki i NIE pisze „Brak … na dziś” bez wiedzy', () => {
  const z = czytaj('zawodnik.html');
  assert.match(z, /<script src="js\/dzis-offline\.js"><\/script>/, 'moduł ma być dołączony (po sb.js)');
  assert.ok(z.indexOf('<script src="sb.js">') < z.indexOf('<script src="js/dzis-offline.js">'));
  assert.match(z, /if \(_aw\) \{ data = _aw\.dane; error = null; \}/, 'dane z migawki wchodzą w miejsce odpowiedzi sieci');
  assert.match(z, /Brak połączenia — plan na dziś nieznany\./, 'bez migawki: zdanie o braku połączenia, nie o braku treningu');
  assert.match(z, /Brak połączenia — plan tygodnia nieznany\./);
  // pasek: moduł pokazuje go przy odczycie awaryjnym, a udany zapis go zdejmuje
  const srcMod = czytaj('js/dzis-offline.js');
  assert.match(srcMod, /Offline · dane z /);
  assert.ok(srcMod.indexOf('M.pokazPasek(m.ts)') > 0 && srcMod.indexOf('M.ukryjPasek();') > 0);
});

test('czyszczenie: wyczysc() kasuje wszystkie migawki; odczyt innego konta kasuje cudze; logout() woła wyczysc', () => {
  const s = swiezy();
  D.zapisz(U, 'logi', [1]);
  s.setItem(D.PREFIX + 'inny', JSON.stringify({ userId: 'inny', ts: 1, czesci: {} }));
  s.setItem('bm_theme', 'ocean');
  assert.equal(D.odczytaj(U).czesci.logi[0], 1);
  assert.equal(s.getItem(D.PREFIX + 'inny'), null, 'cudza migawka skasowana przy odczycie własnej');
  assert.equal(D.wyczysc(), 1);
  assert.equal(s.getItem(D.PREFIX + U), null);
  assert.equal(s.getItem('bm_theme'), 'ocean', 'wyczysc() nie rusza innych kluczy');
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function logout()');
  assert.match(z.slice(i, i + 400), /DzisOffline\.wyczysc\(\)/, 'logout bez czyszczenia migawki');
});

test('limit rozmiaru: migawka ponad 200 kB NIE jest zapisywana, poprzednia zostaje', () => {
  swiezy();
  assert.equal(D.zapisz(U, 'logi', [{ id: 1 }]), true);
  const wielka = [{ comment: 'x'.repeat(250 * 1024) }];
  assert.equal(D.zapisz(U, 'logi', wielka), false);
  assert.deepEqual(D.odczytaj(U).czesci.logi, [{ id: 1 }]);
});

// ── sw.js: cache obrazów z limitem ───────────────────────────────────────────────────
const sw = czytaj('sw.js').replace(/\r/g, '');
function wyciagnijObrazy() {
  const f1 = sw.match(/async function wlozObraz\([\s\S]*?\n\}\n/), f2 = sw.match(/async function przytnijCache\([\s\S]*?\n\}\n/), f3 = sw.match(/function isAssetsImage\([\s\S]*?\n\}\n/);
  assert.ok(f1 && f2 && f3, 'brak wlozObraz/przytnijCache/isAssetsImage w sw.js');
  return new Function('LIMIT_OBRAZOW', 'LIMIT_OBRAZOW_B', f1[0] + f2[0] + f3[0] + ' return { wlozObraz, przytnijCache, isAssetsImage };')(150, 30 * 1024 * 1024);
}
function atrapaCacheObrazow() {
  const m = new Map();
  return { m, async keys() { return [...m.keys()]; }, async match(k) { return m.get(k); }, async put(k, r) { m.set(k, r); }, async delete(k) { return m.delete(k); } };
}
const obraz = (bajty, status = 200, typ = 'image/webp') => new Response(new Uint8Array(0), { status, headers: { 'content-type': typ, 'content-length': String(bajty) } });

test('cache obrazów: wchodzi tylko status 200 + image/*; opaque (0), 404 i text/html nie wchodzą', async () => {
  const { wlozObraz } = wyciagnijObrazy();
  const c = atrapaCacheObrazow();
  assert.equal(await wlozObraz(c, 'a.webp', obraz(1000)), true);
  assert.equal(await wlozObraz(c, 'b.webp', obraz(1000, 404)), false);
  assert.equal(await wlozObraz(c, 'c.webp', { status: 0, headers: new Headers() }), false);
  assert.equal(await wlozObraz(c, 'd.webp', obraz(1000, 200, 'text/html')), false);
  assert.equal(c.m.size, 1);
});

test('cache obrazów: nie przekracza 150 wpisów ani 30 MB — najstarsze wylatują', async () => {
  const { wlozObraz, przytnijCache } = wyciagnijObrazy();
  const c = atrapaCacheObrazow();
  for (let i = 0; i < 170; i++) await wlozObraz(c, 'img' + i + '.webp', obraz(100 * 1024));
  assert.equal(c.m.size, 150, 'limit wpisów');
  assert.ok(!c.m.has('img0.webp') && c.m.has('img169.webp'), 'kasowane od najstarszych');
  const d = atrapaCacheObrazow();
  for (let i = 0; i < 40; i++) d.m.set('duzy' + i + '.jpg', obraz(1024 * 1024));   // 40 MB
  const usuniete = await przytnijCache(d, 150, 30 * 1024 * 1024);
  assert.equal(usuniete, 10, 'limit bajtów: 40 MB → 30 MB');
  assert.ok(!d.m.has('duzy0.jpg') && d.m.has('duzy39.jpg'));
});

test('sw.js: isAssetsImage tylko obrazy z biegamy-assets; osobny cache przeżywa activate; gałąź przed isStorageAsset', () => {
  const { isAssetsImage } = wyciagnijObrazy();
  assert.equal(isAssetsImage(new URL('https://filipjanczak1989-png.github.io/biegamy-assets/solo-01.webp')), true);
  assert.equal(isAssetsImage(new URL('https://filipjanczak1989-png.github.io/biegamy-assets/badges/pierwszy_krok.webp')), true);
  assert.equal(isAssetsImage(new URL('https://filipjanczak1989-png.github.io/biegamy-assets/manifest.md')), false, 'nie-obraz');
  assert.equal(isAssetsImage(new URL('https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/x/a.webp')), false, 'inny origin');
  assert.match(sw, /const ASSETS_CACHE = 'biegamy-obrazy-v1';/);
  assert.match(sw, /!name\.startsWith\(CACHE_VERSION\) && name !== ASSETS_CACHE/, 'activate musi oszczędzić cache obrazów');
  assert.ok(sw.indexOf('isAssetsImage(url)) {') > 0 && sw.indexOf('isAssetsImage(url)) {') < sw.indexOf('isStorageAsset(url)) {'), 'gałąź obrazów przed storage');
  assert.match(sw, /const LIMIT_OBRAZOW = 150;\nconst LIMIT_OBRAZOW_B = 30 \* 1024 \* 1024;/);
});

// ── POPRAWKI PRZED PUSHEM (decyzje Filipa 7.10): trener, pierścień tygodnia, SWR obrazów ──────────────
test('trener offline: flaga ma_trenera w migawce; bez sieci i bez migawki _brakTrenera = null → CTA „Ułóż plan" ukryte', () => {
  assert.ok(D.CZESCI.includes('trener') && D.CZESCI.includes('postep'));
  swiezy();
  assert.equal(D.zapisz(U, 'trener', true), true);
  assert.equal(D.awaryjnie(U, 'trener', { message: 'Failed to fetch' }).dane, true);
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function loadCoachMessage()');
  const c = z.slice(i, i + 2500);
  assert.match(c, /if \(!athErr\) \{ DzisOffline\.zapisz\(_uidMig, 'trener', _maTrenera\); \}/);
  assert.match(c, /window\._brakTrenera = _trenerZnany \? !_maTrenera : null;/, 'bez wiedzy o trenerze flaga ma być null, nie true');
  const cta = z.slice(z.indexOf('function _odswiezCtaGeneratora()'), z.indexOf('function _odswiezCtaGeneratora()') + 400);
  assert.match(cta, /window\._brakTrenera != null && window\._brakTreninguDzis != null/, 'CTA wymaga ZNANEGO stanu trenera');
});

test('pierścień tygodnia offline: zapis {trainings, logs} po udanym odczycie, z migawki przy błędzie sieci, UKRYTY bez migawki — nigdy 0%', () => {
  swiezy();
  assert.equal(D.zapisz(U, 'postep', { trainings: [{ type: 'Tempo' }], logs: [{ distance_km: 5, training_type: 'Tempo' }] }), true);
  assert.equal(D.awaryjnie(U, 'postep', { message: 'NetworkError when attempting to fetch resource.' }).dane.trainings.length, 1);
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function updateWeekProgress()');
  const c = z.slice(i, i + 3500);
  const iZapis = c.indexOf("DzisOffline.zapisz(_uidMig, 'postep'"), iPct = c.indexOf('const pct = planned');
  assert.ok(iZapis > 0 && iPct > iZapis, 'zapis migawki PRZED liczeniem procentów');
  assert.match(c.slice(0, iPct), /if \(!e1 && !e2\) \{ DzisOffline\.zapisz/, 'zapis tylko gdy oba odczyty bez błędu');
  assert.match(c.slice(0, iPct), /czyBladSieci\(e1 \|\| e2\)\) \{ if \(_ws\) _ws\.style\.display = 'none'; return; \}/, 'bez migawki: ukryć .week-sum i wyjść przed liczeniem');
  assert.match(c, /select\('distance_km,training_type'\)/, 'isRunType potrzebuje training_type — dotąd zapytanie go nie brało');
});

function wyciagnijSwr(fetchAtrapa, cacheAtrapa) {
  const f = sw.match(/async function obrazStaleWhileRevalidate\([\s\S]*?\n\}\n/);
  const f1 = sw.match(/async function wlozObraz\([\s\S]*?\n\}\n/), f2 = sw.match(/async function przytnijCache\([\s\S]*?\n\}\n/);
  assert.ok(f && f1 && f2, 'brak obrazStaleWhileRevalidate w sw.js');
  const caches = { open: async () => cacheAtrapa };
  return new Function('Response', 'fetch', 'caches', 'ASSETS_CACHE', 'LIMIT_OBRAZOW', 'LIMIT_OBRAZOW_B', f[0] + f1[0] + f2[0] + ' return obrazStaleWhileRevalidate;')(Response, fetchAtrapa, caches, 'obrazy-test', 150, 30 * 1024 * 1024);
}

test('obrazy SWR: kopia wraca od razu (bez czekania na sieć), świeża trafia w tle do cache', async () => {
  const c = atrapaCacheObrazow();
  const stara = obraz(10); c.m.set('x.webp', stara);
  let zwolnij; const fetchWolny = () => new Promise((res) => { zwolnij = () => res(obraz(20)); });
  const swr = wyciagnijSwr(fetchWolny, c);
  const t0 = Date.now();
  const r = await swr('x.webp');
  assert.equal(r, stara, 'ma wrócić kopia z cache');
  assert.ok(Date.now() - t0 < 100);
  zwolnij(); await new Promise((res) => setTimeout(res, 20));
  assert.equal(c.m.get('x.webp').headers.get('content-length'), '20', 'świeża odpowiedź nadpisała kopię w tle');
});

test('obrazy SWR: bez kopii → sieć (i zapis); bez kopii i bez sieci → 504, nie wyjątek; cache nie tyka 404', async () => {
  const c = atrapaCacheObrazow();
  const swr = wyciagnijSwr(async () => obraz(30), c);
  assert.equal((await swr('n.webp')).headers.get('content-length'), '30');
  await new Promise((res) => setTimeout(res, 10));
  assert.ok(c.m.has('n.webp'));
  const swr2 = wyciagnijSwr(async () => { throw new TypeError('Failed to fetch'); }, atrapaCacheObrazow());
  assert.equal((await swr2('brak.webp')).status, 504);
  const c3 = atrapaCacheObrazow();
  const swr3 = wyciagnijSwr(async () => obraz(5, 404), c3);
  assert.equal((await swr3('404.webp')).status, 404);
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(c3.m.size, 0, '404 nie wchodzi do cache');
  assert.match(sw, /event\.respondWith\(obrazStaleWhileRevalidate\(request\)\)/);
  assert.doesNotMatch(sw, /obrazCacheFirst/);
});

// ── SMOKE FILIPA 7/8.10: hero, pasek offline, Plan, pierścień bez planu ────────────────────────────────
test('SW nie cachuje Supabase REST (network-only): brak gałęzi i brak networkFirst — odpowiedź z cache nie udaje sukcesu offline', () => {
  assert.doesNotMatch(sw, /isSupabaseAPI\(url\)/, 'gałąź Supabase REST wróciła do routera');
  assert.doesNotMatch(sw, /async function networkFirst\(/);
  assert.match(sw, /Supabase REST \(\/rest\/v1\/\) — NETWORK-ONLY od 07\.10\.2026/);
  assert.match(sw, /nie ma nagłówka Vary/, 'powód (klucz cache bez Authorization) ma zostać przy kodzie');
});

test('initAuth offline: wiersz athletes z migawki; bez migawki komunikat i STOP — nigdy onboarding po braku sieci', () => {
  swiezy();
  const z = czytaj('zawodnik.html');
  assert.match(z, /function _athZMigawki\(userId, ath, err\)/);
  assert.equal((z.match(/= _athZMigawki\(/g) || []).length, 2, 'obie ścieżki initAuth przez _athZMigawki');
  assert.equal((z.match(/if \(ath2? === undefined\) return;/g) || []).length, 2, 'undefined = przerwij przed onboardingiem');
  assert.equal(D.zapisz(U, 'zawodnik', { id: 'a1', full_name: 'Filip' }), true);
  assert.equal(D.awaryjnie(U, 'zawodnik', { message: 'Failed to fetch' }).dane.id, 'a1');
});

test('wiadomość trenera offline: ostatnia wiadomość w migawce, odczyt przy błędzie sieci', () => {
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function loadCoachMessage()');
  const c = z.slice(i, i + 4000);
  assert.match(c, /if \(!msgsErr\) \{ DzisOffline\.zapisz\(_uidMig, 'wiadomosc'/);
  assert.match(c, /DzisOffline\.awaryjnie\(_uidMig, 'wiadomosc', msgsErr\)/);
});

test('hero: zapis kadru NIE przesuwa znacznika „dane z" ani nie zdejmuje paska; awaryjny kadr z własnego originu w precache', () => {
  swiezy();
  D.zapisz(U, 'logi', [1]);
  const ts0 = D.odczytaj(U).ts;
  assert.ok(D.BEZ_CZASU.includes('hero'));
  const teraz = Date.now; Date.now = () => ts0 + 3600000;
  try { assert.equal(D.zapisz(U, 'hero', 'https://x/solo-07.webp'), true); } finally { Date.now = teraz; }
  const m = D.odczytaj(U);
  assert.equal(m.ts, ts0, 'kadr hero zapisany offline nie może udawać świeżej synchronizacji');
  assert.equal(m.czesci.hero, 'https://x/solo-07.webp');
  assert.equal(D.HERO_DOMYSLNY, '/assets/ui/banery/baner-index-01.webp');
  assert.ok(fs.existsSync(path.join(KORZEN, 'assets/ui/banery/baner-index-01.webp')), 'brak pliku awaryjnego kadru — addAll() wywróciłby instalację SW');
  assert.match(sw, /'\/assets\/ui\/banery\/baner-index-01\.webp'/, 'awaryjny kadr w PRECACHE_URLS');
  const z = czytaj('zawodnik.html');
  assert.match(z, /_heroZabezpiecz\(bg, _heroCards\[0\]\);/);
  const h = z.slice(z.indexOf('function _heroZabezpiecz('), z.indexOf('function _heroInit()'));
  assert.match(h, /im\.onerror/, 'background-image nie ma zdarzenia błędu — sonda przez Image()');
  assert.match(h, /DzisOffline\.zapisz\(uid, 'hero', u\)/, 'zapis tylko po onload (kadr ostatnio WYŚWIETLONY)');
  assert.match(h, /DzisOffline\.HERO_DOMYSLNY/);
});

test('Plan offline: zakres = dzień zapisu „tydzien" .. +13; dzień poza zakresem i brak migawki = nieznany', () => {
  swiezy();
  assert.equal(D.zakresTygodnia(D.odczytaj(U)), null, 'bez migawki brak zakresu');
  const dzis = D.dataLokalna(Date.now());
  D.zapisz(U, 'tydzien', [{ date: dzis, type: 'Tempo' }]);
  const z = D.zakresTygodnia(D.odczytaj(U));
  assert.equal(z.od, dzis);
  const p = dzis.split('-').map(Number);
  assert.equal(z.do, D.dataLokalna(new Date(p[0], p[1] - 1, p[2] + 13).getTime()));
  assert.equal(D.dzienWZakresie(z, z.od), true);
  assert.equal(D.dzienWZakresie(z, z.do), true);
  assert.equal(D.dzienWZakresie(null, z.od), false);
  assert.equal(D.dzienWZakresie(z, D.dataLokalna(new Date(p[0], p[1] - 1, p[2] - 1).getTime())), false, 'dzień przed zapisem = nieznany');
  D.zapisz(U, 'logi', [1]);
  assert.equal(D.odczytaj(U).tydzienOd, z.od, 'zapis innej części nie przestawia początku zakresu');
});

test('Plan offline w kalendarz.html: moduł, błąd sieci → _calPlanOffline, dzień nieznany → komunikat przed logiką pustego dnia', () => {
  const k = czytaj('kalendarz.html');
  assert.ok(k.indexOf('<script src="sb.js">') < k.indexOf('<script src="js/dzis-offline.js">'));
  const f = k.slice(k.indexOf('async function loadTrainingsFromDB()'), k.indexOf('async function loadTrainingsFromDB()') + 1800);
  assert.match(f, /if \(athErr && DzisOffline\.czyBladSieci\(athErr\)\) return _calPlanOffline\(session\.user\.id\);/);
  assert.match(f, /if \(error && _urlRole === 'athlete' && DzisOffline\.czyBladSieci\(error\)\) return _calPlanOffline\(session\.user\.id\);/);
  assert.match(f, /if \(window\._calOffline\) \{ window\._calOffline = null; DzisOffline\.ukryjPasek\(\); \}/, 'powrót sieci kończy tryb offline');
  assert.match(k, /const _CAL_OFFLINE_TXT = 'Brak połączenia — ten dzień niedostępny offline';/);
  const rm = k.slice(k.indexOf('function renderMobile()'), k.indexOf('function renderMobile()') + 3500);
  const iGuard = rm.indexOf('if (_calDzienNieznany(ds))'), iItems = rm.indexOf('const items = trainings[ds] || [];');
  assert.ok(iGuard > 0 && iItems > iGuard, 'dzień nieznany obsłużony ZANIM wiersz potraktuje go jak pusty');
  const p = k.slice(k.indexOf('function _calPlanOffline('), k.indexOf('function _calDzienNieznany('));
  assert.match(p, /if \(zakresy\.length\) DzisOffline\.pokazPasek\(m\.ts\);/,'pasek „Offline · dane z" przy danych z migawki');
});

test('pierścień bez planu (planned = 0): bez procentu, w środku liczba treningów, „N treningów w tym tygodniu"; km biegowe zawsze', () => {
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function updateWeekProgress()');
  const c = z.slice(i, i + 6000);
  const iIf = c.indexOf('if (planned > 0) {');
  assert.ok(iIf > 0, 'procent tylko przy planned > 0');
  const iElse = c.indexOf('} else {', iIf);
  assert.match(c.slice(iIf, iElse), /Anim\.countUp\(pctEl, pct, 800, '%'\)/);
  const galazBez = c.slice(iElse, iElse + 600);
  assert.doesNotMatch(galazBez, /'%'/, 'bez planu żadnego procentu');
  assert.match(galazBez, /pctEl\.textContent = String\(ileTr\)/);
  assert.match(galazBez, /w tym tygodniu/);
  assert.ok(c.indexOf('if (kmEl) { const safeKm') > iElse, 'km biegowe tygodnia renderowane w obu przypadkach');
  const odm = (n) => n === 1 ? '1 trening w tym tygodniu' : n + ((n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? ' treningi' : ' treningów') + ' w tym tygodniu';
  assert.deepEqual([0, 1, 2, 5, 12, 22].map(odm), ['0 treningów w tym tygodniu', '1 trening w tym tygodniu', '2 treningi w tym tygodniu', '5 treningów w tym tygodniu', '12 treningów w tym tygodniu', '22 treningi w tym tygodniu']);
  assert.ok(galazBez.includes('(ileTr % 10 >= 2 && ileTr % 10 <= 4 && (ileTr % 100 < 12 || ileTr % 100 > 14))'), 'odmiana w kodzie = odmiana w teście');
});

// ── SMOKE 59ccb94 (8.10): ponowienia postgrest-js offline, tła kart, narzędzie smoke ────────────────────
test('sb.js: offline (navigator.onLine === false) zapytanie NIE ponawia się — wywołanie po definicji, działa na łańcuchu prototypów', () => {
  const sb = czytaj('sb.js');
  const iDef = sb.indexOf('window._bmBezPonowienOffline = function (klient)');
  const iWyw = sb.indexOf('if (window.sb) window._bmBezPonowienOffline(window.sb);');
  assert.ok(iDef > 0 && iWyw > iDef, 'wywołanie musi stać PO definicji (inaczej TypeError przy ładowaniu każdej strony)');
  assert.match(sb, /postgrest-js w vendor\/supabase-js-2\.112\.4 przy błędzie\s*\n?\s*\/?\*?\s*sieci PONAWIA|PONAWIA każde zapytanie GET trzy razy/);
  // funkcjonalnie: wyciągnij funkcję i uruchom na atrapie klasy z metodą retry i then
  const m = sb.match(/window\._bmBezPonowienOffline = function \(klient\) \{[\s\S]*?\n  \};/);
  assert.ok(m, 'brak _bmBezPonowienOffline');
  class Builder { constructor() { this.retryEnabled = true; } retry(e) { this.retryEnabled = e; return this; } then(a) { return Promise.resolve(this.retryEnabled).then(a); } }
  class Filter extends Builder { eq() { return this; } }
  const klient = { from: () => ({ select: () => new Filter() }) };
  const nav = { onLine: false };
  const okno = {};
  new Function('window', 'navigator', m[0])(okno, nav);
  assert.equal(okno._bmBezPonowienOffline(klient), true);
  assert.equal(okno._bmBezPonowienOffline(klient), false, 'drugie założenie łatki nic nie robi');
  return (async () => {
    assert.equal(await new Filter(), false, 'offline: retryEnabled wyłączone przed wysłaniem');
    nav.onLine = true;
    assert.equal(await new Filter(), true, 'online: ponowienia zostają');
    assert.equal(okno._bmBezPonowienOffline({ from: () => ({ select: () => ({}) }) }), false, 'obcy kształt = brak łatki, bez wyjątku');
  })();
});

test('tła kart offline: data-bgsonda na kartach logów i tygodnia, sonda po wstawieniu do DOM, błąd → gradient', () => {
  const z = czytaj('zawodnik.html');
  assert.match(z, /return `<div onclick="editLog\(\$\{idx\}\)" data-bgsonda="\$\{bgImg\}"/);
  assert.match(z, /<div data-bgsonda="\$\{_dayImgFor\(t\.type,i\)\.u\}"/);
  assert.match(z, /\}\)\.join\(''\);\r?\n  _tlaZabezpiecz\(logListEl\);/);
  assert.match(z, /\}\)\.join\(''\);\r?\n  _tlaZabezpiecz\(document\.getElementById\('week-strip'\)\);/);
  const f = z.match(/const _TLO_ZAPASOWE = '[^']+';\r?\nfunction _tlaZabezpiecz\(root\) \{[\s\S]*?\r?\n\}\r?\n/);
  assert.ok(f);
  const obrazy = [];
  class FakeImage { set src(u) { this._u = u; obrazy.push(this); } }
  const el = (u) => ({ style: {}, _a: { 'data-bgsonda': u }, getAttribute(k) { return this._a[k]; }, removeAttribute(k) { delete this._a[k]; } });
  const a = el('https://x/run7.webp'), b = el('https://x/run9.webp');
  const root = { querySelectorAll: () => [a, b] };
  const tz = new Function('Image', f[0] + ' return { _tlaZabezpiecz, _TLO_ZAPASOWE };')(FakeImage);
  tz._tlaZabezpiecz(root);
  assert.equal(obrazy.length, 2);
  obrazy[0].onerror();                       // run7 nie ma w cache offline
  assert.equal(a.style.backgroundImage, tz._TLO_ZAPASOWE, 'nieudany obraz → gradient');
  assert.equal(b.style.backgroundImage, undefined, 'udany (brak błędu) → tło bez zmian');
  assert.equal(a.getAttribute('data-bgsonda'), undefined, 'sonda raz — atrybut zdjęty');
  assert.match(tz._TLO_ZAPASOWE, /^linear-gradient\(/);
});

test('tools/smoke-offline.js: istnieje, ręczny (nie w CI), sprawdza wszystkie punkty smoke Filipa', () => {
  const t = czytaj('tools/smoke-offline.js');
  for (const wz of ['Offline · dane z', 'Ten tydzień', 'Postęp tygodnia', 'wiadomości trenera', 'czarnego tła', 'Plan: tryb offline', "route.abort('internetdisconnected')", "serviceWorkers: 'block'"]) {
    assert.ok(t.includes(wz), 'smoke nie sprawdza: ' + wz);
  }
  assert.match(t, /URUCHAMIANY RĘCZNIE, NIE W CI/);
  const ci = fs.readdirSync(path.join(KORZEN, '.github/workflows')).map((f) => czytaj('.github/workflows/' + f)).join('\n');
  assert.doesNotMatch(ci, /smoke-offline/, 'smoke wymaga Playwrighta i Chromium — nie do CI');
});

test('ikony skrótów obok hero offline: błąd ładowania <img data-ic> → emoji w <span>, nigdy „zepsuty obrazek”', () => {
  const sb = czytaj('sb.js');
  assert.match(sb, /el\.onerror = function\(\)\{ window\._icZapas\(el\); \}; el\.src = window\.assetUrl\(el\.dataset\.ic\);/, 'onerror ma być ustawiony PRZED src');
  assert.equal((sb.match(/<img onerror="window\._icZapas&&window\._icZapas\(this\)"/g) || []).length, 2, 'icHtml i ikony typów treningu też z zapasem');
  const z = czytaj('zawodnik.html');
  const ikony = ['icon-ex-section.webp', 'icon-radio-trophy.webp', 'icon-nav-medal.webp', 'icon-nav-flag.webp', 'icon-nav-people.webp'];
  for (const ic of ikony) assert.ok(z.includes('<img data-ic="' + ic + '"'), 'kafel skrótu bez data-ic: ' + ic);
  const m = sb.match(/window\._IC_ZAPAS = \{[\s\S]*?\n  window\._icZapas = function \(img\) \{[\s\S]*?\n  \};/);
  assert.ok(m, 'brak _IC_ZAPAS/_icZapas');
  const okno = {};
  const span = () => ({ style: {}, _a: {}, setAttribute(k, v) { this._a[k] = v; } });
  const doc = { createElement: () => span() };
  new Function('window', 'document', 'getComputedStyle', m[0])(okno, doc, () => ({ width: '28px', height: '28px' }));
  okno.getComputedStyle = () => ({ width: '28px', height: '28px' });
  for (const ic of ikony) assert.ok(okno._IC_ZAPAS[ic], 'brak emoji dla ' + ic);
  const rodzic = { zamiana: null, replaceChild(n, o) { this.zamiana = { n, o }; } };
  const img = { dataset: { ic: 'icon-nav-flag.webp' }, className: 'x', parentNode: rodzic, getAttribute: () => '', width: 0, height: 0 };
  okno._icZapas(img);
  assert.ok(rodzic.zamiana, 'img nie został zamieniony');
  assert.equal(rodzic.zamiana.n.textContent, '🏁');
  assert.equal(rodzic.zamiana.n._a['data-ic-zapas'], 'icon-nav-flag.webp');
  assert.match(rodzic.zamiana.n.style.cssText, /width:28px;height:28px/, 'zapas w rozmiarze ikony');
  rodzic.zamiana = null; okno._icZapas(img);
  assert.equal(rodzic.zamiana, null, 'drugi błąd tego samego img nic nie robi');
  const r2 = { zamiana: null, replaceChild(n) { this.zamiana = n; } };
  okno._icZapas({ dataset: {}, className: '', parentNode: r2, getAttribute: (k) => (k === 'src' ? 'https://x/assets/icon-nieznana.webp?v=2' : ''), width: 16, height: 16 });
  assert.equal(r2.zamiana.textContent, '◆', 'nieznana ikona → neutralny znak');
  assert.doesNotThrow(() => okno._icZapas(null));
  const smoke = czytaj('tools/smoke-offline.js');
  assert.ok(smoke.includes('ikony skrótów obok hero'), 'smoke nie sprawdza ikon skrótów');
});

test('Plan offline: dni bieżącego tygodnia sprzed dziś z części „postep" — znane dni = „tydzien" (dzień zapisu..+13) ∪ tydzień pn–nd „postep"', () => {
  swiezy();
  assert.deepEqual(D.zakresyPlanu(D.odczytaj(U)), [], 'bez migawki brak zakresów');
  // poniedziałek: dowolny dzień tygodnia → pn tego tygodnia (lokalnie)
  assert.equal(D.poniedzialek(new Date(2026, 9, 8, 15).getTime()), '2026-10-05', 'czwartek 8.10 → pn 5.10');
  assert.equal(D.poniedzialek(new Date(2026, 9, 5, 0, 5).getTime()), '2026-10-05', 'poniedziałek → ten sam dzień');
  assert.equal(D.poniedzialek(new Date(2026, 9, 11, 23, 59).getTime()), '2026-10-05', 'niedziela → pn TEGO tygodnia, nie następnego');
  const dzis = D.dataLokalna(Date.now());
  const pon = D.poniedzialek(Date.now());
  const p = pon.split('-').map(Number);
  const nd = D.dataLokalna(new Date(p[0], p[1] - 1, p[2] + 6).getTime());
  D.zapisz(U, 'tydzien', [{ id: 't1', date: dzis, type: 'Tempo' }]);
  D.zapisz(U, 'postep', { trainings: [{ id: 'p0', date: pon, type: 'Wybieganie' }, { id: 't1', date: dzis, type: 'Tempo (stara kopia)' }], logs: [] });
  const m = D.odczytaj(U);
  assert.equal(m.postepOd, pon, 'zapis „postep" zapamiętuje pn tygodnia');
  const zs = D.zakresyPlanu(m);
  assert.deepEqual(zs.map((z) => z.czesc), ['tydzien', 'postep']);
  assert.deepEqual(zs[1], { od: pon, do: nd, czesc: 'postep' });
  assert.equal(D.dzienWZakresach(zs, pon), true, 'pn bieżącego tygodnia znany');
  assert.equal(D.dzienWZakresach(zs, nd), true);
  assert.equal(D.dzienWZakresach(zs, D.dataLokalna(new Date(p[0], p[1] - 1, p[2] - 1).getTime())), false, 'nd POPRZEDNIEGO tygodnia = nieznany');
  assert.equal(D.dzienWZakresach([], dzis), false);
  const tr = D.treningiPlanu(m);
  if (pon < dzis) assert.ok(tr.some((t) => t.id === 'p0'), 'trening z pn z „postep"');
  assert.equal(tr.filter((t) => t.id === 't1').length, 1, 'dzień w zakresie „tydzien" bierze dane z „tydzien" — bez dubla');
  assert.equal(tr.find((t) => t.id === 't1').type, 'Tempo', '„tydzien" ma pierwszeństwo');
  // migawka sprzed 8.10 (bez postepOd): 'postep' nie poszerza zakresu — nie wiemy, którego tygodnia dotyczy
  const stara = JSON.parse(JSON.stringify(m)); delete stara.postepOd;
  assert.deepEqual(D.zakresyPlanu(stara).map((z) => z.czesc), ['tydzien']);
  assert.equal(D.treningiPlanu(stara).some((t) => t.id === 'p0'), false);
  // sam „postep" bez „tydzien" też daje znane dni (pn–nd)
  swiezy();
  D.zapisz(U, 'postep', { trainings: [{ id: 'p0', date: pon }], logs: [] });
  assert.deepEqual(D.zakresyPlanu(D.odczytaj(U)).map((z) => z.czesc), ['postep']);
  // kalendarz.html korzysta z sumy zakresów
  const k = czytaj('kalendarz.html');
  const f = k.slice(k.indexOf('function _calPlanOffline('), k.indexOf('const _CAL_OFFLINE_TXT'));
  assert.match(f, /const zakresy = DzisOffline\.zakresyPlanu\(m\);/);
  assert.match(f, /DzisOffline\.treningiPlanu\(m\)/);
  assert.match(f, /!DzisOffline\.dzienWZakresach\(window\._calOffline\.zakresy, ds\)/);
  assert.doesNotMatch(k, /window\._calOffline\.zakres[^y]/, 'stare pole zakres nie może zostać w użyciu');
  assert.ok(czytaj('tools/smoke-offline.js').includes('Plan: dni bieżącego tygodnia sprzed dziś'), 'punkt w smoke');
});

// ── WZNOWIENIE Z TŁA (8.10, „dane z 01:53") i tydzień pierścienia po Warszawie ─────────────────────────
function wyciagnijFunkcje(zrodlo, naglowek) {
  const i = zrodlo.indexOf(naglowek);
  assert.ok(i >= 0, 'brak: ' + naglowek);
  const j = zrodlo.indexOf('\n}\n', i);
  return zrodlo.slice(i, j + 3);
}

test('„Dziś": powrót z tła odświeża dane BEZ przeładowania — > 10 min albo zmiana dnia, offline nic, jedno naraz', async () => {
  const z = czytaj('zawodnik.html').replace(/\r/g, '');
  const f = wyciagnijFunkcje(z, 'async function _dzisPoPowrocie(powod) {');
  assert.doesNotMatch(f, /location\.reload|location\.href\s*=/, 'bez przeładowania (dawne miganie, Maciek 14.08)');
  assert.match(z, /const DZIS_ODSWIEZ_PO_MS = 10 \* 60 \* 1000;/);
  assert.match(z, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.visibilityState === 'visible'\) _dzisPoPowrocie\('visibilitychange'\); \}\);/);
  assert.match(z, /window\.addEventListener\('pageshow', \(e\) => \{ if \(e\.persisted\) _dzisPoPowrocie\('pageshow'\); \}\);/);
  // znacznik ładowania tylko z SIECI (przed awaryjnie(), które zeruje error)
  const ll = z.slice(z.indexOf('async function loadLogs()'), z.indexOf('async function loadLogs()') + 9000);
  const iZ = ll.indexOf('const _zSieci = !error;'), iAw = ll.indexOf("DzisOffline.awaryjnie(_uidMig, 'logi', error)");
  assert.ok(iZ > 0 && iAw > iZ, '_zSieci liczone przed odczytem awaryjnym');
  assert.match(ll, /if \(_zSieci\) window\._dzisZaladowano = \{ ts: Date\.now\(\), dzien: DzisOffline\.dataLokalna\(Date\.now\(\)\) \};/);

  const zbuduj = (stan) => {
    const okno = { _dzisZaladowano: stan.z, loadWeather: () => { stan.pogoda++; } };
    const doc = { visibilityState: stan.widocznosc || 'visible' };
    const nav = { onLine: stan.onLine !== false };
    const loadLogs = async () => { stan.ladowan++; await new Promise((r) => setTimeout(r, 20)); okno._dzisZaladowano = { ts: Date.now(), dzien: D.dataLokalna(Date.now()) }; };
    const fn = new Function('window', 'document', 'navigator', '_athleteId', 'DzisOffline', 'loadLogs', '_ustawDateNaglowka', 'console',
      'const DZIS_ODSWIEZ_PO_MS = 10 * 60 * 1000;\n' + f + '\nreturn _dzisPoPowrocie;')(okno, doc, nav, stan.aid === undefined ? 'A1' : stan.aid, D, loadLogs, () => { stan.naglowek++; }, { error() {} });
    return { fn, okno };
  };
  const nowy = (o) => Object.assign({ ladowan: 0, naglowek: 0, pogoda: 0 }, o);
  const dzis = D.dataLokalna(Date.now());
  let st = nowy({ z: { ts: Date.now() - 11 * 60000, dzien: dzis }, onLine: false });
  assert.equal(await zbuduj(st).fn('t'), 'offline'); assert.equal(st.ladowan, 0, 'offline przy powrocie — nic (migawka już jest)');
  st = nowy({ z: { ts: Date.now() - 9 * 60000, dzien: dzis } });
  assert.equal(await zbuduj(st).fn('t'), 'swieze'); assert.equal(st.ladowan, 0);
  st = nowy({ z: { ts: Date.now() - 11 * 60000, dzien: dzis } });
  assert.match(await zbuduj(st).fn('t'), /^odswiezone/); assert.equal(st.ladowan, 1); assert.equal(st.naglowek, 0, 'ten sam dzień — nagłówek bez zmian'); assert.equal(st.pogoda, 1);
  st = nowy({ z: { ts: Date.now() - 60000, dzien: '2000-01-01' } });
  assert.match(await zbuduj(st).fn('t'), /^odswiezone/); assert.equal(st.naglowek, 1, 'zmiana dnia przelicza datę w nagłówku');
  st = nowy({ z: undefined });
  assert.match(await zbuduj(st).fn('t'), /^odswiezone/, 'start offline (brak ładowania z sieci) → powrót z siecią ładuje');
  st = nowy({ z: { ts: 0, dzien: dzis }, widocznosc: 'hidden' });
  assert.equal(await zbuduj(st).fn('t'), 'ukryta'); assert.equal(st.ladowan, 0);
  st = nowy({ z: { ts: 0, dzien: dzis }, aid: null });
  assert.equal(await zbuduj(st).fn('t'), 'brak-zawodnika');
  // dwa zdarzenia naraz (visibilitychange + pageshow) → jedno ładowanie
  st = nowy({ z: { ts: 0, dzien: dzis } });
  const { fn } = zbuduj(st);
  const [a, b] = await Promise.all([fn('visibilitychange'), fn('pageshow')]);
  assert.equal(st.ladowan, 1, 'blokada przed równoległym podwójnym odświeżeniem');
  assert.deepEqual([a.split(':')[0], b], ['odswiezone', 'w-toku']);
});

test('Plan (kalendarz.html): powrót z tła odświeża treningi zawodnika bez przeładowania; zmiana dnia przesuwa tydzień „starego dziś"', async () => {
  const k = czytaj('kalendarz.html').replace(/\r/g, '');
  const f = wyciagnijFunkcje(k, 'async function _calPoPowrocie(powod) {');
  assert.doesNotMatch(f, /location\.reload|location\.href\s*=/);
  assert.match(k, /window\._calZaladowano = \{ ts: Date\.now\(\), dzien: dateStr\(new Date\(\)\) \};/);
  assert.match(k, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.visibilityState === 'visible'\) _calPoPowrocie\('visibilitychange'\); \}\);/);
  const iZal = k.indexOf('window._calZaladowano = {'), iOff = k.indexOf("if (error && _urlRole === 'athlete' && DzisOffline.czyBladSieci(error)) return _calPlanOffline");
  assert.ok(iOff > 0 && iZal > iOff, 'znacznik ustawiany dopiero po udanym odczycie z sieci (nie w trybie offline)');
  const zbuduj = (stan) => new Function('window', 'document', 'navigator', '_urlRole', 'dateStr', 'getWeekStart', 'loadTrainingsFromDB', 'setView', '_calView', 'console', 'stan',
    'let currentWeekStart = stan.cws;\nconst CAL_ODSWIEZ_PO_MS = 10 * 60 * 1000;\n' + f + '\nreturn { f: _calPoPowrocie, cws: () => currentWeekStart };')(
    stan.okno, { visibilityState: 'visible' }, { onLine: stan.onLine !== false }, stan.rola || 'athlete',
    (d) => D.dataLokalna(d.getTime()), (d) => D.poniedzialek(d.getTime()), async () => { stan.ladowan++; }, () => { stan.widok++; }, 'mobile', { error() {} }, stan);
  const dzis = D.dataLokalna(Date.now());
  let st = { okno: { _calZaladowano: { ts: Date.now() - 11 * 60000, dzien: dzis } }, ladowan: 0, widok: 0, cws: D.poniedzialek(Date.now()) };
  assert.match(await zbuduj(st).f('t'), /^odswiezone/); assert.equal(st.ladowan, 1); assert.equal(st.widok, 1);
  st = { okno: { _calZaladowano: { ts: Date.now() - 60000, dzien: dzis } }, ladowan: 0, widok: 0 };
  assert.equal(await zbuduj(st).f('t'), 'swieze');
  st = { okno: { _calZaladowano: { ts: 0, dzien: dzis } }, ladowan: 0, widok: 0, onLine: false };
  assert.equal(await zbuduj(st).f('t'), 'offline'); assert.equal(st.ladowan, 0);
  st = { okno: { _calZaladowano: { ts: 0, dzien: dzis } }, ladowan: 0, widok: 0, rola: 'coach' };
  assert.equal(await zbuduj(st).f('t'), 'trener');
  // zmiana dnia: widok stał na tygodniu „starego dziś" (sprzed 8 dni) → tydzień nowego dnia
  const stary = D.dataLokalna(Date.now() - 8 * 86400000);
  st = { okno: { _calZaladowano: { ts: Date.now(), dzien: stary } }, ladowan: 0, widok: 0, cws: D.poniedzialek(new Date(stary + 'T00:00:00').getTime()) };
  const b = zbuduj(st); await b.f('t');
  assert.equal(b.cws(), D.poniedzialek(Date.now()), 'przejście na bieżący tydzień');
  // zmiana dnia, ale człowiek przeglądał INNY tydzień — zostaje
  st = { okno: { _calZaladowano: { ts: Date.now(), dzien: stary } }, ladowan: 0, widok: 0, cws: '2020-01-06' };
  const c = zbuduj(st); await c.f('t');
  assert.equal(c.cws(), '2020-01-06');
});

test('pierścień tygodnia: pn–nd po kalendarzu Europe/Warsaw — poniedziałek 00:30 PL to już NOWY tydzień (bez niedzieli poprzedniego)', () => {
  const sb = czytaj('sb.js').replace(/\r/g, '');
  const okno = {};
  const dw = sb.match(/window\._dzienWaw = function \(iso\) \{[\s\S]*?\n  \};/);
  const tw = sb.match(/window\._tydzienWaw = function \(ts\) \{[\s\S]*?\n  \};/);
  assert.ok(dw && tw, 'brak _dzienWaw/_tydzienWaw w sb.js');
  new Function('window', dw[0] + '\n' + tw[0])(okno);
  const T = (iso) => okno._tydzienWaw(Date.parse(iso));
  // lato (CEST, UTC+2): pn 5.10.2026 00:30 PL = nd 4.10 22:30 UTC
  assert.deepEqual(T('2026-10-04T22:30:00Z'), { od: '2026-10-05', do: '2026-10-11' }, 'pn 00:30 PL → tydzień 5–11.10');
  assert.deepEqual(T('2026-10-04T21:30:00Z'), { od: '2026-09-28', do: '2026-10-04' }, 'nd 23:30 PL → jeszcze poprzedni tydzień');
  // zima (CET, UTC+1): pn 2.11.2026 00:30 PL = nd 1.11 23:30 UTC
  assert.deepEqual(T('2026-11-01T23:30:00Z'), { od: '2026-11-02', do: '2026-11-08' });
  assert.deepEqual(T('2026-10-08T13:00:00Z'), { od: '2026-10-05', do: '2026-10-11' });
  assert.deepEqual(T('2026-10-11T10:00:00Z'), { od: '2026-10-05', do: '2026-10-11' });
  assert.deepEqual(T('2027-01-01T12:00:00Z'), { od: '2026-12-28', do: '2027-01-03' }, 'przełom roku');
  // updateWeekProgress: kolumna `date` z _tydzienWaw, nie z toISOString lokalnej północy
  const z = czytaj('zawodnik.html').replace(/\r/g, '');
  const u = z.slice(z.indexOf('async function updateWeekProgress()'), z.indexOf('async function updateWeekProgress()') + 3500);
  assert.match(u, /const _tw = window\._tydzienWaw\(Date\.now\(\)\);/);
  assert.match(u, /\.gte\('date', _tw\.od\)\s*\n\s*\.lte\('date', _tw\.do\);/);
  assert.doesNotMatch(u, /\.gte\('date', weekStart\.toISOString\(\)/, 'stary błąd UTC wrócił');
});
