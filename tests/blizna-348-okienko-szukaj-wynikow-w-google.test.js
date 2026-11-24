/* BLIZNA 348 (Filip 24.11, zamiast sieci po link — krok 0c: lista pomiarowców 0/10): gdy reguła wyników kończy się na „Nie znalazłem wyników tej imprezy.”,
   pod „Otwórz Wyniki ›” dochodzi „Szukaj wyników w Google ›” → https://www.google.com/search?q=<encodeURIComponent("<nazwa> <miasto> <rok> wyniki")>, nowa karta,
   noopener noreferrer. Nazwa i miasto z karty kalendarza maszyny (najnowsza PRZESZŁA edycja; rok tylko z jej daty, bez niej bez roku), bez karty: tekst pytania
   bez „wyniki”. Host stały, tylko https, bez danych osoby (para imię–nazwisko → brak przycisku). Pytania o osoby i o własne wyniki przycisku nie dostają.
   Funkcja nie woła sieci ani modelu; adres składa front. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { moduly, przebiegV2, KORZEN } = require('./_okienko-potok-atrapa.js');
const { zaladujSb } = require('./_srodowisko.js');

const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const DZIS = '2026-11-24';
const KAL = [
  { klucz: 'kalendarz:p27', nazwa: '26 Poznań Maraton', data: '2027-10-10', miejscowosc: 'Poznań', przeszla: false },
  { klucz: 'kalendarz:p25', nazwa: '25 Poznań Maraton – 42 km', data: '2026-10-04', miejscowosc: 'Poznań', przeszla: true },
  { klucz: 'kalendarz:p24', nazwa: 'LOTTO 24. Poznań Maraton', data: '2025-10-12', miejscowosc: 'Poznań', przeszla: true }];
function maszyna(wiersze, blad) {
  return async (url, init) => {
    if (blad) return { ok: false, status: 500, json: async () => ({}) };
    const rpc = String(url).split('/rpc/')[1], a = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => (rpc === 'events_search' && /pozna/i.test(a.p_q || '') ? wiersze : []) };
  };
}
const G = (q) => ({ typ: 'szukaj_google', dane: { q } });

test('zapytanie: najnowsza przeszła edycja (nazwa bez dopisku po „ – ”, miasto, rok); tylko przyszła — bez roku; bez karty — pytanie bez „wyniki”', async () => {
  const { zaladuj } = await moduly();
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  assert.deepEqual(I.kartaGoogleWynikow(KAL, 'poznan maraton', DZIS), G('25 Poznań Maraton Poznań 2026 wyniki'));
  assert.deepEqual(I.kartaGoogleWynikow([KAL[0]], 'poznan maraton', DZIS), G('26 Poznań Maraton Poznań wyniki'), 'tylko przyszła edycja: bez roku');
  assert.deepEqual(I.kartaGoogleWynikow([{ nazwa: 'Bieg Leśny', data: '2026-05-01', przeszla: false, miejscowosc: null }], 'x', DZIS), G('Bieg Leśny 2026 wyniki'), 'data przed dziś = przeszła; bez miasta');
  assert.deepEqual(I.kartaGoogleWynikow([], 'cracovia maratonu', DZIS), G('cracovia maratonu wyniki'), 'bez karty: tekst pytania bez „wyniki”');
  assert.equal(I.kartaGoogleWynikow([], 'Anny Nowak maratonu', DZIS), null, 'imię w dopełniaczu (maPareOsoby go nie zna): strażnik nazwiska jak przed siecią');
  assert.equal(I.kartaGoogleWynikow([], 'Nowaka', DZIS), null, 'samo nazwisko');
  assert.equal(I.kartaGoogleWynikow([], 'Cracovia Maratonu', DZIS), null, 'ostrożnie: duża litera w krótkim pytaniu bez karty kalendarza — bez przycisku');
  assert.deepEqual(I.kartaGoogleWynikow([{ nazwa: 'Cracovia Maraton', data: '2026-04-26', przeszla: true, miejscowosc: 'Kraków' }], 'x', DZIS), G('Cracovia Maraton Kraków 2026 wyniki'), 'nazwa z kalendarza: bez strażnika nazwiska');
  assert.deepEqual(I.kartaGoogleWynikow(null, '  bieg   niepodległości ', DZIS), G('bieg niepodległości wyniki'), 'spacje znormalizowane');
  for (const q of ['', null, undefined]) assert.equal(I.kartaGoogleWynikow([], q, DZIS), null, 'puste: ' + q);
  assert.equal(I.kartaGoogleWynikow([], 'maraton '.repeat(30), DZIS), null, 'za długie');
  assert.equal(I.kartaGoogleWynikow([], 'Anna Nowak maraton', DZIS), null, 'para imię–nazwisko: dane osoby nie idą do wyszukiwarki');
  assert.equal(I.kartaGoogleWynikow([{ nazwa: 'Jan Kowalski bieg', data: '2026-05-01', przeszla: true, miejscowosc: 'Łódź' }], 'x', DZIS), null, 'osoba także w nazwie z kalendarza');
  assert.doesNotMatch(czytaj('supabase/functions/okienko/impreza.mjs').split('export function kartaGoogleWynikow')[1].split('\n}\n')[0], /fetch|zapytajSiec|google\.com/, 'funkcja bez sieci i bez adresu');
});

test('wynikiImprezy: z wynikami karty bez Google; bez wyników Google z kalendarza; awaria maszyny — Google z pytania; nigdy nie rzuca', async () => {
  const { zaladuj } = await moduly();
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs'), f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  f6._wyczyscPamiecF6();
  const z = await I.wynikiImprezy(maszyna([{ ...KAL[1], ma_wyniki: true }]), 'T', 'poznan maraton', DZIS);
  assert.equal(z.karty.length, 1); assert.equal(z.google, null, 'są wyniki: bez Google');
  f6._wyczyscPamiecF6();
  assert.deepEqual((await I.wynikiImprezy(maszyna(KAL.map((k) => ({ ...k, ma_wyniki: false }))), 'T', 'poznan maraton', DZIS)).google, G('25 Poznań Maraton Poznań 2026 wyniki'));
  f6._wyczyscPamiecF6();
  const a = await I.wynikiImprezy(maszyna([], true), 'T', 'maratonu awaria', DZIS);
  assert.deepEqual(a, { karty: [], google: G('maratonu awaria wyniki') }, 'awaria maszyny');
});

test('v2 naprawdę: „Otwórz Wyniki ›”, a pod nim Google; bez sieci i modelu. Osoby i własne wyniki — bez przycisku', async () => {
  const { R, zaladuj } = await moduly();
  const f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  f6._wyczyscPamiecF6();
  let r = await przebiegV2('poznan maraton wyniki', { fetchF6: maszyna(KAL.map((k) => ({ ...k, ma_wyniki: false }))) });
  assert.equal(r.slad, 'router:wyniki-imprezy');
  assert.deepEqual(r.body.zdania, [R.ODP_WYNIKI_BRAK]);
  assert.deepEqual(r.body.karty, [R.KARTA_WYNIKI, G('25 Poznań Maraton Poznań 2026 wyniki')], 'kolejność: najpierw „Otwórz Wyniki ›”');
  assert.equal(r.sieci + r.modele, 0);
  f6._wyczyscPamiecF6();
  r = await przebiegV2('wyniki parkrun', { fetchF6: maszyna([]) });
  assert.deepEqual(r.body.karty, [R.KARTA_WYNIKI, G('parkrun wyniki')]); assert.equal(r.sieci + r.modele, 0);
  for (const q of ['moje wyniki z maratonu', 'jakie mam wyniki w tym roku', 'Jan Kowalski wyniki maratonu', 'wyniki Anny Nowak z maratonu', 'Anna Nowak maraton wyniki', 'jej wyniki z maratonu']) {
    f6._wyczyscPamiecF6();
    const o = await przebiegV2(q, { fetchF6: maszyna([]) });
    assert.ok(!(o.body.karty || []).some((k) => k && k.typ === 'szukaj_google'), q + ': bez przycisku Google (' + o.slad + ')');
    assert.ok(!JSON.stringify(o.body).includes('google'), q + ': nic o Google w odpowiedzi');
  }
  // 24.11 (blizna-349): imię w odmianie + nazwisko idzie trybem osoby (dotąd regułą wyników imprezy; małe litery mijały strażnik nazwiska → Google z nazwiskiem)
  for (const q of ['wyniki Anny Nowak z maratonu', 'wyniki anny nowak z maratonu']) {
    f6._wyczyscPamiecF6();
    const an = await przebiegV2(q, { fetchF6: maszyna([]) });
    assert.equal(an.slad, 'osoba', q); assert.ok(!JSON.stringify(an.body).includes('google'), q + ': bez Google');
  }
  assert.equal((await zaladuj('supabase/functions/okienko/impreza.mjs')).kartaGoogleWynikow([], 'anny nowak maratonu', DZIS), null, 'druga linia: imię w odmianie małymi literami');
});

test('v1 i v2: ta sama reguła — karta Google dopisana POD kartami routera, tylko gdy brak kart z wynikami', () => {
  const v1 = czytaj('supabase/functions/okienko/index.ts'), v2 = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.match(v1, /const w = await wynikiImprezy\(fetch, jwt, \(traf as \{ wynikiImprezy: \{ q: string \} \}\)\.wynikiImprezy\.q, dzis\); if \(w\.karty\.length\) return odp\(200, \{ \.\.\.pusto\("router"\), zdania: \[ODP_WYNIKI_IMPREZY\], karty: w\.karty \}\); if \(w\.google\) kartyZd = \[\.\.\.kartyZd, w\.google\]; \}/);
  assert.match(v2, /const w = await wynikiImprezy\(fetchFn, jwt, traf\.wynikiImprezy\.q, dzis\); if \(w\.karty\.length\) return odp\(200, \{ \.\.\.pusto\("router"\), zdania: \[ODP_WYNIKI_IMPREZY\], karty: w\.karty \}\); if \(w\.google\) kartyZd = \[\.\.\.kartyZd, w\.google\]; \}/);
  for (const [n, s] of [['v1', v1], ['v2', v2]]) assert.doesNotMatch(s, /google\.com/, n + ': adres składa wyłącznie front');
});

test('front: stały host https://www.google.com, encodeURIComponent, nowa karta z noopener noreferrer; złe zapytanie — nic', async () => {
  const { R } = await moduly();
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const html = (q) => ctx.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: [R.ODP_WYNIKI_BRAK], karty: [R.KARTA_WYNIKI, G(q)] });
  const h = html('25 Poznań Maraton Poznań 2026 wyniki');
  const a = /<a class="okn-link" href="([^"]+)" target="_blank" rel="noopener noreferrer">Szukaj wyników w Google ›<\/a>/.exec(h);
  assert.ok(a, 'link z target i rel');
  const href = a[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  assert.equal(href, 'https://www.google.com/search?q=25%20Pozna%C5%84%20Maraton%20Pozna%C5%84%202026%20wyniki');
  assert.equal(new URL(href).host, 'www.google.com'); assert.equal(new URL(href).protocol, 'https:');
  assert.equal(new URL(href).searchParams.get('q'), '25 Poznań Maraton Poznań 2026 wyniki', 'zapytanie wraca bez zmian');
  assert.ok(h.indexOf('Otwórz Wyniki ›') < h.indexOf('Szukaj wyników w Google ›'), 'pod „Otwórz Wyniki ›”');
  const zly = html('"><script>alert(1)</script> & q=1#x wyniki');
  assert.doesNotMatch(zly, /<script>|q=1#x/, 'zapytanie zakodowane w całości');
  const surowy = /href="([^"]+)"[^>]*>Szukaj wyników/.exec(zly)[1];
  assert.doesNotMatch(surowy, /[<>"\s#]/, 'w atrybucie nic, co wychodzi poza zapytanie');
  const zh = surowy.replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  assert.equal(new URL(zh).host, 'www.google.com'); assert.equal(new URL(zh).searchParams.get('q'), '"><script>alert(1)</script> & q=1#x wyniki');
  for (const q of ['poznan maraton', '', '   ', 'x'.repeat(170) + ' wyniki', null, 42, { q: 'wyniki' }]) assert.doesNotMatch(html(q), /Szukaj wyników w Google/, 'bez linku: ' + JSON.stringify(q));
});
