/* BLIZNA 90 (1.11.2026, zaległość z 31.10) — km MIESIĄCA tylko z biegów, w przyznawaniu i w pasku wyzwania naraz.

   Co było: checkBadges liczył tydzień z biegów, a miesiąc ze WSZYSTKIEGO (rower dobijał „100 km miesiąca"); WYZWANIA.postep
   kopiował tę asymetrię, żeby pasek mówił to, co zrobi odznaka. Pomiar 1.11: październik — 19 z 32 osób z inną sumą
   miesiąca, 6 z innym progiem odznaki; listopad (1. dzień) — 5 z 11, 1 przy progu.
   Ryzyka: (1) przyznawanie i pasek rozjadą się znowu (dwie kopie postep: sb.js i _shared/wyzwania.mjs + checkBadges);
   (2) ktoś przywróci sumę „ze wszystkiego" w jednym miejscu. Test liczy WSZYSTKIE trzy na tych samych logach. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const TERAZ = new Date('2026-11-20T12:00:00');
const LOGI = [
  { logged_at: '2026-11-03T07:00:00Z', training_type: 'Spokojny', distance_km: '30' },
  { logged_at: '2026-11-10T07:00:00Z', training_type: 'Wybieganie', distance_km: '15' },
  { logged_at: '2026-11-12T07:00:00Z', training_type: 'Rower', distance_km: '80' },
  { logged_at: '2026-11-18T07:00:00Z', training_type: 'Zastępczy', distance_km: '20' },
];

test('WYZWANIA.postep: miesiąc tylko z biegów — kopia przeglądarkowa (sb.js) i Deno (_shared) dają to samo', async () => {
  const ctx = zaladujSb();
  const { WYZWANIA } = await zaladuj();
  const A = WYZWANIA.aktywne(TERAZ);
  const kmMies = A.miesiac.find((c) => c.kind === 'km') || { id: 'x', kind: 'km' };
  const pS = ctx.WYZWANIA.postep(LOGI, TERAZ), pD = WYZWANIA.postep(LOGI, TERAZ);
  assert.equal(JSON.stringify(pS), JSON.stringify(pD), 'dwie kopie liczą identycznie');
  const kmowe = WYZWANIA.MONTHLY.filter((c) => c.kind === 'mkm');
  assert.ok(kmowe.length >= 4, 'wyzwania miesięczne na km: ' + kmowe.length);
  for (const c of kmowe) assert.equal(pD['m_' + c.id], 45, c.id + ': 30 + 15 km biegu, bez roweru i zastępczego');
  void kmMies;
});
async function zaladuj() { return import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/wyzwania.mjs')).href); }

test('źródła: postep w obu kopiach i checkBadges liczą miesiąc przez isRunType — żadnej sumy „ze wszystkiego"', () => {
  for (const p of ['sb.js', 'supabase/functions/_shared/wyzwania.mjs']) {
    const s = czytaj(p);
    assert.match(s, /var mkm = all\.reduce\(function\(s,l\)\{ return s\+\(bieg\(l\) \? \(parseFloat\(l\.distance_km\)\|\|0\) : 0\); \}, 0\);/, p);
    assert.ok(!/var mkm = all\.reduce\(function\(s,l\)\{ return s\+\(parseFloat/.test(s), p + ': stara suma ze wszystkiego');
  }
  const z = czytaj('zawodnik.html');
  assert.match(z, /const mKm = mLogs\.reduce\(\(s, l\) => s \+ \(window\.isRunType\(l\.training_type\) \? \(parseFloat\(l\.distance_km\) \|\| 0\) : 0\), 0\);/);
  assert.ok(!/const mKm = mLogs\.reduce\(\(s, l\) => s \+ \(parseFloat/.test(z));
});

test('checkBadges (zawodnik.html w vm): rower i zastępczy nie dają „50 km miesiąca"; biegi tak', async () => {
  const { zaladujStrone } = require('./_srodowisko.js');
  const vm = require('node:vm');
  const przyznaj = async (logi) => {
    const ctx = zaladujStrone('zawodnik.html');
    const dane = [];
    const q = { select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => q, gte: () => q, in: () => q,
      maybeSingle: async () => ({ data: null, error: null }), then: (r) => Promise.resolve({ data: logi, error: null }).then(r) };
    ctx.sb = { from: (t) => (t === 'achievements' ? { select: () => ({ eq: async () => ({ data: [], error: null }) }), insert: async (w) => { dane.push(...[].concat(w).map((x) => x.badge_id)); return { error: null }; },
      upsert: async (w) => { dane.push(...[].concat(w).map((x) => x.badge_id)); return { error: null }; } } : q), auth: { getSession: async () => ({ data: { session: null } }) }, rpc: async () => ({ data: null, error: null }) };
    const przyznane = [];
    ctx.awardBadge = (id) => przyznane.push(id);
    vm.runInContext('_athleteId = "ath-1";', ctx);
    const prawdziwyDate = ctx.Date;
    ctx.Date = class extends Date { constructor(...a) { super(...(a.length ? a : [TERAZ.getTime()])); } static now() { return TERAZ.getTime(); } };
    try { await ctx.checkBadges(); } catch (e) { /* reszta reguł może sięgać po DOM — liczy się lista przyznanych */ }
    ctx.Date = prawdziwyDate;
    return przyznane;
  };
  const tylkoRower = await przyznaj([{ logged_at: '2026-11-12T07:00:00Z', training_type: 'Rower', distance_km: '80', pace: null, feel: null },
    { logged_at: '2026-11-13T07:00:00Z', training_type: 'Spokojny', distance_km: '5', pace: '6:00', feel: 'good' }]);
  assert.ok(!tylkoRower.includes('50km_miesiaca') && !tylkoRower.includes('maraton_m'), JSON.stringify(tylkoRower));
  const biegi = await przyznaj([{ logged_at: '2026-11-03T07:00:00Z', training_type: 'Spokojny', distance_km: '30', pace: '6:00', feel: 'good' },
    { logged_at: '2026-11-10T07:00:00Z', training_type: 'Wybieganie', distance_km: '25', pace: '6:10', feel: 'good' }]);
  assert.ok(biegi.includes('50km_miesiaca') && biegi.includes('maraton_m'), JSON.stringify(biegi));
});
