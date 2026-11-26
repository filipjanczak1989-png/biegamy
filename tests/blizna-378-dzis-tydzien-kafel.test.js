// Blizna #378 (26.11.2026) — nowe Dziś, Tydzień (E6a), commit 3: kafel „Ten tydzień”.
//
// Po linii pod powitaniem (blizna-377) dochodzi kafel z makiety r5, po „Ostatnim treningu”: zakres dat, „Kalendarz ›”,
// trzy liczby (czas w ruchu, kilometry do planu, średnie tempo; bez planu kilometrów „tydzień temu” zamiast „do planu”),
// siedem słupków pn–nd (plan obrysem, zrobione wypełnieniem, dziś wyróżnione, kilometry dnia pod słupkiem), legenda
// i mała linia aktywności niebiegowych. Decyzje Filipa 26.11: trzy liczby jak w makiecie; niebiegowe w osobnej małej
// linii; odczyt pod palcem później. Liczby z policzTydzien (blizna-376), więc te same co w linii pod powitaniem.
// Gdy tygodnia nie da się policzyć, kafla NIE MA (nie zostaje na szkielecie i nie pokazuje zer).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, TERAZ, PROFIL, MODUL } = require('./_dzis-nowy-strona.js');

const H = 3600e3;
const plan = (id, date, type, km, status) => ({ id, date, type, distance_km: km, duration_min: null, pace: null, description: 'opis ' + id, status: status || 'planned', plan_source: 'coach', coach_id: 'c-9' });
const log = (iso, typ, km, czas) => ({ logged_at: iso, training_type: typ, distance_km: km, duration: czas });
// czwartek 26.11.2026, tydzień 23–29.11
const PLANY = [plan('p1', '2026-11-23', 'Spokojny', 8, 'done'), plan('p2', '2026-11-24', 'Odpoczynek', null), plan('p3', '2026-11-25', 'Interwały', 10, 'done'), plan('p4', '2026-11-26', 'Tempo', 9), plan('p6', '2026-11-28', 'Spokojny', 5), plan('p7', '2026-11-29', 'Wybieganie', 6)];
const WPISY = [log('2026-11-25T17:10:00+00:00', 'Interwały', 10.2, '52:30'), log('2026-11-24T06:00:00+00:00', 'Rower', 22, '1:05:00'), log('2026-11-23T16:00:00+00:00', 'Spokojny', 8.21, '44:36'), log('2026-11-26T06:00:00+00:00', 'Spokojny', 6.19, '34:00'),
  log('2026-11-21T09:00:00+00:00', 'Wybieganie', 16.4, '1:32:05'), log('2026-11-18T17:00:00+00:00', 'Spacer', 3, '40:00')];
const kafel = (s) => s.kafel('tydzien');
const slupki = (h) => [...h.matchAll(/<div class="dn-sl( dzis)?"><div class="dn-sl-p">(.*?)<\/div><b>([^<]*)<\/b><span>([^<]*)<\/span><\/div>/g)].map((m) => [m[4], m[3], (/plan" style="height:(\d+)%/.exec(m[2]) || [])[1] || '', (/zrob" style="height:(\d+)%/.exec(m[2]) || [])[1] || '', m[1] ? 'dziś' : '']);

test('(1) z planem: zakres dat, „Kalendarz ›”, trzy liczby, siedem słupków pn–nd, legenda, linia niebiegowych', async () => {
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start(); await s.doKonca();
  const h = kafel(s).innerHTML;
  assert.equal(kafel(s).hidden, false);
  assert.match(h, /^<div class="dn-gora"><div><h2 class="dn-etykieta">Ten tydzień<\/h2><div class="dn-kto">23–29 listopada<\/div><\/div><a class="dn-link" href="kalendarz\.html\?role=athlete">Kalendarz ›<\/a><\/div>/);
  assert.deepEqual([...h.matchAll(/<div class="dn-l"><b>(.*?)<\/b><span>([^<]*)<\/span><\/div>/g)].map((m) => [m[1], m[2]]),
    [['3:16<small>h</small>', 'czas w ruchu'], ['13,4<small>km</small>', 'do planu'], ['5:20<small>/km</small>', 'śr. tempo']], 'czas wszystkich aktywności; 38 − 24,6 km; tempo tylko z biegów');
  assert.match(h, /<div class="dn-liczby dn-trzy">/);
  assert.ok(MODUL.includes('#dzis-nowy .dn-liczby.dn-trzy{grid-template-columns:repeat(3,1fr)}'), 'trzy liczby w trzech kolumnach (kafel „Ostatni trening” ma cztery)');
  assert.deepEqual(slupki(h), [['pn', '8,2', '78', '80', ''], ['wt', '', '', '', ''], ['śr', '10,2', '98', '100', ''], ['cz', '6,2', '88', '61', 'dziś'], ['pt', '', '', '', ''], ['sb', '', '49', '', ''], ['nd', '', '59', '', '']],
    'wysokości względem największego słupka tygodnia (10,2 km); plan obrysem, zrobione wypełnieniem; czwartek to dziś');
  assert.match(h, /<p class="dn-legenda"><span><i class="plan"><\/i>plan<\/span><span><i class="zrob"><\/i>zrobione<\/span><\/p>/);
  assert.match(h, /<p class="dn-inne">\+ 1 inna aktywność · 22 km<\/p>$/, 'rower osobno, małą linią; nie w kilometrach biegowych');
  assert.equal(s.cz('tydzien-linia').innerHTML, 'Ten tydzień: <b>24,6</b> z 38 km · <b>4</b> z 5 treningów', 'te same liczby co w linii pod powitaniem');
});

test('(2) słupki mają jeden opis dla czytnika ekranu, a kilometry dnia stoją pod słupkiem (bez odczytu pod palcem)', async () => {
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start(); await s.doKonca();
  assert.match(kafel(s).innerHTML, /<div class="dn-slupki" role="img" aria-label="Kilometry dzień po dniu: pn 8,2 km, plan 8 km; wt bez biegu; śr 10,2 km, plan 10 km; cz 6,2 km, plan 9 km; pt bez biegu; sb bez biegu, plan 5 km; nd bez biegu, plan 6 km">/);
  assert.match(MODUL, /#dzis-nowy \.dn-slupki\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/, 'siedem równych kolumn: mieści się też przy 320 px');
  const z = s.B.zakresTygodnia(TERAZ), t = s.B.policzTydzien([plan('a', '2026-11-23', 'Wybieganie', 30), plan('b', '2026-11-24', 'Spokojny', 1)], [log('2026-11-24T10:00:00+00:00', 'Spokojny', 0.4, '3:00')], z);
  assert.deepEqual(slupki(s.B.tydzienHtml(t, z)).slice(0, 2), [['pn', '', '100', '', ''], ['wt', '0,4', '6', '6', '']], 'bardzo mały słupek ma najmniej 6% wysokości, żeby był widoczny');
});

test('(3) bez planu kilometrów: „tydzień temu” zamiast „do planu”, bez obrysów planu i bez legendy', async () => {
  const s = strona({ trening: [], wpisyTyg: WPISY, profil: Object.assign({}, PROFIL, { coach_id: null }) }); s.B.start(); await s.doKonca();
  const h = kafel(s).innerHTML;
  assert.deepEqual([...h.matchAll(/<div class="dn-l"><b>(.*?)<\/b><span>([^<]*)<\/span><\/div>/g)].map((m) => [m[1], m[2]]), [['3:16<small>h</small>', 'czas w ruchu'], ['16,4<small>km</small>', 'tydzień temu'], ['5:20<small>/km</small>', 'śr. tempo']], 'tydzień temu: tylko biegowe (spacer się nie liczy)');
  assert.doesNotMatch(h, /dn-legenda|class="plan"|do planu/);
  assert.equal(slupki(h).filter((x) => x[3]).length, 3);
  // plan z samą siłą (bez kilometrów) to też „bez planu kilometrów”
  const sila = strona({ trening: [plan('s', '2026-11-27', 'Siła', null)], wpisyTyg: WPISY }); sila.B.start(); await sila.doKonca();
  assert.match(kafel(sila).innerHTML, /tydzień temu/); assert.doesNotMatch(kafel(sila).innerHTML, /dn-legenda/);
});

test('(4) drobne formaty: zakres na przełomie miesięcy, czas poniżej godziny, brak czasu i tempa, odmiana „inne aktywności”', () => {
  const s = strona(), H2 = s.B.tydzienHtml, zG = s.B.zakresTygodnia(new Date(2026, 11, 2, 12).getTime());
  const pusty = (o) => Object.assign({ od: zG.od, do: zG.do, km: 0, kmInne: 0, planKm: 0, kmPoprz: 0, sek: 0, inne: 0, tempoSek: 0, zaplanowane: 0, zrobione: 0, wpisow: 0, dniZRuchem: 0, dni: zG.dni.map((d) => ({ dzien: d, km: 0, planKm: 0, plan: false, wolne: false, wpisow: 0 })) }, o);
  assert.match(H2(pusty({}), zG), /<div class="dn-kto">30 listopada – 6 grudnia<\/div>/);
  const liczby = (h) => [...h.matchAll(/<div class="dn-l"><b>(.*?)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(liczby(H2(pusty({ sek: 42 * 60 + 20, wpisow: 1 }), zG)), ['42<small>min</small>', '0<small>km</small>', '—'], 'poniżej godziny minuty; bez tempa kreska bez jednostki');
  assert.deepEqual(liczby(H2(pusty({ planKm: 20, km: 26 }), zG)), ['—', '0<small>km</small>', '—'], 'plan przekroczony: do planu 0, nie liczba ujemna');
  assert.deepEqual(liczby(H2(pusty({ sek: 3600 * 10 + 5 * 60, tempoSek: 305 }), zG)), ['10:05<small>h</small>', '0<small>km</small>', '5:05<small>/km</small>']);
  assert.match(H2(pusty({ inne: 2, kmInne: 0 }), zG), /<p class="dn-inne">\+ 2 inne aktywności<\/p>$/, 'bez kilometrów (np. siłownia) sama liczba');
  assert.match(H2(pusty({ inne: 5, kmInne: 41.26 }), zG), /<p class="dn-inne">\+ 5 innych aktywności · 41,3 km<\/p>$/);
  assert.doesNotMatch(H2(pusty({}), zG), /dn-inne/);
  assert.equal(slupki(H2(pusty({}), zG)).filter((x) => x[4]).length, 1, 'dziś (środa 2.12) wyróżnione także w pustym tygodniu');
});

test('(5) kafel stoi po „Ostatnim treningu”, przed listą; gdy tygodnia nie da się policzyć, jest schowany, nie na szkielecie i nie z zerami', async () => {
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start();
  assert.match(s.korzen.innerHTML, /data-kafel="ostatni".*data-kafel="tydzien" aria-busy="true"><h2 class="dn-etykieta">Ten tydzień<\/h2>.*data-kafel="lista"/, 'szkielet kafla od początku');
  await s.doKonca(); assert.equal(kafel(s).hidden, false);
  s.st.awaria = { 'training_logs tydzien': 'odmowa' }; s.B.wczytaj(true); await s.doKonca();
  assert.equal(kafel(s).hidden, true, 'odmowa wpisów tygodnia: kafel znika razem z linią'); assert.equal(s.cz('tydzien-linia').innerHTML, '');
  s.st.awaria = {}; s.B.wczytaj(true); await s.doKonca(); assert.equal(kafel(s).hidden, false);
  for (const [opis, o] of [['strona bez funkcji tygodnia', { bezTygodnia: true }], ['nie doszły plany', { awaria: { trainings: 'odmowa' } }], ['nie doszedł profil', { awaria: { athletes: 'odmowa' } }], ['bez sieci i bez migawki', { online: false, awaria: { '*': 'siec' } }], ['bez sieci i bez konta', { online: false, sesja: false, awaria: { '*': 'siec' } }]]) {
    const x = strona(Object.assign({ trening: PLANY, wpisyTyg: WPISY }, o)); x.B.start(); await x.doKonca();
    assert.equal(kafel(x).hidden, true, opis); assert.equal(kafel(x).getAttribute('aria-busy'), null, opis + ': nie zostaje na szkielecie');
  }
  const bez = strona({ pamiec: new Map(s.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: TERAZ + 2 * H }); bez.B.start(); await bez.doKonca();
  assert.equal(kafel(bez).hidden, false, 'bez sieci w tym samym tygodniu kafel z telefonu'); assert.match(kafel(bez).innerHTML, /13,4<small>km<\/small><\/b><span>do planu/);
  const zaTydzien = strona({ pamiec: new Map(s.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: TERAZ + 7 * 24 * H }); zaTydzien.B.start(); await zaTydzien.doKonca();
  assert.equal(kafel(zaTydzien).hidden, true, 'za tydzień bez sieci: zeszłotygodniowe słupki nie udają bieżących');
});
