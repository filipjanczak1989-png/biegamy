/* BLIZNA 179 / BUTY W MAGAZYNIE (Filip 5.11): kategoria „Buty”, przymierzanie jak przy reszcie, przypięcie do stóp każdej postaci.
   - dane stóp dla każdej klatki każdego arkusza, dawne kolumny przypięć bez zmian (czapka nie może drgnąć przez dodanie butów);
   - grafika dopiero po OK Filipa na przeglądzie, więc bez obrazka w atlasie kategorii nie ma: ani wiersza, ani nagłówka;
   - ceny te same w grze i w bazie, koparka bez butów.
   Po skutku: tools/gra-buty-test.sql (PGlite i baza), przeglądarka (narzędzie poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const MIG = 'supabase/migrations/20261107_gra_buty.sql', WYC = 'supabase/migrations/20261107_WYCOFANIE_gra_buty.sql';
const buty = L.SKLEP.filter((p) => p.rodzaj === 'buty');
const atlas = JSON.parse(czytaj('assets/gra/atlas.json'));

function przypiecia() {
  const w = {}; new Function('window', czytaj('js/cegielki-przypiecia.js'))(w); return w.BM_CEGIELKI_PRZYPIECIA;
}

test('magazyn: kilka par biegowych w kolorach i robocze, za złote cegły, ze swoim miejscem', () => {
  assert.ok(L.SLOTY.includes('stopy'));
  const nazwy = buty.map((p) => p.nazwa);
  assert.ok(nazwy.filter((n) => / biegowe$/.test(n)).length >= 3, 'kilka par biegowych, pod nagłówkiem Buty');
  assert.ok(nazwy.includes('Robocze budowlane'));
  for (const p of buty) {
    assert.equal(p.slot, 'stopy', p.id); assert.ok(Number.isInteger(p.cena) && p.cena > 0, p.id);
    assert.equal(L.DODATKI[p.id].punkt, 'stopy', p.id); assert.ok(L.DODATKI[p.id].szer > 0, p.id);
    assert.doesNotMatch(p.nazwa, /zł|PLN/);
  }
});

test('postacie: Kasia, Filip i rowerzysta noszą buty, koparka zostaje jak narysowana', () => {
  for (const po of ['kasia', 'filip', 'rowerzysta']) {
    assert.ok(L.POSTACIE[po].sloty.includes('stopy'), po);
    assert.equal(L.strojPostaci({ stopy: 'buty-czerwone' }, po).stopy, 'buty-czerwone', po);
  }
  assert.equal(L.strojPostaci({ stopy: 'buty-czerwone' }, 'koparka').stopy, null);
  assert.equal(L.maStroj({ stopy: 'buty-robocze' }), true, 'same buty to już strój');
  assert.equal(L.poprawnyStroj({ stopy: 'buty-czerwone' }, ['buty-czerwone']).stopy, 'buty-czerwone');
  assert.equal(L.poprawnyStroj({ stopy: 'buty-czerwone' }, []).stopy, null, 'niekupione nie wchodzą');
  assert.deepEqual(L.strojZPrzedmiotem({ glowa: 'opaska' }, buty[0]), { glowa: 'opaska', stopy: buty[0].id }, 'przymiarka nie zdejmuje reszty');
});

test('przypięcia: każda klatka każdego arkusza ma kolumnę stóp, punkty w kadrze', () => {
  const P = przypiecia();
  for (const po of ['kasia', 'filip', 'rowerzysta']) {
    for (const [ark, klatki] of Object.entries(P[po])) {
      const at = atlas[po + '_' + ark]; assert.ok(at, po + ark); assert.equal(klatki.length, at.n, po + ark);
      klatki.forEach((k, i) => {
        const id = po + ' ' + ark + i;
        assert.equal(k.length, 10, id); assert.ok(Array.isArray(k[9]), id); assert.equal(k[9].length % 3, 0, id); assert.ok(k[9].length <= 6, id);
        for (let j = 0; j < k[9].length; j += 3) {
          assert.ok(k[9][j] >= 0 && k[9][j] <= at.cw, id + ' x'); assert.ok(k[9][j + 1] >= 0 && k[9][j + 1] <= at.ch, id + ' y');
          assert.ok(Math.abs(k[9][j + 2]) <= 2 * Math.PI + 0.01, id + ' kąt');
        }
      });
    }
    for (const k of P[po].bieg) assert.ok(k[9].length >= 3, po + ': w biegu but zawsze widać');
  }
  for (const po of ['kasia', 'filip']) for (const k of P[po].bieg) assert.equal(k[9].length, 6, po + ': w biegu dwie stopy');
  const palce = (k) => { const a = k[9][k[9].length - 1]; return Math.cos(a) > 0; };
  assert.ok(P.kasia.bieg.filter(palce).length >= 4 && P.filip.bieg.filter(palce).length >= 4, 'bieg w prawo: bliższy but palcami do przodu');
});

test('rysowanie: dwa obrazki w dobrych miejscach i obrotach, klatka bez stóp i brak grafiki nic nie rysują', () => {
  const okno = { BM_CEGIELKI: L, BM_CEGIELKI_PRZYPIECIA: { kasia: { bieg: [[50, 20, 10, 0, 1, 50, 40, 0, 0, [30, 100, 0.5, 70, 110, -0.25]], [50, 20, 10, 0, 1, 50, 40, 0, 0, []]] } } };
  new Function('window', czytaj('js/cegielki-stroj.js'))(okno);
  const S = okno.BM_CEGIELKI_STROJ, lista = S.noszone({ stopy: 'buty-czerwone' });
  assert.deepEqual(lista.map((d) => d.slot), ['stopy']); assert.deepEqual(S.nazwyObrazow(lista), ['dodatek_buty-czerwone']);
  const zapis = [], k = { save() { zapis.push('save'); }, restore() { zapis.push('restore'); }, translate(x, y) { zapis.push(['t', x, y]); }, rotate(a) { zapis.push(['r', a]); }, scale() {}, drawImage(_i, x, y, w, h) { zapis.push(['d', x, y, w, h]); } };
  const im = {}, OBR = { 'dodatek_buty-czerwone': im }, A = { 'dodatek_buty-czerwone': { w: 100, h: 50 } };
  S.dodatki(k, 'tyl', OBR, A, 'kasia', 'bieg', 0, 5, 7, 2, lista);
  assert.deepEqual(zapis, [], 'buty nie idą pod postać');
  S.dodatki(k, 'przod', OBR, A, 'kasia', 'bieg', 0, 5, 7, 2, lista);
  const u = L.DODATKI['buty-czerwone'], sz = u.szer * 10 * 2, wy = sz / 2;
  assert.deepEqual(zapis, ['save', ['t', 65, 207], ['r', 0.5], ['d', -u.kx * sz, -u.ky * wy, sz, wy], 'restore', 'save', ['t', 145, 227], ['r', -0.25], ['d', -u.kx * sz, -u.ky * wy, sz, wy], 'restore']);
  zapis.length = 0;
  S.dodatki(k, 'przod', OBR, A, 'kasia', 'bieg', 1, 5, 7, 2, lista); assert.deepEqual(zapis, [], 'bez stóp w kadrze');
  S.dodatki(k, 'przod', {}, A, 'kasia', 'bieg', 0, 5, 7, 2, lista); assert.deepEqual(zapis, [], 'bez obrazka');
});

test('kategoria: ukryta bez grafiki w atlasie, przymierzanie tą samą drogą co reszta, bez sekretów', () => {
  const k = czytaj('js/cegielki-konto.js'), h = czytaj('gra-cegielki.html');
  assert.match(h, /<h3 class="s-naglowek" id="s-stopy-naglowek" hidden>Buty<\/h3>\n\s*<div id="s-stopy" class="s-lista" hidden><\/div>/, 'na starcie schowana');
  assert.match(k, /maObraz = function \(p\) \{ return p\.rodzaj !== "buty" \|\| !!\(GRA && GRA\.A && GRA\.A\["dodatek_" \+ p\.id\]\); \}/);
  assert.match(k, /\$\("s-stopy"\)\.hidden = !butyWidac; \$\("s-stopy-naglowek"\)\.hidden = !butyWidac;/);
  assert.match(k, /\["s-stopy", \["stopy"\]\]/);
  assert.match(k, /return w\[1\]\.indexOf\(p\.slot\) >= 0 && maObraz\(p\);/);
  assert.match(k, /butyWidac \? "Na rowerze pasują tylko okulary, medal, peleryna i buty/, 'opis ograniczeń idzie za ofertą');
  for (const p of buty) {
    const plik = fs.existsSync(path.join(KORZEN, 'assets/gra/dodatek_' + p.id + '.webp')), wAtlasie = !!atlas['dodatek_' + p.id];
    assert.equal(plik, wAtlasie, 'plik i atlas razem: ' + p.id);
  }
});

test('baza: te same ceny co w grze, nowe miejsce w zapisie, bez nowych uprawnień, jest wycofanie', { skip: !fs.existsSync(path.join(KORZEN, MIG)) && 'migracja butów jeszcze poza repo' }, () => {
  const m = czytaj(MIG), w = czytaj(WYC);
  const wBazie = Object.fromEntries([...m.matchAll(/when '([a-z-]+)' then (\d+)/g)].map((x) => [x[1], Number(x[2])]));
  const naSprzedaz = L.SKLEP.filter((p) => !p.tylkoCzolowka && !p.tylkoSeria);
  for (const p of naSprzedaz) assert.equal(wBazie[p.id], p.cena, p.id);
  assert.equal(Object.keys(wBazie).length, naSprzedaz.length, 'przedmiot w bazie bez odpowiednika w grze');
  assert.equal(wBazie.korona, undefined); assert.equal(wBazie['kamizelka-wytrwalych'], undefined);
  assert.match(m, /t\.key in \('tulow', 'spodenki', 'glowa', 'oczy', 'szyja', 'plecy', 'stopy'\)/);
  assert.doesNotMatch(m, /^\s*(grant|revoke)\b/m, 'create or replace zachowuje uprawnienia');
  assert.doesNotMatch(m, /to anon/);
  assert.doesNotMatch(w, /buty-/, 'wycofanie bez butów'); assert.match(w, /t\.key in \('tulow', 'spodenki', 'glowa', 'oczy', 'szyja', 'plecy'\)/);
});
