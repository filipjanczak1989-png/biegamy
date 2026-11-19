/* BLIZNA 285 / 18.11: plakat Wirtualnego Biegu Mikołajkowego na bieg.html.
   - pliki (WebP do strony, PDF A4) w publicznym kubełku bieg-plakaty (migracja 20261208), NIGDY w repo (zdjęcie dziecka);
   - adres stały w js/bieg.mjs (PLAKATY), tylko bieg-mikolajki; z ?v= (sw.js: storage cache-first); PDF z ?download=;
   - sekcja „Plakat” pod „Jak to działa”: obrazek lazy z alt i zaokrąglonymi rogami, „Pobierz plakat (PDF) ›”, „Udostępnij” (Web Share z biegamy.run/bieg, bez niego kopiowanie linku);
   - obrazek się nie wczyta = sekcja schowana. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B;
test.before(async () => { await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL; });

test('PLAKATY: tylko bieg-mikolajki, publiczny kubełek bieg-plakaty, ?v=, PDF do pobrania', () => {
  const p = B.plakatBiegu('bieg-mikolajki');
  assert.equal(p.obraz, 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/bieg-plakaty/bieg-mikolajki-plakat.webp?v=1');
  assert.match(p.pdf, /^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/public\/bieg-plakaty\/bieg-mikolajki-plakat\.pdf\?v=1&download=[a-z-]+\.pdf$/);
  for (const s of ['proba-bieg', '', null, undefined, 'toString', '__proto__']) assert.equal(B.plakatBiegu(s), null, String(s));
  assert.equal(B.ADRES_BIEGU, 'https://biegamy.run/bieg');
  assert.doesNotMatch(czytaj('js/bieg.mjs').replace(/dla-fabianka(\.html)?/g, '').replace(B.DANE_ADMINISTRATORA, ''), /fabian|Kasia|Filip\b/, 'bez imion w module (jak blizna-235)');
});

test('pliki plakatu nie są w repo', () => {
  const pliki = [];
  (function chodz(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['.git', 'node_modules'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) chodz(p); else pliki.push(e.name); } })(KORZEN);
  assert.deepEqual(pliki.filter((n) => /plakat/i.test(n) && /\.(png|jpe?g|webp|pdf)$/i.test(n) && /mikolaj|bieg/i.test(n)), []);
});

test('bieg.html: sekcja „Plakat” po „Ukończyli” i „Wesprzyj zbiórkę”, ukryta w HTML; miniatura (blizna-287), przyciski PDF i Udostępnij', () => {
  const h = czytaj('bieg.html');
  /* 19.11 (prostsza strona): na wierzchu Ukończyli → Wesprzyj → Plakat; „Jak to działa” w zwiniętych „Zasadach” niżej; duży obrazek zastąpiła miniatura */
  const uko = h.indexOf('aria-label="Ukończyli"'), sek = h.indexOf('id="bw-plakat-sekcja"'), jak = h.indexOf('aria-label="Jak to działa"');
  assert.ok(uko > 0 && sek > uko && jak > sek, 'po „Ukończyli”, przed zwiniętym „Jak to działa”');
  assert.match(h, /<section class="bw-sekcja" aria-label="Plakat" id="bw-plakat-sekcja" hidden>/);
  assert.match(h, /<img id="bw-plakat-mini-obraz" alt="Plakat Wirtualnego Biegu Mikołajkowego" width="104" height="147" loading="lazy" decoding="async">/);
  assert.match(h, /id="bw-plakat-pdf" target="_blank" rel="noopener noreferrer">Pobierz plakat \(PDF\) ›<\/a>/);
  assert.match(h, /id="bw-plakat-udostepnij">Udostępnij<\/button>/);
  assert.match(h, /miniObraz\.onerror = function \(\) \{ sek\.hidden = true; \};/, 'obrazek się nie wczyta: sekcja znika');
  assert.match(h, /navigator\.share\(\{ title: nazwa, text: [^}]*url: adres \}\)/);
  assert.match(h, /navigator\.clipboard\.writeText\(adres\)/);
  assert.match(h, /rysujMoj\(\); rysujPlakat\(\);/);
});

test('migracja 20261208: publiczny kubełek tylko WebP i PDF, bez reguł zapisu; wycofanie najpierw sprawdza pliki', () => {
  const m = czytaj('supabase/migrations/20261208_bieg_plakaty_kubelek.sql'), w = czytaj('supabase/migrations/20261208_WYCOFANIE_bieg_plakaty_kubelek.sql');
  assert.match(m, /values \('bieg-plakaty', 'bieg-plakaty', true, 10485760, array\['image\/webp', 'application\/pdf'\]\)\non conflict \(id\) do nothing;/);
  assert.doesNotMatch(m.replace(/^--.*$/gm, ''), /create\s+polic|grant\s/i, 'bez reguł i grantów');
  assert.match(w, /if exists \(select 1 from storage\.objects where bucket_id = 'bieg-plakaty'\) then/);
});
