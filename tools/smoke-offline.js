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
const STAN = { martwy: false, wersja: '', zrywaj: new Set(), log: [] };
function serwer() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      STAN.log.push((STAN.martwy ? 'ZERWANE ' : '') + p);
      if (STAN.martwy || STAN.zrywaj.has(p)) { req.socket.destroy(); return; }
      const plik = path.join(KORZEN, p === '/' ? 'index.html' : p);
      if (!plik.startsWith(KORZEN) || !fs.existsSync(plik) || fs.statSync(plik).isDirectory()) { res.writeHead(404); return res.end(); }
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
  const tydzien = [0, 1, 3, 5, 8, 12].map((n, i) => ({ id: 'tr' + i, athlete_id: AID, date: plusDni(n), type: ['Tempo', 'Spokojny', 'Interwały', 'Wybieganie', 'Regeneracja', 'Spokojny'][i],
    distance_km: [8, 10, 7, 18, 6, 9][i], pace: '5:10', heart_rate: null, description: 'Opis ' + i, status: 'planned', coach_id: 'c0ac0000-0000-0000-0000-000000000000' }));
  const logi = [1, 2, 3, 4, 5].map((n) => ({ id: 'lg' + n, athlete_id: AID, logged_at: new Date(Date.now() - n * 86400000).toISOString(), training_type: n % 2 ? 'Spokojny' : 'Tempo',
    distance_km: 5 + n, pace: '5:30', duration: '0:40:00', feel: 'dobrze', comment: 'Log ' + n, attachment_url: null, card_bg_url: null, source: 'manual' }));
  const czesci = {
    zawodnik: { id: AID, full_name: 'Test Offline' },
    logi, dzis: tydzien[0], tydzien, trener: true,
    postep: { trainings: tydzien.slice(0, 3), logs: logi.slice(0, 2).map((l) => ({ distance_km: l.distance_km, training_type: l.training_type })) },
    wiadomosc: { body: 'Dzień dobry — offline test wiadomości trenera.', sent_at: new Date(ts).toISOString() },
    hero: 'https://filipjanczak1989-png.github.io/biegamy-assets/solo-01.webp',
  };
  return { userId: UID, ts, tydzienOd: dzis, czesci };
}

function sesja() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' }) + '.podpis';
  return { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 604800, expires_at: exp,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'offline@test.local', user_metadata: { full_name: 'Test Offline' }, app_metadata: {} } };
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

  await browser.close(); srv.close();
  console.log('\n  SMOKE OFFLINE — „Dziś" i Plan (Chromium, Android UA, bez SW)\n');
  for (const w of wyniki) console.log('  ' + (w.ok ? 'OK  ' : 'BŁĄD') + '  ' + w.nazwa + (w.szczegol ? '  — ' + String(w.szczegol).replace(/\s+/g, ' ').slice(0, 150) : ''));
  const istotne = bledy.filter((b) => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(b));
  console.log('\n  Błędy konsoli/strony (bez samych odmów sieci): ' + istotne.length);
  istotne.slice(0, 25).forEach((b) => console.log('    ' + b));
  console.log('\n  Zrzuty: ' + ZRZUTY);
  process.exit(wyniki.every((w) => w.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
