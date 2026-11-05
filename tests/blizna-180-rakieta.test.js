/* BLIZNA 180 / PRZYCZEPKA-RAKIETA (Filip 5.11): tylko rowerzysta, 4 s lotu na wysokości łuku cegieł, bez kolizji, zbiera cegły w locie, potem jazda bez przyczepki.
   Do plecaka za złote cegły, raz na rundę, serwer pilnuje postaci, posiadania i pułapu. Zero pieniędzy, zero związku z licznikiem akcji.
   Po skutku: tools/gra-rakieta-test.sql (PGlite i baza), przeglądarka i pomiar bota (narzędzia poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const MIG = 'supabase/migrations/20261107_gra_rakieta.sql', WYC = 'supabase/migrations/20261107_WYCOFANIE_gra_rakieta.sql';
const R = L.ULEPSZENIA.find((u) => u.id === 'rakieta');

test('ulepszenie: tylko rowerzysta, kask i bidon dla każdego', () => {
  assert.ok(R && Number.isInteger(R.cena) && R.cena > 0); assert.equal(R.tylko, 'rowerzysta');
  assert.equal(L.ulepszenieDla('rakieta', 'rowerzysta'), true);
  for (const p of ['kasia', 'filip', 'koparka']) assert.equal(L.ulepszenieDla('rakieta', p), false, p);
  for (const p of ['kasia', 'filip', 'rowerzysta']) { assert.equal(L.ulepszenieDla('kask', p), true, p); assert.equal(L.ulepszenieDla('bidon', p), true, p); }
  assert.equal(L.ulepszenieDla('helikopter', 'rowerzysta'), false);
  assert.equal(L.mozeUzyc({ rakieta: 1 }, [], 'rakieta'), true); assert.equal(L.mozeUzyc({ rakieta: 1 }, ['rakieta'], 'rakieta'), false, 'raz na rundę'); assert.equal(L.mozeUzyc({}, [], 'rakieta'), false);
});

test('lot: 4 s, start i koniec na ziemi, w locie na wysokości łuku cegieł, klatki kolejno', () => {
  const r = L.RAKIETA; assert.equal(r.czas_s, 4);
  assert.equal(L.wysokoscRakiety(0, 'rowerzysta'), 0); assert.equal(L.wysokoscRakiety(4, 'rowerzysta'), 0);
  const luk = L.lukCegiel('rowerzysta', 0);
  for (let t = r.wznos_s; t <= r.czas_s - r.opad_s; t += 0.1) { const h = L.wysokoscRakiety(t, 'rowerzysta'); assert.ok(h > luk * 0.7 && h < luk * 1.1, 't=' + t + ' h=' + h); }
  let poprz = 0; for (let t = 0.02; t < r.wznos_s; t += 0.05) { const h = L.wysokoscRakiety(t, 'rowerzysta'); assert.ok(h > poprz, 'wznosi się'); poprz = h; }
  assert.equal(L.klatkaRakiety(0.05, 0), 0, 'odpalenie'); assert.equal(L.klatkaRakiety(3.9, 0), 4, 'lądowanie');
  for (let a = 0; a < 20; a++) { const k = L.klatkaRakiety(2, a); assert.ok(k >= 1 && k <= 3, 'lot'); }
});

test('gra: bez kolizji, zbiera w locie, dotknięcie nic nie psuje, arkusz tylko dla posiadaczy, przycisk tylko na rowerze', () => {
  const s = czytaj('js/cegielki.js'), h = czytaj('gra-cegielki.html');
  assert.match(s, /g\.nietykalny = Math\.max\(g\.nietykalny, L\.RAKIETA\.czas_s \+ L\.RAKIETA\.po_s\)/, 'bez kolizji przez cały lot i chwilę po');
  assert.match(s, /\(g\.rakieta \|\| e\.h > g\.y - 16\) && e\.h < glowaH \+ 16/, 'zbiera wszystko pod sobą');
  assert.equal(s.match(/if \(g\.reakcja > 0 \|\| g\.przemiana > 0 \|\| g\.rakieta\) return;/g).length, 2, 'skok i ślizg wyłączone w locie');
  assert.match(s, /if \(g\.rakieta\) \{\n\s+g\.rakietaT \+= dt; g\.y = L\.wysokoscRakiety\(g\.rakietaT, g\.postac\); g\.vy = 0;/);
  assert.match(s, /g\.rakieta = false; g\.y = 0; g\.naZiemi = true;/, 'po 4 s na ziemi, dalej zwykłe klatki');
  assert.match(s, /if \(g\.rakieta && OBR\.rakieta_rower\) return \["rakieta_rower", L\.klatkaRakiety\(g\.rakietaT, g\.anim\)\];/);
  assert.match(s, /L\.ulepszenieDla\("rakieta", postac\) && KONTO && KONTO\.plecak && L\.mozeUzyc\(KONTO\.plecak\(\), \[\], "rakieta"\)\) naz\.push\("rakieta_rower"\)/, 'arkusz nie obciąża pozostałych');
  assert.match(s, /moze = !!ile && L\.ulepszenieDla\(typ, G\.postac\) && L\.mozeUzyc\(ile, G\.uzyte, typ\)/);
  assert.match(h, /data-typ="rakieta" aria-label="Użyj przyczepki-rakiety z plecaka" hidden/);
  assert.doesNotMatch(s + czytaj('js/cegielki-konto.js') + czytaj('js/cegielki-logika.mjs') + h, /s[lł]awek|s[lł]awka/i, 'imię rowerzysty tylko w bazie');
});

test('magazyn: wiersz tylko, gdy rower jest dostępny; pliki i atlas', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /L\.ULEPSZENIA\.filter\(function \(u\) \{ return !u\.tylko \|\| postacieMagazynu\(\)\.indexOf\(u\.tylko\) >= 0; \}\)/);
  const a = JSON.parse(czytaj('assets/gra/atlas.json'));
  assert.equal(a.rakieta_rower.n, 5); assert.ok(a.rakieta_rower.kx > 0.5, 'rower w klatce po prawej, przyczepka wystaje w lewo');
  assert.ok(a.rakieta);
  for (const n of ['rakieta_rower', 'rakieta']) { const st = fs.statSync(path.join(KORZEN, 'assets/gra', n + '.webp')); assert.ok(st.size < 120 * 1024, n); }
  assert.ok(!Object.keys(a).some((n) => /s[lł]awek/i.test(n)));
});

test('baza: ta sama cena, tylko rower, pułap bez zmian, bez nowych uprawnień, jest wycofanie', { skip: !fs.existsSync(path.join(KORZEN, MIG)) && 'migracja rakiety jeszcze poza repo' }, () => {
  const m = czytaj(MIG), w = czytaj(WYC), pl = czytaj('supabase/migrations/20261106_gra_plecak.sql');
  assert.match(m, new RegExp("when 'rakieta' then " + R.cena + ' end'));
  assert.match(m, /elsif v_uzyte \? 'rakieta' and p_postac is distinct from 'rowerzysta' then v_powod_plecaka := 'plecak_zla_postac';/);
  assert.match(m, /GRA_MAKS_NA_S constant numeric := 45;/);
  assert.match(m, /POMIAR|Pomiar|pomiar/); assert.doesNotMatch(m, /POMIAR_RAKIETY/, 'pomiar wpisany');
  assert.doesNotMatch(m, /^\s*(grant|revoke)\b/m); assert.doesNotMatch(m, /to anon/);
  assert.doesNotMatch(w, /'rakieta' then/); assert.doesNotMatch(w, /plecak_zla_postac/);
  const f = (t) => t.slice(t.indexOf('create or replace function public.gra_zapisz_wynik'), t.indexOf('end $$;', t.indexOf('create or replace function public.gra_zapisz_wynik')));
  assert.equal(f(w), f(pl), 'wycofanie oddaje dokładnie poprzednią funkcję');
});
