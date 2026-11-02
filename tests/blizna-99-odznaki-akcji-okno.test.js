/* BLIZNA 99 (2.11.2026) — PROJEKT F dzień 4: odznaki akcji i okno przyznawania (front).
   Spec v2 pkt 4 + polecenie Filipa 2.11: okno start → dzień zamknięcia włącznie, poza oknem nigdy; #100kmDlaKasi
   (15.08–20.09.2026) zamknięte — przyznane zostają, nikt nie dostaje wstecz. Do 2.11 pętla WYZWANIA sprawdzała tylko datę
   WPISU: bieg z 10.09 dopisany w listopadzie dawał odznakę dziś (sprawdzone w kodzie).
   Twardą kontrolę w bazie (wyzwalacz achievements_okno) testuje tools/odznaki-okna-test.sh.

   Pilnuje: reguły js/odznaki-akcji.mjs (progi, sponsor, „Razem", „Co tydzień"), bramkę okna w awardBadge i w paczce,
   katalog akcji dopiero po starcie, zaślepkę w tym samym <img>, zero imienia dziecka w slugach/plikach/tekstach. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SLUGI = ['akcja-1km', 'akcja-100', 'akcja-200', 'akcja-500', 'akcja-1000', 'akcja-co-tydzien', 'akcja-razem', 'akcja-sponsor'];
let O;
test.before(async () => { await import(pathToFileURL(path.join(KORZEN, 'js/odznaki-akcji.mjs')).href); O = globalThis.BM_ODZNAKI_AKCJI; });
const T = (d) => new Date(d + 'T12:00:00Z');
const AK = { wystartowala: true, start: '2026-11-08', koniec: null, suma_km: 3000, cel_km: 12500 };

test('zestaw: 8 slugów ze spec, bez imienia, plik assets/odznaki/<slug>.webp, zaślepka SVG ze znakiem', () => {
  assert.deepEqual(O.LISTA.map((b) => b.id), SLUGI);
  const tekst = czytaj('js/odznaki-akcji.mjs') + JSON.stringify(O.LISTA);
  assert.doesNotMatch(tekst, /fabian|borowczyk/i, 'imię/nazwisko w module odznak — repo publiczne');
  assert.equal(O.src('akcja-100'), 'assets/odznaki/akcja-100.webp');
  assert.equal(O.src('akcja-100', true), 'assets/odznaki/akcja-100-512.webp');
  const z = decodeURIComponent(O.zaslepka('akcja-1000'));
  assert.match(z, /^data:image\/svg\+xml;charset=utf-8,<svg/);
  assert.match(z, />1000<\/text>/);
  assert.match(O.onerrorAttr('akcja-1km'), /this\.dataset\.z/, 'zaślepka raz, bez pętli onerror');
  assert.equal(O.onerrorAttr('pierwszy_krok'), '');
  // narzędzie do grafik zna ten sam zestaw
  const py = czytaj('tools/odznaki-akcji-grafiki.py');
  assert.match(py, new RegExp('SLUGI = \\[' + SLUGI.map((s) => '"' + s + '"').join(', ') + '\\]'));
});

test('okno: przed startem i po zamknięciu nic; dzień startu i dzień zamknięcia włącznie', () => {
  assert.deepEqual(O.doPrzyznania({ wystartowala: false, start: '2026-11-08' }, { km: 500 }, null, T('2026-11-08')), []);
  assert.deepEqual(O.doPrzyznania(AK, { km: 500 }, null, T('2026-11-07')), [], 'dzień przed startem');
  assert.deepEqual(O.doPrzyznania(AK, { km: 1.2 }, null, T('2026-11-08')), ['akcja-1km'], 'dzień startu');
  const zam = { ...AK, koniec: '2026-12-01' };
  assert.ok(O.doPrzyznania(zam, { km: 150 }, new Set(['2026-12-01']), T('2026-12-01')).includes('akcja-100'), 'dzień zamknięcia');
  assert.deepEqual(O.doPrzyznania(zam, { km: 150 }, new Set(['2026-12-02']), T('2026-12-02')), [], 'dzień po zamknięciu');
  assert.equal(O.katalogWidoczny({ wystartowala: false }), false);
  assert.equal(O.katalogWidoczny(zam), true, 'po zamknięciu katalog zostaje — przyznane są na zawsze');
});

test('progi, sponsor; „Razem" i „Co tydzień" tylko w dniu zamknięcia', () => {
  assert.deepEqual(O.doPrzyznania(AK, { km: 1000, stawka_gr: 5 }, null, T('2026-11-20')),
    ['akcja-1km', 'akcja-100', 'akcja-200', 'akcja-500', 'akcja-1000', 'akcja-sponsor']);
  assert.deepEqual(O.doPrzyznania(AK, { km: 99.9, stawka_gr: null }, null, T('2026-11-20')), ['akcja-1km']);
  assert.deepEqual(O.doPrzyznania(AK, { km: 0 }, null, T('2026-11-20')), []);
  // dzień zamknięcia przed nocnym cronem: suma ≥ cel, koniec null
  const dzien = { ...AK, suma_km: 12500 };
  const dniPelne = new Set(['2026-11-08', '2026-11-12', '2026-11-19', '2026-11-25', '2026-11-30']);
  assert.deepEqual(O.doPrzyznania(dzien, { km: 50 }, dniPelne, T('2026-11-30')), ['akcja-1km', 'akcja-razem', 'akcja-co-tydzien']);
  const bezDzis = new Set(['2026-11-12', '2026-11-19', '2026-11-25']);
  assert.ok(!O.doPrzyznania(dzien, { km: 50 }, bezDzis, T('2026-11-30')).includes('akcja-razem'), '„Razem" wymaga aktywności w dniu zamknięcia');
  const dziura = new Set(['2026-11-12', '2026-11-25', '2026-11-30']);   // pusty tydzień 16–22.11
  assert.ok(!O.doPrzyznania(dzien, { km: 50 }, dziura, T('2026-11-30')).includes('akcja-co-tydzien'), '„Co tydzień" traci się przy pustym tygodniu');
  assert.ok(!O.doPrzyznania(AK, { km: 50 }, dniPelne, T('2026-11-30')).includes('akcja-razem'), 'zwykły dzień — bez „Razem"');
  // pełne tygodnie od startu w niedzielę 8.11: pierwszy pełny = 9–15.11; niepełny bieżący się nie liczy
  assert.equal(O.coTydzien('2026-11-08', '2026-11-14', new Set()), true, 'brak pełnego tygodnia');
  assert.equal(O.coTydzien('2026-11-08', '2026-11-15', new Set()), false);
  assert.equal(O.coTydzien('2026-11-08', '2026-11-15', new Set(['2026-11-15'])), true);
});

test('zawodnik.html: bramka okna w awardBadge i w paczce; #100kmDlaKasi dziś nie przechodzi (naprawa przyznawania wstecz)', () => {
  const z = czytaj('zawodnik.html');
  assert.match(z, /async function awardBadge\(badgeId\) \{\n  if \(!window\._odznakaWOknie\(badgeId\)\) return;/);
  assert.match(z, /\.filter\(id => window\._odznakaWOknie\(id\)\)/);
  const i = z.indexOf('window._odznakaWOknie = function'), f = z.slice(i, z.indexOf('\n};\n', i) + 3);
  const okno = (wyzw, stanAkcji, dzis) => {
    const win = { BM_ODZNAKI_AKCJI: O, _akcjaStan: stanAkcji };
    const RealDTF = Intl.DateTimeFormat;
    const fakeIntl = { DateTimeFormat: function () { return { format: () => dzis }; } };
    new Function('window', 'WYZWANIA', 'Intl', f)(win, wyzw, fakeIntl);
    void RealDTF;
    return win._odznakaWOknie;
  };
  const WYZW = [{ id: '100km_wrzesien_2026', od: '2026-08-15', do: '2026-09-20' }, { id: 'razem_wrzesien_2026', od: '2026-08-15', do: '2026-09-20' }];
  assert.equal(okno(WYZW, null, '2026-11-02')('razem_wrzesien_2026'), false, 'wstecz po zamknięciu');
  assert.equal(okno(WYZW, null, '2026-09-20')('razem_wrzesien_2026'), true, 'ostatni dzień okna');
  assert.equal(okno(WYZW, null, '2026-11-02')('pierwszy_krok'), true, 'odznaka bez okna');
  assert.equal(okno(WYZW, null, '2026-11-08')('akcja-100'), false, 'akcja bez stanu = zamknięte');
  assert.equal(okno(WYZW, { wystartowala: true, start: '2026-11-02', koniec: null }, '2026-11-02')('akcja-100'), true);
  // odznaki akcji poza BADGES (blizna-40 liczy tylko BADGES), reguły przez doPrzyznania
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
  assert.equal(N.nazwaOdznaki('akcja-500'), '500 km akcji');
  assert.equal(N.nazwaOdznaki('nie_ma_takiej'), 'Odznaka');
  assert.ok(czytaj('sw.js').includes("'/js/odznaki-akcji.mjs',"), 'moduł w precache SW');
});
