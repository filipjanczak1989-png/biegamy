// Blizna #379 (26.11.2026) — nowe Dziś, Tydzień (E6a), commit 4: stany kafla „Ten tydzień”.
//
// Kafel z blizna-378 był zrobiony pod tydzień z planem i wpisami. W pozostałych sytuacjach pokazywał puste słupki
// i kreski, czyli nic nie mówił. Stany z planu E6a: bez planu, dzień wolny, pierwszy tydzień konta, tydzień bez wpisów.
//   - linia o dzisiejszym dniu pod słupkami (makieta: „dziś jeszcze nic · 8 km w planie”),
//   - pusty tydzień bez planu kilometrów: same nazwy dni i zdanie zamiast siedmiu pustych kolumn,
//   - pierwszy tydzień konta: zdanie z makiety „Słupki pojawią się po pierwszym treningu.”, bez liczb.
// „Pierwszy tydzień” znaczy tu: konto nie ma ŻADNEGO wpisu (wynik zapytania o ostatnie wpisy). Gdy tamto zapytanie
// nie doszło, tego nie wiemy i nie udajemy.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, TERAZ, PROFIL } = require('./_dzis-nowy-strona.js');

const plan = (id, date, type, km, status) => ({ id, date, type, distance_km: km, duration_min: null, pace: null, description: 'opis ' + id, status: status || 'planned', plan_source: 'coach', coach_id: 'c-9' });
const log = (iso, typ, km, czas) => ({ logged_at: iso, training_type: typ, distance_km: km, duration: czas });
// czwartek 26.11.2026, tydzień 23–29.11
const PLANY = [plan('p1', '2026-11-23', 'Spokojny', 8, 'done'), plan('p2', '2026-11-24', 'Odpoczynek', null), plan('p3', '2026-11-25', 'Interwały', 10, 'done'), plan('p4', '2026-11-26', 'Tempo', 9), plan('p6', '2026-11-28', 'Spokojny', 5)];
const WPISY = [log('2026-11-25T17:10:00+00:00', 'Interwały', 10.2, '52:30'), log('2026-11-23T16:00:00+00:00', 'Spokojny', 8.21, '44:36'), log('2026-11-21T09:00:00+00:00', 'Wybieganie', 16.4, '1:32:05')];
const DZIS_BIEG = log('2026-11-26T06:00:00+00:00', 'Spokojny', 6.19, '34:00');
const BEZ_TRENERA = Object.assign({}, PROFIL, { coach_id: null });
const linieDzis = (h) => [...h.matchAll(/<p class="dn-tekst dn-tl">(.*?)<\/p>/g)].map((m) => m[1]);
async function kafel(o) { const s = strona(o); s.B.start(); await s.doKonca(); return s.kafel('tydzien').innerHTML; }

test('(1) linia o dzisiejszym dniu: zrobione z planem, jeszcze nic z planem, plan bez kilometrów, dzień wolny, bez planu cisza', async () => {
  assert.deepEqual(linieDzis(await kafel({ trening: PLANY, wpisyTyg: WPISY.concat([DZIS_BIEG]) })), ['Dziś: <b>6,2 km</b> z 9 w planie']);
  assert.deepEqual(linieDzis(await kafel({ trening: PLANY, wpisyTyg: WPISY })), ['Dziś jeszcze nic · <b>9 km</b> w planie']);
  const sila = PLANY.map((p) => (p.id === 'p4' ? plan('p4', '2026-11-26', 'Siła', null) : p));
  assert.deepEqual(linieDzis(await kafel({ trening: sila, wpisyTyg: WPISY })), ['Dziś jeszcze nic · trening w planie']);
  assert.deepEqual(linieDzis(await kafel({ trening: sila, wpisyTyg: WPISY.concat([DZIS_BIEG]) })), ['Dziś: <b>6,2 km</b>'], 'bieg mimo planu siły: bez „z 0 w planie”');
  const wolne = PLANY.map((p) => (p.id === 'p4' ? plan('p4', '2026-11-26', 'Odpoczynek', null) : p));
  const hW = await kafel({ trening: wolne, wpisyTyg: WPISY });
  assert.deepEqual(linieDzis(hW), ['Dziś wolne']);
  assert.match(hW, /aria-label="Kilometry dzień po dniu: pn 8,2 km, plan 8 km; wt wolne; śr 10,2 km, plan 10 km; cz wolne; pt bez biegu; /, 'dzień wolny nazwany także w opisie słupków');
  assert.deepEqual(linieDzis(await kafel({ trening: wolne, wpisyTyg: WPISY.concat([DZIS_BIEG]) })), ['Dziś: <b>6,2 km</b>'], 'bieg w dzień wolny: pokazujemy bieg, nie „wolne”');
  const bezNaDzis = PLANY.filter((p) => p.id !== 'p4');
  assert.deepEqual(linieDzis(await kafel({ trening: bezNaDzis, wpisyTyg: WPISY })), [], 'nic w planie na dziś i bez biegu: bez linii');
  assert.deepEqual(linieDzis(await kafel({ trening: [], wpisyTyg: WPISY.concat([DZIS_BIEG]), profil: BEZ_TRENERA })), ['Dziś: <b>6,2 km</b>'], 'bez planu: sam dzisiejszy bieg');
});

test('(2) tydzień z planem, ale bez wpisów: obrysy planu zostają, liczby mówią, ile przed zawodnikiem, bez zdania o pustym tygodniu', async () => {
  const h = await kafel({ trening: PLANY, wpisyTyg: [] });
  assert.deepEqual([...h.matchAll(/<div class="dn-l"><b>(.*?)<\/b><span>([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]), [['—', 'czas w ruchu'], ['32<small>km</small>', 'do planu'], ['—', 'śr. tempo']]);
  assert.equal((h.match(/<i class="plan" style="height:\d+%"><\/i>/g) || []).length, 4, 'cztery dni z planem kilometrów');
  assert.doesNotMatch(h, /class="zrob" style|jeszcze bez treningu|Słupki pojawią się/);
  assert.match(h, /role="img" aria-label="Kilometry dzień po dniu: pn bez biegu, plan 8 km; wt wolne; /);
  assert.deepEqual(linieDzis(h), ['Dziś jeszcze nic · <b>9 km</b> w planie']);
  assert.match(h, /dn-legenda/);
});

test('(3) pusty tydzień bez planu kilometrów (konto ma starsze wpisy): same nazwy dni i zdanie; „tydzień temu” zostaje', async () => {
  const h = await kafel({ trening: [], wpisyTyg: [WPISY[2]], profil: BEZ_TRENERA });
  assert.match(h, /<div class="dn-slupki dn-puste" aria-hidden="true">(<div class="dn-sl( dzis)?"><span>(pn|wt|śr|cz|pt|sb|nd)<\/span><\/div>){7}<\/div><p class="dn-tekst dn-tl">W tym tygodniu jeszcze bez treningu\.<\/p>/);
  assert.match(h, /<div class="dn-sl dzis"><span>cz<\/span><\/div>/, 'dziś dalej wyróżnione');
  assert.doesNotMatch(h, /dn-sl-p|role="img"|dn-legenda|Słupki pojawią się/, 'bez siedmiu pustych kolumn i bez opisu pustego wykresu');
  assert.deepEqual([...h.matchAll(/<div class="dn-l"><b>(.*?)<\/b><span>([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]), [['—', 'czas w ruchu'], ['16,4<small>km</small>', 'tydzień temu'], ['—', 'śr. tempo']]);
  // plan z samą siłą, bez wpisów: też pusty wykres kilometrów, ale linia o dziś mówi o planie
  const sila = await kafel({ trening: [plan('s', '2026-11-26', 'Siła', null)], wpisyTyg: [WPISY[2]] });
  assert.deepEqual(linieDzis(sila), ['W tym tygodniu jeszcze bez treningu.', 'Dziś jeszcze nic · trening w planie']);
  // sam rower w tym tygodniu to nie pusty tydzień: słupki są (puste), linia niebiegowych mówi resztę
  const rower = await kafel({ trening: [], wpisyTyg: [log('2026-11-24T06:00:00+00:00', 'Rower', 22, '1:05:00')], profil: BEZ_TRENERA });
  assert.doesNotMatch(rower, /jeszcze bez treningu/); assert.match(rower, /\+ 1 inna aktywność · 22 km/);
});

test('(4) pierwszy tydzień konta: zdanie z makiety i same nazwy dni, bez liczb; tylko gdy WIEMY, że konto nie ma żadnego wpisu', async () => {
  const h = await kafel({ trening: [], wpisy: [], wpisyTyg: [], profil: BEZ_TRENERA });
  assert.match(h, /^<div class="dn-gora">.*?Kalendarz ›<\/a><\/div><div class="dn-slupki dn-puste" aria-hidden="true">.*?<\/div><p class="dn-tekst dn-tl">Słupki pojawią się po pierwszym treningu\.<\/p>(<button type="button" class="dn-wlink" data-dn="generator">Ułóż plan ›<\/button>)?$/);   // link dla konta bez trenera: blizna-393
  assert.doesNotMatch(h, /dn-liczby|tydzień temu|—/, 'trzy kreski nic nie mówią nowej osobie');
  // nie doszło zapytanie o ostatnie wpisy: nie wiemy, czy konto jest nowe
  const niewiadomo = await kafel({ trening: [], wpisy: [], wpisyTyg: [], profil: BEZ_TRENERA, awaria: { training_logs: 'odmowa' } });
  assert.match(niewiadomo, /W tym tygodniu jeszcze bez treningu\./); assert.doesNotMatch(niewiadomo, /Słupki pojawią się/); assert.match(niewiadomo, /dn-liczby/);
  // konto ma stary wpis (sprzed miesiąca), ale nic w dwóch ostatnich tygodniach: to nie pierwszy tydzień
  const stare = await kafel({ trening: [], wpisy: [wpis('dawny', 30 * 24, { feel: 'good' })], wpisyTyg: [], profil: BEZ_TRENERA });
  assert.match(stare, /W tym tygodniu jeszcze bez treningu\./); assert.doesNotMatch(stare, /Słupki pojawią się/);
  // nowe konto, ale trener już dał plan z kilometrami: słupki planu są od razu
  const zPlanem = await kafel({ trening: PLANY, wpisy: [], wpisyTyg: [] });
  assert.doesNotMatch(zPlanem, /Słupki pojawią się|jeszcze bez treningu/); assert.match(zPlanem, /class="plan" style/);
  // nowe konto z planem samej siły: liczby zostają (jest plan), zdanie ogólne
  const sila = await kafel({ trening: [plan('s', '2026-11-27', 'Siła', null)], wpisy: [], wpisyTyg: [] });
  assert.match(sila, /W tym tygodniu jeszcze bez treningu\./); assert.match(sila, /dn-liczby/);
});

test('(5) kolejność odpowiedzi nie zmienia wyniku: tydzień przed ostatnimi wpisami i po nich daje ten sam kafel; bez sieci tak samo z telefonu', async () => {
  const o = { trening: [], wpisy: [], wpisyTyg: [], profil: BEZ_TRENERA };
  const a = strona(o); a.B.start(); await a.tik(); a.zapytania.forEach((z) => z.odpowiedz()); await a.tik();
  a.zapytania.filter((z) => z.nazwa === 'trainings' || z.nazwa === 'training_logs tydzien').forEach((z) => z.odpowiedz()); await a.tik();
  assert.match(a.kafel('tydzien').innerHTML, /W tym tygodniu jeszcze bez treningu\./, 'ostatnie wpisy jeszcze w drodze: nie wiemy, czy konto jest nowe');
  await a.doKonca();
  assert.match(a.kafel('tydzien').innerHTML, /Słupki pojawią się po pierwszym treningu\./, 'doszły ostatnie wpisy (zero): kafel się poprawia');
  const b = strona(o); b.B.start(); await b.tik(); b.zapytania.forEach((z) => z.odpowiedz()); await b.tik();
  b.zapytania.filter((z) => z.nazwa === 'training_logs').forEach((z) => z.odpowiedz()); await b.tik(); await b.doKonca();
  assert.equal(b.kafel('tydzien').innerHTML, a.kafel('tydzien').innerHTML);
  const bez = strona({ pamiec: new Map(a.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: TERAZ + 3600e3 }); bez.B.start(); await bez.doKonca();
  assert.equal(bez.kafel('tydzien').innerHTML, a.kafel('tydzien').innerHTML, 'bez sieci ten sam stan z telefonu');
});
