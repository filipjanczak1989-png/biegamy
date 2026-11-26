// Blizna #376 (26.11.2026) — nowe Dziś, Tydzień (E6a), commit 1: dane tygodnia.
//
// Stare Dziś ma „Postęp tygodnia” (N z M zaplanowanych, kilometry), nowe Dziś nie miało o tygodniu nic.
// Ten commit to same DANE, na ekranie nic nowego: zapytanie o plany TYGODNIA zastępuje zapytanie o trening na dziś
// (dzisiejszy wybierany po dacie), dochodzi jedno zapytanie o wpisy z dwóch tygodni, a liczenie idzie regułami
// starej updateWeekProgress. Decyzje Filipa 26.11: budżet 6 zapytań bez trenera i 7 z trenerem; doba warszawska;
// bez planu „km tydzień temu” z tego samego zapytania; tydzień trafia do migawki „dzisNowe”.
// Zgodność ze starym jest sprawdzana na ŹRÓDLE starej funkcji (wycięte wzory z zawodnik.html), nie na przepisanej kopii.
// Funkcje tygodnia (_tydzienWaw, _dzienWaw, isRunType, _parseTimeToSecs) są prawdziwe, wycięte z klienta.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, TERAZ, UID, PROFIL, MODUL, czytaj } = require('./_dzis-nowy-strona.js');

const H = 3600e3;
// czwartek 26.11.2026; tydzień pn 23.11 – nd 29.11; poprzedni 16–22.11
const plan = (id, date, type, km, status, z) => Object.assign({ id, date, type, distance_km: km, duration_min: null, pace: null, description: 'opis ' + id, status: status || 'planned', plan_source: 'coach', coach_id: 'c-9' }, z);
const log = (iso, typ, km, czas) => ({ logged_at: iso, training_type: typ, distance_km: km, duration: czas });
const PLANY = [plan('p1', '2026-11-23', 'Spokojny', 8, 'done'), plan('p2', '2026-11-24', 'Odpoczynek', null), plan('p3', '2026-11-25', 'Interwały', 10, 'done'), plan('p4', '2026-11-26', 'Tempo', 9),
  plan('p5', '2026-11-27', 'Siła', null), plan('p6', '2026-11-28', 'Spokojny', 6), plan('p7', '2026-11-29', 'Wybieganie', 18)];
const WPISY = [log('2026-11-25T17:10:00+00:00', 'Interwały', 10.2, '52:30'), log('2026-11-24T06:00:00+00:00', 'Rower', 22, '1:05:00'), log('2026-11-23T16:00:00+00:00', 'Spokojny', 8.21, '44:36'),
  log('2026-11-21T09:00:00+00:00', 'Wybieganie', 16.4, '1:32:05'), log('2026-11-18T17:00:00+00:00', 'Spokojny', 7, '38:00'), log('2026-11-17T17:00:00+00:00', 'Spacer', 3, '40:00')];

/** Wzory starej updateWeekProgress, wycięte ze źródła i policzone na tych samych danych. */
const STARE = /  const planned = [\s\S]*?  const plannedKm = [^\n]*\n/.exec(czytaj('zawodnik.html'));
function stare(trainingsThisWeek, logsThisWeek, window) {
  assert.ok(STARE, 'w zawodnik.html nie ma już wzorów starego Postępu tygodnia: test trzeba przepiąć');
  return new Function('trainingsThisWeek', 'logsThisWeek', 'window', STARE[0] + 'return { planned, done, totalKm, subKm, plannedKm };')(trainingsThisWeek, logsThisWeek, window);
}

test('(1) budżet: 6 zapytań bez trenera, 7 z trenerem, 2 fale; plany TYGODNIA zamiast dzisiejszego treningu, wpisy z dwóch tygodni jednym zapytaniem', async () => {
  const s = strona({ profil: Object.assign({}, PROFIL, { coach_id: null }), trening: PLANY, wpisyTyg: WPISY }); s.B.start(); await s.tik();
  assert.deepEqual(s.zapytania.map((z) => z.nazwa).sort(), ['athletes', 'rpc akcja_licznik', 'rpc akcja_moj_wklad'], 'fala 1');
  s.zapytania.forEach((z) => z.odpowiedz()); await s.tik();
  assert.deepEqual(s.zapytania.slice(3).map((z) => z.nazwa).sort(), ['training_logs', 'training_logs tydzien', 'trainings'], 'fala 2');
  await s.doKonca();
  assert.equal(s.zapytania.length, 6, 'bez trenera 6');
  const t = s.zapytania.find((z) => z.nazwa === 'trainings').opis, l = s.zapytania.find((z) => z.nazwa === 'training_logs tydzien').opis;
  assert.match(t, /\.gte\("date","2026-11-23"\)\.lte\("date","2026-11-29"\)\.order\("date"\)\.order\("created_at"\)\.limit\(60\)$/, 'plany pn–nd');
  assert.doesNotMatch(t, /\.eq\("date"/, 'osobnego zapytania o dziś już nie ma');
  assert.match(l, /^\.select\("logged_at,training_type,distance_km,duration"\)\.eq\("athlete_id","a-1"\)\.not\("training_type","like","__badge__%"\)\.gte\("logged_at","2026-11-15T21:00:00\.000Z"\)/, 'wpisy od poniedziałku POPRZEDNIEGO tygodnia, z zapasem na północ w Warszawie');
  assert.equal(s.zapytania.filter((z) => z.nazwa === 'trainings').length, 1);
  const zTrenerem = strona({ trening: PLANY, wpisyTyg: WPISY }); zTrenerem.B.start(); await zTrenerem.doKonca();
  assert.deepEqual(zTrenerem.zapytania.map((z) => z.nazwa).sort(), ['athletes', 'messages', 'rpc akcja_licznik', 'rpc akcja_moj_wklad', 'training_logs', 'training_logs tydzien', 'trainings'], 'z trenerem 7');
  s.B.start(); await s.doKonca(); assert.equal(s.zapytania.length, 6, 'w oknie 60 s nic nie dochodzi');
});

test('(2) trening na dziś dalej ten sam: wybrany z tygodnia po dacie, w kolejności dodania, najwyżej trzy; plan z innego dnia nie udaje dzisiejszego', async () => {
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start(); await s.doKonca();
  assert.match(s.kafel('trening').innerHTML, /opis p4/); assert.doesNotMatch(s.kafel('trening').innerHTML, /opis p(1|3|5|6|7)/);
  assert.deepEqual(s.migawka().czesci.dzisNowe.trening, { dzien: '2026-11-26', lista: [PLANY[3]] }, 'do migawki jako „trening” idzie tylko dzisiejszy');
  const dwa = strona({ trening: [plan('rano', '2026-11-26', 'Spokojny', 5), plan('wieczor', '2026-11-26', 'Siła', null), plan('x3', '2026-11-26', 'Tempo', 4), plan('x4', '2026-11-26', 'Tempo', 4), plan('jutro', '2026-11-27', 'Tempo', 9)] });
  dwa.B.start(); await dwa.doKonca();
  assert.deepEqual(dwa.migawka().czesci.dzisNowe.trening.lista.map((x) => x.id), ['rano', 'wieczor', 'x3']);
  assert.match(dwa.kafel('trening').innerHTML, /opis rano/); assert.doesNotMatch(dwa.kafel('trening').innerHTML, /opis jutro/);
  const pusto = strona({ trening: [plan('jutro', '2026-11-27', 'Tempo', 9)] }); pusto.B.start(); await pusto.doKonca();
  assert.match(pusto.kafel('trening').innerHTML, /Dziś bez planu/, 'w tygodniu jest plan, ale nie na dziś');
  assert.match(MODUL, /qT\.gte\("date", z\.od < dzis \? z\.od : dzis\)\.lte\("date", z\.do > dzis \? z\.do : dzis\)/, 'zakres obejmuje też „dziś” telefonu, gdyby za granicą wypadało poza tygodniem warszawskim');
});

test('(3) zgodność ze starym „Postępem tygodnia”: te same dane, wzory wycięte ze źródła starej funkcji, te same „N z M” i kilometry', () => {
  const s = strona(), z = s.B.zakresTygodnia(TERAZ);
  const zestawy = [
    ['plan i wpisy', PLANY, WPISY],
    ['więcej wpisów niż planów', [plan('a', '2026-11-23', 'Spokojny', 8)], WPISY],
    ['plany odhaczone bez wpisów', [plan('a', '2026-11-23', 'Spokojny', 8, 'done'), plan('b', '2026-11-24', 'Tempo', 10, 'done'), plan('c', '2026-11-25', 'Siła', null)], []],
    ['odpoczynek odhaczony', [plan('a', '2026-11-23', 'Odpoczynek', null, 'done'), plan('b', '2026-11-24', 'Tempo', '10.5')], [log('2026-11-24T10:00:00+00:00', 'tempo ', '10.5', '50:00')]],
    ['bez planu', [], WPISY], ['nic', [], []],
    ['plan niebiegowy z dystansem', [plan('a', '2026-11-24', 'Rower', 30), plan('b', '2026-11-25', 'Spokojny', 5)], [log('2026-11-24T10:00:00+00:00', 'Rower', 31, '1:10:00')]],
    ['dystans tekstem i pusty', [plan('a', '2026-11-26', 'Bieg spokojny', '7,5'), plan('b', '2026-11-26', 'Spokojny', null)], [log('2026-11-26T08:00:00+00:00', 'Spokojny', null, null), log('2026-11-26T09:00:00+00:00', 'Pływanie', '1.2', '30:00')]],
  ];
  for (const [opis, plany, wpisy] of zestawy) {
    const wTygodniu = wpisy.filter((l) => l.logged_at >= '2026-11-22T23:00:00+00:00');   // stara funkcja dostaje z bazy tylko wpisy bieżącego tygodnia
    const st = stare(plany, wTygodniu, s.w), n = s.B.policzTydzien(plany, wpisy, z);
    assert.deepEqual([n.zaplanowane, n.zrobione, n.km, n.kmInne, n.planKm], [st.planned, st.done, st.totalKm, st.subKm, st.plannedKm], opis);
  }
  const n = s.B.policzTydzien(PLANY, WPISY, z);
  assert.deepEqual([n.zaplanowane, n.zrobione, n.planKm], [6, 3, 51], 'dla porządku wprost: 6 zaplanowanych (bez Odpoczynku), 3 zrobione, 51 km planu biegowego');
  assert.ok(Math.abs(n.km - 18.41) < 1e-9); assert.equal(n.kmInne, 22);
});

test('(4) nowe liczby: czas w ruchu, średnie tempo biegów, km tydzień temu, dni z ruchem, siedem dni pn–nd; dane w kształcie z bazy', () => {
  const s = strona(), z = s.B.zakresTygodnia(TERAZ), n = s.B.policzTydzien(PLANY, WPISY, z);
  assert.equal(n.sek, 52 * 60 + 30 + 65 * 60 + 44 * 60 + 36, 'czas w ruchu: wszystkie aktywności tygodnia, czas z tekstu „M:SS” i „H:MM:SS”');
  assert.equal(n.tempoSek, Math.round((52 * 60 + 30 + 44 * 60 + 36) / (10.2 + 8.21)), 'średnie tempo tylko z biegów (rower nie zaniża)');
  assert.ok(Math.abs(n.kmPoprz - 23.4) < 1e-9, 'tydzień temu: tylko biegowe (16,4 + 7), spacer się nie liczy');
  assert.deepEqual([n.wpisow, n.dniZRuchem, n.inne], [3, 3, 1]);
  assert.deepEqual(Array.from(n.dni).map((d) => d.dzien), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  assert.deepEqual(Array.from(n.dni).map((d) => [Math.round(d.km * 100) / 100, d.planKm, d.plan, d.wolne]), [[8.21, 8, true, false], [0, 0, false, true], [10.2, 10, true, false], [0, 9, true, false], [0, 0, true, false], [0, 6, true, false], [0, 18, true, false]]);
  // bieg bez czasu albo bez dystansu nie psuje tempa; dwa biegi jednego dnia się sumują; dwa plany jednego dnia też
  const d = s.B.policzTydzien([plan('a', '2026-11-26', 'Spokojny', 5), plan('b', '2026-11-26', 'Tempo', 4)], [log('2026-11-26T06:00:00+00:00', 'Spokojny', 5, '30:00'), log('2026-11-26T17:00:00+00:00', 'Tempo', 4, null), log('2026-11-26T18:00:00+00:00', 'Spokojny', null, '10:00')], z);
  assert.deepEqual([d.dni[3].km, d.dni[3].planKm, d.km, d.tempoSek, d.sek, d.dniZRuchem, d.wpisow], [9, 9, 9, 360, 2400, 1, 3]);
  assert.equal(s.B.policzTydzien([], [], z).tempoSek, 0);
});

test('(5) brzegi tygodnia w dobie warszawskiej: niedziela 23:59 to jeszcze stary tydzień, poniedziałek 00:01 już nowy; plan spoza tygodnia się nie liczy', () => {
  const s = strona(), z = s.B.zakresTygodnia(TERAZ);
  assert.deepEqual([z.od, z.do, z.poprzOd, z.dzis, z.wpisyOd], ['2026-11-23', '2026-11-29', '2026-11-16', '2026-11-26', '2026-11-15T21:00:00.000Z']);
  // zimą Warszawa = UTC+1: 22.11 22:59 UTC = niedziela 23:59; 22.11 23:01 UTC = poniedziałek 00:01
  const n = s.B.policzTydzien([plan('przed', '2026-11-22', 'Spokojny', 30), plan('po', '2026-11-30', 'Spokojny', 30)],
    [log('2026-11-22T22:59:00+00:00', 'Spokojny', 5, '30:00'), log('2026-11-22T23:01:00+00:00', 'Spokojny', 7, '40:00'), log('2026-11-29T22:59:00+00:00', 'Spokojny', 3, '20:00'), log('2026-11-29T23:01:00+00:00', 'Spokojny', 100, '9:00:00'),
      log('2026-11-15T22:59:00+00:00', 'Spokojny', 50, '5:00:00'), log('2026-11-15T23:01:00+00:00', 'Spokojny', 2, '12:00'), log('zła data', 'Spokojny', 99, '1:00')], z);
  assert.deepEqual([n.km, n.kmPoprz, n.dni[0].km, n.dni[6].km, n.zaplanowane, n.planKm], [10, 7, 7, 3, 0, 0], 'wpisy z zapasu zapytania (niedziela sprzed dwóch tygodni) i z następnego tygodnia odpadają');
  assert.deepEqual([s.B.zakresTygodnia(new Date(2026, 10, 29, 23, 30).getTime()).od, s.B.zakresTygodnia(new Date(2026, 10, 30, 0, 30).getTime()).od], ['2026-11-23', '2026-11-30'], 'niedziela wieczór i poniedziałek tuż po północy');
});

test('(6) migawka: para plany + wpisy z poniedziałkiem tygodnia; bez sieci wraca tylko dla tego samego tygodnia; odmowa nie sięga do telefonu i nie psuje kafla treningu', async () => {
  const a = strona({ trening: PLANY, wpisyTyg: WPISY }); a.B.start(); await a.doKonca();
  const m = a.migawka().czesci.dzisNowe;
  assert.deepEqual(m.tydzien, { od: '2026-11-23', plany: PLANY, wpisy: WPISY }); assert.equal(m.czas.tydzien, TERAZ);
  assert.equal(a.B.tydzien().zaplanowane, 6);
  const bez = strona({ pamiec: new Map(a.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: TERAZ + 3 * H }); bez.B.start(); await bez.doKonca();
  assert.deepEqual([bez.B.tydzien().zaplanowane, bez.B.tydzien().zrobione, bez.B.tydzien().planKm], [6, 3, 51], 'bez sieci tydzień z telefonu'); assert.equal(bez.pasekOffline(), 'Offline · dane z 12:00');
  const zaTydzien = strona({ pamiec: new Map(a.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: TERAZ + 7 * 24 * H }); zaTydzien.B.start(); await zaTydzien.doKonca();
  assert.equal(zaTydzien.B.tydzien(), null, 'zeszłotygodniowe liczby nie udają bieżących');
  const pol = strona({ pamiec: new Map(a.tel.mapa), awaria: { 'training_logs tydzien': 'siec' }, teraz: TERAZ + H, trening: PLANY.slice(0, 4), wpisyTyg: [] }); pol.B.start(); await pol.doKonca();
  assert.equal(pol.B.tydzien().zaplanowane, 6, 'padły same wpisy tygodnia: cała para z telefonu, nie świeże plany ze starymi wpisami');
  assert.match(pol.kafel('trening').innerHTML, /opis p4/);
  const odm = strona({ pamiec: new Map(a.tel.mapa), awaria: { 'training_logs tydzien': 'odmowa' }, teraz: TERAZ + H, trening: PLANY, wpisyTyg: WPISY }); odm.B.start(); await odm.doKonca();
  assert.equal(odm.B.tydzien(), null); assert.equal(odm.pasekOffline(), null); assert.match(odm.kafel('trening').innerHTML, /opis p4/, 'kafel treningu nie zależy od wpisów tygodnia');
  assert.deepEqual(odm.zgloszenia.map((x) => JSON.stringify(x)).filter((x) => /tydzien/.test(x)).length, 1, 'usterka zgłoszona etapem „tydzien”');
  assert.deepEqual(odm.migawka().czesci.dzisNowe.tydzien.wpisy, WPISY, 'a w telefonie zostaje poprzednia para');
});

test('(7) strona bez funkcji tygodnia (stary klient w pamięci telefonu): po staremu samo dziś, 5 zapytań, bez tygodnia i bez błędu', async () => {
  const s = strona({ bezTygodnia: true, profil: Object.assign({}, PROFIL, { coach_id: null }) }); s.B.start(); await s.doKonca();
  assert.equal(s.B.zakresTygodnia(TERAZ), null);
  assert.deepEqual(s.zapytania.map((z) => z.nazwa).sort(), ['athletes', 'rpc akcja_licznik', 'rpc akcja_moj_wklad', 'training_logs', 'trainings']);
  assert.match(s.zapytania.find((z) => z.nazwa === 'trainings').opis, /\.eq\("date","2026-11-26"\)\.order\("created_at"\)\.limit\(3\)$/);
  assert.equal(s.B.tydzien(), null); assert.equal(s.zgloszenia.length, 0); assert.match(s.kafel('trening').innerHTML, /Rozgrzewka/);
  assert.equal('tydzien' in s.migawka().czesci.dzisNowe, false);
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /RUN_TYPES|'spokojny'|"spokojny"|Europe\/Warsaw/, 'moduł nie przepisuje listy typów biegowych ani strefy: woła isRunType, _dzienWaw, _tydzienWaw');
  assert.equal(UID, 'u-1'); assert.ok(wpis);
});
