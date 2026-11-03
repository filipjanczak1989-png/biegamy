/* BLIZNA 110 (2.11.2026, etap 1 projektu „wyniki jak manager" — docs/projekt-wyniki-jak-manager-2026-11-02.md §2, decyzje Filipa 2.11).
   Router po hashu (klucze F6 tylko z wzorca, encodeURIComponent, k:<nazwisko>|<rocznik> dopuszczone), pamięć TYLKO w dokumencie
   (TTL 10 min, ≤ 200; żadnego sessionStorage/localStorage z danymi osób — w sessionStorage wyłącznie sam hash na czas logowania),
   stos przez pushState/popstate, prefetch tylko z intencji (pointerdown) i wyłącznik po 429, rekordy ±3 % jak w EF okienko,
   trend tylko z dystansów klasycznych (Riegel 1,06, ≥ 3 punkty, bez prognoz), porównanie = wspólne starty (klucz nazwy + data ±1 +
   dystans ±3 %; dwa kandydaty → żaden). Widżet: naKandydata nawiguje zamiast rozwijać. races.html linkuje do wyniki.html. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
async function W() { globalThis.window = globalThis; for (const p of ['js/tekst.mjs', 'js/kalendarz-lista.mjs', 'js/riegel.js', 'js/wyniki-lista.mjs']) await import(pathToFileURL(path.join(KORZEN, p)).href); return globalThis.BM_WYNIKI; }

test('router: ekrany i walidacja kluczy; k:<nazwisko>|<rocznik> przechodzi, śmieci nie; hash ↔ stan', async () => {
  const w = await W();
  assert.deepEqual(w.parsuj(''), { ekran: 'szukaj' }); assert.deepEqual(w.parsuj('#/'), { ekran: 'szukaj' });
  assert.deepEqual(w.parsuj('#/zawodnik/datasport%3A368751'), { ekran: 'zawodnik', klucz: 'datasport:368751' });
  assert.deepEqual(w.parsuj('#/zawodnik/k%3Ajan%20kowalski%7C1990'), { ekran: 'zawodnik', klucz: 'k:jan kowalski|1990' });
  assert.deepEqual(w.parsuj('#/porownaj/datasport%3A1/datasport%3A2'), { ekran: 'porownaj', a: 'datasport:1', b: 'datasport:2' });
  for (const z of ['#/zawodnik/<script>', '#/zawodnik/javascript:x', '#/porownaj/datasport%3A1/datasport%3A1', '#/x', '#/zawodnik/', '#/zawodnik/k%3A%7C1990']) assert.equal(w.parsuj(z).ekran, 'szukaj', z);
  assert.equal(w.hashDla({ ekran: 'zawodnik', klucz: 'k:jan kowalski|1990' }), '#/zawodnik/k%3Ajan%20kowalski%7C1990');
  assert.deepEqual(w.parsuj(w.hashDla({ ekran: 'porownaj', a: 'k:a b|1990', b: 'datasport:2' })), { ekran: 'porownaj', a: 'k:a b|1990', b: 'datasport:2' }, 'w obie strony');
});

test('pamięć w dokumencie: TTL 10 min, limit 200 (najstarszy wypada); wyłącznik po 429', async () => {
  const w = await W(); const p = w.pamiec(); const t0 = 1_000_000;
  p.zapisz(p.klucz('runner_results', { p_runner_key: 'a:1' }), [1], t0);
  assert.deepEqual(p.czytaj(p.klucz('runner_results', { p_runner_key: 'a:1' }), t0 + 9 * 60000), [1]);
  assert.equal(p.czytaj(p.klucz('runner_results', { p_runner_key: 'a:1' }), t0 + 11 * 60000), null, 'po 10 min pusto');
  for (let i = 0; i < 205; i++) p.zapisz('k' + i, i, t0);
  assert.ok(p.rozmiar() <= 200); assert.equal(p.czytaj('k0', t0), null, 'najstarszy wypadł'); assert.equal(p.czytaj('k204', t0), 204);
  const x = w.wylacznik(); assert.equal(x.wolno(t0), true); x.zglos429(90, t0); assert.equal(x.wolno(t0 + 60000), false); assert.equal(x.wolno(t0 + 91000), true);
  x.zglos429(undefined, t0); assert.equal(x.wolno(t0 + 59000), false, 'bez Retry-After: 60 s');
});

test('rekordy ±3 % jak w EF (moje.mjs), inne dystanse; trend tylko klasyczne, ≥ 3 punkty, bez prognoz', async () => {
  const w = await W();
  const rows = [['Bieg A', '2026-03-01', 10, 2700], ['Bieg B', '2026-05-01', 21.1, 6000], ['Bieg C', '2026-09-01', 5, 1260], ['Trail', '2026-07-01', 33, 14000], ['Bieg A', '2025-03-01', 10.2, 2650]]
    .map(([n, d, km, s]) => w.wiersz({ event_name: n, event_date: d, distance_km: km, time_seconds: s }));
  const r = w.rekordy(rows);
  assert.deepEqual(r.klasyczne.map((x) => [x.dystans, x.czas]), [['5 km', '21:00'], ['10 km', '44:10'], ['półmaraton', '1:40:00']], '10,2 km mieści się w ±3 % i jest lepsze');
  assert.deepEqual(r.inne.map((x) => x.km), [33]);
  const t = w.trend(rows); assert.equal(t.length, 4); assert.deepEqual(t.map((p) => p.data), ['2025-03-01', '2026-03-01', '2026-05-01', '2026-09-01'], 'rosnąco po dacie, trail poza');
  assert.equal(w.trend(rows.slice(0, 2)), null, 'za mało punktów');
  assert.equal(w.RIEGEL, 1.06);
  const svg = w.wykresSvg(t); assert.match(svg, /^<svg /); assert.doesNotMatch(svg, /prognoz|forma rośnie|spadek/i, 'bez słów-prognoz');
  const src = czytaj('js/wyniki-lista.mjs').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); assert.doesNotMatch(src, /sessionStorage|localStorage|indexedDB/, 'dane osób nie w magazynach przeglądarki (kod, nie komentarze)');
  const moje = czytaj('supabase/functions/okienko/moje.mjs'); assert.match(moje, /Math\.abs\(r\.dystans_km - km\) <= km \* 0\.03/); assert.match(src, /Math\.abs\(r\.km - d\[1\]\) <= d\[1\] \* 0\.03/, 'ta sama tolerancja co EF');
});

test('porównanie: wspólne starty po kluczu nazwy (edycje) + data ±1 + dystans ±3 %; dwa kandydaty → brak; bilans', async () => {
  const w = await W();
  const A = [['12. Bieg Niepodległości', '2026-11-11', 10, 2700], ['Parkrun', '2026-10-03', 5, 1300], ['Parkrun', '2026-10-10', 5, 1290]].map(([n, d, km, s]) => w.wiersz({ event_name: n, event_date: d, distance_km: km, time_seconds: s }));
  const B = [['XII Bieg Niepodległości', '2026-11-11', 10.1, 2650], ['Parkrun', '2026-10-03', 5, 1310], ['Parkrun', '2026-10-04', 5, 1280]].map(([n, d, km, s]) => w.wiersz({ event_name: n, event_date: d, distance_km: km, time_seconds: s }));
  const ws = w.wspolneStarty(A, B);
  assert.deepEqual(ws.starty.map((s) => [s.bieg, s.szybszy]), [['12. Bieg Niepodległości', 'b']], 'parkrun 3.10 ma w B dwóch kandydatów (3.10 i 4.10) → pominięty; 10.10 bez pary');
  assert.deepEqual(ws.bilans, { a: 0, b: 1, remis: 0 });
  const E = [w.wiersz({ event_name: 'X', event_date: '2026-01-01', distance_km: 10, time_seconds: 100 + 2600, edition_id: 'e1' })], F = [w.wiersz({ event_name: 'Y inna nazwa', event_date: '2026-01-01', distance_km: 10, time_seconds: 2600, edition_id: 'e1' })];
  assert.equal(w.wspolneStarty(E, F).starty.length, 1, 'edition_id (etap 3) wygrywa z nazwą');
});

test('wyniki.html: sesja → hash w sessionStorage (sam hash), pushState/popstate, prefetch z pointerdown, data-* bez onclick, widżet naKandydata, link z races.html', () => {
  const h = czytaj('wyniki.html');
  for (const s of ['js/tekst.mjs', 'js/kalendarz-lista.mjs', 'sb.js', 'js/wyszukiwarka-wynikow.js', 'js/wyniki-api.js', 'js/wyniki-lista.mjs', 'js/wynik-zgloszony.mjs']) assert.ok(h.includes('<script src="' + s + '">'), s);
  assert.match(h, /sessionStorage\.setItem\(KLUCZ_HASH, location\.hash \|\| '#\/'\)/); assert.equal((h.match(/sessionStorage\.setItem/g) || []).length, 1, 'tylko hash w sessionStorage');
  assert.doesNotMatch(h, /localStorage\.setItem/);
  assert.match(h, /history\.pushState\(\{ h: h, y: window\.scrollY \}, '', h\)/); assert.match(h, /addEventListener\('popstate'/);
  assert.match(h, /addEventListener\('pointerdown'[\s\S]*?\{ prefetch: true \}/, 'prefetch tylko z intencji');
  assert.match(h, /if \(opcje && opcje\.prefetch && !wyl\.wolno\(\)\) return/, 'wyłącznik dotyczy prefetchu');
  assert.doesNotMatch(h, /onclick="[^"]*\$\{/, 'zero JS-in-attribute z danymi');
  assert.match(h, /data-klucz="' \+ esc\(/); assert.match(h, /W\.kluczOk\(el\.getAttribute\('data-klucz'\)\)/, 'klucz z data-* walidowany przy odczycie');
  assert.match(h, /safeExternalHref\(r\.url, \{ tylkoHttps: true \}\)/);
  const wid = czytaj('js/wyszukiwarka-wynikow.js'); assert.match(wid, /if \(typeof opts\.naKandydata === 'function'\) opts\.naKandydata\(c\); else open\(c\);/);
  assert.match(czytaj('races.html'), /<a href="wyniki\.html"[^>]*>Otwórz wyniki ›<\/a>/);
});
