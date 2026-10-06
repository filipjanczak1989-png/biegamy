// Blizna #36 (06.10.2026) — mapa typów aktywności intervals → BiegaMy w JEDNEJ kopii.
//
// Rana: „świadomy duplikat" RUN_ACT/ACT_MAP/typeForActivity w intervals-sync i intervals-webhook
// rozjechał się 27.07 (`cce8902` dodał ACT_MAP tylko w sync; webhook ostatnio `f2231e4` 23.07).
// Przez 10 tygodni każdy nie-bieg z webhooka wpadał jako 'Zastępczy' — to objaw Maćka z 14.08
// (258 wpisów), którego nie dało się zdiagnozować z bazy, bo surowy `type` nie był zapisywany.
//
// Dwie warstwy pilnowania: tools/bramka-reguly.js (część D, w CI) i ten test. Test ładuje moduł
// NATYWNIE (jak blizna-18 dla wstaw-z-odzyskiem) i sprawdza ZACHOWANIE, nie tekst — plus kilka
// asercji tekstowych na EF, bo Deno z esm.sh nie wejdzie do node.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (f) => fs.readFileSync(path.join(KORZEN, f), 'utf8');
let M;
test.before(async () => { M = await import('../supabase/functions/_shared/typ-aktywnosci.mjs'); });

test('Walk → Spacer: dokładnie przypadek Maćka z 14.08', () => {
  assert.equal(M.typeForActivity({ type: 'Walk' }, null), 'Spacer');
  assert.equal(M.typeForActivity({ type: 'Hike' }, null), 'Spacer');
});

test('pozostałe nie-biegi dostają własny typ, nieznany → Zastępczy', () => {
  assert.equal(M.typeForActivity({ type: 'OpenWaterSwim' }, null), 'Pływanie');
  assert.equal(M.typeForActivity({ type: 'WeightTraining' }, null), 'Siłownia');
  assert.equal(M.typeForActivity({ type: 'Ride' }, 'Interwały'), 'Rower', 'rower nie bierze typu z planu');
  assert.equal(M.typeForActivity({ type: 'Kitesurf' }, null), 'Zastępczy');
  assert.equal(M.typeForActivity({}, null), 'Zastępczy');
  assert.equal(M.typeForActivity(null, null), 'Zastępczy');
});

test('bieg bierze typ z PLANU; brak planu / odpoczynek / plan nie-biegowy → Spokojny; alias „bieg spokojny" → Spokojny', () => {
  assert.equal(M.typeForActivity({ type: 'Run' }, 'Interwały'), 'Interwały');
  assert.equal(M.typeForActivity({ type: 'TrailRun' }, 'Długi'), 'Długi');
  assert.equal(M.typeForActivity({ type: 'Run' }, null), 'Spokojny');
  assert.equal(M.typeForActivity({ type: 'Run' }, 'Odpoczynek'), 'Spokojny');
  assert.equal(M.typeForActivity({ type: 'Run' }, 'Siłownia'), 'Spokojny');
  assert.equal(M.typeForActivity({ type: 'Run' }, 'bieg spokojny'), 'Spokojny');
  assert.equal(M.typeForActivity({ type: 'Run' }, 'INTERWAŁY'), 'INTERWAŁY', 'wielkość liter planu zachowana (match case-insensitive)');
});

test('RUN_PLAN nie wraca jako osobna kopia — plan biegowy rozstrzyga RUN_TYPES z reguly-treningow.mjs', async () => {
  const R = await import('../supabase/functions/_shared/reguly-treningow.mjs');
  for (const t of R.RUN_TYPES) {
    if (t === 'bieg spokojny') continue;   // jedyny alias
    assert.equal(M.typeFromPlan(t), t, 'typ biegowy ' + t + ' nie przechodzi z planu');
  }
  const src = czytaj('supabase/functions/_shared/typ-aktywnosci.mjs');
  assert.doesNotMatch(src, /RUN_PLAN\s*=/, 'RUN_PLAN (mirror RUN_TYPES) wrócił — trzecia kopia listy biegowej');
  assert.match(src, /import \{ RUN_TYPES \} from '\.\/reguly-treningow\.mjs'/);
});

test('⚠️ próg liczności: ACT_MAP ma co najmniej 22 pozycje, RUN_ACT 4 (zmierzone 06.10)', () => {
  assert.ok(Object.keys(M.ACT_MAP).length >= 22, 'ACT_MAP skurczyła się do ' + Object.keys(M.ACT_MAP).length);
  assert.ok(M.RUN_ACT.size >= 4);
  assert.ok(Object.isFrozen(M.ACT_MAP), 'ACT_MAP ma być zamrożona — EF nie dopisuje do niej po cichu');
});

test('rawActivityType: surowy typ do external_type, pusty → null, przycięty do 64', () => {
  assert.equal(M.rawActivityType({ type: 'OpenWaterSwim' }), 'OpenWaterSwim');
  assert.equal(M.rawActivityType({ type: '  ' }), null);
  assert.equal(M.rawActivityType({}), null);
  assert.equal(M.rawActivityType({ type: 'x'.repeat(100) }).length, 64);
});

test('oba EF importują mapę, nie mają własnej i zapisują external_type', () => {
  for (const ef of ['intervals-sync', 'intervals-webhook']) {
    const kod = czytaj('supabase/functions/' + ef + '/index.ts');
    assert.match(kod, /from ['"]\.\.\/_shared\/typ-aktywnosci\.mjs['"]/, ef + ' nie importuje mapy');
    assert.doesNotMatch(kod, /const\s+ACT_MAP\s*[:=]/, ef + ' ma własną ACT_MAP');
    assert.doesNotMatch(kod, /const\s+RUN_ACT\s*=/, ef + ' ma własny RUN_ACT');
    assert.doesNotMatch(kod, /function\s+typeForActivity\s*\(/, ef + ' ma własną typeForActivity');
    assert.doesNotMatch(kod, /\?\s*typeFromPlan\([^)]*\)\s*:\s*['"]Zastępczy['"]/, ef + ': stary webhook (nie-bieg → Zastępczy) wrócił');
    assert.match(kod, /external_type:\s*rawActivityType\(a\)/, ef + ' nie zapisuje external_type');
  }
});

test('migracja external_type: kolumna + trigger białej listy ją zna, bez grantu dla anon', () => {
  const sql = czytaj('supabase/migrations/20261006_training_logs_external_type.sql');
  const linie = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(linie, /add column if not exists external_type text/);
  assert.match(linie, /if new\.external_type is distinct from old\.external_type then/, 'trigger guard_coach_fields nie zna external_type — trener mógłby ją zmienić');
  assert.ok(!/\bto\b[^;]*\banon\b/i.test(linie), 'migracja nadaje coś anonowi');
  // wycofanie istnieje i NAJPIERW zdejmuje linię z funkcji, potem kolumnę
  const w = czytaj('supabase/migrations/20261006_WYCOFANIE_training_logs_external_type.sql');
  const iFn = w.indexOf('create or replace function'), iDrop = w.indexOf('drop column if exists external_type');
  assert.ok(iFn > 0 && iDrop > iFn, 'wycofanie: drop column przed przepisaniem funkcji wywróci trigger');
  assert.doesNotMatch(w.slice(iFn, iDrop), /external_type is distinct/, 'wycofanie zostawia external_type w funkcji');
});
