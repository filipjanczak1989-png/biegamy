// Blizna #400 (26.11.2026) — nowe Dziś: z muru imion w kaflu Ulicy było widać tylko pierwszy rząd.
//
// Scena w kaflu (blizna-397) stawia na murze tyle cegieł, ile mieści się w jednym rzędzie. Resztę scena umie pokazać
// pod oknem (pasek „Cały mur (N)”, po rozwinięciu kolejne rzędy i „Zwiń”), ale tylko w kontenerze, który dostanie w opcji
// murDol. Nowy kafel go nie dawał, więc przy 40 cegłach było widać 6 imion i nic nie mówiło, że jest ich więcej.
// E3 commit 2: kontener pod oknem, przenoszony razem ze sceną przy odświeżeniu, bez data-dn (kliknięcia w mur nie są
// sprawami modułu), cel dotyku przycisku 44 px (przycisk sceny ma 28 px; sprawdzone kliknięciem na prawdziwej stronie).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL } = require('./_dzis-nowy-strona.js');

function staryKod(s) {
  const log = { naKaflu: [], usun: [] };
  const U = { naKaflu(tu, d, o) { log.naKaflu.push({ tu, d, o }); if (!tu._bmScena) { tu._bmScena = {}; tu.firstChild = {}; } return true; }, usun(tu) { log.usun.push(tu); tu._bmScena = null; } };
  s.w.BM_AKCJA = { zUlica(cb) { s.w.BM_ULICA = U; cb(U); } };
  return log;
}
const mur = (s) => s.kafel('ulica').querySelector('.dn-ul-mur');
const odswiez = async (s) => { s.B.wczytaj(true); await s.doKonca(); };

test('(1) pod oknem sceny kontener muru: pusty (wszystko w jednym rzędzie) jest schowany, bez data-dn', async () => {
  const s = strona(); staryKod(s); s.B.start(); await s.doKonca();
  const h = s.kafel('ulica').innerHTML;
  assert.match(h, /^<div class="dn-ul-scena">[\s\S]*?<\/div><div class="dn-ul-mur"><\/div><div class="dn-gora">/, 'zaraz pod oknem, przed nagłówkiem kafla');
  assert.doesNotMatch(h, /dn-ul-mur"[^>]*data-dn/, 'bez data-dn: kliknięcie w cegłę pod oknem nie trafia do obsługi modułu');
  assert.match(MODUL, /#dzis-nowy \.dn-ul-mur\{margin:-14px -16px 14px\}#dzis-nowy \.dn-ul-mur:empty\{display:none\}/, 'od krawędzi do krawędzi, przyklejony do okna (−14 px znosi odstęp pod oknem); pusty schowany');
});

test('(2) scena dostaje kontener w opcji murDol, przy pierwszym i każdym kolejnym wywołaniu', async () => {
  const s = strona(), st = staryKod(s); s.B.start(); await s.doKonca();
  assert.equal(st.naKaflu.length, 1); assert.equal(st.naKaflu[0].o.murDol, mur(s));
  await odswiez(s);
  assert.equal(st.naKaflu.length, 2); assert.equal(st.naKaflu[1].o.murDol, mur(s));
});

test('(3) odświeżenie: nowy HTML daje nowe miejsca, a stara scena i STARY kontener muru (z rzędami, które scena tam postawiła) przechodzą do nich', async () => {
  const s = strona(), st = staryKod(s); s.B.start(); await s.doKonca();
  const tu = s.kafel('ulica').querySelector('[data-dn="scena"]'), m = mur(s), wymiany = [];
  const kafel = s.kafel('ulica'), stary = kafel.querySelector;
  const noweMiejsce = { parentNode: { replaceChild: (a, b) => wymiany.push(['scena', a, b]) } }, nowyMur = { parentNode: { replaceChild: (a, b) => wymiany.push(['mur', a, b]) } };
  kafel.querySelector = (sel) => (sel === '[data-dn="scena"]' ? noweMiejsce : sel === '.dn-ul-mur' ? nowyMur : stary.call(kafel, sel));
  await odswiez(s);
  assert.deepEqual(wymiany, [['scena', tu, noweMiejsce], ['mur', m, nowyMur]]);
  assert.equal(st.naKaflu.at(-1).o.murDol, m, 'scena pisze dalej do kontenera, który zna od montażu');
  assert.deepEqual(st.usun, []);
});

test('(4) bez starego kodu: ani okna, ani kontenera muru (kafel jak przed E3)', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  assert.doesNotMatch(s.kafel('ulica').innerHTML, /dn-ul-mur|dn-ul-scena/);
});

test('(5) przycisk „Cały mur (N)” / „Zwiń”: cel dotyku 44 px w kaflu, nad linkiem sceny, bez przycinania', () => {
  assert.match(MODUL, /#dzis-nowy \.dn-ul-mur \.us-mur-przelacz\{overflow:visible;z-index:3\}/, 'przycisk sceny ma overflow:hidden (wielokropek cegieł): bez tego powiększenie byłoby obcięte; z-index nad linkiem sceny (2)');
  assert.match(MODUL, /#dzis-nowy \.dn-ul-mur \.us-mur-przelacz::after\{content:'';position:absolute;inset:-12px -4px -4px\}/, '28 + 12 + 4 = 44 px; dół tylko 4 px, żeby nie zabrać celu „Zobacz ulicę ›”');
});
