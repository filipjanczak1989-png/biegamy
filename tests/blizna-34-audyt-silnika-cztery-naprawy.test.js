// ─────────────────────────────────────────────────────────────────────────────
// BLIZNA 34 — CZTERY NAPRAWY Z AUDYTU SILNIKA 13.09.2026 (pkt 2, 3, 5).
//
// (1) PONIEDZIAŁEK TRACIŁ TYDZIEŃ. `najblizszyPoniedzialek` brało „pierwszy
//     poniedziałek OSTRO po", więc plan układany w poniedziałek ruszał za 7 dni:
//     start za 83 dni = 12 tygodni we wtorek, 11 w poniedziałek. Bez słowa,
//     a przy krótkim horyzoncie z odmową ZA_MALO_TYGODNI, której wtorek by nie
//     dostał. Jedna próba na siedem.
// (2) ZAŁOŻENIE PODAWANE JAKO FAKT. Bez logów silnik zakłada 20 km/tydz — i do
//     13.09 odmowa brzmiała „czyli 2,3× więcej niż biegasz TERAZ". Zdanie
//     o człowieku, którego nikt nie zmierzył. 29 z 46 uprawnionych nie ma ani
//     jednego logu w 28 dni — największa liczba w całym audycie.
// (3) CAP 40% Z KRZYWEJ, NIE Z TYGODNIA. Sufit udziału wybiegania liczył się
//     z deklaracji, a tydzień po sufitach zadawał mniej: 767 z 4428 tygodni
//     miało wybieganie do 43% tego, co człowiek naprawdę biegnie. Reguła
//     spełniona wobec liczby, której w planie nie ma.
// (4) MARTWY SUFIT AKCENTU I NOTA, KTÓRA GO CYTOWAŁA. `sufitAkcentu(baza)`
//     (10–16 km) nigdy nie wiązał — reguła 40 min tnie wcześniej (7 km przy
//     5:30/km). Nota mówiła „akcent do 16 km" przy Tempo 10 km. Rozjazd
//     wprowadzony NASZĄ naprawą z 19.08.
//
// !! Cena (3) jest ZMIERZONA i ŚWIADOMA: przy 3 dniach dwie reguły naraz
//    (długie ≤ 40% dostawy, spokojny ≤ długie) domykają tydzień na 5 × jakość.
//    Bazy ≤ 45: 0–7% mniej km; 4–6 dni: zero zmiany. Decyzja Filipa 13.09.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const G = require(path.join(__dirname, '..', 'js', 'generator-planu.js'));
const d0 = new Date('2026-09-15T00:00:00Z');                       // wtorek
const iso = (n) => new Date(d0.getTime() + n * 864e5).toISOString().slice(0, 10);
const uloz = (o) => G.uloz(Object.assign({
  dystans: 'half', dniWTygodniu: 4, dataStartu: iso(7 * 12 - 1), today: '2026-09-15',
  poziom: { p10sec: 330, wynik: null, objetoscTygodniowa: 30 }, celCzasowy: null,
}, o));

describe('(1) dzisiejszy poniedziałek liczy się jako najbliższy', () => {
  test('today = poniedziałek → plan rusza DZIŚ i ma tyle tygodni, co ten sam start układany w niedzielę przed', () => {
    const pn = uloz({ today: '2026-09-14' });
    const nd = uloz({ today: '2026-09-13' });
    assert.ok(pn.ok && nd.ok);
    assert.equal(pn.plan.start_date, '2026-09-14');
    assert.equal(nd.plan.start_date, '2026-09-14');
    assert.equal(pn.meta.tygodnie, nd.meta.tygodnie, 'poniedziałek dostawał o tydzień mniej niż niedziela');
  });
  test('today = wtorek → plan rusza w NASTĘPNY poniedziałek (bez zmian)', () => {
    const wt = uloz({ today: '2026-09-15' });
    assert.equal(wt.plan.start_date, '2026-09-21');
  });
  test('granica: start odbity ZA_MALO_TYGODNI we wtorek PRZECHODZI w poniedziałek', () => {
    // half min 10 tyg: start za 9 tygodni od najbliższego poniedziałku (Wt) = odmowa; w Pn to 10 tygodni
    const start = iso(6 + 9 * 7 - 1);            // niedziela w 9. tygodniu liczonym od 21.09
    const wt = uloz({ dataStartu: start, today: '2026-09-15', poziom: { p10sec: 330, objetoscTygodniowa: 60 } });
    const pn = uloz({ dataStartu: start, today: '2026-09-14', poziom: { p10sec: 330, objetoscTygodniowa: 60 } });
    assert.equal(wt.ok, false); assert.equal(wt.sciana.kod, 'ZA_MALO_TYGODNI');
    assert.equal(pn.ok, true, 'poniedziałek: ' + (pn.ok ? '' : pn.sciana.kod));
    assert.equal(pn.meta.tygodnie, 10);
  });
});

describe('(2) założenie 20 km/tydz mówi, że jest założeniem', () => {
  const bezLogow = { p10sec: 330, wynik: null, objetoscTygodniowa: null };
  test('ZA_MALA_BAZA: „Zakładam 20 km/tydz, bo nie mam Twoich treningów" — nie „biegasz teraz"', () => {
    const r = uloz({ dystans: 'marathon', dataStartu: iso(7 * 20 - 1), poziom: bezLogow });
    assert.equal(r.sciana.kod, 'ZA_MALA_BAZA');
    assert.match(r.sciana.komunikat, /^Zakładam 20 km\/tydz, bo nie mam Twoich treningów — zaloguj kilka, a policzę dokładniej\./);
    assert.doesNotMatch(r.sciana.komunikat, /biegasz teraz/);
    assert.equal(r.sciana.szczegoly.objetoscZalozona, true);
  });
  test('SKOK_OBJETOSCI: to samo zdanie zamiast „Biegasz 20 km/tydz"', () => {
    const r = uloz({ dystans: '5k', dataStartu: iso(7 * 5 - 1), poziom: bezLogow });
    assert.equal(r.sciana.kod, 'SKOK_OBJETOSCI');
    assert.match(r.sciana.komunikat, /^Zakładam 20 km\/tydz, bo nie mam Twoich treningów/);
    assert.doesNotMatch(r.sciana.komunikat, /^Biegasz/);
  });
  test('ZA_KROTKIE_WYBIEGANIE: to samo zdanie na początku', () => {
    const r = uloz({ dystans: 'half', dataStartu: iso(7 * 10 - 1), poziom: bezLogow });
    assert.equal(r.sciana.kod, 'ZA_KROTKIE_WYBIEGANIE');
    assert.match(r.sciana.komunikat, /^Zakładam 20 km\/tydz/);
  });
  test('ZMIERZONA objętość → zdanie o faktach, bez „Zakładam"', () => {
    const r = uloz({ dystans: 'marathon', dataStartu: iso(7 * 20 - 1), poziom: { p10sec: 330, objetoscTygodniowa: 20 } });
    assert.equal(r.sciana.kod, 'ZA_MALA_BAZA');
    assert.match(r.sciana.komunikat, /^Przy 20 km\/tydz/);
    assert.match(r.sciana.komunikat, /więcej niż biegasz teraz/);
    assert.doesNotMatch(r.sciana.komunikat, /Zakładam/);
  });
  test('plan odroczony przy założonej objętości: mówi ZAŁOŻONYCH i każe zalogować', () => {
    const r = uloz({ dystans: 'half', dataStartu: iso(7 * 70 - 1), poziom: bezLogow });
    assert.ok(r.ok && r.startOdroczony, r.ok ? 'brak odroczenia' : r.sciana.kod);
    assert.match(r.startOdroczony.komunikat, /ZAŁOŻONYCH 20 km\/tydz, bo nie mam Twoich treningów/);
    assert.doesNotMatch(r.startOdroczony.komunikat, /nie stracić tego, co już biegasz/);
  });
});

describe('(3) cap 40% wybiegania liczony z DOSTARCZONEGO tygodnia', () => {
  test('w każdym tygodniu budowy wybieganie ≤ 40% sumy jednostek (z tolerancją siatki 0,5 km)', () => {
    let tyg = 0, zle = [];
    for (const dyst of ['5k', '10k', 'half', 'marathon']) for (let dni = 3; dni <= 6; dni++) for (let b = 12; b <= 140; b += 8) {
      const T = { '5k': 8, '10k': 10, half: 14, marathon: 20 }[dyst];
      const r = uloz({ dystans: dyst, dniWTygodniu: dni, dataStartu: iso(7 * T - 1), poziom: { p10sec: 330, objetoscTygodniowa: b } });
      if (!r.ok) continue;
      const bud = r.meta.tygodnie - r.meta.taperTygodni;
      for (let w = 1; w <= bud; w++) {
        const ws = r.treningi.filter((t) => t.week_number === w && t.target_distance_km > 0);
        const dl = ws.find((t) => t.workout_type === 'Wybieganie'); if (!dl) continue; tyg++;
        const suma = ws.reduce((s, t) => s + t.target_distance_km, 0);
        if (dl.target_distance_km > 0.40 * suma + 0.5) zle.push(`${dyst} ${dni}d baza ${b} T${w}: ${dl.target_distance_km} z ${suma}`);
      }
    }
    assert.ok(tyg > 500, 'za mało tygodni w próbie: ' + tyg);
    assert.deepEqual(zle, [], zle.length + ' tygodni ponad 40% dostawy (do 13.09: 767):\n' + zle.slice(0, 5).join('\n'));
  });
  test('4–6 dni: dostawa NIE zmienia się (cap z krzywej i z dostawy dają to samo)', () => {
    // kontrola, że zmiana nie dotyka tego, czego nie miała dotknąć
    const r = uloz({ dystans: 'half', dniWTygodniu: 5, dataStartu: iso(7 * 14 - 1), poziom: { p10sec: 330, objetoscTygodniowa: 40 } });
    const bud = r.meta.tygodnie - r.meta.taperTygodni;
    for (let t = 0; t < bud; t++) assert.ok(Math.abs(r.meta.objetosciFaktyczne[t] - r.meta.objetosciTygodni[t]) <= 1.5, 'T' + (t + 1));
  });
});

describe('(4) sufit akcentu: liczba w nocie jest tą, która tnie', () => {
  test('sufitPracyAkcentu = min(sufit z bazy, 40 min w tempie T) — dla p10 5:30 to 7 km, nie 16', () => {
    assert.equal(G._sufitPracyAkcentu(90, 330), 7);
    assert.equal(G._sufitPracyAkcentu(30, 330), 7);
    assert.equal(G._sufitPracyAkcentu(90, 200), 12, 'przy 3:20/km i bazie 90: 40 min w tempie T (Daniels) = 12 km — nadal poniżej sufitu z bazy 16');
  });
  test('nota „akcent do X km pracy" cytuje tę samą liczbę, którą ma najdłuższy Tempo w planie', () => {
    const r = uloz({ dystans: '5k', dniWTygodniu: 3, dataStartu: iso(7 * 8 - 1), poziom: { p10sec: 330, objetoscTygodniowa: 90 } });
    const nota = r.meta.zalozenia.find((z) => /akcent do/.test(z));
    assert.ok(nota, 'brak noty o sufitach');
    const m = nota.match(/akcent do (\d+) km pracy, czyli 40 min/);
    assert.ok(m, 'nota nie mówi o pracy i minutach: ' + nota);
    const tempo = r.treningi.filter((t) => t.workout_type === 'Tempo');
    const najdluzszy = Math.max(...tempo.map((t) => t.target_distance_km));
    assert.equal(Number(m[1]) + 3, najdluzszy, 'nota ' + m[1] + ' km pracy vs jednostka ' + najdluzszy + ' km (rozgrzewka 2 + praca + schłodzenie 1)');
    assert.doesNotMatch(nota, /akcent do 16 km\)/);
  });
});
