/* BLIZNA 332 (Filip 22.11, krok 2): „półmaraton Poznań wyniki” szło do sieci (tryb imprezy pomija „wyniki”), a sieć oddała datę kolejnej edycji zamiast wyników.
   Teraz: „wynik/wyniki” + słowo biegowe → kalendarz maszyny wyników BEZ sieci i do 3 kart imprez z „Wyniki ›” (najpierw edycje przeszłe); bez trafienia albo przy
   awarii maszyny „Nie znalazłem tej imprezy…” + „Otwórz Wyniki ›”. „moje wyniki”, imię i nazwisko, imię albo zaimek w pytaniu — jak dotąd. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { moduly, przebiegV2, trasaRoutera, KORZEN } = require('./_okienko-potok-atrapa.js');
const { zaladujSb } = require('./_srodowisko.js');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

/* atrapa maszyny wyników: Poznań — edycja przeszła i nadchodząca z kluczem; „awaria” — błąd; reszta — pusto */
const IMPREZY = [{ klucz: 'kalendarz:poznan-polmaraton-2027', nazwa: 'Poznań Półmaraton', data: '2027-04-11', miejscowosc: 'Poznań', przeszla: false },
  { klucz: 'kalendarz:poznan-polmaraton-2026', nazwa: 'Poznań Półmaraton', data: '2026-04-12', miejscowosc: 'Poznań', przeszla: true }];
const wywolania = [];
const fetchF6 = async (url, init) => {
  const rpc = String(url).split('/rpc/')[1], a = JSON.parse(init.body);
  wywolania.push(rpc + ':' + a.p_q);
  if (/awaria/i.test(a.p_q || '')) return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => (rpc === 'events_search' && /pozna/i.test(a.p_q || '') ? IMPREZY : []) };
};

const TAK = [['polmaraton poznan wyniki', 'polmaraton poznan'], ['wyniki półmaratonu poznańskiego', 'półmaratonu poznańskiego'], ['wyniki maratonu warszawskiego 2025', 'maratonu warszawskiego'],
  ['Bieg Niepodległości wyniki', 'Bieg Niepodległości'], ['wyniki parkrun', 'parkrun'], ['Wyniki Cracovia Maratonu już są?!', 'Cracovia Maratonu']];
const NIE = [['moje wyniki', 'moje_wyniki'], ['jak mi poszło w Dębnie', 'moje_wyniki'], ['wyniki Jan Kowalski', null], ['Kto wygrał maraton w Berlinie?', null], ['wyniki', null],
  ['wyniki badań krwi', null], ['Jaki wynik w historycznych tabelach ma Kasia na 100km', null], ['jaki wynik w historycznych tabelach ma ona na 100km', null],
  // kolizje znalezione na ławkach przed commitem: liczba pojedyncza „wynik” i własne wyniki („miałem”) nie są pytaniem o imprezę
  ['Czy kofeina przed zawodami rzeczywiście poprawia wynik?', null], ['Jakie miałem wyniki w zawodach w tym roku?', null]];

test('router: wyniki imprezy → zdanie zapasowe + „Otwórz Wyniki ›” i zapytanie do kalendarza; moje wyniki, osoby i pytania bez słowa biegowego jak dotąd', async () => {
  const { R } = await moduly();
  for (const [q, nazwa] of TAK) {
    const d = R.dopasuj(q, '2026-11-22');
    assert.equal(d && d.log, 'wyniki-imprezy', q);
    assert.equal(d.wynikiImprezy.q, nazwa, q);
    assert.equal(d.zdanie, R.ODP_WYNIKI_BRAK, q);
    assert.deepEqual(d.karty, [R.KARTA_WYNIKI], q);
  }
  for (const [q, oczek] of NIE) assert.equal(await trasaRoutera(q), oczek, q);
  assert.equal(R.ODP_WYNIKI_IMPREZY, 'Wyniki tej imprezy są w zakładce Wyniki:');
  assert.equal(R.ODP_WYNIKI_BRAK, 'Nie znalazłem tej imprezy w maszynie wyników. Poszukaj jej w zakładce Wyniki:');
});

test('v2: trafienie → karty imprez z kluczem (najpierw przeszła), brak trafienia i awaria → „Otwórz Wyniki ›”; zawsze bez sieci i modelu', async () => {
  const { R, zaladuj } = await moduly();
  const f6 = await zaladuj('supabase/functions/okienko/f6.mjs');
  f6._wyczyscPamiecF6();
  const r = await przebiegV2('polmaraton poznan wyniki', { fetchF6 });
  assert.equal(r.slad, 'router:wyniki-imprezy');
  assert.deepEqual(r.body.zdania, [R.ODP_WYNIKI_IMPREZY]);
  assert.deepEqual(r.body.karty.map((k) => [k.typ, k.dane.klucz]), [['impreza', 'kalendarz:poznan-polmaraton-2026'], ['impreza', 'kalendarz:poznan-polmaraton-2027']], 'przeszła edycja pierwsza');
  assert.ok(wywolania.some((w) => w === 'events_search:polmaraton poznan'), 'zapytanie do kalendarza bez „wyniki”: ' + wywolania.join(', '));
  for (const q of ['wyniki parkrun', 'wyniki maratonu awaria']) {
    f6._wyczyscPamiecF6();
    const b = await przebiegV2(q, { fetchF6 });
    assert.equal(b.slad, 'router:wyniki-imprezy', q);
    assert.deepEqual(b.body.zdania, [R.ODP_WYNIKI_BRAK], q);
    assert.deepEqual(b.body.karty, [R.KARTA_WYNIKI], q);
    assert.equal(b.sieci + b.modele, 0, q);
  }
  assert.equal(r.sieci + r.modele, 0);
});

test('v1: ten sam krok w funkcji; front: karta imprezy z kluczem ma „Wyniki ›”, karta zapasowa „Otwórz Wyniki ›”', async () => {
  const { R } = await moduly();
  const v1 = czytaj('supabase/functions/okienko/index.ts');
  assert.match(v1, /if \(traf\.log === "wyniki-imprezy"\) \{ let k: unknown\[\] = \[\]; try \{ k = await kartyWynikow\(fetch, jwt,/);
  assert.match(v1, /if \(k\.length\) return odp\(200, \{ \.\.\.pusto\("router"\), zdania: \[ODP_WYNIKI_IMPREZY\], karty: k \}\); \}/);
  assert.match(czytaj('supabase/functions/okienko/impreza.mjs'), /export async function kartyWynikow\(fetchFn, token, q\) \{\n  const l = await szukajImprez\(fetchFn, token, \{ q \}\);/);
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  const h = ctx.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: [R.ODP_WYNIKI_IMPREZY], karty: [{ typ: 'impreza', dane: IMPREZY[1] }] });
  assert.match(h, /data-cel="wyniki\.html#\/impreza\/kalendarz%3Apoznan-polmaraton-2026\/2026">Wyniki ›/);
  const z = ctx.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: [R.ODP_WYNIKI_BRAK], karty: [R.KARTA_WYNIKI] });
  assert.match(z, /data-cel="wyniki\.html">Otwórz Wyniki ›/);
});
