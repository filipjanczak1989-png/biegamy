/* BLIZNA 326 (21.11.2026) — odznaki O2 (front). „Pierwsza z pierwszych” trafiała do każdego po onboardingu: obFinish liczył athletes,
   a pod RLS liczba to własny wiersz (≤ 50 zawsze). Przeglądarka nie przyznaje już tej odznaki; nowa „Pionier BiegaMy” jest w obu katalogach
   i w nazwach dla Okienka, oznaczona z_bazy (nadaje ją tylko baza). Grafika: biegamy-assets/badges/<id>.webp. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const Z = czytaj('zawodnik.html'), O = czytaj('odznaki.html'), N = czytaj('supabase/functions/_shared/odznaki-nazwy.mjs');

test('obFinish nie liczy athletes i nie przyznaje „pierwszej z pierwszych”; nikt w przeglądarce jej nie przyznaje', () => {
  const i = Z.indexOf('async function obFinish()');
  const ob = Z.slice(i, Z.indexOf('\nfunction skipOnboarding', i));
  assert.ok(i > 0 && ob.length > 1000);
  assert.ok(!ob.includes("awardBadge('pierwsza_z_pierwszych')"), 'obFinish znów przyznaje');
  assert.doesNotMatch(ob, /from\('athletes'\)\s*\.select\('id',\s*\{count:'exact',head:true\}\)/, 'liczenie athletes pod RLS wróciło');
  assert.ok(!/awardBadge\(\s*'(pierwsza_z_pierwszych|pionier_biegamy)'/.test(Z + O), 'przeglądarka przyznaje odznakę z bazy');
});

test('„Pionier BiegaMy” w obu katalogach (ta sama definicja, ukryta, z_bazy) i w nazwach Okienka', () => {
  const wiersz = "{id:'pionier_biegamy',      name:'Pionier BiegaMy',      desc:'Konto założone w 2026 — pierwszym roku BiegaMy', rarity:'rare', cat:'Sekretne', hidden:true, z_bazy:true},";
  assert.ok(Z.includes(wiersz) && O.includes(wiersz), 'definicja w zawodnik.html i odznaki.html');
  assert.ok(Z.includes("desc:'Jeden z pierwszych 50 użytkowników',     rarity:'legendary', cat:'Sekretne', hidden:true, z_bazy:true},") &&
            O.includes("desc:'Jeden z pierwszych 50 użytkowników',     rarity:'legendary', cat:'Sekretne', hidden:true, z_bazy:true},"));
  assert.ok(N.includes('"pionier_biegamy": "Pionier BiegaMy",') && N.includes('"pionier_biegamy": "Konto założone w 2026 — pierwszym roku BiegaMy",'));
  assert.match('pionier_biegamy', /^[a-z0-9_]+$/, 'id = nazwa pliku .webp');
});
