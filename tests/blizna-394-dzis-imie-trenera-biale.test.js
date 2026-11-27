// Blizna #394 (26.11.2026) — nowe Dziś: imię trenera w wiadomości zostało pomarańczowe po audycie A3.
//
// Po blizna-392 pomarańczowy miał zostać tylko dla linków i przycisków. Imię trenera nad wiadomością („Marek”) było
// ostatnią rzeczą wyglądającą jak etykieta, która dalej świeciła pomarańczem, obok linku „Czytaj ›” pod spodem.
// Decyzja Filipa 26.11: imię białe i pogrubione. „Czytaj ›” zostaje pomarańczowe, bo to jest link.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

const regula = (sel) => { const i = MODUL.indexOf(sel + '{'); assert.ok(i >= 0, 'brak reguły ' + sel); return MODUL.slice(i, MODUL.indexOf('}', i) + 1); };

test('(1) imię trenera białe i pogrubione; data obok szara; „Czytaj ›” dalej pomarańczowe', () => {
  assert.equal(regula('#dzis-nowy .dn-rada-kto b'), '#dzis-nowy .dn-rada-kto b{color:#f5f3ef;font-weight:700}');
  assert.match(regula('#dzis-nowy .dn-rada-kto'), /color:#8f8c97;/, 'data wiadomości („wczoraj”) szara, jak dotąd');
  assert.match(regula('#dzis-nowy .dn-rada-w'), /color:#ff7a45;/, 'link „Czytaj ›” zostaje pomarańczowy');
});

test('(2) po audycie A3 w arkuszu nie ma już pomarańczowego tekstu poza linkami, przyciskami i wyróżnieniem „dziś”', () => {
  const pomaranczowe = [...MODUL.matchAll(/(#dzis-nowy [^{}"]*)\{(?:[^}]*;)?color:#ff7a45[^}]*\}/g)].map((m) => m[1].replace('#dzis-nowy ', '')).sort();
  assert.deepEqual(pomaranczowe, ['.dn-jp-zapisz', '.dn-link', '.dn-moment i', '.dn-rada-w', '.dn-sl.dzis span', '.dn-wlink']   /* od blizna-413 chip „← Trener” ma kolor kółek (#f5f3ef), jak przyciski nagłówka */,
    'linki (.dn-link, .dn-wlink, .dn-rada-w), przyciski (.dn-trener, .dn-jp-zapisz w obrysie, strzałka paska zdarzeń) i podpis dzisiejszego dnia pod słupkami; nowy pomarańczowy tekst wymaga decyzji');
});

test('(3) znacznik wiadomości bez zmian: imię w <b>, potem kiedy, treść i „Czytaj ›”', async () => {
  const s = strona(); s.el['coach-nm'] = { textContent: 'Marek' }; s.B.start(); await s.doKonca();
  assert.match(s.kafel('trening').innerHTML, /<button type="button" class="dn-rada" data-dn="rada"><span class="dn-rada-kto"><b>Marek<\/b><span>[^<]+<\/span><\/span><span class="dn-rada-t">Jutro luźno\.<\/span><span class="dn-rada-w">Czytaj ›<\/span><\/button>/);
});
