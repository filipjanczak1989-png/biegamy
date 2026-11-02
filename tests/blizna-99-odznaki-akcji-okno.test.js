/* BLIZNA 99 (2.11.2026) — PROJEKT F dzień 4: odznaki akcji i okno przyznawania (front). FINAŁ ZASAD Filipa 2.11 15:16.
   6 odznak w kolejności: akcja-1km, akcja-100, akcja-200, akcja-500, akcja-co-tydzien („7 dni z rzędu"), akcja-sponsor.
   Usunięte: akcja-1000, akcja-razem, akcja-dzien-startu. Okno: dzień startu → dzień zamknięcia włącznie, poza oknem nigdy;
   #100kmDlaKasi (15.08–20.09.2026) zamknięte — przyznane zostają, nikt nie dostaje wstecz (do 2.11 pętla WYZWANIA sprawdzała
   tylko datę WPISU — sprawdzone w kodzie). Twardą kontrolę w bazie (wyzwalacz achievements_okno) testuje
   tools/odznaki-okna-test.sh; sponsora przyznaje RPC deklaracji (tools/akcje-test-transakcji.sh).

   „7 dni z rzędu": 7 kolejnych dni kalendarzowych (Warszawa) z >= 1 aktywnością, wszystkie w oknie; raz, od razu po 7. dniu;
   przerwa zeruje serię. Blizny Filipa: 6 + przerwa + 7 = przyznana raz; 7 dni od 7.11 = brak (7.11 poza oknem);
   wpis wsteczny po zamknięciu nie daje. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SLUGI = ['akcja-1km', 'akcja-100', 'akcja-200', 'akcja-500', 'akcja-co-tydzien', 'akcja-sponsor'];
let O;
test.before(async () => { await import(pathToFileURL(path.join(KORZEN, 'js/odznaki-akcji.mjs')).href); O = globalThis.BM_ODZNAKI_AKCJI; });
const T = (d) => new Date(d + 'T12:00:00Z');
const AK = { wystartowala: true, start: '2026-11-08', koniec: null, suma_km: 3000, cel_km: 12500 };
const dni = (od, n) => { const o = []; const x = new Date(od + 'T12:00:00Z'); for (let i = 0; i < n; i++) { o.push(x.toISOString().slice(0, 10)); x.setUTCDate(x.getUTCDate() + 1); } return o; };

test('zestaw: 6 slugów w kolejności Filipa, bez imienia, plik assets/odznaki/<slug>.webp, zaślepka SVG; usunięte nie wracają', () => {
  assert.deepEqual(O.LISTA.map((b) => b.id), SLUGI);
  assert.equal(O.znajdz('akcja-co-tydzien').name, '7 dni z rzędu');
  for (const u of ['akcja-1000', 'akcja-razem', 'akcja-dzien-startu']) assert.equal(O.znajdz(u), null, 'usunięta odznaka wróciła: ' + u);
  const tekst = czytaj('js/odznaki-akcji.mjs') + JSON.stringify(O.LISTA);
  assert.doesNotMatch(tekst, /fabian|borowczyk/i, 'imię/nazwisko w module odznak — repo publiczne');
  assert.equal(O.src('akcja-100'), 'assets/odznaki/akcja-100.webp');
  assert.equal(O.src('akcja-100', true), 'assets/odznaki/akcja-100-512.webp');
  const z = decodeURIComponent(O.zaslepka('akcja-sponsor'));
  assert.match(z, /^data:image\/svg\+xml;charset=utf-8,<svg/);
  assert.match(z, />gr<\/text>/);
  assert.match(O.onerrorAttr('akcja-1km'), /this\.dataset\.z/, 'zaślepka raz, bez pętli onerror');
  assert.equal(O.onerrorAttr('pierwszy_krok'), '');
  const py = czytaj('tools/odznaki-akcji-grafiki.py');
  assert.match(py, new RegExp('SLUGI = \\[' + SLUGI.map((s) => '"' + s + '"').join(', ') + '\\]'));
  assert.doesNotMatch(py.match(/ALIASY = \{[\s\S]*?\}/)[0], /guzik/, 'guzik.png = usunięta odznaka dnia startu — bez mapowania');
  for (const s of SLUGI) for (const suf of ['.webp', '-512.webp']) {
    const f = 'assets/odznaki/' + s + suf;
    assert.ok(fs.existsSync(path.join(KORZEN, f)), 'brak grafiki ' + f);
  }
});

test('okno: przed startem i po zamknięciu nic; dzień startu i dzień zamknięcia włącznie', () => {
  assert.deepEqual(O.doPrzyznania({ wystartowala: false, start: '2026-11-08' }, { km: 500 }, null, T('2026-11-08')), []);
  assert.deepEqual(O.doPrzyznania(AK, { km: 500 }, null, T('2026-11-07')), [], 'dzień przed startem');
  assert.deepEqual(O.doPrzyznania(AK, { km: 1.2 }, null, T('2026-11-08')), ['akcja-1km'], 'dzień startu');
  const zam = { ...AK, koniec: '2026-12-01' };
  assert.ok(O.doPrzyznania(zam, { km: 150 }, null, T('2026-12-01')).includes('akcja-100'), 'dzień zamknięcia');
  assert.deepEqual(O.doPrzyznania(zam, { km: 150 }, null, T('2026-12-02')), [], 'dzień po zamknięciu');
  assert.equal(O.katalogWidoczny({ wystartowala: false }), false);
  assert.equal(O.katalogWidoczny(zam), true, 'po zamknięciu katalog zostaje — przyznane są na zawsze');
});

test('progi i sponsor (zapas z wkładu; właściwie przyznaje RPC deklaracji)', () => {
  assert.deepEqual(O.doPrzyznania(AK, { km: 1000, stawka_gr: 5 }, null, T('2026-11-20')), ['akcja-1km', 'akcja-100', 'akcja-200', 'akcja-500', 'akcja-sponsor']);
  assert.deepEqual(O.doPrzyznania(AK, { km: 99.9, stawka_gr: null }, null, T('2026-11-20')), ['akcja-1km']);
  assert.deepEqual(O.doPrzyznania(AK, { km: 0 }, null, T('2026-11-20')), []);
});

test('„7 dni z rzędu": blizny Filipa — 6 + przerwa + 7 = raz; 7 dni od 7.11 = brak; wstecz po zamknięciu = brak', () => {
  const ma = (zestaw, dzis, d = AK) => O.doPrzyznania(d, { km: 5 }, new Set(zestaw), T(dzis)).includes('akcja-co-tydzien');
  assert.equal(ma(dni('2026-11-08', 6), '2026-11-13'), false, '6 dni');
  assert.equal(ma(dni('2026-11-08', 7), '2026-11-14'), true, '7 dni — od razu po 7. dniu');
  assert.equal(ma([...dni('2026-11-08', 6), ...dni('2026-11-15', 6)], '2026-11-20'), false, '6 + przerwa + 6');
  assert.equal(ma([...dni('2026-11-08', 6), ...dni('2026-11-15', 7)], '2026-11-21'), true, '6 + przerwa + 7');
  assert.equal(ma(dni('2026-11-07', 7), '2026-11-20'), false, '7 dni od 7.11: 8.11 to 2. dzień serii, 7.11 poza oknem');
  assert.equal(ma(dni('2026-11-07', 8), '2026-11-20'), true, '7.11–14.11: 8–14.11 to pełne 7 dni w oknie');
  const zam = { ...AK, koniec: '2026-11-20' };
  assert.equal(ma(dni('2026-11-14', 7), '2026-11-25', zam), false, 'wpis wsteczny po zamknięciu nie daje (okno zamknięte)');
  assert.equal(ma(dni('2026-11-16', 7), '2026-11-20', zam), false, 'seria wychodząca poza dzień zamknięcia: 16–20.11 = 5 dni');
  // „raz": awardBadge pomija zdobytą; zawodnik.html nie pobiera dni, gdy odznakę już ma
  assert.match(czytaj('zawodnik.html'), /if \(!window\._earnedBadges\.has\('akcja-co-tydzien'\)\) \{/);
});

test('zawodnik.html: bramka okna w awardBadge i w paczce; #100kmDlaKasi dziś nie przechodzi (naprawa przyznawania wstecz)', () => {
  const z = czytaj('zawodnik.html');
  assert.match(z, /async function awardBadge\(badgeId\) \{\n  if \(!window\._odznakaWOknie\(badgeId\)\) return;/);
  assert.match(z, /\.filter\(id => window\._odznakaWOknie\(id\)\)/);
  const i = z.indexOf('window._odznakaWOknie = function'), f = z.slice(i, z.indexOf('\n};\n', i) + 3);
  const okno = (wyzw, stanAkcji, dzis) => {
    const win = { BM_ODZNAKI_AKCJI: O, _akcjaStan: stanAkcji, _teraz: () => T(dzis) };
    new Function('window', 'WYZWANIA', f)(win, wyzw);
    return win._odznakaWOknie;
  };
  const WYZW = [{ id: '100km_wrzesien_2026', od: '2026-08-15', do: '2026-09-20' }, { id: 'razem_wrzesien_2026', od: '2026-08-15', do: '2026-09-20' }];
  assert.equal(okno(WYZW, null, '2026-11-02')('razem_wrzesien_2026'), false, 'wstecz po zamknięciu');
  assert.equal(okno(WYZW, null, '2026-09-20')('razem_wrzesien_2026'), true, 'ostatni dzień okna');
  assert.equal(okno(WYZW, null, '2026-11-02')('pierwszy_krok'), true, 'odznaka bez okna');
  assert.equal(okno(WYZW, null, '2026-11-08')('akcja-100'), false, 'akcja bez stanu = zamknięte');
  const B = z.slice(z.indexOf('const BADGES = ['), z.indexOf('\n];', z.indexOf('const BADGES = [')));
  assert.doesNotMatch(B, /akcja-/);
  assert.match(z, /for \(const id of O\.doPrzyznania\(d, wklad, dni\)\) await awardBadge\(id\);/);
  assert.match(z, /_KAT = BADGES\.concat\(_O && _O\.katalogWidoczny\(window\._akcjaStan\) \? _O\.LISTA : \[\]\)/);
});

test('odznaki.html: katalog akcji dopiero po starcie, obraz z assets/odznaki z zaślepką; okienko zna nazwy akcji', async () => {
  const h = czytaj('odznaki.html');
  assert.match(h, /const KATALOG = \(\) => BADGES\.filter\(b => !b\.bez_reguly\)\.concat\(_OA\(\) && _OA\(\)\.katalogWidoczny\(window\._akcjaStan\) \? _OA\(\)\.LISTA : \[\]\);/);
  assert.equal((h.match(/<img src="\$\{_odzSrc\(b\.id\)\}" data-odz="\$\{b\.id\}"/g) || []).length, 2);
  assert.match(h, /<script src="js\/odznaki-akcji\.mjs"><\/script>/);
  const N = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/odznaki-nazwy.mjs')).href);
  assert.equal(N.nazwaOdznaki('akcja-co-tydzien'), '7 dni z rzędu');
  assert.equal(N.nazwaOdznaki('akcja-1000'), 'Odznaka', 'usunięta odznaka nie ma nazwy');
  assert.ok(czytaj('sw.js').includes("'/js/odznaki-akcji.mjs',"), 'moduł w precache SW');
});
