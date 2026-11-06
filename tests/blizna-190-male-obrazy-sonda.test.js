/* BLIZNA 190 / PUSTE LOGO LOG (6.11 po 2ff9c743). Wdrożenie biegamy-assets e581039 padło na „Deploy to GitHub Pages”, więc m/ dawało
   95 × 404, a sb.js już prosił o m/bm-nav.webp: kółko LOG puste, karty planu bez zdjęć.
   - logo LOG (bm-nav.webp) zawsze z oryginału;
   - pozostałe małe kopie tylko po potwierdzeniu sondą, że m/ jest pod adresem (wynik z poprzedniego wejścia); bez tego oryginały;
   - każdy adres, który daje mapa, jest w m/ (tools/male-obrazy-m.txt = git ls-tree biegamy-assets e581039 m/; z BM_ASSETS także na dysku);
   - po wdrożeniu: tools/sprawdz-male-obrazy.sh (curl każdego adresu i logo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const SB = czytaj('sb.js');
const BAZA = 'https://filipjanczak1989-png.github.io/biegamy-assets/';
const M = new Set(czytaj('tools/male-obrazy-m.txt').split('\n').map((x) => x.trim()).filter(Boolean));

function sb(flaga, opcje) {
  const o = opcje || {}, zapis = {}, obrazy = [];
  const i = SB.indexOf('window.MALE_OBRAZY ='), j = SB.indexOf('})();', SB.indexOf('function sondaMalychObrazow')) + 5;
  const ls = { getItem: (k) => (k === 'bm_male_obrazy' ? flaga : null), setItem: (k, v) => { zapis[k] = v; }, removeItem: (k) => { zapis[k] = 'USUNIĘTE'; } };
  class Image { constructor() { obrazy.push(this); } }
  const w = { localStorage: ls };
  vm.runInNewContext(SB.slice(i, j), { window: w, Image, navigator: { onLine: o.offline ? false : true }, Date, String });
  return { w, u: (p) => w.assetUrl(p).replace(BAZA, ''), zapis, obrazy };
}
function wszystkieZMapy(re) {
  const n = [];
  for (let i = 1; i <= 120; i++) n.push('run' + i + '.webp');
  const slugi = (re.source.match(/typ-\(([^)]+)\)/) || [])[1].split('|'), ikony = (re.source.match(/ikona-\(([^)]+)\)/) || [])[1].split('|');
  return n.concat(slugi.map((s) => 'typ-' + s + '.jpg'), ikony.map((s) => 'ikona-' + s + '.png'), ['bm-nav.webp']).filter((x) => re.test(x));
}

test('logo LOG zawsze z oryginału, także po potwierdzonej sondzie', () => {
  for (const f of [null, '1']) assert.equal(sb(f).u('bm-nav.webp'), 'bm-nav.webp', 'flaga ' + f);
  assert.match(SB, /window\.assetUrl \? window\.assetUrl\('bm-nav\.webp'\)/, 'pasek bierze logo przez assetUrl');
  assert.doesNotMatch(sb('1').w.MALE_OBRAZY.source, /bm-nav/);
});

test('bez potwierdzenia sondy oryginały, po potwierdzeniu małe kopie', () => {
  const nie = sb(null), tak = sb('1');
  for (const [x, oryg, maly] of [['run5.webp', 'run5.webp', 'm/run5.webp'], ['typ-tempo.jpg', 'typ-tempo.jpg', 'm/typ-tempo.webp'], ['ikona-czat.png?v=3', 'ikona-czat.png?v=3', 'm/ikona-czat.webp?v=3']]) {
    assert.equal(nie.u(x), oryg, 'bez sondy: ' + x); assert.equal(tak.u(x), maly, 'po sondzie: ' + x);
  }
  assert.equal(sb('0').u('run5.webp'), 'run5.webp', 'tylko „1” włącza');
});

test('sonda: raz dziennie jedna ikona z m/, wynik na następne wejście, offline bez zmiany', () => {
  const s = sb(null);
  assert.equal(s.obrazy.length, 1);
  assert.match(s.obrazy[0].src, new RegExp('^' + BAZA.replace(/[.]/g, '\\.') + 'm/ikona-czat\\.webp\\?d=\\d{8}$'));
  assert.ok(M.has(s.w.MALE_OBRAZY_SONDA.replace(/^m\//, '')), 'plik sondy jest w m/');
  s.obrazy[0].onload(); assert.equal(s.zapis.bm_male_obrazy, '1');
  assert.equal(s.u('run5.webp'), 'run5.webp', 'w trakcie strony adresy bez zmian');
  const e = sb('1'); e.obrazy[0].onerror(); assert.equal(e.zapis.bm_male_obrazy, 'USUNIĘTE', 'm/ znikło: od następnego wejścia oryginały');
  const off = sb('1', { offline: true }); off.obrazy[0].onerror(); assert.equal(off.zapis.bm_male_obrazy, undefined, 'offline wynik zostaje');
});

test('każdy adres z mapy istnieje w m/ (lista z biegamy-assets e581039)', () => {
  const t = sb('1'), lista = wszystkieZMapy(t.w.MALE_OBRAZY);
  assert.ok(lista.length >= 93, 'mapa obejmuje ' + lista.length);
  for (const x of lista) { const p = t.u(x).replace(/^m\//, '').replace(/\?.*$/, ''); assert.ok(M.has(p), x + ' → m/' + p + ': brak w m/'); }
  if (process.env.BM_ASSETS) for (const p of M) assert.ok(fs.existsSync(path.join(process.env.BM_ASSETS, 'm', p)), 'na dysku: m/' + p);
  const sh = czytaj('tools/sprawdz-male-obrazy.sh');
  assert.match(sh, /tools\/male-obrazy-m\.txt/); assert.match(sh, /bm-nav\.webp/);
});
