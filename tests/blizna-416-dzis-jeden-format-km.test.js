// Blizna #416 (27.11.2026) — U1: jeden format kilometrów w całym nowym Dziś (decyzja Filipa 27.11).
//
// Reguła: POJEDYNCZY TRENING (zrobiony albo zaplanowany na dziś) ORAZ SUMA DNIA (słupek pod dniem, „Dziś: … km”) = zawsze jedno miejsce
//         po przecinku, także zero: 4,0 · 8,2 · 10,2 · 1 234,6 (ten sam bieg w dwóch kaflach wygląda tak samo; decyzja Filipa 27.11).
//         SUMY TYGODNIA I CELE (tydzień, plan tygodnia i dnia, „do planu”, „tydzień temu”, inne aktywności, Ulica, Społeczność) = bez miejsc: 25 · 13 · 36.
//         Suma bez miejsc większa od 0, ale mniejsza od 1 km = „<1” (nie „0”).
// Wcześniej były trzy reguły: km() do 2 miejsc poniżej 10 km z obcinaniem zer („4”, „6,25”), tydzień 1 miejsce poniżej 100 km („24,6”),
// Ulica 1 miejsce poniżej 10 km. Ten sam trening 4 km był „4,0” w Społeczności i „4” w Ostatnim treningu.
// Moduły sceny Ulicy (wspólne z bieg.html) już piszą cele i sumy całe (formatKm), stara strona Społeczność idzie do przebudowy: bez zmian.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, MODUL } = require('./_dzis-nowy-strona.js');

const KOD = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PRZED_KM = /(\d[\d ]*(?:,\d+)?)(?:<\/b>)?(?:<small>| )km\b/g;
const liczbyPrzedKm = (h) => [...String(h).replace(/&lt;/g, '<').matchAll(PRZED_KM)].map((m) => m[1].trim());

test('(1) km(): pojedynczy trening, zawsze jedno miejsce po przecinku; brak albo zero = „—”', () => {
  const { km } = strona().B;
  for (const [x, t] of [[4, '4,0'], [6.25, '6,3'], [8.214, '8,2'], [9.99, '10,0'], [10.24, '10,2'], [21.0975, '21,1'], [42.195, '42,2'], [1234.56, '1 234,6'], ['5.5', '5,5'], [0.04, '0,0']])
    assert.equal(km(x), t, x + ' → ' + t);
  for (const x of [0, -2, null, undefined, 'x', NaN]) assert.equal(km(x), '—', String(x));
});

test('(2) kmSuma(): sumy i cele bez miejsc po przecinku; między 0 a 1 km „<1”', () => {
  const { kmSuma } = strona().B;
  for (const [x, t] of [[24.6, '25'], [13.4, '13'], [16.44, '16'], [21.7, '22'], [0, '0'], [0.4, '<1'], [0.99, '<1'], [1, '1'], [9.5, '10'], [1234.6, '1 235'], [12345.6, '12 346'], [20000, '20 000']])
    assert.equal(kmSuma(x), t, x + ' → ' + t);
  assert.equal(kmSuma('x'), '—');
});

test('(3) w module kilometry idą wyłącznie przez km() i kmSuma(); żadnej trzeciej reguły', () => {
  assert.doesNotMatch(KOD, /kmTygodnia|toFixed\(\d\)[^\n]{0,40}km/);
  const argumenty = [...KOD.matchAll(/liczba\(([^,()]+(?:\([^)]*\))?)/g)].map((m) => m[1].trim()).sort();
  assert.deepEqual(argumenty, ['Math.round(n)', 'l.elevation_gain', 'l.heart_rate', 'n', 'n', 'p', 't.duration_min'].sort(),
    'liczba() poza km/kmSuma tylko dla tętna, przewyższenia, minut i procentu');
  assert.ok(KOD.includes('function km(x) { var n = Number(x); return isFinite(n) && n > 0 ? liczba(n, 1, true) : "—"; }'));
  assert.ok(KOD.includes('function kmSuma(x) { var n = Number(x); return !isFinite(n) ? "—" : n > 0 && n < 1 ? "<1" : liczba(Math.round(n), 0); }'));
  for (const w of ['"Twój wkład: <b>" + esc(kmSuma(k)) + " km</b>"', "'\"><b>' + esc(kmSuma(suma)) + \"</b><span>\"", '"z " + esc(kmSuma(cel)) + " km · "', '"</b>, razem " + esc(kmSuma(suma)) + " km"'])
    assert.ok(KOD.includes(w), 'suma albo cel przez kmSuma: ' + w);
});

test('(4) na ekranie: pojedyncze treningi i sumy dnia z jednym miejscem, sumy tygodnia bez miejsc (te same dane w kilku kaflach)', async () => {
  const wpisy = [wpis('l1', 20, { distance_km: 4 }), wpis('l2', 30, { distance_km: 8.214, training_type: 'Wybieganie' }), wpis('l3', 50, { distance_km: 16.44, feel: 'good' })];
  const s = strona({ wpisy }); s.B.start(); await s.doKonca();
  const ostatni = s.kafel('ostatni').innerHTML, lista = s.kafel('lista').innerHTML, trening = s.kafel('trening').innerHTML;
  assert.match(ostatni, /<b>4,0<small>km<\/small><\/b><span>dystans<\/span>/, 'Ostatni trening: 4 km → 4,0');
  assert.match(lista, /<b>8,2 km<\/b>/); assert.match(lista, /<b>16,4 km<\/b>/);
  assert.match(trening, /<span class="dn-cel"><span>8,0 km ·<\/span>/, 'plan na dziś to też pojedynczy trening');
  const cele = [...trening.matchAll(/<span class="dn-cel">[\s\S]*?<\/span><\/span>/g)].map((m) => m[0]).join('');   // opis trenera („Rozgrzewka 2 km…”) to wolny tekst
  for (const [nazwa, h] of [['ostatni', ostatni], ['lista', lista], ['trening (cel)', cele]])
    for (const x of liczbyPrzedKm(h)) assert.match(x, /^\d{1,3}( \d{3})*,\d$/, nazwa + ': pojedynczy trening ma jedno miejsce po przecinku: ' + x);
  const pasek = s.cz('zdarzenie').innerHTML;
  assert.match(pasek, /Jak poszło\?<small>Spokojny · [^<]* · 4,0 km<\/small>/, 'opis „Jak poszło?”: ten sam format co kafel');
  /* decyzja Filipa 27.11: suma DNIA (słupek, „Dziś: … km”, opis dla czytnika) jak pojedynczy trening; sumy tygodnia i cele (także plan dnia) bez miejsc */
  const tydzien = s.kafel('tydzien').innerHTML, linia = s.cz('tydzien-linia').innerHTML;
  const tydzienLiczby = (/<div class="dn-liczby dn-trzy">[\s\S]*?<\/div><\/div>/.exec(tydzien) || [''])[0];
  const slupkiDnia = [...tydzien.matchAll(/<\/div><b>([^<]+)<\/b><span>(?:pn|wt|śr|cz|pt|sb|nd)<\/span>/g)].map((m) => m[1]);
  assert.ok(slupkiDnia.length >= 1, 'słupki z kilometrami'); for (const x of slupkiDnia) assert.match(x, /^\d{1,3}( \d{3})*,\d$/, 'słupek dnia jak pojedynczy trening: ' + x);
  for (const x of [...tydzien.matchAll(/Kilometry dzień po dniu: [^"]*/g)].flatMap((m) => [...m[0].matchAll(/(pn|wt|śr|cz|pt|sb|nd) (\d[\d ]*(?:,\d+)?) km/g)].map((y) => y[2])))
    assert.match(x, /^\d{1,3}( \d{3})*,\d$/, 'opis dla czytnika: kilometry dnia jak słupek: ' + x);
  for (const [nazwa, h] of [['liczby tygodnia', tydzienLiczby], ['linia tygodnia', linia]]) {
    assert.ok(liczbyPrzedKm(h).length >= 1, nazwa + ': są sumy do sprawdzenia');
    for (const x of liczbyPrzedKm(h)) assert.match(x, /^(<1|\d{1,3}( \d{3})*)$/, nazwa + ': suma bez miejsc po przecinku: ' + x);
  }
  const { km, kmSuma } = s.B; assert.equal(km(0.4), '0,4', 'dzień z 0,4 km pod słupkiem to „0,4”'); assert.equal(kmSuma(0.4), '<1', '„<1” tylko w sumach bez miejsc');
});
