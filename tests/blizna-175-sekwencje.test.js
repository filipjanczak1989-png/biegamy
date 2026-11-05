/* BLIZNA 175 / SEKWENCJE (Filip 5.11): od poziomu 5 rytm falami: sekwencja 8–12 s, luz 3–5 s. Wyższy poziom: dłuższa i gęstsza.
   Każda do przejścia: bot idealny bez upadku na wszystkich poziomach (pomiar przed wdrożeniem). „Czysto!” i bonus za sekwencję bez upadku.
   Bonusów w sekwencji nie ma: przemiana po kasku zabrałaby sterowanie w środku układu, a sprint po bucie skróciłby odstępy poniżej lotu. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;

test('od poziomu 5, bez koparki i Małego', () => {
  assert.equal(L.sekwencjeWRundzie(4, false, 'kasia'), false, 'poziomy 1–4 jak dotąd');
  assert.equal(L.sekwencjeWRundzie(5, false, 'kasia'), true);
  assert.equal(L.sekwencjeWRundzie(10, false, 'rowerzysta'), true);
  assert.equal(L.sekwencjeWRundzie(20, false, 'koparka'), false, 'koparka nie skacze');
  assert.equal(L.sekwencjeWRundzie(20, true, 'kasia'), false, 'Mały budowniczy');
});

test('długość 8–12 s, rośnie z poziomem', () => {
  for (const n of [5, 8, 12, 16, 20]) for (const los of [0, 0.5, 1]) { const d = L.dlugoscSekwencji(n, los); assert.ok(d >= 8 && d <= 12, n + ' ' + d); }
  assert.equal(L.dlugoscSekwencji(5, 0.5), 8); assert.equal(L.dlugoscSekwencji(20, 0.5), 12);
  assert.ok(L.dlugoscSekwencji(12, 0.5) > L.dlugoscSekwencji(6, 0.5));
});

test('fale na przemian: najpierw luz, luz 3–5 s, numer rośnie tylko przy sekwencji', () => {
  let f = { sek: true, nr: 0, doX: 0 };
  f = L.nastepnaFala(f, 10, 400, 900, 0);
  assert.equal(f.sek, false, 'runda zaczyna się od luzu'); assert.equal(f.nr, 0); assert.equal(f.doX, 900 + 3 * 400);
  const g = L.nastepnaFala(f, 10, 400, f.doX, 0.5);
  assert.equal(g.sek, true); assert.equal(g.nr, 1); assert.equal(g.doX, f.doX + L.dlugoscSekwencji(10, 0.5) * 400);
  const h = L.nastepnaFala(g, 10, 400, g.doX, 1);
  assert.equal(h.sek, false); assert.equal(h.nr, 1); assert.equal(h.doX, g.doX + 5 * 400);
});

test('odstęp: gęstszy z poziomem, ale nigdy krótszy niż lot i chwila na następne wybicie', () => {
  const v = 500, s = (n, p) => L.odstepSekwencji(n, v, p || 'kasia', 0.5) / v;
  assert.ok(s(5) > s(12) && s(12) > s(20), 'gęstszy z poziomem');
  const lot = (p) => 2 * L.FIZYKA.SKOK * ((L.POSTACIE[p] || {}).skok || 1) / L.FIZYKA.GRAW;
  for (const p of ['kasia', 'filip', 'rowerzysta']) for (let n = 5; n <= 25; n++) for (const los of [0, 1]) assert.ok(L.odstepSekwencji(n, v, p, los) / v >= lot(p) + L.SEKWENCJE.zapas_s - 1e-9, p + ' ' + n);
  assert.equal(L.odstepSekwencji(20, 100, 'kasia', 0.5), L.SEKWENCJE.min_px, 'wolno: dolna granica w pikselach');
});

test('trasa: luz bez przeszkód, sekwencja bez bonusów, na Górce zwykła trasa', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /fala: L\.sekwencjeWRundzie\(pz, trybMaly, postac\)/);
  assert.match(s, /if \(!G\.fala\.sek\) \{ rzedyLuzu\(G\.nastPrzeszkoda, G\.fala\.doX - G\.nastPrzeszkoda\); G\.nastPrzeszkoda = G\.fala\.doX; G\.ostPrzerwa = G\.predBaza \* 2; continue; \}/);
  assert.match(s, /if \(fazaXp\) \{ koniecSekwencji\(\); G\.fala\.doX = 0; \}/, 'Górka przerywa falę');
  assert.match(s, /var wSek = !!\(G\.fala && G\.fala\.sek && !fazaXp\);/);
  assert.match(s, /\} else if \(!wSek && xp \+ przerwa \/ 2 > G\.nastBonus\) dodajBonus/);
  assert.match(s, /if \(!bonus && x === xp \+ krok \* 0\.5 && x > G\.nastBonus\)/, 'bonus tylko na początku luzu');
});

test('dwa błędy trasy znalezione przy dowodzie: para liczona od drugiej przeszkody, odstęp pary z tempa miejsca', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /G\.nastPrzeszkoda = xp \+ przerwa; G\.ostPrzerwa = przerwa;/, 'następna przeszkoda wpadała na drugą z pary');
  assert.doesNotMatch(s, /G\.nastPrzeszkoda \+= przerwa/);
  assert.match(s, /L\.odstepPary\(para, G\.postac, G\.predBaza \* L\.tempoGorki\(fazaXp\)\)/, 'na podjeździe pojedynczy skok nie sięgał drugiej przeszkody');
});

test('Czysto! tylko za całą sekwencję bez upadku; kask, który uratował, to nie upadek', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /if \(!s\.koniec \|\| s\.dane \|\| !s\.czysta \|\| s\.ok < s\.ile\) return;/);
  assert.match(s, /dodajNapis\("Czysto! \+" \+ n,/);
  assert.match(s, /g\.cegly \+= n; g\.bezUpadku \+= n; g\.st\.czyste\+\+;/);
  assert.match(s, /if \(p\.sek && g\.sekwencje\[p\.sek\]\) g\.sekwencje\[p\.sek\]\.czysta = false;/, 'upadek kasuje');
  const u = s.slice(s.indexOf('function uderzenie(p)'), s.indexOf('g.st.upadki++', s.indexOf('function uderzenie(p)')));
  assert.match(u, /zaliczSekwencje\(p\);\n\s+return;/, 'kask liczy przeszkodę jako przejętą');
  assert.match(s, /p\.zuzyta = true; p\.ukryta = true; zaliczSekwencje\(p\);/, 'przeszkoda sprzątnięta przez przemianę też');
});
