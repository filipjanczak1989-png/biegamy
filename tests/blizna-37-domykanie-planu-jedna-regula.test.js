// Blizna #37 (06.10.2026) — domykanie planu logiem: JEDNA reguła, dwie kopie, te same przypadki.
//
// Rana: intervals-sync i intervals-webhook wstawiały training_logs i nie dotykały trainings —
// plan zostawał `planned` mimo wykonania (główne źródło 293 wiszących planów z logiem tego
// samego dnia; completionRate28 w EF raportów zaniżony o ~1/3). saveLog miał własną regułę
// „dokładnie jeden kandydat". Decyzja Filipa 06.10: import domyka plan DOKŁADNIE jak saveLog.
//
// Oryginał: sb.js `window.wybierzPlanDoDomkniecia` (ładowany piaskownicą z tests/_srodowisko.js,
// jak w bramce). Kopia: _shared/domknij-plan.mjs (import natywny). Każdy przypadek karmi OBIE
// i wymaga tego samego wyniku — to jest test ROZJAZDU, nie tylko poprawności.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
let sb, M;
test.before(async () => {
  sb = zaladujSb();
  M = await import('../supabase/functions/_shared/domknij-plan.mjs');
});

const P = (id, type, status = 'planned', km = null) => ({ id, type, status, distance_km: km });
const PRZYPADKI = [
  ['jeden kandydat → on, nawet innego typu',      [P('a', 'Spokojny')], 'Interwały', 'a'],
  ['missed sam → nic',                             [P('a', 'Spokojny', 'missed')], 'Spokojny', null],
  ['dwa plany, log pasuje do jednego',             [P('a', 'Spokojny'), P('b', 'Interwały')], 'Interwały', 'b'],
  ['dwa plany, log do żadnego → nic',              [P('a', 'Spokojny'), P('b', 'Interwały')], 'Rower', null],
  ['dwa plany TEGO SAMEGO typu → nic (nie zgaduj)', [P('a', 'Spokojny'), P('b', 'Spokojny')], 'Spokojny', null],
  ['missed + planned → ten planned',               [P('a', 'Spokojny', 'missed'), P('b', 'Spokojny')], 'Rower', 'b'],
  ['trzy plany, jeden pasuje',                     [P('a', 'Spokojny'), P('b', 'Tempo'), P('c', 'Długi')], 'Tempo', 'b'],
  ['pusto → nic',                                  [], 'Spokojny', null],
  ['null → nic',                                   null, 'Spokojny', null],
  ['typ ze spacją → trim',                         [P('a', 'Tempo'), P('b', 'Długi')], ' Tempo ', 'a'],
  ['wielkość liter NIE jest ignorowana (jak saveLog)', [P('a', 'Tempo'), P('b', 'Długi')], 'tempo', null],
  ['typ logu pusty przy dwóch planach → nic',      [P('a', 'Tempo'), P('b', 'Długi')], '', null],
];

for (const [nazwa, kandydaci, typ, oczekiwane] of PRZYPADKI) {
  test('obie kopie: ' + nazwa, () => {
    const a = sb.wybierzPlanDoDomkniecia(kandydaci ? kandydaci.map((k) => ({ ...k })) : kandydaci, typ);
    const b = M.wybierzPlanDoDomkniecia(kandydaci ? kandydaci.map((k) => ({ ...k })) : kandydaci, typ);
    assert.equal(a ? a.id : null, oczekiwane, 'sb.js');
    assert.equal(b ? b.id : null, oczekiwane, '_shared');
  });
}

test('⚠️ kluczDnia: dzień logu w czasie POLSKIM, nie UTC (warunek wstępny bramki Filipa 06.10)', () => {
  assert.equal(M.kluczDnia('2026-10-06T22:30:00Z'), '2026-10-07', 'lato: 22:30 UTC = 00:30 PL następnego dnia');
  assert.equal(M.kluczDnia('2026-01-15T23:30:00Z'), '2026-01-16', 'zima: 23:30 UTC = 00:30 PL następnego dnia');
  assert.equal(M.kluczDnia('2026-10-06T22:30:00+00:00'), '2026-10-07', 'kształt z bazy (timestamptz, offset +00:00)');
  assert.equal(M.kluczDnia('2026-10-06T19:59:00Z'), '2026-10-06', 'lato: 21:59 PL — jeszcze ten sam dzień');
  assert.equal(M.kluczDnia('2026-01-15T22:59:00Z'), '2026-01-15', 'zima: 23:59 PL — jeszcze ten sam dzień');
  assert.equal(M.kluczDnia('2026-10-06T07:00:00'), '2026-10-06', 'naiwny start_date_local z intervals = już lokalny, bez przesunięcia');
  assert.equal(M.kluczDnia('2026-10-06T23:30:00'), '2026-10-06', 'naiwny 23:30 lokalnie zostaje 6.10 (nie jest instantem UTC)');
  assert.equal(M.kluczDnia('2026-10-06T22:30:00+02:00'), '2026-10-06', 'offset PL w napisie = 22:30 PL');
  assert.equal(M.kluczDnia(''), '');
  assert.equal(M.kluczDnia(null), '');
  assert.equal(M.kluczDnia('abc'), 'abc', 'śmieć nie rzuca i nie daje Invalid Date');
});

test('domknijPlanyPoImporcie: log 22:30Z domyka plan z NASTĘPNEGO dnia PL', async () => {
  const log = [];
  const plany = [Object.assign(P('p7', 'Spokojny', 'planned', 10), { date: '2026-10-07' })];
  const klient = { from(t) { const q = { _t: t, _op: null, _f: [] }; const c = {
    select() { q._op = 'select'; return c; }, update() { q._op = 'update'; return c; },
    eq(k, v) { q._f.push([k, v]); return c; }, neq() { return c; },
    gte(k, v) { q._f.push(['gte', v]); return c; }, lte(k, v) { q._f.push(['lte', v]); return c; },
    then(r) { log.push(q); return r(q._op === 'select' ? { data: plany } : { data: null }); } }; return c; } };
  const w = await M.domknijPlanyPoImporcie(klient, 'ath', [{ id: 'l', logged_at: '2026-10-06T22:30:00+00:00', training_type: 'Spokojny', distance_km: 10 }]);
  assert.equal(w.domkniete, 1, 'plan z 7.10 nie został domknięty logiem z 22:30 UTC 6.10');
  const sel = log.find((q) => q._op === 'select');
  assert.deepEqual(sel._f.filter(([k]) => k === 'gte' || k === 'lte').map(([, v]) => v), ['2026-10-07', '2026-10-07'], 'zakres dat liczony w PL');
});

test('wiarygodneWykonanie: 0,5–2,0× dystansu planu, bez obu dystansów false (jak saveLog)', () => {
  assert.equal(M.wiarygodneWykonanie(10, 5), true);
  assert.equal(M.wiarygodneWykonanie(10, 20), true);
  assert.equal(M.wiarygodneWykonanie(10, 4.9), false);
  assert.equal(M.wiarygodneWykonanie(10, 20.1), false);
  assert.equal(M.wiarygodneWykonanie(0, 10), false);
  assert.equal(M.wiarygodneWykonanie(10, null), false);
  assert.equal(M.wiarygodneWykonanie('8', '12'), true, 'stringi z bazy');
});

test('domknijPlanyPoImporcie: jedno zapytanie po plany, UPDATE tylko dla dopasowań, nigdy nie rzuca', async () => {
  const log = [];
  const atrapa = (plany) => ({
    from(tabela) {
      const q = { _t: tabela, _op: null, _f: [] };
      const chain = {
        select() { q._op = 'select'; return chain; },
        update(d) { q._op = 'update'; q._d = d; return chain; },
        eq(k, v) { q._f.push([k, v]); return chain; },
        neq() { return chain; }, gte() { return chain; }, lte() { return chain; },
        then(res) { log.push(q); return res(q._op === 'select' ? { data: plany, error: null } : { data: null, error: null }); },
      };
      return chain;
    },
  });
  const plany = [P('p1', 'Spokojny', 'planned', 10), P('p2', 'Tempo', 'planned', 8), P('p3', 'Długi', 'planned', 20)];
  plany[0].date = '2026-10-01'; plany[1].date = '2026-10-02'; plany[2].date = '2026-10-02';
  const logi = [
    { id: 'l1', logged_at: '2026-10-01T07:00:00', training_type: 'Rower', distance_km: 30 },   // jeden kandydat → p1 done; 30/10=3 → bez powiązania
    { id: 'l2', logged_at: '2026-10-02T07:00:00', training_type: 'Tempo', distance_km: 8.5 },  // dwa kandydaci, Tempo → p2; 8.5/8 → powiązanie
    { id: 'l3', logged_at: '2026-10-03T07:00:00', training_type: 'Spokojny', distance_km: 5 }, // brak planu → nic
  ];
  const w = await M.domknijPlanyPoImporcie(atrapa(plany), 'ath', logi);
  assert.deepEqual(w, { domkniete: 2, powiazane: 1, bledy: 0 });
  const selecty = log.filter((q) => q._op === 'select');
  assert.equal(selecty.length, 1, 'plany pobrane JEDNYM zapytaniem, nie per log');
  const updaty = log.filter((q) => q._op === 'update');
  assert.deepEqual(updaty.map((q) => [q._t, q._f[0][1]]), [['trainings', 'p1'], ['trainings', 'p2'], ['training_logs', 'l2']]);
  // nie rzuca przy awarii klienta
  const zly = { from() { throw new Error('boom'); } };
  assert.deepEqual(await M.domknijPlanyPoImporcie(zly, 'ath', logi), { domkniete: 0, powiazane: 0, bledy: 1 });
  assert.deepEqual(await M.domknijPlanyPoImporcie(atrapa([]), 'ath', []), { domkniete: 0, powiazane: 0, bledy: 0 });
});

test('ten sam plan nie jest domykany dwa razy w jednej paczce (dwa logi tego samego dnia)', async () => {
  const log = [];
  const plany = [Object.assign(P('p1', 'Spokojny', 'planned', 10), { date: '2026-10-01' })];
  const klient = { from(t) { const q = { _t: t, _op: null, _f: [] }; const c = {
    select() { q._op = 'select'; return c; }, update() { q._op = 'update'; return c; },
    eq(k, v) { q._f.push([k, v]); return c; }, neq() { return c; }, gte() { return c; }, lte() { return c; },
    then(r) { log.push(q); return r(q._op === 'select' ? { data: plany } : { data: null }); } }; return c; } };
  const w = await M.domknijPlanyPoImporcie(klient, 'ath', [
    { id: 'l1', logged_at: '2026-10-01T07:00:00', training_type: 'Spokojny', distance_km: 10 },
    { id: 'l2', logged_at: '2026-10-01T18:00:00', training_type: 'Spokojny', distance_km: 10 },
  ]);
  assert.equal(w.domkniete, 1);
  assert.equal(log.filter((q) => q._op === 'update' && q._t === 'trainings').length, 1);
});

test('saveLog w zawodnik.html używa SSOT z sb.js, nie własnej kopii; oba EF importują moduł', () => {
  const z = czytaj('zawodnik.html');
  const i = z.indexOf('async function saveLog');
  const cialo = z.slice(i, i + 20000);
  assert.match(cialo, /window\.wybierzPlanDoDomkniecia\(plannedRows, _logType\)/);
  assert.doesNotMatch(cialo, /filter\(r => r\.status !== 'missed'\)/, 'saveLog ma znów własną kopię reguły');
  for (const ef of ['intervals-sync', 'intervals-webhook']) {
    const kod = czytaj('supabase/functions/' + ef + '/index.ts');
    assert.match(kod, /from ['"]\.\.\/_shared\/domknij-plan\.mjs['"]/, ef);
    assert.match(kod, /domknijPlanyPoImporcie\(/, ef + ' nie woła domknięcia');
    assert.match(kod, /domkniete/, ef + ' nie raportuje domkniete w odpowiedzi');
  }
  assert.match(czytaj('sb.js'), /window\.wybierzPlanDoDomkniecia = function\(kandydaci, typLogu\)/);
});
