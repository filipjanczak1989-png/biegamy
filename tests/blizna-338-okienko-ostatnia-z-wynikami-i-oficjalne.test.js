/* BLIZNA 338 (Filip 23.11, krok 3 po wdrożeniu 019/020 na maszynie):
   a) „Wyniki ›” przy naszych wynikach; gdy żadna trafiona edycja nie ma wyników (np. najbliższa jest przyszła) — karta OSTATNIEJ edycji z wynikami tej samej
      imprezy z event_info (reguła serii maszyny, ta sama co ekran imprezy), w regule wyników i w trybie imprezy (obok przyszłej edycji);
   b) „Oficjalne wyniki ›” z adresu w maszynie (url_wyniki) — tylko https + serwis pomiaru czasu z listy 6 domen (linki-wynikow.mjs, kopia w js/okienko.js),
      tylko przy edycji, która się odbyła; zły adres nigdy nie dochodzi do linku (strażnik w funkcji i drugi we froncie). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { moduly, przebiegV2, KORZEN, DZIS } = require('./_okienko-potok-atrapa.js');
const { atrapa } = require('./_okienko-atrapy.js');
const { zaladujSb } = require('./_srodowisko.js');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

const ZLE = ['http://wyniki.datasport.pl/x', 'javascript:alert(1)', 'data:text/html,x', '//datasport.pl/x', 'https://datasport.pl.evil.com/x', 'https://evil-datasport.pl/x',
  'https://notdatasport.pl/x', 'https://xn--datasport-xyz.pl/x', 'https://wyniki.xn--dtasport-9db.pl/', 'https://xn--80ak6aa92e.datasport.pl/x','https://user@datasport.pl/x', 'https://user:pass@wyniki.datasport.pl/x',
  'https://datasport.pl:8443/x', 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC', 'https://datasport.pl\\@evil.com', ' https://datasport.pl/x',
  'https://datasport.pl/x y', 'https://192.168.0.1/x', 'https://[::1]/x', 'https://datasport.pl./x', 'https://' + 'a'.repeat(600) + '.datasport.pl/', '', 'wyniki.datasport.pl/x',
  'https://datasport.pl\n.evil.com', 'ftp://datasport.pl/x', null, undefined, 12, { href: 'https://datasport.pl/' }];
const DOBRE = [['https://wyniki.datasport.pl/results/6182', 'https://wyniki.datasport.pl/results/6182'], ['https://elektronicznezapisy.pl/event/1/results.html', 'https://elektronicznezapisy.pl/event/1/results.html'],
  ['https://wyniki.b4sport.pl/x?y=1', 'https://wyniki.b4sport.pl/x?y=1'], ['https://wyniki.plus-timing.pl/x', 'https://wyniki.plus-timing.pl/x'],
  ['https://v1.foxter-sport.pl/x', 'https://v1.foxter-sport.pl/x'], ['https://sportevents.time4run.com.pl/x', 'https://sportevents.time4run.com.pl/x'],
  ['https://DATASPORT.PL/X', 'https://datasport.pl/X']];

function front() {
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  return (d) => ctx.OKIENKO.htmlOdpowiedzi(200, { tryb: 'impreza', zdania: [], karty: [{ typ: 'impreza', dane: { nazwa: 'Poznań Maraton', data: '2024-10-13', przeszla: true, klucz: 'kalendarz:p25', ...d } }] });
}
function maszyna(wiersze, info) {
  const wywolania = [];
  return { wywolania, fetchF6: async (url, init) => {
    const rpc = String(url).split('/rpc/')[1], a = JSON.parse(init.body);
    wywolania.push(rpc + ':' + (a.p_q || a.p_klucz || ''));
    if (rpc === 'event_info') { const v = info[a.p_klucz]; return v === 'awaria' ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => v || [] }; }
    return { ok: true, status: 200, json: async () => (rpc === 'events_search' && /pozna/i.test(a.p_q || '') ? wiersze : []) };
  } };
}
const PRZYSZLA = { klucz: 'kalendarz:p27', nazwa: '26 Poznań Maraton', data: '2027-10-10', miejscowosc: 'Poznań', przeszla: false, ma_wyniki: false };
const INFO_P27 = [{ event_id: null, nazwa: '26 Poznań Maraton', data: '2027-10-10', miejscowosc: 'Poznań', ukonczonych: 0 },
  { event_id: 'e23-10', nazwa: '23. Poznań Maraton – Bieg 10 km', data: '2024-10-13', miejscowosc: 'Poznań', dystans_km: 10, ukonczonych: 900, url_wyniki: 'http://wyniki.datasport.pl/zly' },
  { event_id: 'e23-42', nazwa: '23. Poznań Maraton – Maraton', data: '2024-10-13', miejscowosc: 'Poznań', dystans_km: 42.195, ukonczonych: 3834, url_wyniki: 'https://wyniki.datasport.pl/results/p23' },
  { event_id: 'e22', nazwa: '22. Poznań Maraton', data: '2023-10-22', miejscowosc: 'Poznań', dystans_km: 42.195, ukonczonych: 3500, url_wyniki: 'https://wyniki.datasport.pl/results/p22' }];

test('strażnik linków: tylko https + serwis z listy (bez portu, user@, punycode, IP, przekierowań) — funkcja i kopia we froncie dają to samo', async () => {
  const { zaladuj } = await moduly();
  const L = await zaladuj('supabase/functions/okienko/linki-wynikow.mjs');
  assert.deepEqual(L.DOMENY_WYNIKOW, ['datasport.pl', 'elektronicznezapisy.pl', 'b4sport.pl', 'plus-timing.pl', 'foxter-sport.pl', 'time4run.com.pl'], 'lista 6 domen (Filip 23.11)');
  for (const z of ZLE) assert.equal(L.linkWynikow(z), null, 'przepuścił: ' + String(z).slice(0, 60));
  for (const [u, o] of DOBRE) assert.equal(L.linkWynikow(u), o, u);
  const listaFrontu = czytaj('js/okienko.js').match(/var DOMENY_WYNIKOW = \[([^\]]*)\];/);
  assert.ok(listaFrontu, 'kopia listy we froncie');
  assert.deepEqual(JSON.parse('[' + listaFrontu[1].replace(/'/g, '"') + ']'), L.DOMENY_WYNIKOW, 'lista we froncie = lista w funkcji');
  const h = front();
  for (const z of ZLE.filter((x) => typeof x === 'string')) assert.doesNotMatch(h({ url_wyniki: z }), /Oficjalne wyniki/, 'front przepuścił: ' + z.slice(0, 60));
  for (const [u] of DOBRE) assert.match(h({ url_wyniki: u }), /Oficjalne wyniki ›/, 'front odrzucił: ' + u);
});

test('front: „Oficjalne wyniki ›” tylko przy edycji, która się odbyła; nowa karta, noopener; podpis źródła; przyszła edycja nigdy', async () => {
  const h = front();
  const z = h({ url_wyniki: 'https://wyniki.datasport.pl/results/p23' });
  assert.match(z, /<a class="okn-link" href="https:\/\/wyniki\.datasport\.pl\/results\/p23" target="_blank" rel="noopener noreferrer">Oficjalne wyniki ›<\/a><span class="okn-meta">źródło wyników: datasport\.pl<\/span>/);
  assert.doesNotMatch(h({ przeszla: false, data: '2027-10-10', url_wyniki: 'https://wyniki.datasport.pl/results/p27' }), /Oficjalne wyniki/, 'przyszła edycja');
  assert.doesNotMatch(h({ przeszla: undefined, url_wyniki: 'https://wyniki.datasport.pl/x' }), /Oficjalne wyniki/, 'nieznane „przeszla”');
  assert.doesNotMatch(h({ url_wyniki: '"><img src=x onerror=alert(1)>' }), /onerror|Oficjalne wyniki/);
  assert.match(h({ ma_wyniki: true, ostatnia_z_wynikami: true }), /ostatnia edycja z wynikami<\/span><button type="button" class="okn-otworz" data-cel="wyniki\.html#\/impreza\/kalendarz%3Ap25\/2024">Wyniki ›/);
  const kod = czytaj('js/okienko.js');
  assert.equal(kod.split('Oficjalne wyniki').length - 1, 2, 'jedno miejsce z linkiem (+ komentarz)');
  assert.match(kod, /var u = linkWynikow\(d\.url_wyniki\), h = u && window\.safeExternalHref \? window\.safeExternalHref\(u, \{ tylkoHttps: true \}\) : '';/);
});

test('maszyna → karta: mapowanie przepuszcza url_wyniki tylko przez strażnika', async () => {
  const { zaladuj } = await moduly();
  const K = await zaladuj('supabase/functions/okienko/kalendarz.mjs');
  assert.equal(K.mapuj({ klucz: 'k:1', nazwa: 'X', data: '2024-01-01', url_wyniki: 'https://wyniki.datasport.pl/r/1' }).url_wyniki, 'https://wyniki.datasport.pl/r/1');
  for (const z of ['http://wyniki.datasport.pl/r/1', 'https://evil.pl/r', 'javascript:x', null]) assert.equal(K.mapuj({ klucz: 'k:1', nazwa: 'X', data: '2024-01-01', url_wyniki: z }).url_wyniki, null, String(z));
});

test('a) reguła wyników: bez edycji z wynikami na liście → event_info → karta ostatniej edycji z wynikami (największy dystans tej daty); brak wyników albo awaria → pusto', async () => {
  const { zaladuj } = await moduly();
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs'), f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  f6._wyczyscPamiecF6();
  const m = maszyna([PRZYSZLA], { 'kalendarz:p27': INFO_P27 });
  const k = await I.kartyWynikow(m.fetchF6, 'T', 'poznan maraton');
  assert.deepEqual(m.wywolania, ['events_search:poznan maraton', 'event_info:kalendarz:p27']);
  assert.equal(k.length, 1);
  assert.deepEqual({ ...k[0].dane, dystanse: [...k[0].dane.dystanse].sort() }, { klucz: 'kalendarz:p27', nazwa: '23. Poznań Maraton', data: '2024-10-13', dokladnosc_daty: 'dzien', miejscowosc: 'Poznań',
    dystanse: [10, 42.195], zrodlo_domena: null, url: null, status: null, przeszla: true, ma_wyniki: true, url_wyniki: 'https://wyniki.datasport.pl/results/p23', ostatnia_z_wynikami: true });
  for (const [info, opis] of [[[INFO_P27[0]], 'seria bez wyników'], ['awaria', 'awaria maszyny'], [[{ event_id: 'x', data: 'zła' }], 'zła data']]) {
    f6._wyczyscPamiecF6();
    assert.deepEqual(await I.kartyWynikow(maszyna([PRZYSZLA], { 'kalendarz:p27': info }).fetchF6, 'T', 'poznan maraton'), [], opis);
  }
  f6._wyczyscPamiecF6();
  const zW = maszyna([PRZYSZLA, { klucz: 'wyniki:p23', nazwa: '23. Poznań Maraton', data: '2024-10-13', przeszla: true, ma_wyniki: true }], { 'kalendarz:p27': INFO_P27 });
  assert.deepEqual((await I.kartyWynikow(zW.fetchF6, 'T', 'poznan maraton')).map((x) => x.dane.klucz), ['wyniki:p23']);
  assert.deepEqual(zW.wywolania, ['events_search:poznan maraton'], 'jest edycja z wynikami → bez event_info');
  f6._wyczyscPamiecF6();
  const zlyAdres = maszyna([PRZYSZLA], { 'kalendarz:p27': [{ ...INFO_P27[2], url_wyniki: 'https://evil.pl/x' }] });
  assert.equal((await I.kartyWynikow(zlyAdres.fetchF6, 'T', 'poznan maraton'))[0].dane.url_wyniki, null);
});

test('a) tryb imprezy: przyszła edycja zostaje bez „Wyniki ›”, obok karta ostatniej edycji z wynikami; z kartą z wynikami albo przy pytaniu o cenę — bez event_info', async () => {
  const { zaladuj } = await moduly();
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs'), f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  const deps = (m, extra = {}) => ({ sb: atrapa({ races: [] }), fetchFn: m.fetchF6, token: 'T', q: 'poznan maraton', jawne: true, dzis: DZIS,
    zPamieci: async () => null, sieciDozwolona: async () => false, siec: async () => { throw new Error('sieć'); }, doPamieci: async () => {}, znaleziska: async () => {}, ...extra });
  f6._wyczyscPamiecF6();
  const m = maszyna([PRZYSZLA, { klucz: 'kalendarz:p25', nazwa: '25 Poznań Maraton', data: '2026-10-04', przeszla: true, ma_wyniki: false }], { 'kalendarz:p27': INFO_P27 });
  const o = await I.odpowiedzImpreza(deps(m));
  assert.deepEqual(o.karty.map((k) => [k.dane.klucz, k.dane.data, k.dane.ma_wyniki, !!k.dane.ostatnia_z_wynikami]),
    [['kalendarz:p27', '2027-10-10', false, false], ['kalendarz:p25', '2026-10-04', false, false], ['kalendarz:p27', '2024-10-13', true, true]]);
  assert.deepEqual(m.wywolania, ['events_search:poznan maraton', 'event_info:kalendarz:p27']);
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const html = ctx.OKIENKO.htmlOdpowiedzi(200, { tryb: 'impreza', zdania: [], karty: o.karty });
  assert.deepEqual([...html.matchAll(/data-cel="([^"]*)">Wyniki ›/g)].map((x) => x[1]), ['wyniki.html#/impreza/kalendarz%3Ap27/2024'], 'jedyny „Wyniki ›” = ostatnia edycja z wynikami');
  assert.equal((html.match(/Oficjalne wyniki ›/g) || []).length, 1);
  f6._wyczyscPamiecF6();
  const zW = maszyna([PRZYSZLA, { klucz: 'wyniki:p23', nazwa: '23. Poznań Maraton', data: '2024-10-13', przeszla: true, ma_wyniki: true }], { 'kalendarz:p27': INFO_P27 });
  await I.odpowiedzImpreza(deps(zW));
  assert.deepEqual(zW.wywolania, ['events_search:poznan maraton'], 'karta z wynikami już jest');
  f6._wyczyscPamiecF6();
  const cena = maszyna([PRZYSZLA], { 'kalendarz:p27': INFO_P27 });
  await I.odpowiedzImpreza(deps(cena, { cena: true }));
  assert.deepEqual(cena.wywolania, ['events_search:poznan maraton'], 'pytanie o cenę');
  f6._wyczyscPamiecF6();   // live 23.11 („poznan polmaraton”): edycja z wynikami na 11. miejscu nie może wyłączyć karty, skoro widać tylko 5 bez wyników
  const daleko = maszyna([PRZYSZLA, ...Array.from({ length: 9 }, (_, i) => ({ klucz: 'kalendarz:s' + i, nazwa: 'Poznań Maraton ' + i, data: (2026 - i) + '-10-01', przeszla: true, ma_wyniki: false })),
    { klucz: 'kalendarz:inna', nazwa: 'Poznański Maraton Jesienny', miejscowosc: 'Poznań', data: '2015-11-09', przeszla: true, ma_wyniki: true }], { 'kalendarz:p27': INFO_P27 });
  /* wiersz z wynikami MUSI przejść filtr rdzeni (nazwa z „poznan” i „maraton”), inaczej test niczego nie sprawdza — pierwsza wersja z „Bieg Jesienny” przepuściła mutację */
  const od = await I.odpowiedzImpreza(deps(daleko));
  assert.deepEqual(daleko.wywolania, ['events_search:poznan maraton', 'event_info:kalendarz:p27']);
  assert.deepEqual(od.karty.map((k) => [k.dane.data, k.dane.ma_wyniki]), [['2027-10-10', false], ['2026-10-01', false], ['2025-10-01', false], ['2024-10-01', false], ['2024-10-13', true]]);
  f6._wyczyscPamiecF6();
  const duzo = maszyna(Array.from({ length: 6 }, (_, i) => ({ ...PRZYSZLA, klucz: 'kalendarz:p' + (27 + i), data: (2027 + i) + '-10-10' })), { 'kalendarz:p27': INFO_P27 });
  assert.equal((await I.odpowiedzImpreza(deps(duzo))).karty.length, 5, 'limit kart zostaje 5');
});

test('v2: „wyniki poznan maraton” przy samej przyszłej edycji → karta ostatniej z wynikami, „Wyniki ›” na rok 2024 i „Oficjalne wyniki ›”; bez sieci i modelu', async () => {
  const { R, zaladuj } = await moduly();
  const f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  f6._wyczyscPamiecF6();
  const m = maszyna([PRZYSZLA], { 'kalendarz:p27': INFO_P27 });
  const r = await przebiegV2('wyniki poznan maraton', { fetchF6: m.fetchF6 });
  assert.equal(r.slad, 'router:wyniki-imprezy'); assert.equal(r.sieci + r.modele, 0);
  assert.deepEqual(r.body.zdania, [R.ODP_WYNIKI_IMPREZY]);
  assert.deepEqual(r.body.karty.map((k) => [k.dane.data, k.dane.ma_wyniki, k.dane.ostatnia_z_wynikami]), [['2024-10-13', true, true]]);
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const html = ctx.OKIENKO.htmlOdpowiedzi(200, r.body);
  assert.match(html, /data-cel="wyniki\.html#\/impreza\/kalendarz%3Ap27\/2024">Wyniki ›/);
  assert.match(html, /href="https:\/\/wyniki\.datasport\.pl\/results\/p23" target="_blank" rel="noopener noreferrer">Oficjalne wyniki ›/);
});
