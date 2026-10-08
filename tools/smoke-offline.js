#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SMOKE OFFLINE — „Dziś" i Plan bez sieci, w Chromium (Playwright), bez telefonu.
//
// URUCHAMIANY RĘCZNIE, NIE W CI: wymaga Playwrighta i Chromium, których repo nie
// ma (brak npm z założenia). Instalacja poza repo, raz:
//     mkdir ~/pw && cd ~/pw && npm init -y && npm i playwright@1 && npx playwright install chromium
// Uruchomienie z korzenia repo:
//     NODE_PATH=~/pw/node_modules node tools/smoke-offline.js [katalog-na-zrzuty]
//
// CO SYMULUJE (zgodnie ze smoke Filipa 8.10, Android w trybie samolotowym):
//   · zalogowany stan: sesja supabase-js w localStorage (token z datą ważności w przyszłości —
//     getSession() czyta go lokalnie, bez sieci);
//   · migawka bm_dzis_migawka_<uid> wypełniona tak, jak zostawia ją udane ładowanie „Dziś";
//   · OFFLINE: navigator.onLine = false i KAŻDE żądanie poza localhost przerwane błędem
//     sieci (Supabase REST/Auth/EF, biegamy-assets, CDN). Lokalny serwer repo działa —
//     odpowiada temu, co telefonowi daje precache Service Workera.
//   · Service Worker zablokowany w tym przebiegu (deterministycznie: strona widzi błąd
//     sieci, nie odpowiedź z cache).
//
// CO SPRAWDZA (kod wyjścia 1 przy którymkolwiek niepowodzeniu):
//   „Dziś": pasek „Offline · dane z", hero z obrazem, lista treningów z migawki, „Ten tydzień"
//   bez szkieletu (dni z migawki), „Postęp tygodnia" bez „Ładowanie…", treść wiadomości trenera,
//   karty treningów bez czarnego tła, ikony skrótów obok hero bez „zepsutego obrazka”, zero nieobsłużonych wyjątków.
//   Plan: dni z migawki + „Brak połączenia — ten dzień niedostępny offline" dla dni spoza zakresu.
//   Plan: dni bieżącego tygodnia sprzed dziś z części „postep" (08.10.2026).
//   ONLINE (atrapa Supabase REST, nic do produkcji): udane ładowanie „Dziś" odświeża migawkę; wznowienie
//   z tła (visibilitychange) po > 10 min / po zmianie dnia odświeża „Dziś" i Plan BEZ przeładowania.
// SMOKE_SW=1: prawdziwy sw.js — scenariusze A–F (precache, aktualizacja z nieudanym precache, online z SW).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('Brak Playwrighta. Zobacz nagłówek pliku (NODE_PATH=~/pw/node_modules).'); process.exit(2); }

const KORZEN = path.join(__dirname, '..');
const ZRZUTY = process.argv[2] || path.join(require('os').tmpdir(), 'smoke-offline');
fs.mkdirSync(ZRZUTY, { recursive: true });

const UID = '11111111-2222-3333-4444-555555555555';
const AID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mjs': 'application/javascript' };

// Stan serwera sterowany przez tryb SW: `martwy` = każde połączenie zrywane (telefon w trybie
// samolotowym — SW nie dostaje NIC z sieci), `wersja` = dopisek do CACHE_VERSION w sw.js (symulacja
// deployu), `zrywaj` = ścieżki zrywane mimo żywego serwera (nieudany precache jednego pliku).
const STAN = { martwy: false, wersja: '', zrywaj: new Set(), log: [], korzen: null };
function serwer() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      STAN.log.push((STAN.martwy ? 'ZERWANE ' : '') + p);
      if (STAN.martwy || STAN.zrywaj.has(p)) { req.socket.destroy(); return; }
      const K = STAN.korzen || KORZEN;
      const plik = path.join(K, p === '/' ? 'index.html' : p);
      if (!plik.startsWith(K) || !fs.existsSync(plik) || fs.statSync(plik).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPY[path.extname(plik).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
      if (p === '/sw.js' && STAN.wersja) {
        return res.end(fs.readFileSync(plik, 'utf8').replace(/const CACHE_VERSION = '([^']+)';/, (m, v) => "const CACHE_VERSION = '" + v + STAN.wersja + "';"));
      }
      fs.createReadStream(plik).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

function dataLokalna(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function plusDni(n) { const d = new Date(); d.setDate(d.getDate() + n); return dataLokalna(d); }

function migawka() {
  const ts = Date.now() - 10 * 60 * 1000;
  const dzis = dataLokalna(new Date());
  const pon = (() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dataLokalna(d); })();
  const tydzien = [0, 1, 3, 5, 8, 12].map((n, i) => ({ id: 'tr' + i, athlete_id: AID, date: plusDni(n), type: ['Tempo', 'Spokojny', 'Interwały', 'Wybieganie', 'Regeneracja', 'Spokojny'][i],
    distance_km: [8, 10, 7, 18, 6, 9][i], pace: '5:10', heart_rate: null, description: 'Opis ' + i, status: 'planned', coach_id: 'c0ac0000-0000-0000-0000-000000000000' }));
  const logi = [1, 2, 3, 4, 5].map((n) => ({ id: 'lg' + n, athlete_id: AID, logged_at: new Date(Date.now() - n * 86400000).toISOString(), training_type: n % 2 ? 'Spokojny' : 'Tempo',
    distance_km: 5 + n, pace: '5:30', duration: '0:40:00', feel: 'dobrze', comment: 'Log ' + n, attachment_url: null, card_bg_url: null, source: 'manual' }));
  const czesci = {
    zawodnik: { id: AID, full_name: 'Test Offline' },
    logi, dzis: tydzien[0], tydzien, trener: true,
    // 'postep' = plan BIEŻĄCEGO tygodnia pn–nd (updateWeekProgress). Poniedziałek: Wybieganie 21 km — dzień
    // sprzed dnia zapisu, który Plan offline ma pokazać z tej części (08.10.2026).
    postep: { trainings: (pon < dzis ? [{ id: 'trpon', athlete_id: AID, date: pon, type: 'Wybieganie', distance_km: 21, pace: '5:30', description: 'Poniedziałek', status: 'done', coach_id: 'c0ac0000-0000-0000-0000-000000000000' }] : []).concat(tydzien.slice(0, 3)), logs: logi.slice(0, 2).map((l) => ({ distance_km: l.distance_km, training_type: l.training_type })) },
    wiadomosc: { body: 'Dzień dobry — offline test wiadomości trenera.', sent_at: new Date(ts).toISOString() },
    hero: 'https://filipjanczak1989-png.github.io/biegamy-assets/solo-01.webp',
  };
  return { userId: UID, ts, tydzienOd: dzis, postepOd: pon, czesci };
}

function sesja() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' }) + '.podpis';
  return { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 604800, expires_at: exp,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'offline@test.local', user_metadata: { full_name: 'Test Offline' }, app_metadata: {} } };
}

// ─────────────────────────────────────────────────────────────────────────────
// ONLINE: czy udane ładowanie „Dziś" ODŚWIEŻA migawkę (08.10.2026, smoke Filipa po a6bfdfe:
// pasek „Offline · dane z 01:53", choć o ~15:05 „Dziś" było otwarte z siecią).
// Supabase REST odpowiada atrapą (route.fulfill — nic nie idzie do produkcji). Migawka startowa
// ma ts sprzed 5 h i wstawiana jest TYLKO, gdy w localStorage nie ma żadnej (inaczej init script
// nadpisywałby zapis strony przy każdej nawigacji i test niczego by nie mierzył).
// ─────────────────────────────────────────────────────────────────────────────
const COACH = 'c0ac0000-0000-0000-0000-000000000000';
const LICZNIK_REST = {};   // tabela → liczba GET-ów do atrapy (punkty wznowienia: czy cokolwiek pobrano)
function atrapaRest(url, accept) {
  const u = new URL(url);
  const tabela = u.pathname.replace(/^\/rest\/v1\//, '');
  const q = u.searchParams;
  const dzis = dataLokalna(new Date());
  let rows = [];
  if (tabela === 'athletes') rows = [{ id: AID, user_id: UID, full_name: 'Test Online', coach_id: COACH, terms_accepted_at: new Date().toISOString() }];
  else if (tabela === 'trainings') {
    rows = [-2, -1, 0, 1, 2, 4, 6, 9].map((n, i) => ({ id: 'on' + i, athlete_id: AID, date: plusDni(n), type: ['Spokojny', 'Tempo', 'Interwały', 'Spokojny', 'Wybieganie', 'Regeneracja', 'Tempo', 'Spokojny'][i],
      distance_km: 6 + i, pace: '5:00', description: 'Online ' + i, status: n < 0 ? 'done' : 'planned', coach_id: COACH, plan_source: 'coach' }));
    for (const v of q.getAll('date')) {
      const [op, d] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
      rows = rows.filter((r) => (op === 'gte' ? r.date >= d : op === 'lte' ? r.date <= d : op === 'eq' ? r.date === d : true));
    }
  } else if (tabela === 'training_logs') {
    rows = [1, 2, 3].map((n) => ({ id: 'onl' + n, athlete_id: AID, logged_at: new Date(Date.now() - n * 3600000).toISOString(), training_type: 'Spokojny', distance_km: 7 + n,
      pace: '5:20', duration: '0:40:00', feel: 'dobrze', comment: 'Log online ' + n, source: 'manual' }));
  } else if (tabela === 'messages') rows = [{ id: 'm1', body: 'Wiadomość ONLINE od trenera.', sent_at: new Date().toISOString(), sender_id: COACH }];
  if (/vnd\.pgrst\.object/.test(accept || '')) {
    if (rows.length === 1) return { status: 200, body: rows[0] };
    return { status: 406, body: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains ' + rows.length + ' rows' } };
  }
  return { status: 200, body: rows };
}
async function podepnijAtrape(ctx) {
  await ctx.route(/supabase\.co\//, async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (u.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    if (u.pathname.startsWith('/rest/v1/')) {
      if (r.method() !== 'GET' && r.method() !== 'HEAD') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      const a = atrapaRest(r.url(), r.headers()['accept']);
      const tab = u.pathname.replace(/^\/rest\/v1\//, ''); LICZNIK_REST[tab] = (LICZNIK_REST[tab] || 0) + 1;
      return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'content-range': '0-0/*', 'access-control-allow-origin': '*' }, body: JSON.stringify(a.body) });
    }
    if (u.pathname === '/auth/v1/user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sesja().user) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}
const STARA_MIGAWKA_MS = 5 * 3600 * 1000;
async function kontekstOnline(browser, zSW) {
  const ctx = await browser.newContext({ serviceWorkers: zSW ? 'allow' : 'block', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36' });
  const M = migawka(); M.ts = Date.now() - STARA_MIGAWKA_MS;
  await ctx.addInitScript(([m, s, uid]) => {
    try {
      if (!localStorage.getItem('sb-afqojgkaveykxbltxzwm-auth-token')) localStorage.setItem('sb-afqojgkaveykxbltxzwm-auth-token', JSON.stringify(s));
      if (!localStorage.getItem('bm_dzis_migawka_' + uid)) localStorage.setItem('bm_dzis_migawka_' + uid, JSON.stringify(m));
    } catch (e) {}
  }, [M, sesja(), UID]);
  await podepnijAtrape(ctx);
  if (!zSW) await ctx.route((u) => !/supabase\.co|127\.0\.0\.1|localhost/.test(String(u)), (route) => route.abort('internetdisconnected'));
  return { ctx, tsStary: M.ts };
}
function sprawdzOnline(sprawdz, et, st, tsStary) {
  sprawdz(et + ': udane ładowanie ONLINE odświeża migawkę (ts, logi, wiadomość)', st.ts > tsStary + 60000 && st.logiKom === 'Log online 1' && /ONLINE/.test(st.wiad || ''),
    'ts ' + (st.ts ? new Date(st.ts).toTimeString().slice(0, 8) : null) + ' (stary ' + new Date(tsStary).toTimeString().slice(0, 8) + '), logi[0]=' + st.logiKom + ', uid=' + st.uidStrony + ', widokTrenera=' + st.widokTrenera + ', ' + st.bajty + ' B');
  sprawdz(et + ': online bez paska offline', !st.pasek, st.pasek);
}
async function scenariuszOnline(ctx, baza, etykieta) {
  const p = await ctx.newPage();
  const bledy = [];
  p.on('pageerror', (e) => bledy.push(String(e.message).slice(0, 160)));
  const tsStary = await p.evaluate(() => 0).catch(() => 0);
  await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
  await p.waitForTimeout(9000);
  const st = await p.evaluate(async ([uid]) => {
    const raw = localStorage.getItem('bm_dzis_migawka_' + uid);
    const m = raw ? JSON.parse(raw) : null;
    let uidStrony = null; try { uidStrony = await DzisOffline.userId(sb); } catch (e) { uidStrony = 'BŁĄD ' + e.message; }
    return { ts: m && m.ts, bajty: raw ? raw.length : 0, czesci: m ? Object.keys(m.czesci) : [], logiKom: m && m.czesci.logi && m.czesci.logi[0] && m.czesci.logi[0].comment,
             wiad: m && m.czesci.wiadomosc && m.czesci.wiadomosc.body, uidStrony, widokTrenera: DzisOffline.widokTrenera(), onLine: navigator.onLine,
             pasek: (document.getElementById('bm-offline-pasek') || {}).innerText || null, athleteId: typeof _athleteId !== 'undefined' ? _athleteId : null,
             kontrolowana: !!(navigator.serviceWorker && navigator.serviceWorker.controller) };
  }, [UID]);
  st.bledy = bledy.slice(0, 3);
  console.log('   [' + etykieta + '] online: ' + JSON.stringify(st));
  return { p, st };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRYB Z SERVICE WORKEREM (SMOKE_SW=1) — 08.10.2026, smoke Filipa po 830f760:
// „Dziś" offline działa, Plan (kalendarz.html?role=athlete) daje ekran braku połączenia.
// Tu SW jest PRAWDZIWY (sw.js z repo), sieć znika naprawdę: context.setOffline(true) + serwer
// zrywa każde połączenie. Obce hosty są nierozwiązywalne od początku (--host-resolver-rules),
// więc nic nie idzie do produkcji. Scenariusze:
//   A  online tylko zawodnik.html → offline → nawigacja na Plan (przebieg Filipa)
//   B  online zawodnik.html i Plan → offline → nawigacja na Plan
//   C  SW zainstalowany w całości → DEPLOY (nowa CACHE_VERSION), a precache kalendarz.html
//      w nowej instalacji się nie udaje (zerwane połączenie) → offline → nawigacja na Plan
//   D  jak C, ale sieć znika W TRAKCIE instalacji nowej wersji — zerwane wszystkie pliki precache
//   E  deploy z nieudanym precache strony NIEKRYTYCZNEJ (profil.html) — nowa wersja instaluje się,
//      a profil.html ma wejść do nowego cache jako kopia z poprzedniej wersji
// Od 08.10 (sw.js PRECACHE_KRYTYCZNE): w C i D instalacja nowej wersji ma się NIE udać, a stara wersja
// z pełnym cache — zostać. Przed poprawką C dawało offline.html, D 503 (zmierzone).
// Mierzy: co oddaje nawigacja (offline.html / kopia / nic), zawartość STATIC_CACHE, stan Planu.
// ─────────────────────────────────────────────────────────────────────────────
async function trybSW() {
  const srv = await serwer();
  const baza = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1'] });
  const M = migawka(), S = sesja();
  const wyniki = [];
  const sprawdz = (nazwa, ok, szczegol) => { wyniki.push({ nazwa, ok: !!ok, szczegol }); };

  async function nowyKontekst() {
    const ctx = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36' });
    await ctx.addInitScript(([m, s, uid]) => {
      try {
        if (!localStorage.getItem('sb-afqojgkaveykxbltxzwm-auth-token')) localStorage.setItem('sb-afqojgkaveykxbltxzwm-auth-token', JSON.stringify(s));
        localStorage.setItem('bm_dzis_migawka_' + uid, JSON.stringify(m));
      } catch (e) {}
    }, [M, S, UID]);
    return ctx;
  }
  async function czekajNaKontrole(p) {
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  }
  async function zawartoscStatic(p) {
    return p.evaluate(async () => {
      const nazwy = await caches.keys();
      const st = nazwy.filter((n) => /-static$/.test(n));
      const out = {};
      for (const n of st) out[n] = (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
      return { nazwy, statyczne: out };
    });
  }
  async function offlineNaPlan(ctx, p, etykieta) {
    STAN.martwy = true;
    await ctx.setOffline(true);
    let odp = null, blad = null;
    try { odp = await p.goto(baza + '/kalendarz.html?role=athlete', { waitUntil: 'domcontentloaded', timeout: 15000 }); }
    catch (e) { blad = String(e.message).split('\n')[0]; }
    await p.waitForTimeout(6000);
    const st = await p.evaluate(() => {
      const c = document.getElementById('mobile-days-container');
      return { tytul: document.title, url: location.pathname + location.search, calOffline: !!window._calOffline,
               dni: c ? c.innerText.replace(/\s+/g, ' ').slice(0, 1200) : null,
               pasek: (document.getElementById('bm-offline-pasek') || {}).innerText || null };
    }).catch((e) => ({ blad: String(e.message).split('\n')[0] }));
    await p.screenshot({ path: path.join(ZRZUTY, 'sw-' + etykieta + '.png'), fullPage: false }).catch(() => {});
    STAN.martwy = false;
    await ctx.setOffline(false);
    return { status: odp ? odp.status() : null, zSW: odp ? odp.fromServiceWorker() : null, blad, ...st };
  }
  const opis = (r) => JSON.stringify({ status: r.status, zSW: r.zSW, tytul: r.tytul, calOffline: r.calOffline, dni: r.dni && r.dni.replace(/(Brak połączenia — ten dzień niedostępny offline ?)+/g, '[niedostępny] ').slice(0, 90), pasek: r.pasek, blad: r.blad });
  const toPlan = (r) => r.tytul === 'BiegaMy — Kalendarz' && r.calOffline && /Tempo|Spokojny|Interwały/.test(r.dni || '');

  // ── A ──
  {
    STAN.wersja = ''; STAN.zrywaj.clear();
    const ctx = await nowyKontekst(); const p = await ctx.newPage();
    await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
    await czekajNaKontrole(p); await p.waitForTimeout(1500);
    const c = await zawartoscStatic(p);
    const klucze = Object.values(c.statyczne)[0] || [];
    console.log('   [A] cache: ' + c.nazwy.join(', ') + ' | STATIC ' + klucze.length + ' wpisów: ' + klucze.join(' '));
    const r = await offlineNaPlan(ctx, p, 'A');
    console.log('   [A] Plan offline: ' + opis(r));
    sprawdz('SW A: kalendarz.html w STATIC_CACHE po wejściu TYLKO na „Dziś"', klucze.includes('/kalendarz.html'), klucze.length + ' wpisów');
    sprawdz('SW A: Plan offline po wejściu tylko na „Dziś" (kopia z cache, dni z migawki)', toPlan(r), opis(r));
    await ctx.close();
  }
  // ── B ──
  {
    STAN.wersja = ''; STAN.zrywaj.clear();
    const ctx = await nowyKontekst(); const p = await ctx.newPage();
    await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
    await czekajNaKontrole(p);
    await p.goto(baza + '/kalendarz.html?role=athlete', { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const r = await offlineNaPlan(ctx, p, 'B');
    console.log('   [B] Plan offline: ' + opis(r));
    sprawdz('SW B: Plan offline po wejściu na Plan z siecią', toPlan(r), opis(r));
    await ctx.close();
  }
  // ── C i D: aktualizacja SW (deploy) z nieudanym precache ──
  for (const [et, zrywane] of [['C', ['/kalendarz.html']], ['D', null]]) {
    STAN.wersja = ''; STAN.zrywaj.clear();
    const ctx = await nowyKontekst(); const p = await ctx.newPage();
    await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
    await czekajNaKontrole(p); await p.waitForTimeout(1000);
    const przed = await zawartoscStatic(p);
    STAN.wersja = '-deploy' + et;
    if (zrywane) zrywane.forEach((x) => STAN.zrywaj.add(x));
    else PRECACHE_ZRYWAJ_WSZYSTKO();
    const zmiana = p.evaluate(() => new Promise((ok) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => ok('controllerchange'), { once: true });
      setTimeout(() => ok('brak controllerchange w 15 s'), 15000);
    }));
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update())).catch(() => {});
    const zm = await zmiana;
    await p.waitForTimeout(1500);
    STAN.zrywaj.clear();
    const po = await zawartoscStatic(p);
    const kluczePo = Object.entries(po.statyczne).map(([n, k]) => n + ': ' + k.length + (k.includes('/kalendarz.html') ? ' (z kalendarz)' : ' (BEZ kalendarz)'));
    console.log('   [' + et + '] przed: ' + Object.keys(przed.statyczne).join(', ') + ' | ' + zm + ' | po: ' + kluczePo.join(' ; '));
    const r = await offlineNaPlan(ctx, p, et);
    console.log('   [' + et + '] Plan offline: ' + opis(r));
    const stare = Object.keys(przed.statyczne)[0];
    sprawdz('SW ' + et + ': nieudana instalacja nowej wersji zostawia starą z kompletnym cache', zm !== 'controllerchange' && (po.statyczne[stare] || []).includes('/kalendarz.html'),
      zm + ' | ' + kluczePo.join(' ; '));
    sprawdz('SW ' + et + ': Plan offline po deployu z nieudanym precache ' + (zrywane ? 'kalendarz.html' : '(sieć znika w trakcie instalacji)'), toPlan(r), opis(r));
    await ctx.close();
  }
  function PRECACHE_ZRYWAJ_WSZYSTKO() {
    // D: zrywane są wszystkie pliki precache oprócz samego sw.js (aktualizacja dochodzi, instalacja już nie)
    ['/', '/index.html', '/zawodnik.html', '/trener.html', '/profil.html', '/odznaki.html', '/wyzwania.html', '/kalendarz.html', '/compare.html',
     '/races.html', '/gra.html', '/o-nas.html', '/terms.html', '/privacy.html', '/privacy-en.html', '/sb.js', '/vendor/supabase-js-2.112.4.min.js',
     '/theme.css', '/manifest.json', '/offline.html', '/js/dzis-offline.js', '/js/generator-planu.js', '/js/silnik-anim.js', '/js/silnik-momentu.js',
     '/assets/ui/pustki/pustka-offline.webp', '/assets/ui/banery/baner-index-01.webp'].forEach((x) => STAN.zrywaj.add(x));
  }

  // ── F: online z SW — pierwsze wejście (instalacja) i drugie (strona kontrolowana przez SW) ──
  {
    STAN.wersja = ''; STAN.zrywaj.clear();
    const { ctx, tsStary } = await kontekstOnline(browser, true);
    const { p, st: st1 } = await scenariuszOnline(ctx, baza, 'F1 z SW, 1. wejście');
    sprawdzOnline(sprawdz, 'SW F1', st1, tsStary);
    await p.evaluate(([uid, t]) => { const m = JSON.parse(localStorage.getItem('bm_dzis_migawka_' + uid)); m.ts = t; localStorage.setItem('bm_dzis_migawka_' + uid, JSON.stringify(m)); }, [UID, tsStary]);
    await p.close();
    const { st: st2 } = await scenariuszOnline(ctx, baza, 'F2 z SW, strona kontrolowana');
    sprawdz('SW F2: strona kontrolowana przez SW', st2.kontrolowana, String(st2.kontrolowana));
    sprawdzOnline(sprawdz, 'SW F2', st2, tsStary);
    await ctx.close();
  }

  // ── G: DEPLOY z nowym HTML i JS (08.10.2026, smoke Filipa po a3e546c: „dane z 01:53" mimo wejść
  //    online, hero czarny, Plan bez nowego kodu). Wersja N-1 = drzewo sprzed ostatniego commitu, który
  //    zmienił zawodnik.html (git archive), wersja N = drzewo robocze. Po przełączeniu serwera: trzy
  //    kolejne wejścia online na „Dziś" + Plan; przy każdym — którą wersję JS ma strona, błędy, migawka.
  {
    const { execSync } = require('child_process');
    const ost = execSync('git log -n 1 --format=%H -- zawodnik.html', { cwd: KORZEN }).toString().trim();
    const n1 = process.env.SMOKE_N1 || execSync('git rev-parse ' + ost + '~1', { cwd: KORZEN }).toString().trim();
    const katN1 = path.join(require('os').tmpdir(), 'smoke-n1-' + n1.slice(0, 7));
    if (!fs.existsSync(path.join(katN1, 'zawodnik.html'))) {
      fs.mkdirSync(katN1, { recursive: true });
      execSync('git archive ' + n1 + ' | tar -x -C "' + katN1.replace(/\\/g, '/') + '"', { cwd: KORZEN, shell: 'bash' });
    }
    STAN.korzen = katN1; STAN.wersja = ''; STAN.zrywaj.clear();
    const { ctx, tsStary } = await kontekstOnline(browser, true);
    const p = await ctx.newPage();
    const bledyG = [];
    p.on('pageerror', (e) => bledyG.push('[' + (p.url().split('/').pop() || '') + '] ' + String(e.message).slice(0, 140)));
    // TypeError z mieszanki wersji jest POŁYKANY przez try/catch loaderów (console.error, nie pageerror)
    p.on('console', (m) => { if (m.type() === 'error' && /TypeError|is not a function|undefined/.test(m.text())) bledyG.push('[console] ' + m.text().slice(0, 140)); });
    await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
    await czekajNaKontrole(p); await p.waitForTimeout(3000);
    const wersjaJS = () => p.evaluate(() => ({
      sbNowy: typeof window._tydzienWaw === 'function',
      dzisOfflineNowy: !!(window.DzisOffline && typeof window.DzisOffline.zakresyPlanu === 'function'),
      cacheSW: null,
    }));
    const stanMigawki = () => p.evaluate(([uid]) => { const r = localStorage.getItem('bm_dzis_migawka_' + uid); const m = r ? JSON.parse(r) : null; return m ? m.ts : null; }, [UID]);
    const nazwyCache = () => p.evaluate(async () => (await caches.keys()).filter((n) => /static/.test(n)));
    console.log('   [G] N-1 = ' + n1.slice(0, 7) + ', strona: ' + JSON.stringify(await wersjaJS()) + ', cache: ' + (await nazwyCache()).join(', '));
    // DEPLOY N — artefakt jak w deploy.yml: kopia drzewa roboczego bez zaplecza, potem
    // tools/wersjonuj-zasoby.js (adresy ?v=<hash>). SMOKE_G_BEZ_WERSJI=1 = artefakt BEZ ?v= (prod do 8.10).
    const katN = path.join(require('os').tmpdir(), 'smoke-n-' + process.pid);
    fs.rmSync(katN, { recursive: true, force: true });
    const pliki = execSync('git ls-files', { cwd: KORZEN }).toString().split(/\r?\n/).filter((f) => f && !/^(tests|tools|docs|\.ai|supabase|\.github)\//.test(f) && f !== 'journal.txt');
    for (const f of pliki) { const z = path.join(KORZEN, f); if (!fs.existsSync(z)) continue; fs.mkdirSync(path.dirname(path.join(katN, f)), { recursive: true }); fs.copyFileSync(z, path.join(katN, f)); }
    const zWersja = !process.env.SMOKE_G_BEZ_WERSJI;
    if (zWersja) require('./wersjonuj-zasoby.js').wersjonuj(katN);
    console.log('   [G] wersja N: ' + (zWersja ? 'artefakt z ?v=<hash> (wersjonuj-zasoby)' : 'artefakt BEZ ?v= (SMOKE_G_BEZ_WERSJI)'));
    STAN.korzen = katN; STAN.wersja = '-deployG';
    let zmian = 0;
    await p.exposeFunction('__zmianaKontrolera', () => { zmian++; }).catch(() => {});
    const hm = (t) => (t ? new Date(t).toTimeString().slice(0, 8) : String(t));
    const wejscia = [];
    for (let i = 1; i <= 3; i++) {
      const ts0 = await stanMigawki();
      await p.evaluate(([uid, t]) => { const m = JSON.parse(localStorage.getItem('bm_dzis_migawka_' + uid)); m.ts = t; localStorage.setItem('bm_dzis_migawka_' + uid, JSON.stringify(m)); }, [UID, tsStary]);
      const bl0 = bledyG.length;
      await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
      await p.evaluate(() => navigator.serviceWorker.addEventListener('controllerchange', () => window.__zmianaKontrolera && window.__zmianaKontrolera()));
      await p.waitForTimeout(9000);
      const w = await wersjaJS();
      const ts = await stanMigawki();
      const r = { i, ...w, migawkaOdswiezona: ts > tsStary + 60000, ts: hm(ts), bledy: bledyG.slice(bl0, bl0 + 3), cache: await nazwyCache(), zmianKontrolera: zmian };
      wejscia.push(r);
      console.log('   [G] wejście ' + i + ' po deployu: ' + JSON.stringify(r));
    }
    // Plan po trzecim wejściu
    const bl1 = bledyG.length;
    await p.goto(baza + '/kalendarz.html?role=athlete', { waitUntil: 'load' }); await p.waitForTimeout(5000);
    const plan = await p.evaluate(() => ({ dzisOfflineNowy: !!(window.DzisOffline && typeof window.DzisOffline.zakresyPlanu === 'function'), calPoPowrocie: typeof window._calPoPowrocie }));
    console.log('   [G] Plan po deployu: ' + JSON.stringify(plan) + ' błędy: ' + JSON.stringify(bledyG.slice(bl1, bl1 + 3)));
    const w1 = wejscia[0];
    sprawdz('SW G: pierwsze wejście po deployu — strona ma JS wersji N (sb.js i dzis-offline.js), bez błędów, migawka zapisana',
      w1.sbNowy && w1.dzisOfflineNowy && w1.bledy.length === 0 && w1.migawkaOdswiezona, JSON.stringify(w1).slice(0, 220));
    sprawdz('SW G: kolejne wejścia po deployu — JS wersji N, migawka zapisana', wejscia.slice(1).every((w) => w.sbNowy && w.dzisOfflineNowy && w.migawkaOdswiezona && w.bledy.length === 0),
      wejscia.slice(1).map((w) => 'wejście ' + w.i + ': sb ' + (w.sbNowy ? 'N' : 'N-1') + ', dzis-offline ' + (w.dzisOfflineNowy ? 'N' : 'N-1') + ', migawka ' + (w.migawkaOdswiezona ? 'tak' : 'NIE') + ', błędów ' + w.bledy.length).join(' | '));
    sprawdz('SW G: nowa wersja SW zainstalowana i aktywna (cache wersji N)', wejscia[2].cache.some((n) => /deployG/.test(n)) && !wejscia[2].cache.some((n) => !/deployG/.test(n)), wejscia[2].cache.join(', ') + ' | controllerchange ' + zmian);
    // po deployu OFFLINE: Plan i „Dziś" z precache (adresy ?v= muszą trafić dokładnie).
    // Atrapa Supabase (ctx.route) odpowiadałaby mimo setOffline — odpinamy ją; obce hosty i tak nierozwiązywalne.
    await ctx.unrouteAll({ behavior: 'ignoreErrors' });
    const rOff = await offlineNaPlan(ctx, p, 'G');
    console.log('   [G] Plan offline po deployu: ' + opis(rOff));
    sprawdz('SW G: po deployu Plan offline z precache (nowy kod Planu: bieżący tydzień bez dni „niedostępny")', toPlan(rOff) && !/niedostępny/.test(rOff.dni || ''), opis(rOff));
    STAN.martwy = true; await ctx.setOffline(true);
    await p.goto(baza + '/zawodnik.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(6000);
    const dOff = await p.evaluate(() => ({ sbNowy: typeof window._tydzienWaw === 'function', modul: !!window.DzisOffline,
      pasek: (document.getElementById('bm-offline-pasek') || {}).innerText || null, logi: ((document.getElementById('log-list') || {}).innerText || '').slice(0, 60) })).catch((e) => ({ blad: e.message }));
    STAN.martwy = false; await ctx.setOffline(false);
    sprawdz('SW G: po deployu „Dziś" offline — JS wersji N z precache, pasek, lista', dOff.sbNowy && dOff.modul && /Offline · dane z/.test(dOff.pasek || '') && /Log online/.test(dOff.logi || ''), JSON.stringify(dOff));
    STAN.wersja = ''; STAN.korzen = null;
    await ctx.close();
    fs.rmSync(katN, { recursive: true, force: true });
  }

  // ── H: STARY DOKUMENT WZNOWIONY PO DEPLOYU (08.10.2026, sb.js bmPowrotSprawdzWersje) ──
  //    Obie wersje = artefakt drzewa roboczego po tools/wersjonuj-zasoby.js; N różni się znacznikiem w sb.js
  //    (window.__wersjaN) i CACHE_VERSION — jak prawdziwy deploy. Dokument wersji N-1 zostaje otwarty,
  //    serwer przechodzi na N, potem „powrót z tła" (visibilitychange). Wiek dokumentu ustawiany przez
  //    window._bmStartDokumentu (zamiast czekać 30 min).
  {
    const { execSync } = require('child_process');
    const artefakt = (nazwa, dopisekSb) => {
      const kat = path.join(require('os').tmpdir(), 'smoke-h-' + nazwa + '-' + process.pid);
      fs.rmSync(kat, { recursive: true, force: true });
      const pliki = execSync('git ls-files', { cwd: KORZEN }).toString().split(/\r?\n/).filter((f) => f && !/^(tests|tools|docs|\.ai|supabase|\.github)\//.test(f) && f !== 'journal.txt');
      for (const f of pliki) { const z = path.join(KORZEN, f); if (!fs.existsSync(z)) continue; fs.mkdirSync(path.dirname(path.join(kat, f)), { recursive: true }); fs.copyFileSync(z, path.join(kat, f)); }
      if (dopisekSb) fs.appendFileSync(path.join(kat, 'sb.js'), dopisekSb);
      require('./wersjonuj-zasoby.js').wersjonuj(kat);
      return kat;
    };
    const katA = artefakt('n1', ''), katB = artefakt('n', '\n;window.__wersjaN = true;\n');
    const powrot = (p) => p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const przebieg = async (et, { wiekMin, brudnePole }) => {
      STAN.korzen = katA; STAN.wersja = '-H1'; STAN.zrywaj.clear();
      const { ctx } = await kontekstOnline(browser, true);
      const p = await ctx.newPage();
      await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
      await czekajNaKontrole(p);
      // dokument, który WSTAŁ pod kontrolą SW (jak u ludzi) — tylko wtedy jest wersja startowa
      await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3000);
      await p.evaluate(([wiek, brudne]) => {
        window.__dokumentH = 'stary';
        window._bmStartDokumentu = Date.now() - wiek * 60000;
        if (brudne) { const i = document.createElement('input'); i.id = 'h-pole'; i.type = 'text'; document.body.appendChild(i); i.value = 'wpisane 12,4 km'; }
      }, [wiekMin, !!brudnePole]);
      const start = await p.evaluate(() => ({ wersjaStartu: window._bmWersjaStartu, n: !!window.__wersjaN }));
      STAN.korzen = katB; STAN.wersja = '-H2';                       // DEPLOY N
      const nawigacja = p.waitForNavigation({ timeout: 15000 }).then(() => true).catch(() => false);
      await powrot(p);
      const przeladowano = await nawigacja;
      await p.waitForTimeout(3000);
      const po = await p.evaluate(() => ({ dokument: window.__dokumentH || 'NOWY', kodN: !!window.__wersjaN, pasek: !!document.getElementById('bm-nowa-wersja'),
        pole: (document.getElementById('h-pole') || {}).value || null }));
      console.log('   [H ' + et + '] start ' + JSON.stringify(start) + ' | przeładowanie ' + przeladowano + ' | po ' + JSON.stringify(po));
      await ctx.close();
      return { przeladowano, ...po, start };
    };
    const h1 = await przebieg('>30 min', { wiekMin: 31 });
    sprawdz('SW H1: dokument N-1 (> 30 min) wznowiony po deployu N → jedno przeładowanie, po powrocie kod N', h1.przeladowano && h1.dokument === 'NOWY' && h1.kodN && !!h1.start.wersjaStartu,
      'przeładowanie=' + h1.przeladowano + ', kod N=' + h1.kodN + ', wersja startu=' + h1.start.wersjaStartu);
    const h2 = await przebieg('<30 min', { wiekMin: 5 });
    sprawdz('SW H2: dokument < 30 min — bez przeładowania (ten sam dokument)', !h2.przeladowano && h2.dokument === 'stary', 'przeładowanie=' + h2.przeladowano + ', dokument ' + h2.dokument);
    const h3 = await przebieg('>30 min + wpisane pole', { wiekMin: 31, brudnePole: true });
    sprawdz('SW H3: > 30 min, ale niezapisana treść w polu — bez przeładowania, pasek „Nowa wersja"', !h3.przeladowano && h3.dokument === 'stary' && h3.pole === 'wpisane 12,4 km' && h3.pasek,
      'przeładowanie=' + h3.przeladowano + ', pole=' + h3.pole + ', pasek=' + h3.pasek);
    STAN.korzen = null; STAN.wersja = '';
    fs.rmSync(katA, { recursive: true, force: true }); fs.rmSync(katB, { recursive: true, force: true });
  }

  // ── E: niekrytyczna strona z poprzedniej wersji ──
  {
    STAN.wersja = ''; STAN.zrywaj.clear();
    const ctx = await nowyKontekst(); const p = await ctx.newPage();
    await p.goto(baza + '/zawodnik.html', { waitUntil: 'load' });
    await czekajNaKontrole(p); await p.waitForTimeout(1000);
    STAN.wersja = '-deployE'; STAN.zrywaj.add('/profil.html');
    const zmiana = p.evaluate(() => new Promise((ok) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => ok('controllerchange'), { once: true });
      setTimeout(() => ok('brak controllerchange w 15 s'), 15000);
    }));
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update())).catch(() => {});
    const zm = await zmiana; await p.waitForTimeout(1500); STAN.zrywaj.clear();
    const po = await zawartoscStatic(p);
    const nowa = Object.keys(po.statyczne).find((n) => /deployE/.test(n));
    const k = (nowa && po.statyczne[nowa]) || [];
    console.log('   [E] ' + zm + ' | nowa: ' + nowa + ' ' + k.length + ' wpisów, profil=' + k.includes('/profil.html') + ' | wszystkie: ' + Object.keys(po.statyczne).join(', '));
    sprawdz('SW E: deploy z nieudaną stroną niekrytyczną instaluje się, strona z poprzedniej wersji', zm === 'controllerchange' && k.includes('/profil.html') && k.includes('/kalendarz.html'),
      zm + ' | ' + k.length + ' wpisów, profil=' + k.includes('/profil.html'));
    await ctx.close();
  }

  await browser.close(); srv.close();
  console.log('\n  SMOKE OFFLINE — tryb z Service Workerem (Chromium, prawdziwy sw.js)\n');
  for (const w of wyniki) console.log('  ' + (w.ok ? 'OK  ' : 'BŁĄD') + '  ' + w.nazwa + (w.szczegol ? '  — ' + String(w.szczegol).replace(/\s+/g, ' ').slice(0, 220) : ''));
  console.log('\n  Zrzuty: ' + ZRZUTY);
  process.exit(wyniki.every((w) => w.ok) ? 0 : 1);
}
if (process.env.SMOKE_SW) { trybSW().catch((e) => { console.error(e); process.exit(2); }); }
else
(async () => {
  const srv = await serwer();
  const baza = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36' });
  const M = migawka(), S = sesja();
  await ctx.addInitScript(([m, s, uid]) => {
    try {
      localStorage.setItem('sb-afqojgkaveykxbltxzwm-auth-token', JSON.stringify(s));
      localStorage.setItem('bm_dzis_migawka_' + uid, JSON.stringify(m));
      localStorage.setItem('terms_accepted_at_pending', '');
    } catch (e) {}
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
    window.__odrzucenia = [];
    window.addEventListener('unhandledrejection', (e) => { window.__odrzucenia.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason)); });
  }, [M, S, UID]);
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
    return route.abort('internetdisconnected');
  });

  const bledy = [];
  const wyniki = [];
  const sprawdz = (nazwa, ok, szczegol) => { wyniki.push({ nazwa, ok: !!ok, szczegol }); };

  // ── „DZIŚ" ──
  const p = await ctx.newPage();
  p.on('pageerror', (e) => bledy.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  p.on('console', (m) => {
    if (process.env.SMOKE_GLOSNO && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) console.log('   [dziś console.' + m.type() + '] ' + m.text().slice(0, 240));
    if (m.type() === 'error') bledy.push('console.error: ' + m.text().slice(0, 300));
  });
  await p.goto(baza + '/zawodnik.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  if (process.env.SMOKE_GLOSNO) {
    // SONDA: czy pojedyncze zapytanie supabase-js offline KOŃCZY SIĘ (błędem), czy wisi; ile trwa getSession/userId.
    const sonda = await p.evaluate(async () => {
      const zLimitem = (pr, ms) => Promise.race([pr.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) })), new Promise((r) => setTimeout(() => r({ wisi: ms + ' ms' }), ms))]);
      const t0 = performance.now();
      const q = await zLimitem(sb.from('athletes').select('id').limit(1), 4000);
      const t1 = performance.now();
      const s = await zLimitem(sb.auth.getSession(), 4000);
      const t2 = performance.now();
      const u = await zLimitem(DzisOffline.userId(sb), 4000);
      return { rest: q.wisi || (q.ok ? 'error=' + JSON.stringify(q.v && q.v.error).slice(0, 120) : q.e), restMs: Math.round(t1 - t0),
               getSession: s.wisi || (s.ok ? 'sesja=' + !!(s.v && s.v.data && s.v.data.session) : s.e), sesjaMs: Math.round(t2 - t1),
               userId: u.wisi || (u.ok ? u.v : u.e), loadLogsRunning: !!window._loadLogsRunning };
    });
    console.log('   [SONDA] ' + JSON.stringify(sonda));
  }
  const dz = await p.evaluate(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? e.innerText.trim() : null; };
    const ws = document.querySelector('.week-sum');
    const hero = document.getElementById('today-hero-bg');
    const karty = [...document.querySelectorAll('#log-list [style*="background-image"], #week-strip [style*="background-image"]')]
      .map((e) => getComputedStyle(e).backgroundImage).filter((b) => /url\(|gradient/.test(b) && !/rgba\(7, 5, 12/.test(b));
    return {
      pasek: t('bm-offline-pasek'),
      heroBg: hero ? getComputedStyle(hero).backgroundImage : null,
      heroOpacity: hero ? getComputedStyle(hero).opacity : null,
      logList: (t('log-list') || '').slice(0, 300),
      szkieletLogi: !!document.querySelector('#log-list .skeleton, #log-list [class*="skel"]'),
      weekStrip: (t('week-strip') || '').slice(0, 300),
      szkieletTydzien: !!document.querySelector('#week-strip .skeleton, #week-strip [class*="skel"]'),
      wsDays: t('ws-days'), ringPct: t('ring-pct'), wsKm: t('ws-km'), weekSumWidoczny: ws ? getComputedStyle(ws).display !== 'none' : null,
      coachVis: (() => { const e = document.getElementById('coach-msg-section'); return e ? getComputedStyle(e).display : null; })(),
      coachBody: t('coach-body'),
      todayDesc: t('today-desc'),
      kartyBg: karty,
      skroty: [...document.querySelectorAll('#home-tiles-row-right .ht-tile')].map((b) => {
        const img = b.querySelector('img'), zap = b.querySelector('[data-ic-zapas]');
        return { lbl: (b.querySelector('.ht-lbl') || {}).innerText, zepsuty: !!img && img.complete && img.naturalWidth === 0, zapas: zap ? zap.textContent : null, obraz: !!img && img.naturalWidth > 0 };
      }),
      odrzucenia: window.__odrzucenia,
      athleteId: typeof _athleteId !== 'undefined' ? _athleteId : '(niezdefiniowane)',
    };
  });
  await p.screenshot({ path: path.join(ZRZUTY, 'dzis-offline.png'), fullPage: true });
  sprawdz('pasek „Offline · dane z"', /Offline · dane z/.test(dz.pasek || ''), dz.pasek);
  sprawdz('_athleteId z migawki', dz.athleteId === AID, dz.athleteId);
  sprawdz('hero ma obraz (nie none)', dz.heroBg && dz.heroBg !== 'none', dz.heroBg && dz.heroBg.slice(0, 120));
  sprawdz('lista treningów z migawki', /Log 1|Spokojny|Tempo/.test(dz.logList) && !dz.szkieletLogi, dz.logList.slice(0, 120));
  sprawdz('„Ten tydzień" bez szkieletu, dni z migawki', !dz.szkieletTydzien && /Tempo|Spokojny|Interwały/.test(dz.weekStrip), dz.weekStrip.slice(0, 160));
  sprawdz('„Postęp tygodnia" bez „Ładowanie…"', dz.wsDays && !/Ładowanie/.test(dz.wsDays), dz.wsDays + ' | ' + dz.ringPct + ' | widoczny=' + dz.weekSumWidoczny);
  sprawdz('treść wiadomości trenera', /offline test wiadomości trenera/.test(dz.coachBody || ''), (dz.coachVis || '') + ' | ' + (dz.coachBody || '').slice(0, 80));
  // Offline biegamy-assets jest odcięte, więc tło wskazujące tam = czarna karta. Wymagane: gradient
  // zapasowy albo obraz z własnego originu. (Wcześniejsza wersja sprawdzała tylko „nie none" — przechodziła
  // przy czarnych kartach, bo CSS nadal wskazywał na nieosiągalny URL.)
  const czarne = dz.kartyBg.filter((b) => !b || b === 'none' || /github\.io/.test(b));
  sprawdz('karty treningów i tygodnia bez czarnego tła (gradient albo obraz z własnego originu)', dz.kartyBg.length > 0 && czarne.length === 0, dz.kartyBg.length + ' kart, czarnych ' + czarne.length);
  // Kolumna skrótów obok hero: ikony 3D z biegamy-assets. Offline = brak w cache → <img> ma się zamienić
  // na emoji (sb.js _icZapas). Nigdy ikona „zepsutego obrazka” (img załadowany, naturalWidth 0).
  const zepsute = dz.skroty.filter((x) => x.zepsuty || (!x.zapas && !x.obraz));
  sprawdz('ikony skrótów obok hero bez „zepsutego obrazka” (emoji albo obraz)', dz.skroty.length === 5 && zepsute.length === 0,
    dz.skroty.map((x) => x.lbl + '=' + (x.zapas || (x.obraz ? 'obraz' : 'ZEPSUTA'))).join(', '));
  sprawdz('zero nieobsłużonych odrzuceń', dz.odrzucenia.length === 0, dz.odrzucenia.slice(0, 3).join(' || '));

  // ── PLAN ──
  const k = await ctx.newPage();
  k.on('pageerror', (e) => bledy.push('kalendarz pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await k.goto(baza + '/kalendarz.html?role=athlete', { waitUntil: 'domcontentloaded' });
  await k.waitForTimeout(7000);
  const pl = await k.evaluate(() => {
    const c = document.getElementById('mobile-days-container');
    return { tekst: c ? c.innerText.slice(0, 600) : null, pasek: (document.getElementById('bm-offline-pasek') || {}).innerText || null,
             niedostepnych: c ? (c.innerText.match(/ten dzień niedostępny offline/g) || []).length : 0, offline: !!window._calOffline };
  });
  await k.screenshot({ path: path.join(ZRZUTY, 'plan-offline.png'), fullPage: true });
  sprawdz('Plan: tryb offline aktywny', pl.offline, JSON.stringify(pl).slice(0, 160));
  sprawdz('Plan: dni z migawki widoczne (Tempo/Spokojny)', /Tempo|Spokojny|Interwały/.test(pl.tekst || ''), (pl.tekst || '').slice(0, 120));
  sprawdz('Plan: pasek offline', /Offline · dane z/.test(pl.pasek || ''), pl.pasek);
  {
    const poniedzialekDzis = new Date().getDay() === 1;
    sprawdz('Plan: dni bieżącego tygodnia sprzed dziś z „postep" (pn: Wybieganie 21 km), zero „niedostępny" w tym tygodniu',
      pl.niedostepnych === 0 && (poniedzialekDzis || /21 km/.test(pl.tekst || '')), 'niedostępnych ' + pl.niedostepnych + ' | ' + (pl.tekst || '').replace(/\s+/g, ' ').slice(0, 90));
  }

  // ── ONLINE: odświeżenie migawki ──
  {
    const { ctx: c2, tsStary } = await kontekstOnline(browser, false);
    const { p: pOn, st } = await scenariuszOnline(c2, baza, 'bez SW');
    sprawdzOnline(sprawdz, 'Online', st, tsStary);
    // WZNOWIENIE Z TŁA (08.10.2026, przyczyna „dane z 01:53"): aplikacja przywrócona z tła to TEN SAM
    // dokument. Powrót przy sieci po > 10 min (albo po zmianie dnia) ma odświeżyć dane i migawkę BEZ
    // przeładowania — znacznik na window musi przetrwać. Powrót po < 10 min — nic nie pobiera.
    const powrot = () => pOn.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hm = (t) => (t ? new Date(t).toTimeString().slice(0, 5) : String(t));
    const migTs = () => pOn.evaluate(([uid]) => JSON.parse(localStorage.getItem('bm_dzis_migawka_' + uid)).ts, [UID]);
    await pOn.evaluate(() => { window.__znacznikDokumentu = 'ten-sam-' + Math.random(); });
    const znacznik = await pOn.evaluate(() => window.__znacznikDokumentu);
    // (a) < 10 min od ostatniego ładowania — bez odświeżenia
    const logiPrzedA = LICZNIK_REST.training_logs || 0;
    await powrot(); await pOn.waitForTimeout(2500);
    sprawdz('Wznowienie < 10 min: bez pobierania (dane świeże)', (LICZNIK_REST.training_logs || 0) === logiPrzedA, 'GET training_logs +' + ((LICZNIK_REST.training_logs || 0) - logiPrzedA));
    // (b) > 10 min: ts migawki i _dzisZaladowano cofnięte o 11 min / 5 h
    await pOn.evaluate(([uid, t]) => {
      const m = JSON.parse(localStorage.getItem('bm_dzis_migawka_' + uid)); m.ts = t; localStorage.setItem('bm_dzis_migawka_' + uid, JSON.stringify(m));
      if (window._dzisZaladowano) window._dzisZaladowano.ts = Date.now() - 11 * 60 * 1000;
    }, [UID, tsStary]);
    const logiPrzedB = LICZNIK_REST.training_logs || 0;
    await powrot(); await pOn.waitForTimeout(6000);
    const tsPo = await migTs();
    const poB = await pOn.evaluate(() => ({ z: window.__znacznikDokumentu, pasek: (document.getElementById('bm-offline-pasek') || {}).innerText || null }));
    sprawdz('Wznowienie > 10 min: migawka i ts odświeżone bez przeładowania (ten sam window)', tsPo > tsStary + 60000 && poB.z === znacznik && (LICZNIK_REST.training_logs || 0) > logiPrzedB,
      'ts ' + hm(tsStary) + ' → ' + hm(tsPo) + ', window ' + (poB.z === znacznik ? 'ten sam' : 'NOWY') + ', GET training_logs +' + ((LICZNIK_REST.training_logs || 0) - logiPrzedB));
    // (c) zmiana dnia przy < 10 min: odświeżenie + data w nagłówku
    await pOn.evaluate(() => {
      if (window._dzisZaladowano) window._dzisZaladowano.dzien = '2000-01-01';
      const el = document.getElementById('today-date'); if (el) el.textContent = 'WCZORAJ';
    });
    const logiPrzedC = LICZNIK_REST.training_logs || 0;
    await powrot(); await pOn.waitForTimeout(6000);
    const poC = await pOn.evaluate(() => ({ data: (document.getElementById('today-date') || {}).textContent, z: window.__znacznikDokumentu }));
    sprawdz('Wznowienie po zmianie dnia: odświeżenie i data w nagłówku', poC.data !== 'WCZORAJ' && /\d{4}/.test(poC.data || '') && (LICZNIK_REST.training_logs || 0) > logiPrzedC && poC.z === znacznik,
      'nagłówek „' + poC.data + '", GET training_logs +' + ((LICZNIK_REST.training_logs || 0) - logiPrzedC));
    // (d) Plan (kalendarz.html, zawodnik): powrót po > 10 min → ponowne pobranie treningów, ten sam window
    await pOn.goto(baza + '/kalendarz.html?role=athlete', { waitUntil: 'load' });
    await pOn.waitForTimeout(5000);
    await pOn.evaluate(() => { window.__znacznikPlanu = 'plan-' + Math.random(); if (window._calZaladowano) window._calZaladowano.ts = Date.now() - 11 * 60 * 1000; });
    const zPlan = await pOn.evaluate(() => [window.__znacznikPlanu, !!window._calZaladowano]);
    const trPrzed = LICZNIK_REST.trainings || 0;
    await powrot(); await pOn.waitForTimeout(5000);
    const poD = await pOn.evaluate(() => window.__znacznikPlanu);
    sprawdz('Plan: wznowienie > 10 min pobiera treningi ponownie, bez przeładowania', zPlan[1] && poD === zPlan[0] && (LICZNIK_REST.trainings || 0) > trPrzed,
      '_calZaladowano=' + zPlan[1] + ', GET trainings +' + ((LICZNIK_REST.trainings || 0) - trPrzed) + ', window ' + (poD === zPlan[0] ? 'ten sam' : 'NOWY'));
    // (e) potem tryb samolotowy → Plan: pasek z godziną ODŚWIEŻONEJ migawki (dawniej „dane z 01:53")
    await c2.unrouteAll({ behavior: 'ignoreErrors' });
    await c2.route((u) => !/127\.0\.0\.1|localhost/.test(String(u)), (route) => route.abort('internetdisconnected'));
    await pOn.goto(baza + '/kalendarz.html?role=athlete', { waitUntil: 'domcontentloaded' });
    await pOn.waitForTimeout(12000);   // navigator.onLine = true → postgrest-js ponawia 1+2+4 s przed błędem
    const pasekPlanu = await pOn.evaluate(() => (document.getElementById('bm-offline-pasek') || {}).innerText || null);
    const tsKoniec = await migTs();
    sprawdz('Po wznowieniu i odcięciu sieci Plan pokazuje godzinę odświeżonej migawki', pasekPlanu === 'Offline · dane z ' + hm(tsKoniec) && tsKoniec > tsStary + 60000, pasekPlanu + ' (migawka ' + hm(tsKoniec) + ')');
    await c2.close();
  }

  await browser.close(); srv.close();
  console.log('\n  SMOKE OFFLINE — „Dziś" i Plan (Chromium, Android UA, bez SW)\n');
  for (const w of wyniki) console.log('  ' + (w.ok ? 'OK  ' : 'BŁĄD') + '  ' + w.nazwa + (w.szczegol ? '  — ' + String(w.szczegol).replace(/\s+/g, ' ').slice(0, 150) : ''));
  const istotne = bledy.filter((b) => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(b));
  console.log('\n  Błędy konsoli/strony (bez samych odmów sieci): ' + istotne.length);
  istotne.slice(0, 25).forEach((b) => console.log('    ' + b));
  console.log('\n  Zrzuty: ' + ZRZUTY);
  process.exit(wyniki.every((w) => w.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
