/* BLIZNA 310 / 20.11 (decyzja Filipa): łagodne pytanie przy zapisie biegu albo marszu ponad 60 km — „Na pewno X km?”, bez blokady.
   Jedna funkcja w sb.js (pytajDuzyDystans); Dziś: po pytaniu „rower czy bieg” (rower = typ zastępczy, wtedy bez pytania); kalendarz: po sprawdzeniu czasu
   i pytaniu o rower. Przy edycji tylko, gdy zmienił się dystans. Twardy limit 300 km na Dziś zostaje. Anuluj = powrót do formularza, kursor w dystansie. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let ctx, pytania, odp;
test.before(() => { ctx = zaladujSb(); pytania = []; odp = true; ctx.window.confirm = (t) => { pytania.push(t); return odp; }; });
const P = (typ, km, przed) => { pytania.length = 0; const w = ctx.window.pytajDuzyDystans(typ, km, przed); return { w, pytania: pytania.slice() }; };

test('reguła: bieg albo marsz ponad 60 km pyta „Na pewno X km?”; do 60 km, inne typy i edycja bez zmiany dystansu — bez pytania', () => {
  odp = true;
  assert.deepEqual(P('Bieg spokojny', 64.5), { w: true, pytania: ['Na pewno 64,5 km?'] });
  assert.deepEqual(P('Długi', 100), { w: true, pytania: ['Na pewno 100 km?'] });
  assert.deepEqual(P('Spacer', 60.01), { w: true, pytania: ['Na pewno 60,01 km?'] });
  for (const t of ['Marsz', 'Nordic walking', 'Wędrówka', 'Start', 'wybieganie', ' Interwały ']) assert.equal(P(t, 61).pytania.length, 1, t);
  assert.deepEqual(P('Bieg spokojny', 60), { w: true, pytania: [] }, 'dokładnie 60 km: bez pytania');
  for (const t of ['Zastępczy', 'Wzmacniający', 'Rower', '', null]) assert.deepEqual(P(t, 120), { w: true, pytania: [] }, String(t));
  assert.deepEqual(P('Bieg spokojny', NaN), { w: true, pytania: [] });
  assert.deepEqual(P('Długi', 80, 80), { w: true, pytania: [] }, 'edycja bez zmiany dystansu');
  assert.deepEqual(P('Długi', 80, '80.00'), { w: true, pytania: [] });
  assert.equal(P('Długi', 85, 80).pytania.length, 1, 'edycja ze zmianą dystansu');
  odp = false;
  assert.deepEqual(P('Bieg spokojny', 70), { w: false, pytania: ['Na pewno 70 km?'] }, 'Anuluj = nie zapisuj');
  odp = true;
});

test('prawdziwe nazwy z formularzy (Dziś: „Spokojny”, „Spacer”, „Zastępczy”); isRunType dostaje typ w oryginalnej postaci', () => {
  odp = true;
  assert.deepEqual(P('Spokojny', 65), { w: true, pytania: ['Na pewno 65 km?'] });
  assert.deepEqual(P('Spacer', 65), { w: true, pytania: ['Na pewno 65 km?'] });
  assert.deepEqual(P('Zastępczy', 65), { w: true, pytania: [] });
  assert.deepEqual(P('Spokojny', 60), { w: true, pytania: [] });
  const z = czytaj('zawodnik.html'), k = czytaj('kalendarz.html');
  for (const typ of ['Spokojny', 'Spacer', 'Zastępczy']) assert.match(z, new RegExp("selType\\(this,'" + typ + "'"), 'Dziś ma typ „' + typ + '”');
  assert.match(k, /selLmType\(this,'Bieg spokojny'\)/, 'kalendarz: „Bieg spokojny”');
  const dostal = [], stary = ctx.window.isRunType;
  ctx.window.isRunType = (t) => { dostal.push(t); return stary(t); };
  try { P('Spokojny', 65); } finally { ctx.window.isRunType = stary; }
  assert.deepEqual(dostal, ['Spokojny'], 'isRunType bez zmiany wielkości liter');
});

test('Dziś: pytanie po „rower czy bieg”, przed zapisem; dystans z edycji; limit 300 km zostaje', () => {
  const z = czytaj('zawodnik.html'), s = z.slice(z.indexOf('async function saveLog()'), z.indexOf('_savingLog = true;', z.indexOf('async function saveLog()')));
  assert.match(s, /if \(dist > 300\) \{ toast\('Dystans wygląda nieprawidłowo'\); return; \}/);
  const rower = s.indexOf("window.askBikeOrRun(dist, pace) === 'bike'"), pyt = s.indexOf("window.pytajDuzyDystans(_logType, dist, _editingLogId ? _editingLogDist : null)");
  assert.ok(rower > 0 && pyt > rower, 'po pytaniu o rower, przed _savingLog');
  assert.match(s, /\{ try \{ document\.getElementById\('l-dist'\)\.focus\(\); \} catch \(_\) \{\} return; \}/);
  assert.match(z, /_editingLogId = l\.id;\n\s*_editingLogDist = l\.distance_km != null \? Number\(l\.distance_km\) : null;/);
});

test('kalendarz: pytanie po sprawdzeniu czasu i pytaniu o rower, przed zapisem; dystans istniejącego logu', () => {
  const k = czytaj('kalendarz.html'), od = k.indexOf("const time = document.getElementById('lm-time').value.trim() || null;"), s = k.slice(od, k.indexOf('window.zapiszLog({', od));
  const czas = s.indexOf("window.uwagaCzasu('lm-time', 'lm-time-uwaga', 'lm-dist', true)"), rower = s.indexOf("window.askBikeOrRun(dist, pace) === 'bike'"), pyt = s.indexOf('window.pytajDuzyDystans(_logType2, dist, existingLogId ? window._existingLogDist : null)');
  assert.ok(czas > 0 && rower > czas && pyt > rower, 'czas → rower → pytanie o dystans');
  assert.match(s, /\{ try \{ document\.getElementById\('lm-dist'\)\.focus\(\); \} catch \(_\) \{\} return; \}/);
  assert.match(k, /window\._existingLogId = existingLog \? existingLog\.id : null;\n\s*window\._existingLogDist = existingLog && existingLog\.distance_km != null \? Number\(existingLog\.distance_km\) : null;/);
});
