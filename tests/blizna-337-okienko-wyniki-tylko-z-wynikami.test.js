/* BLIZNA 337 (Filip 23.11, po próbie „poznan maraton wyniki”): karta Poznań Maratonu miała „Wyniki ›”, a ekran imprezy pokazał „Wyniki imprez jeszcze
   nie działają w maszynie.”. Odczyt (raport poza repo): 3 karty z kalendarza, żadna z wynikami w maszynie (maszyna ma wyniki tylko edycji 2024), a F6 019
   (event_info) nie jest wdrożone. Teraz:
   (1) „Wyniki ›” TYLKO przy edycji z wynikami w maszynie (ma_wyniki === true), nigdy przy edycji bez wyników, także przyszłej; dopóki maszyna nie podaje pola — nigdzie;
   (2) reguła wyników bez edycji z wynikami → „Nie znalazłem wyników tej imprezy.” + „Otwórz Wyniki ›”, bez sieci;
   (3) literówki wniki/wynki/wyiki/wynkii poprawiane tylko w kopii tekstu dla reguł (router, tryb imprezy); log v2 i klasyfikator dostają oryginał,
       a pytania z ławek bez tych form mają tekst dla reguł identyczny z oryginałem (nic obcego nie łapie). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { moduly, przebiegV2, KORZEN, DZIS } = require('./_okienko-potok-atrapa.js');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, TERAZ } = require('./_lawka-pytan.js');
const { zaladujSb } = require('./_srodowisko.js');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

const FORMY = ['wniki', 'wynki', 'wyiki', 'wynkii'];
const zLiterowka = (q, forma) => q.replace(/wyniki/i, (m) => (m[0] === 'W' ? forma[0].toUpperCase() + forma.slice(1) : forma));

/* atrapa maszyny wyników jak 23.11 na produkcji: trzy edycje z kalendarza bez pola ma_wyniki; z flagą — wiersze po wdrożeniu nowego events_search */
const POZNAN_DZIS = [
  { klucz: 'kalendarz:p25', nazwa: '25 Poznań Maraton', data: '2026-10-04', miejscowosc: 'Poznań', przeszla: true },
  { klucz: 'kalendarz:pp26', nazwa: 'Poznań Półmaraton', data: '2026-04-19', miejscowosc: 'Poznań', przeszla: true },
  { klucz: 'kalendarz:p24', nazwa: 'LOTTO 24. Poznań Maraton', data: '2025-10-12', miejscowosc: 'Poznań', przeszla: true }];
const POZNAN_Z_WYNIKAMI = [
  { klucz: 'kalendarz:p27', nazwa: '26 Poznań Maraton', data: '2027-10-10', miejscowosc: 'Poznań', przeszla: false, ma_wyniki: false },
  ...POZNAN_DZIS.map((x) => ({ ...x, ma_wyniki: false })),
  { klucz: 'wyniki:p23', nazwa: '23. Poznań Maraton', data: '2024-10-13', miejscowosc: 'Poznań', przeszla: true, ma_wyniki: true },
  { klucz: 'wyniki:p22', nazwa: '22. Poznań Maraton', data: '2023-10-22', miejscowosc: 'Poznań', przeszla: true, ma_wyniki: true }];
function maszyna(wiersze) {
  const wywolania = [];
  return { wywolania, fetchF6: async (url, init) => {
    const rpc = String(url).split('/rpc/')[1], a = JSON.parse(init.body);
    wywolania.push(rpc + ':' + a.p_q);
    return { ok: true, status: 200, json: async () => (rpc === 'events_search' && /pozna/i.test(a.p_q || '') ? wiersze : []) };
  } };
}

function zbiorPytan() {   // te same pliki co blizna-330
  const zbior = new Set();
  const dodaj = (x) => { if (typeof x === 'string' && x.trim().length >= 2 && x.length < 200) zbior.add(x.trim()); };
  const zbierz = (v) => { if (Array.isArray(v)) { if (typeof v[0] === 'string') dodaj(v[0]); else v.forEach(zbierz); } else if (v && typeof v === 'object') { for (const k of ['p', 'q', 'pytanie', 'tekst', 'pyt']) dodaj(v[k]); } };
  for (const f of ['_lawka-pytan.js', '_lawka-v2-pytania.js', '_lawka-wiedzy.js', '_lawka-akcji.js']) { const m = require('./' + f); for (const k of Object.keys(m)) zbierz(m[k]); }
  zbierz(JSON.parse(fs.readFileSync(path.join(KORZEN, 'tools/okienko-ab-pytania.json'), 'utf8')));
  Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '_nagrania-v2.json'), 'utf8'))).forEach(dodaj);
  for (const d of Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '_lawka-v2-kandydaci.json'), 'utf8')))) zbierz(d);
  return [...zbior];
}

test('literówki: tekstDlaRegul — cztery formy, tylko całe słowa, wielka litera zostaje, idempotentne; obce słowa i nie-tekst bez zmian', async () => {
  const { R } = await moduly();
  for (const f of FORMY) {
    assert.equal(R.tekstDlaRegul('poznan maraton ' + f), 'poznan maraton wyniki', f);
    assert.equal(R.tekstDlaRegul(f[0].toUpperCase() + f.slice(1) + ' parkrun?'), 'Wyniki parkrun?', f);
    assert.equal(R.tekstDlaRegul(f.toUpperCase()), 'Wyniki', f);
  }
  assert.equal(R.tekstDlaRegul('wniki i wynki, wyiki; wynkii'), 'wyniki i wyniki, wyniki; wyniki');
  assert.equal(R.tekstDlaRegul(R.tekstDlaRegul('poznan wniki')), 'poznan wyniki');
  for (const o of ['wnikliwie', 'wnikliwy', 'wnikać', 'przenikać', 'wynkiem', 'wyikać', 'Wnikliwa analiza biegu', 'czy wnikniesz w mój plan', 'zawodowiec wynkami', 'wynik', 'wyniku', 'wynikii', 'awniki', 'wniki2', 'wyniki']) assert.equal(R.tekstDlaRegul(o), o, o);
  for (const x of [null, undefined, 12, { a: 1 }]) assert.deepEqual(R.tekstDlaRegul(x), x);
});

test('literówki: każda forma trafia tam, gdzie poprawna pisownia (wyniki imprezy, moje wyniki, osoba, pytania bez reguły)', async () => {
  const { R, zaladuj, AK } = await moduly();
  AK.ustawStan({ ruszyla: true, zamknieta: false, proba: false });
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const trasa = (q) => { const d = R.dopasuj(q, DZIS); return JSON.stringify([d ? [d.log || null, d.narzedzie || null, d.wynikiImprezy ? d.wynikiImprezy.q : null] : null, I.imprezaZPytania(q)]); };
  const BAZA = ['poznan maraton wyniki', 'polmaraton poznan wyniki', 'wyniki maratonu warszawskiego 2025', 'Bieg Niepodległości wyniki', 'wyniki parkrun',
    'Wyniki Cracovia Maratonu już są?', 'wyniki z biegu na 10 km w Gdyni', 'moje wyniki', 'jakie mam wyniki w tym roku', 'Jan Kowalski wyniki'];
  for (const p of BAZA) for (const f of FORMY) assert.equal(trasa(zLiterowka(p, f)), trasa(p), zLiterowka(p, f));
  const d = R.dopasuj('poznan maraton wniki', DZIS);
  assert.equal(d && d.log, 'wyniki-imprezy'); assert.equal(d.wynikiImprezy.q, 'poznan maraton');
  assert.equal(I.imprezaZPytania('poznan maraton wniki'), null, 'z literówką nie idzie trybem imprezy z „wniki” w nazwie');
});

test('korpus ławek: tylko znane pytania z literówką; dla pozostałych tekst dla reguł = oryginał (nic obcego nie łapie)', async () => {
  const { R } = await moduly();
  const pytania = zbiorPytan();
  assert.ok(pytania.length > 2600, 'korpus ' + pytania.length);
  const zmienione = pytania.filter((q) => R.tekstDlaRegul(q) !== q).sort();
  assert.deepEqual(zmienione, ['jakei mam wynki z zawodow', 'jakei mam wynki z zawodów', 'wynkii z moich startow w tym rokuu', 'wynkii z moich startów w tym rokuu'],
    'nowe pytanie z literówką w ławce? dopisz je tu po sprawdzeniu trasy');
  for (const q of zmienione) assert.equal(R.tekstDlaRegul(q).replace(/wyniki/g, 'X'), q.replace(/(?<![\p{L}\d])(wniki|wynki|wyiki|wynkii)(?![\p{L}\d])/giu, 'X'), q);
});

test('tylko kopia dla reguł: obie funkcje nie poprawiają tekstu; poprawka siedzi w trzech regułach; log v2 i klasyfikator dostają oryginał', async () => {
  for (const f of ['supabase/functions/okienko/index.ts', 'supabase/functions/okienko-v2/potok.mjs']) assert.doesNotMatch(czytaj(f), /tekstDlaRegul|LITEROWKI_WYNIKI/, f);
  const router = czytaj('supabase/functions/okienko/router.mjs'), impreza = czytaj('supabase/functions/okienko/impreza.mjs');
  assert.match(router, /export function dopasuj\(tekst, dzis\) \{\n  tekst = tekstDlaRegul\(tekst\);/);
  assert.match(router, /export function wynikiImprezyZPytania\(tekst\) \{\n  tekst = tekstDlaRegul\(tekst\);/);
  assert.match(impreza, /export function imprezaZPytania\(tekst\) \{\n  tekst = tekstDlaRegul\(tekst\);/);
  assert.equal((router + impreza).split('tekst = tekstDlaRegul(tekst);').length - 1, 3, 'dokładnie trzy miejsca');
  // v2 naprawdę: pytanie z literówką, którego reguły nie łapią, idzie do klasyfikatora i do logu w oryginale
  const { potok } = await moduly();
  const q = 'jakei mam wynki z zawodów', tabele = { okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [], athletes: [] }, doKlasyfikatora = [];
  const nad = { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, uzyteRozmowDzis: async () => 0,
    rozumienie: async (...a) => { doKlasyfikatora.push(JSON.stringify(a)); return { intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 0, wy: 0 } }; },
    zapytajSiec: async () => { throw new Error('sieć'); }, zapytajModel: async () => { throw new Error('model'); }, rozmowaModel: async () => null, generujJson: async () => { throw new Error('model'); } };
  const sb = atrapa(baza()); sb.rpc = async () => ({ data: null, error: { message: 'rpc' } });
  await potok({ tekst: q, historia: [], ekran: 'home', athleteId: JA, sb, adm: atrapa(tabele), jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn: async () => { throw new Error('sieć'); } }, nad);
  assert.ok(doKlasyfikatora.length >= 1 && doKlasyfikatora.every((a) => a.includes(q) && !a.includes('jakei mam wyniki')), 'klasyfikator dostał oryginał: ' + doKlasyfikatora.join(' | ').slice(0, 200));
  assert.ok(tabele.okienko_v2_log.length >= 1 && tabele.okienko_v2_log.every((w) => w.tekst === q), 'log v2 ma oryginał');
});

test('front: „Wyniki ›” tylko przy ma_wyniki === true; nigdy przy edycji bez wyników, także przyszłej; mapowanie maszyny ściśle boolean', async () => {
  const { zaladuj } = await moduly();
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const html = (d) => ctx.OKIENKO.htmlOdpowiedzi(200, { tryb: 'impreza', zdania: [], karty: [{ typ: 'impreza', dane: { nazwa: 'Poznań Maraton', data: '2026-10-04', przeszla: true, klucz: 'kalendarz:p25', ...d } }] });
  for (const m of [undefined, false, null, 'true', 1, {}]) assert.doesNotMatch(html({ ma_wyniki: m }), />Wyniki ›</, 'ma_wyniki = ' + JSON.stringify(m));
  assert.doesNotMatch(html({ przeszla: false, data: '2027-10-10' }), />Wyniki ›</, 'przyszła edycja bez wyników');
  assert.match(html({ ma_wyniki: true }), /data-cel="wyniki\.html#\/impreza\/kalendarz%3Ap25\/2026">Wyniki ›/);
  assert.match(html({ ma_wyniki: false }), /Poznań Maraton/, 'karta bez przycisku zostaje (tryb imprezy: termin, miejsce)');
  const K = await zaladuj('supabase/functions/okienko/kalendarz.mjs');
  for (const [w, o] of [[true, true], [false, false], ['true', false], [1, false], [undefined, false]]) assert.equal(K.mapuj({ klucz: 'k:1', nazwa: 'X', data: '2025-01-01', ma_wyniki: w }).ma_wyniki, o, String(w));
});

test('kartyWynikow: tylko edycje z wynikami, najnowsza pierwsza, najwyżej 3; dziś (bez pola) pusto', async () => {
  const { zaladuj } = await moduly();
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs'), f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  f6._wyczyscPamiecF6();
  assert.deepEqual(await I.kartyWynikow(maszyna(POZNAN_DZIS).fetchF6, 'T', 'poznan maraton'), []);
  f6._wyczyscPamiecF6();
  const k = await I.kartyWynikow(maszyna(POZNAN_Z_WYNIKAMI).fetchF6, 'T', 'poznan maraton');
  assert.deepEqual(k.map((x) => [x.typ, x.dane.klucz]), [['impreza', 'wyniki:p23'], ['impreza', 'wyniki:p22']]);
  f6._wyczyscPamiecF6();
  const duzo = Array.from({ length: 6 }, (_, i) => ({ klucz: 'wyniki:x' + i, nazwa: 'Poznań Maraton ' + i, data: (2018 + i) + '-10-01', miejscowosc: 'Poznań', przeszla: true, ma_wyniki: true }));
  assert.deepEqual((await I.kartyWynikow(maszyna(duzo).fetchF6, 'T', 'poznan maraton')).map((x) => x.dane.data), ['2023-10-01', '2022-10-01', '2021-10-01']);
});

test('v2: „poznan maraton wyniki” i z literówką — reguła wyników bez sieci i modelu; dziś „Nie znalazłem wyników tej imprezy.” + „Otwórz Wyniki ›”; z wynikami karty z przyciskiem', async () => {
  const { R, zaladuj } = await moduly();
  const f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  assert.equal(R.ODP_WYNIKI_BRAK, 'Nie znalazłem wyników tej imprezy.');
  for (const q of ['poznan maraton wyniki', 'poznan maraton wniki', 'Poznan maraton WYNKII']) {
    f6._wyczyscPamiecF6();
    const m = maszyna(POZNAN_DZIS), r = await przebiegV2(q, { fetchF6: m.fetchF6 });
    assert.equal(r.slad, 'router:wyniki-imprezy', q);
    assert.deepEqual(r.body.zdania, [R.ODP_WYNIKI_BRAK], q);
    // 24.11 (blizna-348): pod „Otwórz Wyniki ›” „Szukaj wyników w Google ›” — nazwa i miasto z najnowszej przeszłej edycji kalendarza, rok z jej daty
    assert.deepEqual(r.body.karty, [R.KARTA_WYNIKI, { typ: 'szukaj_google', dane: { q: '25 Poznań Maraton Poznań 2026 wyniki' } }], q);
    assert.equal(r.sieci + r.modele, 0, q);
    assert.deepEqual(m.wywolania.map((w) => w.toLowerCase()).slice(0, 1), ['events_search:poznan maraton'], q + ' (bez słowa „wyniki” i literówki w zapytaniu do maszyny)');
    assert.ok(m.wywolania.slice(1).every((w) => w.startsWith('event_info')) && m.wywolania.length <= 2, q + ' — najwyżej jedno event_info (krok 3 a, blizna-338)');
  }
  f6._wyczyscPamiecF6();
  const z = await przebiegV2('poznan maraton wniki', { fetchF6: maszyna(POZNAN_Z_WYNIKAMI).fetchF6 });
  assert.deepEqual(z.body.zdania, [R.ODP_WYNIKI_IMPREZY]);
  assert.deepEqual(z.body.karty.map((k) => k.dane.klucz), ['wyniki:p23', 'wyniki:p22']);
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  assert.equal((ctx.OKIENKO.htmlOdpowiedzi(200, z.body).match(/>Wyniki ›</g) || []).length, 2);
  const brak = ctx.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: [R.ODP_WYNIKI_BRAK], karty: [R.KARTA_WYNIKI] });
  assert.match(brak, /Nie znalazłem wyników tej imprezy\./); assert.match(brak, /data-cel="wyniki\.html">Otwórz Wyniki ›/);
});
