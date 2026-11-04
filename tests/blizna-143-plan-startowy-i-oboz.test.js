/* BLIZNA 143 (4.11.2026, zlecenie Filipa z 3.11): plan startowy i obozy w Okienku.
   Plan = przepis w kodzie: role A/B/C, odstępy po maratonie i półmaratonie, maks. 1 A na pół roku, promień, 3–6 startów. Brak celu i życiówki = bez ról. Start bez dystansu nie jest główny.
   Kalendarz nie ma współrzędnych (m3 4.11), a tylko 9 z 263 nadchodzących ma dystans: słownik miast i dystans z nazwy; czego nie znamy, tego nie zgadujemy i mówimy o tym.
   EF niczego nie zapisuje: „Zapisz plan” zapisuje przeglądarka po potwierdzeniu, bez nadpisania celów. Obóz nigdy nie jest imprezą po słowie w nazwie, a bieg z obozem w nazwie działa jak dotąd.
   Do sieci nie idzie miasto ani dane osoby. Akcja zawsze wygrywa z planem. Atrapy: 0 $, bez sieci. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');
const { zaladujSb, tekstDlaOkna } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const P = () => zaladuj('supabase/functions/okienko-v2/plan-startowy.mjs');

const D0 = '2026-11-04';
const dzien = (n) => new Date(Date.parse(D0 + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const k = (nazwa, n, dystanse, extra = {}) => ({ nazwa, data: dzien(n), miasto: 'Poznań', dystanse, odl: 20, gorski: false, wykluczony: false, klucz: null, url: null, ...extra });
const PB_M = { 42.195: 3 * 3600 };

test('rola A z życiówki, B 3–6 tyg. przed A z uzasadnieniem, C krótszy od A; start tak długi jak A nie jest treningiem', async () => {
  const { ulozPlan } = await P();
  const w = ulozPlan({ dzis: D0, pb: PB_M, poziom: 'sredni', kandydaci: [k('Maraton X', 120, [42.195]), k('Półmaraton Y', 92, [21.0975]), k('Dycha Z', 60, [10]), k('Drugi Maraton', 150, [42.195])] });
  const A = w.starty.find((s) => s.rola === 'A'), B = w.starty.find((s) => s.rola === 'B');
  assert.equal(A.nazwa, 'Maraton X'); assert.equal(B.nazwa, 'Półmaraton Y');
  assert.match(B.powod, /^4 tyg\. przed maratonem, sprawdzisz tempo\.$/);
  const C = w.starty.filter((s) => s.rola === 'C');
  assert.deepEqual(C.map((s) => s.nazwa), ['Dycha Z'], 'drugi maraton nie zostaje treningiem');
  assert.match(C[0].powod, /Trening startowy 9 tyg\. przed maratonem/);
  assert.ok(w.starty.every((s, i, l) => !i || l[i - 1].data <= s.data), 'kolejność po dacie');
});

test('B tylko 21–42 dni przed A: 14 i 50 dni przed nie jest sprawdzianem; bez kandydata plan to mówi', async () => {
  const { ulozPlan } = await P();
  const w = ulozPlan({ dzis: D0, pb: PB_M, poziom: 'sredni', kandydaci: [k('Maraton X', 140, [42.195]), k('Blisko', 126, [21.0975]), k('Daleko', 90, [21.0975])] });
  assert.ok(!w.starty.some((s) => s.rola === 'B'));
  assert.ok(w.uwagi.some((u) => /nie ma sprawdzianu 3–6 tyg/.test(u)));
  for (const [dni, jest] of [[21, true], [42, true], [20, false], [43, false]]) {
    const r = ulozPlan({ dzis: D0, pb: PB_M, poziom: 'sredni', liczba: 3, kandydaci: [k('M', 140, [42.195]), k('P', 140 - dni, [21.0975])] });
    assert.equal(r.starty.some((s) => s.rola === 'B'), jest, dni + ' dni');
  }
});

test('odstępy: po maratonie ≥ 28 dni, po półmaratonie ≥ 14; także gdy start stoi przed długim; C najpóźniej 14 dni przed A', async () => {
  const { odstepOk, odstepPo, C_PRZED_A_DNI } = await P();
  assert.deepEqual([odstepPo(42.195), odstepPo(21.0975), odstepPo(10)], [28, 14, 7]);
  const M = { data: dzien(100), km: 42.195, rola: 'A' };
  assert.equal(odstepOk([M], { data: dzien(127), km: 5, rola: 'C' }), false, '27 dni po maratonie');
  assert.equal(odstepOk([M], { data: dzien(128), km: 5, rola: 'C' }), true, '28 dni po maratonie');
  const H = { data: dzien(100), km: 21.0975, rola: 'A' };
  assert.equal(odstepOk([H], { data: dzien(113), km: 10, rola: 'B' }), false); assert.equal(odstepOk([H], { data: dzien(114), km: 10, rola: 'C' }), true);
  assert.equal(odstepOk([{ data: dzien(100), km: 10, rola: 'C' }], { data: dzien(90), km: 21.0975, rola: 'C' }), false, 'półmaraton 10 dni przed innym startem');
  assert.equal(C_PRZED_A_DNI, 14);
  assert.equal(odstepOk([M], { data: dzien(90), km: 5, rola: 'C' }), false, 'C 10 dni przed A'); assert.equal(odstepOk([M], { data: dzien(86), km: 5, rola: 'C' }), true);
  assert.equal(odstepOk([M], { data: dzien(100), km: 5, rola: 'C' }), false, 'ten sam dzień');
});

test('maks. 1 A na pół roku: drugi maraton 150 dni później nie jest A, 190 dni później jest (tylko przy Więcej startów); dwa cele w pół roku to nie dwa A', async () => {
  const { ulozPlan, moznaA } = await P();
  assert.equal(moznaA([{ rola: 'A', data: dzien(100) }], { data: dzien(281) }), false); assert.equal(moznaA([{ rola: 'A', data: dzien(100) }], { data: dzien(282) }), true);
  const licz = (w) => w.starty.filter((s) => s.rola === 'A').length;
  assert.equal(licz(ulozPlan({ dzis: D0, pb: PB_M, liczba: 6, kandydaci: [k('M1', 100, [42.195]), k('M2', 250, [42.195])] })), 1);
  assert.equal(licz(ulozPlan({ dzis: D0, pb: PB_M, liczba: 6, kandydaci: [k('M1', 100, [42.195]), k('M2', 290, [42.195])] })), 2);
  assert.equal(licz(ulozPlan({ dzis: D0, pb: PB_M, liczba: 4, kandydaci: [k('M1', 100, [42.195]), k('M2', 290, [42.195])] })), 1, 'bez chipa jeden główny');
  const dwa = ulozPlan({ dzis: D0, pb: PB_M, cele: [{ nazwa: 'Cel M', data: dzien(100), km: 42.195 }, { nazwa: 'Cel M2', data: dzien(160), km: 42.195 }], kandydaci: [] });
  assert.equal(licz(dwa), 1); assert.equal(dwa.starty.length, 2, 'cel użytkownika nie znika');
});

test('liczba startów 3–6: domyślnie wg poziomu, nigdy ponad 6; za mało kandydatów = uczciwa uwaga, nie dopychanie', async () => {
  const { ulozPlan, LICZBA_WG_POZIOMU } = await P();
  const duzo = [k('M', 200, [42.195])]; for (let i = 0; i < 30; i++) duzo.push(k('Bieg ' + i, 10 + i * 8, [10]));
  assert.equal(ulozPlan({ dzis: D0, pb: PB_M, poziom: 'zaawansowany', kandydaci: duzo }).starty.length, LICZBA_WG_POZIOMU.zaawansowany);
  assert.equal(ulozPlan({ dzis: D0, pb: PB_M, poziom: 'poczatkujacy', kandydaci: duzo }).starty.length, 3);
  assert.equal(ulozPlan({ dzis: D0, pb: PB_M, liczba: 6, kandydaci: duzo }).starty.length, 6);
  assert.equal(ulozPlan({ dzis: D0, pb: PB_M, liczba: 99, kandydaci: duzo }).starty.length, 6);
  const malo = ulozPlan({ dzis: D0, pb: PB_M, kandydaci: [k('M', 200, [42.195])] });
  assert.equal(malo.starty.length, 1); assert.ok(malo.uwagi.some((u) => /tylko 1 start/.test(u)));
});

test('bez celu i bez życiówki: żadnych ról, uczciwy komunikat; start bez dystansu nigdy nie jest główny ani sprawdzianem', async () => {
  const { ulozPlan } = await P();
  const b = ulozPlan({ dzis: D0, pb: {}, kandydaci: [k('Maraton', 100, [42.195]), k('Dycha', 50, [10])] });
  assert.equal(b.role, false); assert.ok(b.starty.every((s) => s.rola === null)); assert.match(b.uwagi[0], /nie wybieram startu głównego/);
  const bezD = ulozPlan({ dzis: D0, pb: PB_M, kandydaci: [k('Bieg bez dystansu', 100, []), k('Inny bez dystansu', 60, [])] });
  assert.ok(!bezD.starty.some((s) => s.rola === 'A' || s.rola === 'B')); assert.ok(bezD.starty.every((s) => s.rola === 'C' && s.km === null));
  assert.match(bezD.starty[0].powod, /Dystans sprawdź na stronie imprezy/);
  assert.ok(bezD.uwagi.some((u) => /nie ma startu, który mógłby być główny/.test(u)));
});

test('cel z moje_starty jest startem A, poza promieniem też; cel bez dystansu nie, ale plan o nim mówi; przeszłe cele odpadają; kalendarzowy dubel celu znika', async () => {
  const { ulozPlan } = await P();
  const w = ulozPlan({ dzis: D0, pb: {}, cele: [{ nazwa: 'Maraton Daleki', data: dzien(150), km: 42.195 }, { nazwa: 'Coś bez km', data: dzien(40), km: null }, { nazwa: 'Stary', data: dzien(-20), km: 42.195 }],
    kandydaci: [k('Maraton Daleki', 150, [42.195]), k('P', 120, [21.0975])] });
  const A = w.starty.find((s) => s.rola === 'A');
  assert.equal(A.nazwa, 'Maraton Daleki'); assert.equal(A.zCelu, true); assert.match(A.powod, /Twój cel startowy/);
  assert.equal(w.starty.filter((s) => s.nazwa === 'Maraton Daleki').length, 1);
  assert.ok(w.uwagi.some((u) => /„Coś bez km” nie ma dystansu/.test(u)));
  assert.ok(!w.starty.some((s) => s.nazwa === 'Stary'));
  assert.equal(w.starty.find((s) => s.nazwa === 'P').rola, 'B', 'rola B także przy celu bez życiówki');
});

test('promień: poza nim odpada, nieznana odległość nie jest zgadywana i liczy się w uwadze; brak miasta = cała Polska z komunikatem; dalszy maraton w uwadze', async () => {
  const { ulozPlan } = await P();
  const kand = [k('Bliski', 50, [10], { odl: 60 }), k('Sredni', 70, [10], { odl: 120 }), k('Daleki', 90, [10], { odl: 300 }), k('Nieznany', 110, [10], { odl: null })];
  const n = (w) => w.starty.map((s) => s.nazwa).sort();
  const w150 = ulozPlan({ dzis: D0, pb: {}, kandydaci: kand, promien: 150 });
  assert.deepEqual(n(w150), ['Bliski', 'Sredni']); assert.equal(w150.poza, 1); assert.equal(w150.bezOdleglosci, 1); assert.ok(w150.uwagi.some((u) => /bez znanej odległości \(1\)/.test(u)));
  assert.deepEqual(n(ulozPlan({ dzis: D0, pb: {}, kandydaci: kand, promien: 75 })), ['Bliski']);
  const bezM = ulozPlan({ dzis: D0, pb: {}, kandydaci: kand, znamMiasto: false });
  assert.equal(bezM.starty.length, 4); assert.ok(bezM.uwagi.some((u) => /nie filtruję po odległości/.test(u)));
  const dalej = ulozPlan({ dzis: D0, pb: PB_M, kandydaci: [k('Dycha', 80, [10]), k('Cracovia', 165, [42.195], { odl: 340, miasto: 'Kraków' })] });
  assert.ok(dalej.uwagi.some((u) => /Najbliższy maraton dalej: Cracovia/.test(u)));
  assert.equal(dalej.starty.find((s) => s.rola === 'A').nazwa, 'Dycha', 'główny z kolejnego dystansu');
});

test('kandydaci: biegi dziecięce, ultra, sztafety i wirtualne wykluczone; górski nie jest główny; dystans z nazwy oznaczony; dubel ze źródeł scalony; „Nowe zapisy” obcięte', async () => {
  const { mapujKandydata, dystansZNazwy, bezDubli, ulozPlan } = await P();
  const m = (n, d, x = {}) => mapujKandydata({ nazwa: n, data: dzien(60), miejscowosc: 'Poznań', dystanse: d, ...x });
  assert.equal(m('Great KIDS', '0.1, 0.2').wykluczony, true);
  for (const n of ['Dwumaraton Olęderski', 'Ultramaraton Annogórski', 'Maraton - Sztafety', 'Bieg dla dzieci']) assert.equal(m(n, '').wykluczony, true, n);
  assert.equal(mapujKandydata({ name: 'Bieg', event_date: dzien(9), city: 'Cały Świat', distances: [10] }).wykluczony, true);
  assert.equal(m('Półmaraton Górski', '').gorski, true);
  assert.equal(m('Bieg Jesienny', '10', { miejscowosc: 'Częstochowa' }).wykluczony, true, 'plan nie pokazuje startów, które łapie strażnik akcji');
  const h = m('RST Półmaraton Świdnicki', ''); assert.deepEqual(h.dystanse, [21.0975]); assert.equal(h.z_nazwy, true);
  assert.deepEqual(dystansZNazwy('7 Nocny Maraton i Półmaraton'), [42.195, 21.0975]); assert.deepEqual(dystansZNazwy('Bieg Niepodległości'), []);
  assert.equal(m('Nowe zapisy - 24. Cracovia Maraton', '42.195').nazwa, '24. Cracovia Maraton');
  assert.equal(m('X', '10', { url_zapisy: 'javascript:alert(1)' }).url, null); assert.equal(m('X', '10', { url_zapisy: 'https://a.pl/x' }).url, 'https://a.pl/x');
  assert.equal(m('X', '10', { klucz: 'wyniki:datasport:1' }).klucz, 'wyniki:datasport:1'); assert.equal(m('X', '10', { klucz: '<b>' }).klucz, null);
  const a = m('12. Półmaraton Y', '', { klucz: 'kalendarz:a' }), b = { ...m('13 Półmaraton Y', '21.0975'), data: dzien(61) };
  const s = bezDubli([a, b]); assert.equal(s.length, 1); assert.equal(s[0].z_nazwy, false, 'dystans z danych wygrywa'); assert.equal(s[0].klucz, 'kalendarz:a', 'klucz zachowany');
  const g = ulozPlan({ dzis: D0, pb: { 21.0975: 6000 }, kandydaci: [{ ...k('Górski', 100, [21.0975]), gorski: true }, k('Dycha', 80, [10])] });
  assert.equal(g.starty.find((x) => x.rola === 'A').nazwa, 'Dycha');
  const wyk = ulozPlan({ dzis: D0, pb: {}, kandydaci: [{ ...k('Kids', 50, [5]), wykluczony: true }] }); assert.equal(wyk.starty.length, 0);
});

test('zaawansowane: cel czasowy z js/riegel.js (jedno źródło), tylko przy życiówce i nie na górach; tapering: tygodnie jak w generatorze; bez literału wykładnika', async () => {
  const { celCzasowy, taperingDla, TAPERING, poziomZPb, pbSekundy, preferencje } = await P();
  const R = require('../js/riegel.js');
  const c = celCzasowy({ 42.195: 8820 }, 21.0975);
  assert.equal(c.czas_s, Math.round(R.przelicz(8820, 42.195, 21.0975) / 5) * 5); assert.equal(c.z_km, 42.195);
  assert.equal(celCzasowy({ 5: 1200, 42.195: 12000 }, 10).z_km, 5, 'najbliższa życiówka');
  assert.equal(celCzasowy({}, 10), null); assert.equal(celCzasowy({ 10: 2400 }, null), null); assert.equal(celCzasowy({ 10: 2400 }, 21.0975, true), null, 'góry: wzór nie działa');
  assert.doesNotMatch(czytaj('supabase/functions/okienko-v2/plan-startowy.mjs').replace(/\/\/[^\n]*/g, ''), /1[.,]06/);
  const G = require('../js/generator-planu.js').DYSTANSE;
  assert.deepEqual([TAPERING[5].tyg, TAPERING[10].tyg, TAPERING[21].tyg, TAPERING[42].tyg], [G['5k'].taper, G['10k'].taper, G.half.taper, G.marathon.taper], 'tygodnie = generator planu');
  for (const v of Object.values(TAPERING)) assert.equal(v.objetosc.length, v.tyg);
  assert.equal(taperingDla({ rola: 'A', km: 42.195 }).tyg, 3); assert.equal(taperingDla({ rola: 'C', km: 10 }), null);
  assert.equal(pbSekundy('2:27:00'), 8820); assert.equal(pbSekundy('45:30'), 2730); assert.equal(pbSekundy('zly'), null); assert.equal(pbSekundy(null), null);
  assert.equal(poziomZPb({ 42.195: 8820 }), 'zaawansowany'); assert.equal(poziomZPb({ 10: 3000 }), 'sredni'); assert.equal(poziomZPb({ 10: 3600 }), 'poczatkujacy'); assert.equal(poziomZPb({}), null);
  assert.deepEqual(preferencje({ 42.195: 8820 }, 'zaawansowany'), [42, 21, 10, 5]); assert.deepEqual(preferencje({ 10: 3600 }, 'poczatkujacy'), [10, 5]); assert.deepEqual(preferencje({ 42.195: 20000 }, 'poczatkujacy'), [21, 10, 5], 'początkujący: maraton nie jest główny z automatu');
});

test('ustawienia: każdy chip dziedziczy poprzednie, limit 5 zmian, „zapisz” nie liczy się jako zmiana, „od nowa” zeruje; chipy końcowe; okres z pory roku', async () => {
  const { nastepneUstawienia, kodUstawien, zKodu, chipyPlanu, stanZRozmowy, okresZTekstu, komendaPlanu, DOMYSLNE, MAX_DOPYTAN } = await P();
  let u = DOMYSLNE();
  assert.deepEqual(zKodu(kodUstawien(u)), u); assert.equal(zKodu('śmieci'), null); assert.ok(kodUstawien({ promien: 150, liczba: 6, zaaw: true, zagr: true, k: 5 }).length <= 60, 'slot ≤ 60');
  u = nastepneUstawienia(u, 'blizej').u; assert.equal(u.promien, 75);
  u = nastepneUstawienia(u, 'wiecej').u; assert.equal(u.promien, 75, 'dziedziczy'); assert.equal(u.liczba, 6);
  u = nastepneUstawienia(u, 'zaawansowane').u; assert.equal(u.zaaw, true); assert.equal(u.liczba, 6);
  const po = nastepneUstawienia(u, 'zapisz'); assert.equal(po.u.k, 3, 'zapis to nie zmiana'); assert.equal(po.limit, false);
  u = nastepneUstawienia(u, 'zagranica').u; u = nastepneUstawienia(u, 'okres').u; assert.equal(u.k, MAX_DOPYTAN);
  const lim = nastepneUstawienia(u, 'blizej'); assert.equal(lim.limit, true); assert.equal(lim.u.k, MAX_DOPYTAN);
  assert.deepEqual(chipyPlanu(u, false).map((c) => c.etykieta), ['Zapisz plan', 'Zacznij od nowa']);
  assert.deepEqual(nastepneUstawienia(u, 'od_nowa').u, DOMYSLNE());
  assert.deepEqual(chipyPlanu(DOMYSLNE(), false).map((c) => c.etykieta), ['Bliżej domu', 'Więcej startów', 'Zaawansowane', 'Zagranica']);
  assert.deepEqual(chipyPlanu({ ...DOMYSLNE(), promien: 75, zaaw: true }, false).map((c) => c.etykieta), ['Więcej startów', 'Zagranica'], 'użyty chip znika');
  assert.equal(stanZRozmowy([{ intencja: 'moj_plan', sloty: {} }, { intencja: 'plan_startowy', sloty: { plan: 'p75;n0;z0;g0;k1', od: '2027-03-01', do: '2027-05-31' } }]).u.promien, 75);
  assert.equal(stanZRozmowy([{ intencja: 'moj_plan', sloty: {} }]), null);
  assert.deepEqual(okresZTekstu('gdzie pobiec wiosną', D0), { od: '2027-03-01', do: '2027-05-31' });
  assert.deepEqual(okresZTekstu('a zimą', D0), { od: '2026-12-01', do: '2027-02-28' });
  assert.deepEqual(okresZTekstu('starty jesienią', '2026-10-15'), { od: '2026-10-15', do: '2026-11-30' }, 'trwająca pora roku od dziś');
  assert.deepEqual(okresZTekstu('starty w kwietniu', D0), { od: '2027-04-01', do: '2027-04-30' });
  assert.equal(okresZTekstu('plan startowy', D0), null);
  for (const [t, kom] of [['Bliżej domu', 'blizej'], ['więcej startów', 'wiecej'], ['Zaawansowane', 'zaawansowane'], ['za granicą', 'zagranica'], ['Zapisz plan', 'zapisz'], ['Zacznij od nowa', 'od_nowa'], ['a wiosną?', 'okres'], ['plan na jutro', null], ['zapisz mnie na bieg', null]]) assert.equal(komendaPlanu(t), kom, t);
});

test('słownik miast: odległości w rozsądnych widełkach, odmiany i skróty, nazwy niejednoznaczne poza słownikiem', async () => {
  const { wspolrzedne, odlegloscKm, LICZBA_MIAST } = await zaladuj('supabase/functions/okienko-v2/miasta-pl.mjs');
  const o = (a, b) => odlegloscKm(wspolrzedne(a), wspolrzedne(b));
  for (const [a, b, min, max] of [['Warszawa', 'Kraków', 240, 265], ['Poznań', 'Wrocław', 135, 155], ['Gdańsk', 'Warszawa', 275, 295], ['Środa Wielkopolska', 'Poznań', 22, 40], ['Szczecin', 'Rzeszów', 590, 640]]) { const d = o(a, b); assert.ok(d >= min && d <= max, `${a}–${b}: ${d}`); }
  assert.deepEqual(wspolrzedne('środa wlkp.'), wspolrzedne('Środa Wielkopolska')); assert.deepEqual(wspolrzedne('Skawina - Mogilany'), wspolrzedne('Skawina')); assert.deepEqual(wspolrzedne('Jedlina-Zdrój'), wspolrzedne('jedlina zdroj'));
  for (const n of ['Dąbrowa', 'Góra', 'Rudniki', 'Hanower', 'Cały Świat', '', null]) assert.equal(wspolrzedne(n), null, String(n));
  assert.equal(odlegloscKm(null, [50, 20]), null); assert.ok(LICZBA_MIAST > 250);
});

test('routing: plan startowy kontra lista biegów, własne starty i cudzy plan; obóz kontra bieg z obozem w nazwie; impreza nie bierze obozu', async () => {
  const { czyPlanStartowy } = await P();
  const R = await zaladuj('supabase/functions/okienko/router.mjs'), I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  for (const t of ['ułóż mi plan startowy', 'jakie starty w tym sezonie', 'gdzie pobiec wiosną', 'w jakich biegach wystartować latem', 'plan startów na wiosnę', 'zaplanuj mi sezon startowy', 'jakie starty w sezonie']) assert.equal(czyPlanStartowy(t), true, t);
  for (const t of ['gdzie pobiec dyche w grudniu', 'gdzie pobiec', 'jakie biegi wiosną w Krakowie', 'moje starty w tym sezonie', 'plan na jutro', 'mój plan', 'kiedy mam start', 'plan startowy Filipa i Kasi', 'gdzie biegną Filip i Kasia wiosną', 'plan startowy Filipa', 'jakie masz biegi']) assert.equal(czyPlanStartowy(t), false, t);
  for (const t of ['plan startowy Filipa i Kasi', 'gdzie biegną Filip i Kasia wiosną']) assert.equal(R.czyZagadka(t), true, t);
  for (const t of ['gdzie na obóz', 'obóz biegowy', 'zgrupowanie', 'obozy biegowe w górach', 'ile kosztuje obóz biegowy', 'obóz przed maratonem', 'OBÓZ', 'oboz biegowy tatry']) assert.equal(R.czyOboz(t), true, t);
  for (const t of ['wyniki biegu Obóz Karolin', 'kiedy jest bieg Obóz Karolin', 'rekord trasy bieg obóz', 'kto wygrał bieg na obóz', 'plan na jutro', 'maraton Obóz']) assert.equal(R.czyOboz(t), false, t);
  assert.equal(I.imprezaZPytania('obóz biegowy'), null); assert.equal(I.imprezaZPytania('ile kosztuje obóz biegowy'), null);
  assert.match(I.imprezaZPytania('kiedy jest bieg Obóz Karolin').q, /Obóz Karolin/);
  const Roz = await zaladuj('supabase/functions/okienko-v2/rozumienie.mjs');
  assert.ok(Roz.NAZWY_INTENCJI.includes('plan_startowy') && Roz.NAZWY_INTENCJI.includes('oboz'));
  assert.match(Roz.promptRozumienia('2026-11-04'), /obóz biegowy.*oboz, nigdy impreza/s);
});

/* potok na atrapach: rozmowa w jednej pamięci */
async function rozmowa(pytania, opcje = {}) {
  await zaladuj('js/akcja.mjs');
  const { potok } = await zaladuj('supabase/functions/okienko-v2/potok.mjs');
  const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [] }), wyniki = [], siec = [], f6 = [];
  const fetchFn = async (url, init) => { f6.push({ url, body: String(init && init.body) }); return (opcje.fetchFn || fetchF6)(url, init); };
  const sb = opcje.sb || atrapa(baza());
  for (const tekst of pytania) {
    const r = await potok({ tekst, historia: [], ekran: 'home', athleteId: JA, sb, adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn },
      { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, uzyteRozmowDzis: async () => 0, rozumienie: opcje.rozumienie || (async () => ({ intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 1, wy: 1 } })),
        zapytajSiec: async (o) => { siec.push(o); return { tekst: 'Obóz w Zakopanem 12–19 lipca, cena 2500 zł.', gm: { groundingChunks: [{ web: { uri: 'https://example.org/o', title: 'o' } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: 80 } }] }, tok: { we: 5, wy: 5 }, zapytania: 1 }; } });
    wyniki.push(r);
  }
  return { wyniki, siec, f6, adm, sb };
}

test('potok: plan bez modelu, karty i chipy; 5 kolejnych zmian, szósta odmawia; ustawienia przeżywają tury; tura ma slot planu', async () => {
  const { wyniki, adm } = await rozmowa(['ułóż mi plan startowy', 'Bliżej domu', 'Więcej startów', 'Zaawansowane', 'a wiosną?', 'Zagranica', 'Bliżej domu']);
  for (const r of wyniki) { assert.equal(r.status, 200); assert.equal(r.slad.join('>'), 'v2:plan_startowy'); assert.equal(r.body.tryb, 'plan'); assert.ok(r.body.karty.every((k) => ['plan_start', 'plan_przycisk', 'plan_zapis'].includes(k.typ))); }
  assert.deepEqual(wyniki[0].body.chipy.map((c) => c.etykieta), ['Bliżej domu', 'Więcej startów', 'Zaawansowane', 'Zagranica']);
  assert.ok(!wyniki[1].body.chipy.some((c) => c.etykieta === 'Bliżej domu'), 'promień zapamiętany');
  assert.ok(!wyniki[2].body.chipy.some((c) => c.etykieta === 'Bliżej domu' || c.etykieta === 'Więcej startów'), 'oba ustawienia zapamiętane');
  assert.deepEqual(wyniki[5].body.chipy.map((c) => c.etykieta), ['Zapisz plan', 'Zacznij od nowa'], 'po 5 zmianach');
  assert.match(wyniki[6].body.zdania[0], /To już 5 zmian planu/);
  const tury = adm.tabele.okienko_v2_rozmowa;
  assert.ok(tury.every((t) => t.intencja === 'plan_startowy' && /^p\d+;/.test(t.sloty.plan)));
});

test('potok: chip bez planu w pamięci nie uruchamia planu; plan po akcji i akcja po planie zachowują priorytet; nazwisko idzie do trybu osoby', async () => {
  assert.notEqual((await rozmowa(['Bliżej domu'])).wyniki[0].slad.join('>'), 'v2:plan_startowy');
  assert.equal((await rozmowa(['plan startowy Filipa i Kasi'])).wyniki[0].slad.join('>'), 'router:zagadka');
  const r = await rozmowa(['ułóż mi plan startowy', 'dokąd biegną Filip i Kasia', 'Bliżej domu']);
  assert.equal(r.wyniki[1].slad.join('>'), 'router:zagadka');
  assert.equal((await rozmowa(['plan startowy Jana Kowalskiego'])).wyniki[0].slad[0], 'osoba');
});

test('prywatność i zapis: „Zapisz plan” przez EF nic nie pisze, tylko pokazuje potwierdzenie; miasto idzie do naszej maszyny, a do sieci sam dystans i daty', async () => {
  const sb = atrapa(baza());
  const orig = sb.from.bind(sb); const zapisy = [];
  sb.from = (t) => { const q = orig(t); for (const m of ['update', 'insert', 'upsert', 'delete']) if (q[m]) { const f = q[m].bind(q); q[m] = (...a) => { zapisy.push([t, m]); return f(...a); }; } return q; };
  const z = await rozmowa(['ułóż mi plan startowy', 'Zapisz plan'], { sb });
  assert.deepEqual(zapisy, [], 'EF niczego nie zapisuje przez klienta użytkownika');
  const karty = z.wyniki[1].body.karty;
  if (z.wyniki[0].body.karty.some((k) => k.typ === 'plan_start')) { assert.ok(karty.some((k) => k.typ === 'plan_zapis')); assert.match(z.wyniki[1].body.zdania[0], /Istniejących celów nie zmieniam/); }
  const g = await rozmowa(['ułóż mi plan startowy', 'Zagranica']);
  assert.equal(g.siec.length, 1, 'jedno wyszukanie');
  const wyslane = g.siec[0].tekst + g.siec[0].prompt;
  const { data: ja } = await atrapa(baza()).from('athletes').select('city,full_name').eq('id', JA).maybeSingle();
  for (const v of [ja && ja.city, ja && ja.full_name, JA]) if (v) assert.ok(!wyslane.includes(v), 'do sieci bez danych osoby: ' + v);
  assert.match(g.siec[0].tekst, /za granicą/);
  assert.ok(g.wyniki[1].body.zagranica.zrodla.length >= 1);
  const pon = await rozmowa(['ułóż mi plan startowy', 'Zagranica', 'Więcej startów']);
  assert.equal(pon.siec.length, 1, 'kolejna wersja bierze zagranicę z pamięci, bez nowego wyszukania');
  assert.ok(pon.wyniki[2].body.zagranica.zrodla.length >= 1);
});

test('obóz: z sieci, nigdy karta imprezy; pusta konfiguracja nie pokazuje naszego obozu, wypełniona pokazuje go pierwszego; nazwisko nie idzie do Google', async () => {
  const r = await rozmowa(['obóz biegowy w lipcu']);
  assert.equal(r.wyniki[0].slad.join('>'), 'siec'); assert.deepEqual(r.wyniki[0].body.karty, []);
  assert.equal(r.siec.length, 1); assert.match(r.siec[0].tekst, /obóz biegowy w lipcu/); assert.match(r.siec[0].prompt, /obozy biegowe/);
  assert.equal(r.wyniki[0].body.zrodla.length, 1);
  assert.ok(!r.f6.some((x) => /events_search|upcoming_races/.test(x.url)), 'kalendarz nie jest pytany');
  const N = await zaladuj('supabase/functions/_shared/nasz-oboz.mjs');
  assert.deepEqual(N.kartyNaszegoObozu(), [], 'pusta konfiguracja'); assert.equal(N.NASZ_OBOZ.nazwa, '');
  const k = N.kartyNaszegoObozu({ nazwa: 'Obóz BiegaMy', termin: '12–19.07', miejsce: 'Szklarska', cena: '2500 zł', url: 'http://zly' });
  assert.equal(k[0].typ, 'oboz_nasz'); assert.equal(k[0].dane.url, '', 'tylko https');
  const naz = await rozmowa(['obóz biegowy Jana Kowalskiego']);
  assert.equal(naz.siec.length, 0, 'prywatna para nie idzie do Google');
  const wyn = await rozmowa(['wyniki biegu Obóz Karolin'], { rozumienie: async () => ({ intencja: 'impreza', pewnosc: 0.9, dopytac: false, kandydaci: [], sloty: { impreza: 'Obóz Karolin' }, tok: { we: 1, wy: 1 } }) });
  assert.notEqual(wyn.wyniki[0].body.tryb, 'plan'); assert.equal(wyn.wyniki[0].body.karty.some((x) => x.typ === 'oboz_nasz'), false);
  assert.ok(!wyn.siec.some((x) => /obozy biegowe/.test(x.prompt || '')), 'bieg z obozem w nazwie nie idzie ścieżką obozu');
});

test('zdania z sieci: kropka w adresie i w liczbie nie urywa zdania (żywe zapytanie o obóz 4.11); strażnik cyfr dalej działa po bajtach; zwykły podział bez zmian', async () => {
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  const t = 'Polecany jest obóz z obozygorskie.pl, który trwa 8-12 lipca. Drugi ma 10.5 km dziennie! Trzeci bez liczb';
  assert.deepEqual(S.zdaniaZZakresem(t).map((z) => z.zdanie), ['Polecany jest obóz z obozygorskie.pl, który trwa 8-12 lipca.', 'Drugi ma 10.5 km dziennie!', 'Trzeci bez liczb']);
  assert.deepEqual(S.naZdania(t), ['Polecany jest obóz z obozygorskie.pl, który trwa 8-12 lipca.', 'Drugi ma 10.5 km dziennie!', 'Trzeci bez liczb']);
  assert.deepEqual(S.naZdania('Raz. Dwa? Trzy!'), ['Raz.', 'Dwa?', 'Trzy!']);
  const dl = new TextEncoder().encode('Polecany jest obóz z obozygorskie.pl, który trwa 8-12 lipca.').length;
  const z = S.zOdpowiedziSieci(t, { groundingChunks: [{ web: { uri: 'https://a.pl', title: 'a' } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: dl } }] }, () => true, 5);
  assert.deepEqual(z.zdania, ['Polecany jest obóz z obozygorskie.pl, który trwa 8-12 lipca.'], 'cyfra bez pokrycia odpada, z pokryciem zostaje, ogon bez kropki odpada');
  assert.ok(z.odrzucone.some((o) => /^urwane/.test(o.powod) && o.zdanie === 'Trzeci bez liczb'));
});

test('zdania nie są urywane (Filip 4.11): liczby porządkowe, skróty, inicjały, wielokropek; urwany ogon odpada, jedyne zdanie zostaje', async () => {
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  for (const cale of ['Żel weź między 30. a 45. minutą biegu.', 'W tym roku 12. Maraton Poznański startuje rano.', 'Pobiegniesz m.in. Poznań i Kraków.', 'To ok. 5 km od mety.', 'Start o godz. 9 przy hali.', 'Trasę wytyczył J. Kowalski z klubu.', 'Co... i tak warto.', 'Limit to min. 5 km dziennie.', 'Bieg ma np. Górskie odcinki.', 'Dystans to 10.5 km na obozygorskie.pl w lipcu.'])
    assert.deepEqual(S.naZdania(cale), [cale], cale);
  assert.deepEqual(S.naZdania('Bieg trwa 2 godz. Zapisy są otwarte.'), ['Bieg trwa 2 godz.', 'Zapisy są otwarte.'], 'godz. przed wielką literą kończy zdanie');
  assert.deepEqual(S.naZdania('Trasa jest płaska. 5 km to minimum. Zapisy w maju 2026. Start rano!'), ['Trasa jest płaska.', '5 km to minimum.', 'Zapisy w maju 2026.', 'Start rano!'], 'cyfra i rok: zwykła granica');
  assert.deepEqual(S.naZdania('Czy warto? Tak. „Dobry” bieg. (Zapisy) trwają.'), ['Czy warto?', 'Tak.', '„Dobry” bieg.', '(Zapisy) trwają.'], 'cudzysłów i nawias przed wielką literą');
  const gm = { groundingChunks: [{ web: { uri: 'https://a.pl', title: 'a' } }] };
  assert.deepEqual(S.zOdpowiedziSieci('Pełne zdanie o bieganiu. Następne zdanie urwane w poło', gm).zdania, ['Pełne zdanie o bieganiu.'], 'limit tokenów: ogon odpada');
  assert.deepEqual(S.zOdpowiedziSieci('Jedyne zdanie bez kropki', gm).zdania, ['Jedyne zdanie bez kropki'], 'jedynego nie kasujemy');
  const t = 'Żel weź między 30. a 45. minutą. Druga **ważna** rzecz. Trzecia.';
  const zz = S.zdaniaZZakresem(t);
  assert.deepEqual(zz.map((z) => z.zdanie), ['Żel weź między 30. a 45. minutą.', 'Druga ważna rzecz.', 'Trzecia.']);
  const enk = new TextEncoder();
  assert.equal(zz[0].do, enk.encode('Żel weź między 30. a 45. minutą.').length, 'zakres w bajtach');
  assert.equal(zz[2].do, enk.encode(t).length);
  assert.equal(zz[1].od, zz[0].do, 'zakresy bez dziur: strażnik cyfr po bajtach działa jak dotąd');
});

test('js/okienko.js: żadna funkcja nie ma dwóch definicji; druga po cichu nadpisuje pierwszą (scalenie z Wynikami 4.11: przycisk Wyniki otwierał races.html)', () => {
  const kod = fs.readFileSync(path.join(KORZEN, 'js/okienko.js'), 'utf8');
  const nazwy = [...kod.matchAll(/^\s*function ([A-Za-z_]\w*)\(/gm)].map((m) => m[1]);
  assert.deepEqual(nazwy.filter((n, i) => nazwy.indexOf(n) !== i), []);
});

test('plan: nazwa ucięta w źródle bez wielokropka i wiszącego słowa; uwaga o trenerze tylko przy INNYM trenerze (Filip 4.11)', async () => {
  const { nazwaBezUciecia, mapujKandydata, maInnegoTrenera } = await P();
  for (const [z, na] of [['22. Nocny Maraton Kanału Bydgoskiego od ...', '22. Nocny Maraton Kanału Bydgoskiego'], ['18 Nocny Maraton Kanału Bydgoskiego od 2...', '18 Nocny Maraton Kanału Bydgoskiego'], ['Grand Prix Dziewiczej Góry w Biegach Gór...', 'Grand Prix Dziewiczej Góry w Biegach'],
    ['Dwumaraton Pamięci Wojtka Pismenko - bie...', 'Dwumaraton Pamięci Wojtka Pismenko'], ['Bieg Niepodległości im. Dziewięciu z ...', 'Bieg Niepodległości im. Dziewięciu'], ['Bieg…', 'Bieg'], ['Maraton Warszawski', 'Maraton Warszawski']]) assert.equal(nazwaBezUciecia(z), na, z);
  const k = mapujKandydata({ nazwa: '22. Nocny Maraton Kanału Bydgoskiego od ...', data: '2027-06-12', miejscowosc: 'Bydgoszcz' });
  assert.equal(k.nazwa, '22. Nocny Maraton Kanału Bydgoskiego');
  assert.deepEqual(k.dystanse, [42.195], 'dystans z nazwy dalej działa');
  assert.equal(mapujKandydata({ nazwa: 'Bieg dla dzieci i mal...', data: '2027-06-12', miejscowosc: 'Poznań' }).wykluczony, true, 'wykluczenia na pełnym tekście źródła');
  assert.equal(maInnegoTrenera({ user_id: 'a', coach_id: 'b' }), true);
  assert.equal(maInnegoTrenera({ user_id: 'a', coach_id: 'a' }), false, 'konto trenera podpięte samo do siebie');
  assert.equal(maInnegoTrenera({ user_id: 'a', coach_id: null }), false);
  assert.equal(maInnegoTrenera(null), false);
});

function klient() {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const okno = { escapeHtml: esc, BM_TEKST: tekstDlaOkna(), safeExternalHref: (u) => (/^https:\/\//.test(u) ? esc(u) : '') };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null }, sessionStorage: { length: 0, key: () => null, getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(fs.readFileSync(path.join(KORZEN, 'js', 'okienko.js'), 'utf8'), ctx);
  return { O: okno.OKIENKO, okno };
}
const start = { rola: 'A', nazwa: "Maraton <img src=x onerror=alert(1)> o'Brien", data: '2027-04-18', miasto: 'Kraków', km: 42.195, odl: 340, powod: 'Główny start.', klucz: 'wyniki:datasport:6486', url: 'https://a.pl/x', dystanse: [42.195] };

test('klient: karta planu z rolą, uzasadnieniem i kartą imprezy; XSS zablokowany; link przechodzi bezpiecznyCel; cel nie ma przycisku; chipy; zapis po potwierdzeniu; zagranica i nasz obóz', () => {
  const { O } = klient();
  const html = O.htmlOdpowiedzi(200, { tryb: 'plan', zdania: ['Plan.'], uwagi: ['Uwaga <b>.'], karty: [{ typ: 'plan_start', dane: { ...start, cel_czasu: { czas_s: 9000, z_km: 42.195 }, tapering: { tyg: 3, objetosc: [80, 60, 40] } } }, { typ: 'plan_start', dane: { ...start, rola: 'C', zCelu: true, nazwa: 'Mój cel' } }, { typ: 'plan_przycisk', dane: {} }, { typ: 'plan_zapis', dane: { starty: [{ name: 'A"B', date: '2027-04-18' }] } }],
    chipy: [{ etykieta: 'Bliżej domu', pytanie: 'Bliżej domu' }], zagranica: { zdania: ['Maraton w Berlinie, 26.09.2027.'], zrodla: [{ url: 'https://b.de', tytul: 'b' }, { url: 'javascript:x', tytul: 'z' }] } }, 'plan');
  assert.doesNotMatch(html, /<img/); assert.doesNotMatch(html, /<b>\./); assert.match(html, /okn-rola--A/); assert.match(html, />Główny</);
  assert.match(html, /Cel orientacyjnie 2:30:00/); assert.match(html, /Tapering: 3 tyg\., objętość 80 → 60 → 40 % \(reguła planu, nie pomiar\)/);
  assert.match(html, /340 km od Ciebie/); assert.match(html, /Już w Twoich celach/); assert.match(html, /data-pytanie="Zapisz plan"/); assert.match(html, /data-plan-zapisz="/);
  assert.match(html, /za granicą, z sieci/); assert.match(html, /https:\/\/b\.de/); assert.doesNotMatch(html, /javascript:x/);
  const cel = html.match(/data-cel="(races\.html#impreza=[^"]+)"/)[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  assert.equal(O.bezpiecznyCel(cel), cel);
  for (const zly of ['races.html#impreza=<script>', 'races.html#impreza=', 'https://zly.pl/races.html#impreza=a', "races.html#impreza=a'b"]) assert.equal(O.bezpiecznyCel(zly), null, zly);
  const obo = O.htmlOdpowiedzi(200, { tryb: 'siec', zdania: ['Obóz.'], zrodla: [{ url: 'https://o.pl', tytul: 'o' }], karty: [{ typ: 'oboz_nasz', dane: { nazwa: 'Nasz', termin: '12.07', url: 'https://n.pl' } }] }, 'obóz');
  assert.ok(obo.indexOf('Nasz obóz') < obo.indexOf('z sieci'), 'nasz obóz na początku listy');
});

test('karta imprezy z linku: dobre dane wracają, schematy i śmieci odpadają; races.html ją otwiera tym samym arkuszem „Wezmę udział”', () => {
  const okno = {};
  const g = { BM_TEKST: tekstDlaOkna() }; g.globalThis = g; g.window = okno;
  vm.runInNewContext(fs.readFileSync(path.join(KORZEN, 'js/kalendarz-lista.mjs'), 'utf8'), g);
  const K = g.BM_KALENDARZ;
  const zakoduj = (o) => '#impreza=' + encodeURIComponent(JSON.stringify(o)).replace(/['()*!]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const x = K.imprezaZLinku(zakoduj({ n: "24. Cracovia Maraton (o'k)", d: '2027-04-18', m: 'Kraków', k: 'wyniki:datasport:6486', u: 'https://a.pl/x', ds: [42.195] }));
  assert.equal(x.nazwa, "24. Cracovia Maraton (o'k)"); assert.equal(x.data, '2027-04-18'); assert.equal(x.klucz, 'wyniki:datasport:6486'); assert.equal(x.dystanse[0], 42.195); assert.equal(x.dokladnosc, 'dzien'); assert.match(x.id, /^link:/);
  assert.equal(K.imprezaZLinku(zakoduj({ n: 'X', d: '2027-04-18', u: 'javascript:alert(1)', k: '<b>' })).url, null);
  assert.equal(K.imprezaZLinku(zakoduj({ n: 'X', d: '2027-04-18', k: '<b>' })).klucz, null);
  for (const h of ['', '#/', '#impreza=', '#impreza=%7Bzly', zakoduj({ n: '', d: '2027-04-18' }), zakoduj({ n: 'X', d: 'jutro' }), zakoduj({ n: 'X'.repeat(141), d: '2027-04-18' })]) assert.equal(K.imprezaZLinku(h), null, h.slice(0, 30));
  const r = czytaj('races.html');
  assert.match(r, /function otworzImprezeZAdresu\(\)/); assert.match(r, /_imprezyWgId\[x\.id\] = x;\s*openImpreza\(x\.id\);/); assert.match(r, /otworzImprezeZAdresu\(\);/);
  assert.match(r, /src="js\/kalendarz-lista\.mjs"/);
});

test('zapis planu w przeglądarce: dopisuje na końcu, nic nie nadpisuje, duble po kluczu i po nazwie z datą; uszkodzone cele = odmowa bez zapisu', async () => {
  const w = zaladujSb();
  const stare = [{ name: 'Poprawa formy', date: '' }, { name: 'Maraton X', date: '2027-04-18', race_id: 'r1' }, { name: 'Z kluczem', date: '2027-05-01', impreza_klucz: 'wyniki:datasport:1' }];
  const s = w.scalCeleStartowe(stare, [{ name: 'maraton x', date: '2027-04-18' }, { name: 'Inna nazwa', date: '2027-06-01', impreza_klucz: 'wyniki:datasport:1' }, { name: 'Nowy', date: '2027-03-01', miejscowosc: 'Poznań', distance_km: 21.0975, impreza_klucz: 'kalendarz:a' }, { name: '', date: '2027-03-01' }, { name: 'Zła data', date: 'jutro' }]);
  assert.equal(s.dodane, 1); assert.equal(s.cele.length, 4); assert.deepEqual(JSON.parse(JSON.stringify(s.cele.slice(0, 3))), stare, 'istniejące bez zmian i na swoim miejscu');
  assert.deepEqual(JSON.parse(JSON.stringify(s.cele[3])), { name: 'Nowy', date: '2027-03-01', race_id: null, impreza_klucz: 'kalendarz:a', miejscowosc: 'Poznań', distance_km: 21.0975 });
  const fake = (raceGoals) => { const up = []; return { up, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'a1', race_goals: raceGoals }, error: null }) }) }), update: (x) => { up.push(x); return { eq: async () => ({ error: null }) }; } }) }; };
  const f = fake(JSON.stringify(stare));
  assert.equal((await w.dodajCeleStartowe(f, [{ name: 'Nowy', date: '2027-03-01' }])).dodane, 1);
  assert.equal(f.up.length, 1); assert.equal(JSON.parse(f.up[0].race_goals).length, 4); assert.equal(f.up[0].goal, 'Poprawa formy'); assert.equal(f.up[0].target_date, null, 'pusta data pierwszego celu nie idzie do kolumny date');
  const juz = fake(JSON.stringify(stare)); assert.equal((await w.dodajCeleStartowe(juz, [{ name: 'Maraton X', date: '2027-04-18' }])).dodane, 0); assert.equal(juz.up.length, 0, 'nic nowego = bez zapisu');
  const zle = fake('{uszkodzone'); assert.equal((await w.dodajCeleStartowe(zle, [{ name: 'Nowy', date: '2027-03-01' }])).blad, 'uszkodzone'); assert.equal(zle.up.length, 0);
});

test('ławka: 20 pytań o plan, 10 o obozy; samosprawdzenie zna plan; MAPA generatora zna nowe intencje', async () => {
  const { przebieg, PYTANIA } = require('./_lawka-v2.js');
  const plan = PYTANIA.filter((w) => w.kat === 'plan'), oboz = PYTANIA.filter((w) => /ob[oó]z|zgrupowan/i.test(w.p));
  assert.equal(plan.length, 20); assert.equal(oboz.length, 10);
  const w = await przebieg([...plan, ...oboz, ...PYTANIA.filter((x) => /Filipa i Kasi|Filip i Kasia wiosną|wiosną w Krakowie|moje starty w tym sezonie/.test(x.p))]);
  assert.deepEqual(w.filter((r) => !r.pasuje).map((r) => `${r.p} → ${r.slad}`), []);
  const S = await zaladuj('supabase/functions/okienko-v2/samosprawdzenie.mjs');
  assert.deepEqual(S.NARZEDZIA_INTENCJI.plan_startowy, ['plan_startowy']);
  const G = await zaladuj('tools/lawka-generator.mjs');
  assert.equal(G.MAPA.plan_startowy, 'v2:plan_startowy'); assert.equal(G.MAPA.oboz, 'siec');
});
