/* BLIZNA 335 (Filip 22.11, krok 5): podpowiedzi pod polem Okienka brały 3 pozycje z listy i 2 ostatnie pytania użytkownika (router często ich nie zna),
   a podpowiedź w polu krążyła także po „Kto wygrał maraton w Berlinie?” (sieć) i „Wyniki: imię i nazwisko” (tryb osoby). Teraz: 5 stałych podpowiedzi,
   na które router odpowiada sam w v1 i v2 (zero modelu i sieci), szósta „Co to za akcja?” tylko gdy akcja trwa; ostatnie pytania nie są zapisywane ani pokazywane. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { przebiegV2, trasaRoutera, KORZEN } = require('./_okienko-potok-atrapa.js');
const { zaladujSb } = require('./_srodowisko.js');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

function okienko(akcja) {
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  if (akcja) ctx.BM_AKCJA_CYTATY = akcja;
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  return ctx.OKIENKO;
}
const etykiety = (html) => [...html.matchAll(/data-pytanie="([^"]*)"/g)].map((m) => m[1]);

test('lista podpowiedzi: 5 stałych + „Co to za akcja?”; każda kończy się w routerze v1 i v2, bez modelu i sieci', async () => {
  const O = okienko();
  assert.deepEqual([...O.PODPOWIEDZI], ['Plan na jutro', 'Ile przebiegłem w tym tygodniu?', 'Kiedy mam start?', 'Jaką mam formę?', 'Jakie mam odznaki?']);
  assert.equal(O.PODPOWIEDZ_AKCJI, 'Co to za akcja?');
  const oczek = { 'Plan na jutro': 'moj_plan', 'Ile przebiegłem w tym tygodniu?': 'moje_treningi', 'Kiedy mam start?': 'moje_starty', 'Jaką mam formę?': 'moja_forma', 'Jakie mam odznaki?': 'odznaki_moje', 'Co to za akcja?': 'zagadka' };
  for (const q of [...O.PODPOWIEDZI, O.PODPOWIEDZ_AKCJI]) {
    assert.equal(await trasaRoutera(q), oczek[q], 'v1 router: ' + q);
    const r = await przebiegV2(q);
    assert.equal(r.slad, 'router:' + oczek[q], 'v2: ' + q);
    assert.equal(r.sieci + r.modele, 0, 'bez sieci i modelu: ' + q);
  }
});

test('pod polem: bez akcji 5 podpowiedzi, w trakcie akcji 6, po zamknięciu znowu 5; podpowiedź w polu tylko z tej samej listy', () => {
  assert.deepEqual(etykiety(okienko().chipy()), ['Plan na jutro', 'Ile przebiegłem w tym tygodniu?', 'Kiedy mam start?', 'Jaką mam formę?', 'Jakie mam odznaki?']);
  assert.deepEqual(etykiety(okienko({ czyAkcjaRuszyla: () => true, czyAkcjaZamknieta: () => false }).chipy()).slice(-1), ['Co to za akcja?']);
  assert.equal(etykiety(okienko({ czyAkcjaRuszyla: () => true, czyAkcjaZamknieta: () => false }).chipy()).length, 6);
  assert.equal(etykiety(okienko({ czyAkcjaRuszyla: () => true, czyAkcjaZamknieta: () => true }).chipy()).length, 5, 'po zamknięciu akcji bez podpowiedzi o akcji');
  assert.equal(etykiety(okienko({ czyAkcjaRuszyla: () => false }).chipy()).length, 5, 'przed startem bez podpowiedzi o akcji');
  const O = okienko();
  for (let i = 0; i < 12; i++) assert.ok(O.PODPOWIEDZI.includes(O.podpowiedz()), 'podpowiedź w polu z listy');
});

test('ostatnie pytania nie są ani zapisywane, ani pokazywane; z listy zeszły pytania do sieci i do trybu osoby', () => {
  const s = czytaj('js/okienko.js');
  assert.doesNotMatch(s, /okienko_ostatnie|KLUCZ_OSTATNIE|zapamietajPytanie/);
  assert.doesNotMatch(s, /'Kto wygrał maraton w Berlinie\?'|'Wyniki: imię i nazwisko'/);
});
