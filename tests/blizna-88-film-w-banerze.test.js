/* BLIZNA 88 (1.11.2026, FILM-01) — film raz dziennie w GÓRNYM BANERZE z cytatem (#daily-motivation), nie w dużym kadrze.

   Ryzyka:
   1) film gra mimo prefers-reduced-motion / Save-Data / offline albo drugi raz tego samego dnia; localStorage rzucający
      wyjątek (tryb prywatny) wywraca Dziś;
   2) film zmienia wysokość banera albo zasłania cytat na stałe (po końcu / tapnięciu cytat ma wrócić); dźwięk;
   3) kadr (FILM-02): 50% 12% → od 6,88 s 50% 0% → od 8,3 s 50% 72% — zmiana przez timeupdate z przejściem CSS;
   7) (FILM-02 z dźwiękiem) start ZAWSZE wyciszony; 🔊 44 px w rogu banera przełącza muted na tym samym <video>, pojawia
      się z filmem, znika po końcu; ?film=1 pomija „raz dziennie" (test), ale nie reduced-motion / Save-Data / offline;
   4) duży kadr dnia 9:16 (#today-hero) nietknięty;
   5) SW: filmy poza precache, osobny cache max 3, przeżywa deploy; z cache oddaje poprawne 206 (Range); radio dalej
      idzie prosto do sieci;
   6) (poprawka 1.11 wieczór, „przycina na starcie") wideo niewidoczne do 'canplaythrough', bez autoplay, preload 'auto'
      dopiero po wyrenderowaniu banera, fade-in 0,3 s, plakat = klatka 0; brak gotowości w 4 s → cytat, dzień NIE zużyty. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const TERAZ = new Date('2026-11-01T10:00:00');

function el(tag) {
  const e = { tag, style: {}, dataset: {}, dzieci: [], atrybuty: {}, h: {}, parentNode: null,
    setAttribute(k, v) { this.atrybuty[k] = v; }, appendChild(c) { c.parentNode = this; this.dzieci.push(c); return c; },
    removeChild(c) { this.dzieci = this.dzieci.filter((x) => x !== c); c.parentNode = null; },
    addEventListener(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); }, emit(ev, x) { (this.h[ev] || []).forEach((f) => f(x || {})); },
    querySelector(s) { return s === '.film-dzis' ? this.dzieci.find((d) => d.className === 'film-dzis') || null : null; } };
  return e;
}
function srodowisko({ ruch = false, saveData = false, online = true, zapis = null, rzuca = false, play = 'ok' } = {}) {
  const ctx = zaladujSb();
  const mag = new Map(zapis ? [['film_dzis', zapis]] : []);
  ctx.localStorage = rzuca ? { getItem() { throw new Error('prywatny'); }, setItem() { throw new Error('prywatny'); } }
    : { getItem: (k) => (mag.has(k) ? mag.get(k) : null), setItem: (k, v) => mag.set(k, v) };
  ctx.matchMedia = (q) => ({ matches: ruch && /reduce/.test(q) });
  ctx.navigator = { onLine: online, connection: { saveData } };
  ctx.document.createElement = (t) => { const e = el(t); if (t === 'video') { e.pause = () => { e.pauza = true; }; e.load = () => { e.zaladowano = (e.zaladowano || 0) + 1; };
    e.play = () => { e.grano = (e.grano || 0) + 1; return play === 'ok' ? Promise.resolve() : Promise.reject(new Error('autoplay')); }; } return e; };
  // timery pod kontrolą testu: uplyw(ms) odpala zaplanowane do tej chwili (koniec filmu 520 ms, limit gotowości 4000 ms)
  let zegar = 0; const timery = [];
  ctx.setTimeout = (fn, ms) => { timery.push({ fn, t: zegar + (ms || 0) }); return timery.length; };
  ctx.requestAnimationFrame = (fn) => fn();
  const uplyw = (ms) => { zegar += ms; for (;;) { const i = timery.findIndex((x) => x.t <= zegar); if (i < 0) break; timery.splice(i, 1)[0].fn(); } };
  return { ctx, mag, baner: el('div'), uplyw };
}

test('(1) warunki: reduced-motion, Save-Data, offline, już dziś → nie gra; localStorage rzucający → gra bez wyjątku', () => {
  for (const [opcje, powod] of [[{ ruch: true }, 'reduced-motion'], [{ saveData: true }, 'save-data'], [{ online: false }, 'offline'], [{ zapis: '2026-11-01' }, 'juz-dzis']]) {
    const s = srodowisko(opcje);
    assert.equal(s.ctx.FILM_DZIS.powodBlokady(TERAZ), powod);
    assert.equal(s.ctx.FILM_DZIS.start(s.baner, TERAZ), null);
    assert.equal(s.baner.dataset.film, powod); assert.equal(s.baner.dzieci.length, 0, 'baner bez filmu — cytat jak zawsze');
  }
  assert.equal(srodowisko({ zapis: '2026-10-31' }).ctx.FILM_DZIS.powodBlokady(TERAZ), null, 'wczoraj → dziś znowu');
  const p = srodowisko({ rzuca: true });
  assert.equal(p.ctx.FILM_DZIS.powodBlokady(TERAZ), null);
  assert.ok(p.ctx.FILM_DZIS.start(p.baner, TERAZ));
});

test('(6) start: niewidoczne, bez autoplay; preload auto po wyrenderowaniu; play dopiero po canplaythrough; fade-in 0,3 s przy playing', async () => {
  const s = srodowisko();
  const v = s.ctx.FILM_DZIS.start(s.baner, TERAZ);
  assert.equal(v.autoplay, false); assert.match(v.style.cssText, /opacity:0;/); assert.match(v.style.cssText, /opacity \.3s ease/);
  assert.equal(v.preload, 'auto'); assert.equal(v.atrybuty.preload, 'auto'); assert.equal(v.zaladowano, 1, 'preload auto ustawione po klatce, potem load()');
  assert.equal(v.grano, undefined, 'przed canplaythrough nic nie gra'); assert.equal(s.baner.dataset.film, 'laduje');
  v.emit('canplaythrough'); v.emit('canplaythrough');
  assert.equal(v.grano, 1, 'play raz, po canplaythrough');
  assert.equal(v.style.opacity, undefined, 'nadal niewidoczne do „playing"');
  v.emit('playing');
  assert.equal(v.style.opacity, '1'); assert.equal(s.mag.get('film_dzis'), '2026-11-01');
  s.uplyw(5000);
  assert.equal(s.baner.dzieci.length, 2, 'limit 4 s nie dotyczy filmu, który już gra (film + 🔊)');
  assert.match(czytaj('tools/filmy/przygotuj.mjs'), /ff\(\["-i", wej, "-frames:v", "1"/, 'plakat z klatki 0 (bez -ss)');
});

test('(6) brak canplaythrough w 4 s → film znika, cytat zostaje, dzień NIE zużyty; jutro/później znowu można', () => {
  const s = srodowisko();
  const v = s.ctx.FILM_DZIS.start(s.baner, TERAZ);
  s.uplyw(3999);
  assert.equal(s.baner.dzieci.length, 2, 'film + 🔊 (niewidoczne) czekają');
  s.uplyw(1);
  assert.equal(s.baner.dataset.film, 'za-wolno'); assert.equal(v.grano, undefined);
  s.uplyw(600);
  assert.equal(s.baner.dzieci.length, 0, 'baner z cytatem jak zawsze');
  assert.equal(s.mag.get('film_dzis'), undefined, 'dzień nie zużyty');
  assert.equal(s.ctx.FILM_DZIS.powodBlokady(TERAZ), null);
  v.emit('canplaythrough');
  assert.equal(v.grano, undefined, 'spóźnione canplaythrough po rezygnacji nic nie odpala');
});

test('(2)(3) start: video muted/playsinline NA banerze (inset:0, cover), mp4+webm film-02 z biegamy-assets, pozycje 12% → 0% (6,88 s) → 72% (8,3 s), raz dziennie', async () => {
  const s = srodowisko();
  const v = s.ctx.FILM_DZIS.start(s.baner, TERAZ);
  assert.equal(v.tag, 'video'); assert.equal(s.baner.dzieci[0], v);
  assert.ok(v.muted && v.defaultMuted && v.playsInline && 'muted' in v.atrybuty && 'playsinline' in v.atrybuty, 'bez dźwięku, inline');
  assert.match(v.style.cssText, /position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;transition:object-position \.6s/);
  assert.deepEqual(v.dzieci.map((z) => [z.src, z.type]), [['https://filipjanczak1989-png.github.io/biegamy-assets/filmy/film-02.mp4', 'video/mp4'],
    ['https://filipjanczak1989-png.github.io/biegamy-assets/filmy/film-02.webm', 'video/webm']]);
  assert.equal(v.atrybuty.poster, 'https://filipjanczak1989-png.github.io/biegamy-assets/filmy/film-02-poster.jpg');
  for (const [t, p] of [[0, '50% 12%'], [6.87, '50% 12%'], [6.88, '50% 0%'], [8.29, '50% 0%'], [8.3, '50% 72%'], [9.9, '50% 72%']]) { v.currentTime = t; v.emit('timeupdate'); assert.equal(v.style.objectPosition, p, 't=' + t); }
  assert.equal(s.mag.get('film_dzis'), undefined, 'znacznik dopiero, gdy film naprawdę gra');
  v.emit('playing');
  assert.equal(s.mag.get('film_dzis'), '2026-11-01'); assert.equal(s.baner.dataset.film, 'gra');
  assert.equal(s.ctx.FILM_DZIS.start(s.baner, TERAZ), null, 'drugi film na tym samym banerze — nie');
  v.emit('ended');
  assert.equal(v.style.opacity, '0'); s.uplyw(520); assert.equal(s.baner.dzieci.length, 0, 'po końcu film znika — cytat pod spodem wraca'); assert.ok(v.pauza);
  assert.equal(srodowisko({ zapis: s.mag.get('film_dzis') }).ctx.FILM_DZIS.powodBlokady(TERAZ), 'juz-dzis');
});

test('(2) tap pomija (bez przeskoku kadru dnia), zablokowany autoplay i błąd pliku → od razu cytat', async () => {
  const s = srodowisko();
  const v = s.ctx.FILM_DZIS.start(s.baner, TERAZ);
  let zatrzymane = false;
  v.emit('click', { stopPropagation() { zatrzymane = true; } });
  s.uplyw(520); assert.ok(zatrzymane); assert.equal(s.baner.dzieci.length, 0);
  const a = srodowisko({ play: 'blokada' });
  a.ctx.FILM_DZIS.start(a.baner, TERAZ).emit('canplaythrough');
  await new Promise((r) => setImmediate(r)); a.uplyw(520);
  assert.equal(a.baner.dzieci.length, 0, 'autoplay odrzucony → cytat');
  assert.equal(a.mag.get('film_dzis'), undefined, 'nie zagrał → nie zużywa dnia');
  const b = srodowisko();
  const vb = b.ctx.FILM_DZIS.start(b.baner, TERAZ); vb.emit('error'); b.uplyw(520);
  assert.equal(b.baner.dzieci.length, 0);
});

test('(2)(4) zawodnik.html: film startuje z loadDailyMotivation na #daily-motivation; duży kadr #today-hero bez filmu', () => {
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function loadDailyMotivation()'), j = z.indexOf('\n}\n', i);
  assert.match(z.slice(i, j), /if \(window\.FILM_DZIS\) window\.FILM_DZIS\.start\(el\);/);
  assert.equal((z.match(/FILM_DZIS\.start\(/g) || []).length, 1, 'jedno miejsce startu');
  const hero = z.slice(z.indexOf('id="today-hero"'), z.indexOf('<!-- Kafelki po prawej -->'));
  assert.ok(!/video|FILM/i.test(hero), 'duży kadr bez zmian');
  const sb = czytaj('sb.js');
  assert.match(sb, /pozycje: \[\{ od: 0, pos: '50% 12%' \}, \{ od: 6\.88, pos: '50% 0%' \}, \{ od: 8\.3, pos: '50% 72%' \}\] \}/);
  const promo = sb.slice(sb.indexOf('window.FILMY_PROMO = ['), sb.indexOf('];', sb.indexOf('window.FILMY_PROMO = [')));
  assert.equal((promo.match(/\{ id: 'film-/g) || []).length, 1, 'tylko jeden film'); assert.match(promo, /id: 'film-02'/);
  assert.ok(!/film-0\d/.test(czytaj('sw.js').slice(czytaj('sw.js').indexOf('const PRECACHE_URLS'), czytaj('sw.js').indexOf('const PRECACHE_KRYTYCZNE'))), 'filmy poza precache');
});

test('(5) SW: osobny cache filmów (max 3, przeżywa deploy), zakresy 206/416, radio dalej bez SW', async () => {
  const sw = czytaj('sw.js');
  assert.match(sw, /const FILMY_CACHE = 'biegamy-filmy-v1';\nconst LIMIT_FILMOW = 3;/);
  assert.match(sw, /name !== ASSETS_CACHE && name !== FILMY_CACHE\)/);
  assert.ok(sw.indexOf('if (isFilmPromo(url))') < sw.indexOf("if (/\\.(mp4|m4a|mp3|webm|ogg|wav|aac|mov|m4v)$/i.test(url.pathname)) return;"), 'filmy przed ogólnym pominięciem mediów');
  const kod = ['function isFilmPromo', 'function zakresBajtow', 'async function filmZCache', 'async function pobierzFilm'].map((n) => sw.match(new RegExp(n.replace(/ /g, '\\s') + '\\([\\s\\S]*?\\n\\}\\n'))[0]).join('\n');
  const wlozone = [];
  const pliki = new Map();
  // jak Cache API: match oddaje za każdym razem NOWĄ odpowiedź (ciało do jednorazowego odczytu)
  const cacheAtrapa = { match: async (k) => (pliki.has(k) ? new Response(pliki.get(k).blob, { headers: pliki.get(k).h }) : null),
    put: async (k, r) => { wlozone.push(k); pliki.set(k, { blob: await r.blob(), h: Object.fromEntries(r.headers) }); } };
  const fetchAtrapa = async (u, o) => ({ status: 200, headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '10' }), blob: async () => new Blob(['0123456789']), siec: true, init: o });
  const f = new Function('caches', 'fetch', 'przytnijCache', 'LIMIT_FILMOW', 'LIMIT_FILMOW_B', 'FILMY_CACHE', kod + '\nreturn { isFilmPromo, zakresBajtow, filmZCache, pobierzFilm };');
  const S = f({ open: async () => cacheAtrapa }, fetchAtrapa, async () => 0, 3, 1e7, 'biegamy-filmy-v1');
  const U = (p) => new URL('https://filipjanczak1989-png.github.io/biegamy-assets/' + p);
  assert.ok(S.isFilmPromo(U('filmy/film-01.mp4')) && S.isFilmPromo(U('filmy/film-12.webm')));
  assert.ok(!S.isFilmPromo(U('radio-audio/utwor.mp4')) && !S.isFilmPromo(U('filmy/inny.mp4')), 'radio i obce pliki poza');
  assert.deepEqual(S.zakresBajtow('bytes=0-', 10), { od: 0, doB: 9 });
  assert.deepEqual(S.zakresBajtow('bytes=2-5', 10), { od: 2, doB: 5 });
  assert.deepEqual(S.zakresBajtow('bytes=-3', 10), { od: 7, doB: 9 });
  assert.deepEqual(S.zakresBajtow('bytes=4-99', 10), { od: 4, doB: 9 });
  assert.equal(S.zakresBajtow('bytes=12-', 10), null); assert.equal(S.zakresBajtow('items=0-1', 10), null);
  const url = 'https://filipjanczak1989-png.github.io/biegamy-assets/filmy/film-01.mp4';
  const pierwszy = await S.filmZCache(new Request(url, { headers: { range: 'bytes=0-' } }));
  assert.ok(pierwszy.siec, 'bez kopii → sieć');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(wlozone, [url], 'w tle cały plik do cache');
  const r = await S.filmZCache(new Request(url, { headers: { range: 'bytes=2-5' } }));
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await r.text(), '2345');
  assert.equal((await S.filmZCache(new Request(url, { headers: { range: 'bytes=50-' } }))).status, 416);
  const calosc = await S.filmZCache(new Request(url));
  assert.equal(calosc.status, 200); assert.equal(await calosc.text(), '0123456789');
  const S2 = f({ open: async () => cacheAtrapa }, async () => ({ status: 200, headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '999' }), blob: async () => new Blob(['krotki']) }), async () => 0, 3, 1e7, 'x');
  assert.equal(await S2.pobierzFilm(cacheAtrapa, 'urwany'), false, 'urwany plik nie wchodzi');
  const S3 = f({ open: async () => cacheAtrapa }, async () => ({ status: 200, headers: new Headers({ 'content-type': 'text/html' }), blob: async () => new Blob(['<html>']) }), async () => 0, 3, 1e7, 'x');
  assert.equal(await S3.pobierzFilm(cacheAtrapa, 'html'), false, 'tylko video/*');
});

test('(7) 🔊: start wyciszony; przycisk 44 px z aria-label pojawia się przy „playing", przełącza muted na tym samym filmie, znika po końcu', () => {
  const s = srodowisko();
  const v = s.ctx.FILM_DZIS.start(s.baner, TERAZ);
  const g = s.baner.dzieci.find((d) => d.className === 'film-dzwiek');
  assert.ok(g, 'przycisk na banerze (nie w wideo)'); assert.equal(g.tag, 'button');
  assert.equal(g.atrybuty['aria-label'], 'Włącz dźwięk'); assert.equal(g.textContent, '🔊');
  assert.match(g.style.cssText, /width:44px;height:44px;/); assert.match(g.style.cssText, /opacity:0;pointer-events:none;/);
  assert.ok(v.muted && v.defaultMuted, 'start zawsze wyciszony');
  v.emit('canplaythrough'); v.emit('playing');
  assert.ok(v.muted, 'play nie odcisza'); assert.equal(g.style.opacity, '1'); assert.equal(g.style.pointerEvents, 'auto');
  let zatrzymane = false;
  g.emit('click', { stopPropagation() { zatrzymane = true; } });
  assert.ok(zatrzymane, 'dotknięcie 🔊 nie pomija filmu'); assert.equal(v.muted, false, 'dźwięk z tego samego <video>');
  assert.equal(g.atrybuty['aria-label'], 'Wycisz'); assert.equal(g.textContent, '🔇');
  assert.equal(s.baner.dzieci.includes(v), true, 'film gra dalej');
  g.emit('click', { stopPropagation() {} });
  assert.equal(v.muted, true); assert.equal(g.atrybuty['aria-label'], 'Włącz dźwięk');
  v.emit('ended'); assert.equal(g.style.opacity, '0'); s.uplyw(520);
  assert.equal(s.baner.dzieci.length, 0, 'po końcu znika i film, i 🔊');
  const src = czytaj('sb.js');
  assert.ok(!/v\.muted = false/.test(src) && !/autoplay = true/.test(src), 'nigdzie odciszenia ani autoplay poza przyciskiem');
});

test('(7) ?film=1 pomija „raz dziennie" dla tej wizyty — ale nie reduced-motion, Save-Data ani offline', () => {
  const z = srodowisko({ zapis: '2026-11-01' });
  assert.equal(z.ctx.FILM_DZIS.powodBlokady(TERAZ), 'juz-dzis');
  z.ctx.location = { search: '?film=1' };
  assert.equal(z.ctx.FILM_DZIS.powodBlokady(TERAZ), null, '?film=1 → gra mimo znacznika');
  const r = srodowisko({ zapis: '2026-11-01', ruch: true }); r.ctx.location = { search: '?film=1' };
  assert.equal(r.ctx.FILM_DZIS.powodBlokady(TERAZ), 'reduced-motion');
  const o = srodowisko({ online: false }); o.ctx.location = { search: '?x=1&film=1' };
  assert.equal(o.ctx.FILM_DZIS.powodBlokady(TERAZ), 'offline');
  const inny = srodowisko({ zapis: '2026-11-01' }); inny.ctx.location = { search: '?film=0' };
  assert.equal(inny.ctx.FILM_DZIS.powodBlokady(TERAZ), 'juz-dzis');
});
