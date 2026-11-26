// Blizna #377 (26.11.2026) — nowe Dziś, Tydzień (E6a), commit 2: linia tygodnia pod powitaniem.
//
// Stare Dziś pokazuje tydzień pierścieniem „Postęp tygodnia”; nowe nie mówiło o tygodniu nic na pierwszym ekranie.
// Makieta r5: „Ten tydzień: 24,6 z 38 km · 3 z 5 treningów”, bez planu „Ten tydzień: 21,7 km · 3 dni z ruchem”.
// Liczby pochodzą z policzTydzien (blizna-376, reguły starej updateWeekProgress).
// Dwie rzeczy pilnowane osobno: (a) linia ma miejsce w szkielecie od początku, więc dociągnięcie danych nie przesuwa
// ekranu (lekcja z paska „Jak poszło?”, blizna-371); (b) gdy tygodnia nie da się policzyć, linia jest PUSTA, a nie „0 km”.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, TERAZ, PROFIL, MODUL } = require('./_dzis-nowy-strona.js');

const H = 3600e3;
const plan = (id, date, type, km, status) => ({ id, date, type, distance_km: km, duration_min: null, pace: null, description: 'opis ' + id, status: status || 'planned', plan_source: 'coach', coach_id: 'c-9' });
const log = (iso, typ, km, czas) => ({ logged_at: iso, training_type: typ, distance_km: km, duration: czas });
const PLANY = [plan('p1', '2026-11-23', 'Spokojny', 8, 'done'), plan('p2', '2026-11-24', 'Odpoczynek', null), plan('p3', '2026-11-25', 'Interwały', 10, 'done'), plan('p4', '2026-11-26', 'Tempo', 9), plan('p6', '2026-11-28', 'Spokojny', 5), plan('p7', '2026-11-29', 'Wybieganie', 6)];
const WPISY = [log('2026-11-25T17:10:00+00:00', 'Interwały', 10.2, '52:30'), log('2026-11-24T06:00:00+00:00', 'Rower', 22, '1:05:00'), log('2026-11-23T16:00:00+00:00', 'Spokojny', 8.21, '44:36'), log('2026-11-26T06:00:00+00:00', 'Spokojny', 6.19, '34:00')];
const linia = (s) => s.cz('tydzien-linia').innerHTML;

test('(1) z planem: kilometry do planu i „N z M treningów”; liczby jak w starym Postępie tygodnia', async () => {
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start(); await s.doKonca();
  assert.equal(linia(s), 'Ten tydzień: <b>24,6</b> z 38 km · <b>4</b> z 5 treningów');
  const t = s.B.tydzien(); assert.deepEqual([t.zaplanowane, t.zrobione, t.planKm], [5, 4, 38]);
  const L = s.B.tydzienLinia, b = (o) => L(Object.assign({ km: 0, planKm: 0, zaplanowane: 0, zrobione: 0, wpisow: 0, dniZRuchem: 0 }, o));
  assert.equal(b({ km: 0, planKm: 38, zaplanowane: 5 }), 'Ten tydzień: <b>0</b> z 38 km · <b>0</b> z 5 treningów', 'początek tygodnia z planem');
  assert.equal(b({ km: 30, planKm: 20, zaplanowane: 3, zrobione: 3, wpisow: 6 }), 'Ten tydzień: <b>30</b> z 20 km · <b>3</b> z 3 treningów', 'sześć wpisów przy trzech planach to dalej „3 z 3”');
  assert.equal(b({ km: 5, planKm: 5, zaplanowane: 1, zrobione: 1, wpisow: 1 }), 'Ten tydzień: <b>5</b> z 5 km · <b>1</b> z 1 treningu', 'odmiana: z 1 treningu');
  assert.equal(b({ km: 12.34, planKm: 0, zaplanowane: 2, zrobione: 1, wpisow: 1 }), 'Ten tydzień: <b>12,3</b> km · <b>1</b> z 2 treningów', 'plan bez kilometrów (sama siła): bez „z 0 km”');
  assert.equal(b({ km: 131.6, planKm: 140.5, zaplanowane: 7, zrobione: 6, wpisow: 6 }), 'Ten tydzień: <b>132</b> z 141 km · <b>6</b> z 7 treningów', 'od 100 km bez części dziesiętnej, także w planie');
});

test('(2) bez planu: kilometry i liczba treningów (od blizna-386, wcześniej „dni z ruchem”); pusty tydzień bez planu to zdanie, nie zera', async () => {
  const s = strona({ trening: [], wpisyTyg: WPISY, profil: Object.assign({}, PROFIL, { coach_id: null }) }); s.B.start(); await s.doKonca();
  assert.equal(linia(s), 'Ten tydzień: <b>24,6</b> km · <b>4</b> treningi');
  const L = s.B.tydzienLinia, b = (o) => L(Object.assign({ km: 0, planKm: 0, zaplanowane: 0, zrobione: 0, wpisow: 0, dniZRuchem: 0 }, o));
  assert.equal(b({ km: 8.21, wpisow: 1, dniZRuchem: 1 }), 'Ten tydzień: <b>8,2</b> km · <b>1</b> trening');
  assert.equal(b({ km: 0, wpisow: 2, dniZRuchem: 2 }), 'Ten tydzień: <b>0</b> km · <b>2</b> treningi', 'sam rower: zero kilometrów biegowych, ale treningi były');
  assert.equal(b({ km: 40, wpisow: 6, dniZRuchem: 5 }), 'Ten tydzień: <b>40</b> km · <b>6</b> treningów');
  assert.equal(b({}), 'Ten tydzień: jeszcze bez treningu');
  const pusty = strona({ trening: [], wpisyTyg: [] }); pusty.B.start(); await pusty.doKonca();
  assert.equal(linia(pusty), 'Ten tydzień: jeszcze bez treningu');
});

test('(3) linia nie przesuwa ekranu: miejsce jest w szkielecie od początku, ze stałą wysokością, pod nagłówkiem, przed polem „Zapytaj”', async () => {
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start();
  assert.match(s.korzen.innerHTML, /<\/header><p class="dn-tydz" data-dn="tydzien-linia"><\/p><div class="dn-rzad">/, 'pusta linia stoi w szkielecie, zanim przyjdą dane');
  assert.match(MODUL, /#dzis-nowy \.dn-tydz\{margin:-6px 0 12px;min-height:18px;font:500 13px\/18px /, 'jedna linijka tekstu = dokładnie zarezerwowana wysokość');
  await s.tik(); assert.equal(linia(s), '', 'przed danymi pusto, bez zgadywania');
  await s.doKonca(); assert.match(linia(s), /^Ten tydzień: /);
  const przed = linia(s); s.B.start(); await s.doKonca(); assert.equal(linia(s), przed);
});

test('(4) gdy tygodnia nie da się policzyć, linia jest pusta: odmowa, brak funkcji tygodnia; bez sieci tylko ten sam tydzień z telefonu', async () => {
  const a = strona({ trening: PLANY, wpisyTyg: WPISY }); a.B.start(); await a.doKonca();
  const odm = strona({ pamiec: new Map(a.tel.mapa), awaria: { 'training_logs tydzien': 'odmowa' }, trening: PLANY, wpisyTyg: WPISY, teraz: TERAZ + H }); odm.B.start(); await odm.doKonca();
  assert.equal(linia(odm), '', 'odmowa: nie pokazujemy „0 km” ani liczb z telefonu');
  const plany = strona({ pamiec: new Map(a.tel.mapa), awaria: { trainings: 'odmowa' }, trening: PLANY, wpisyTyg: WPISY, teraz: TERAZ + H }); plany.B.start(); await plany.doKonca();
  assert.equal(linia(plany), '', 'nie doszły plany: sama połowa danych to nie tydzień');
  const stary = strona({ bezTygodnia: true }); stary.B.start(); await stary.doKonca(); assert.equal(linia(stary), '');
  const bez = strona({ pamiec: new Map(a.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: TERAZ + 2 * H }); bez.B.start(); await bez.doKonca();
  assert.equal(linia(bez), 'Ten tydzień: <b>24,6</b> z 38 km · <b>4</b> z 5 treningów', 'bez sieci linia z telefonu');
  const zaTydzien = strona({ pamiec: new Map(a.tel.mapa), online: false, awaria: { '*': 'siec' }, teraz: TERAZ + 7 * 24 * H }); zaTydzien.B.start(); await zaTydzien.doKonca();
  assert.equal(linia(zaTydzien), '', 'za tydzień bez sieci: zeszłotygodniowe liczby nie udają bieżących');
  // było dobrze, potem ponowne wczytanie z odmową: stara linia nie zostaje jako prawda
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start(); await s.doKonca(); assert.match(linia(s), /24,6/);
  s.st.awaria = { 'training_logs tydzien': 'odmowa' }; s.B.wczytaj(true); await s.doKonca(); assert.equal(linia(s), '');
  s.st.awaria = {}; s.B.wczytaj(true); await s.doKonca(); assert.match(linia(s), /24,6/);
  s.st.awaria = { trainings: 'odmowa' }; s.B.wczytaj(true); await s.doKonca(); assert.equal(linia(s), '', 'ta sama strona, nie doszły plany: linia znika');
  s.st.awaria = {}; s.B.wczytaj(true); await s.doKonca(); assert.match(linia(s), /24,6/);
  s.st.zegar = TERAZ + 7 * 24 * H; s.st.online = false; s.st.awaria = { '*': 'siec' }; s.B.wczytaj(true); await s.doKonca();
  assert.equal(linia(s), '', 'strona otwarta od tygodnia, bez sieci: linia z zeszłego tygodnia znika');
});

test('(5) podtytuł kafla treningu po przejściu na plany tygodnia: „od trenera” i „z generatora” dalej są, bo zapytanie pobiera te same kolumny co dawne zapytanie o dziś', async () => {
  // 26.11 na zrzucie podglądu zniknęło „od trenera”. Winne były dane próbne narzędzia (plan dnia bez coach_id), nie moduł; ten test pilnuje, żeby tak zostało.
  const KOLUMNY = '.select("id,date,type,distance_km,duration_min,pace,description,status,plan_source,coach_id")';
  const s = strona({ trening: PLANY, wpisyTyg: WPISY }); s.B.start(); await s.doKonca();
  assert.ok(s.zapytania.find((z) => z.nazwa === 'trainings').opis.startsWith(KOLUMNY + '.eq("athlete_id","a-1").gte("date",'), 'plany tygodnia: komplet kolumn, w tym źródło planu i trener');
  assert.match(s.kafel('trening').innerHTML, /<div class="dn-kto">od trenera/, 'plan z coach_id');
  const gen = strona({ trening: PLANY.map((p) => Object.assign({}, p, { plan_source: 'generator', coach_id: null })), wpisyTyg: WPISY }); gen.B.start(); await gen.doKonca();
  assert.match(gen.kafel('trening').innerHTML, /<div class="dn-kto">z generatora/);
  const wlasny = strona({ trening: PLANY.map((p) => Object.assign({}, p, { plan_source: null, coach_id: null })), wpisyTyg: WPISY }); wlasny.B.start(); await wlasny.doKonca();
  assert.doesNotMatch(wlasny.kafel('trening').innerHTML, /od trenera|z generatora/);
  // źródło bierzemy z planu DNIA, nie z pierwszego wiersza tygodnia: poniedziałek od trenera, dziś z generatora
  const mieszany = strona({ trening: PLANY.map((p) => (p.date === '2026-11-26' ? Object.assign({}, p, { plan_source: 'generator', coach_id: null }) : p)), wpisyTyg: WPISY }); mieszany.B.start(); await mieszany.doKonca();
  assert.match(mieszany.kafel('trening').innerHTML, /<div class="dn-kto">z generatora/);
  const stary = strona({ bezTygodnia: true }); stary.B.start(); await stary.doKonca();
  assert.ok(stary.zapytania.find((z) => z.nazwa === 'trainings').opis.startsWith(KOLUMNY + '.eq("athlete_id","a-1").eq("date",'), 'droga zapasowa: te same kolumny');
});
