/* BLIZNA 71 (1.11.2026): podpisy kadrów dnia v2 — z opisów obrazów.

   Co się stało: przegląd 1.11 (opis z obrazu, gemini vision × _SOLO_PODPISY) znalazł podpisy mówiące o rzeczach,
   których na kadrze nie ma („Miasto jeszcze śpi." pod parkiem, „zasiałeś zimą" pod wiosennym lasem). Podpisy v2
   napisano z opisów obrazów (tools/kadry/opisy-kadrow.json). Ten test pilnuje formy podpisu i tego, że podpis nie
   wymienia rzeczy, której opis obrazu nie zna.

   Reguła rozjazdu jest WĄSKA i świadomie niepełna: osiem pojęć (śnieg, deszcz, mgła, noc, buty, dwójka, las, miasto),
   dopasowanie po rdzeniach słów. Poprawki wobec przeglądu (fałszywe alarmy zmierzone na v2): „zamglony", „dwoma",
   odliczanie „trzy, dwa" i „para z ust" nie są rozjazdem; „buty" to rozjazd tylko na kadrze bez biegacza.
   Samokontrola: na podpisach v1 reguła MUSI złapać 13 (miasto) i 81 (śnieg) — inaczej test jest martwy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const zaw = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
function podpisy(src) {
  const i0 = src.indexOf('const _SOLO_PODPISY = [');
  assert.ok(i0 > 0, 'brak _SOLO_PODPISY w zawodnik.html');
  const i1 = src.indexOf('];', i0);
  return new Function('return ' + src.slice(i0 + 'const _SOLO_PODPISY = '.length, i1 + 1))();
}
const P = podpisy(zaw);
const OPISY = JSON.parse(fs.readFileSync(path.join(KORZEN, 'tools', 'kadry', 'opisy-kadrow.json'), 'utf8')).kadry;
const bezAkcentu = (p) => p.replace(/\*/g, '');
const slowa = (p) => bezAkcentu(p).split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w));

const w = (r) => new RegExp('(?:^|[^\\p{L}])(?:' + r + ')', 'iu');
const BIEGACZ = w('biega|biegn|biegacz|mężczy|kobiet|postać|postaci|dwie osoby|dwoje|dwóch|jedna osoba|osoba');
const POJECIA = {
  'śnieg':  [w('śnieg|śnież|zim|mróz|mroź'), w('śnieg|śnież|zim|mróz|mroź|szron|oszronion')],
  'deszcz': [w('deszcz|kałuż|ulew|mokr|krople'), w('deszcz|kałuż|mokr|mżawk|odwilż|ulew')],
  'mgła':   [w('mgł|mgieł|mglist'), w('mgł|mgieł|mglist|zamglon|mgl')],
  'noc':    [w('noc|ciemn|gwiazd|księżyc|latarn|zmrok|zmierzch'), w('noc|ciemn|gwiazd|księżyc|latarn|zmrok|zmierzch|wieczor|po zachodzie')],
  'buty':   [w('but|sznurów|sznurowad|podeszw'), { test: (o) => w('but|obuw|sznurów|sznurowad|podeszw').test(o) || BIEGACZ.test(o) }],
  'dwójka': [w('dwie|dwoje|dwój|dwóch|dwaj|razem|parą|partner'), w('dwa|dwie|dwoje|dwój|dwóch|dwaj|dwoma|dwiema|para|parę|parą|grup|kilk|trzy|trzech|troje|wiele osób|kilkoro|biegaczy|osób|osobami')],
  'las':    [w('las|lesie|leśn|drzew'), w('las|lesie|leśn|drzew|zalesion')],
  'miasto': [w('miast|ulic|bruk|chodnik|beton|asfalt|blok|kamienic'), w('miast|miejsk|ulic|bruk|chodnik|beton|asfalt|blok|budyn|kamienic|zabudow|osiedl')],
};
function rozjazdy(lista) {
  const wynik = [];
  lista.forEach((p, i) => {
    const opis = OPISY[i + 1] || '';
    for (const [k, [wP, wO]] of Object.entries(POJECIA)) if (wP.test(bezAkcentu(p)) && !wO.test(opis)) wynik.push(`${i + 1} ${k}: ${bezAkcentu(p)}`);
  });
  return wynik;
}

test('89 podpisów = 89 kadrów = 89 opisów obrazów', () => {
  assert.equal(P.length, 89);
  assert.equal(Object.keys(OPISY).length, 89);
  for (let n = 1; n <= 89; n++) assert.ok(typeof OPISY[n] === 'string' && OPISY[n].length > 20, `opis kadru ${n}`);
});

test('każdy podpis: ≤ 8 słów, dokładnie jeden *akcent*', () => {
  for (const [i, p] of P.entries()) {
    assert.ok(slowa(p).length <= 8, `${i + 1}: ${slowa(p).length} słów — ${p}`);
    assert.equal((p.match(/\*[^*\s][^*]*\*/g) || []).length, 1, `${i + 1}: akcent — ${p}`);
    assert.equal((p.match(/\*/g) || []).length, 2, `${i + 1}: gwiazdki — ${p}`);
  }
});

test('bez słów zakazanych (wszyscy / każdy / zawsze / nigdy) i bez wykrzyknika', () => {
  const ZAKAZANE = w('wszyscy|każdy|każda|każde|zawsze|nigdy');
  for (const [i, p] of P.entries()) {
    assert.ok(!ZAKAZANE.test(bezAkcentu(p)), `${i + 1}: ${p}`);
    assert.ok(!p.includes('!'), `${i + 1}: wykrzyknik — ${p}`);
  }
});

test('bez duplikatów (wielkość liter i akcent nie mają znaczenia)', () => {
  const widziane = new Map();
  for (const [i, p] of P.entries()) {
    const k = bezAkcentu(p).toLowerCase().trim();
    assert.ok(!widziane.has(k), `${i + 1} = ${widziane.get(k)}: ${p}`);
    widziane.set(k, i + 1);
  }
});

test('samokontrola reguły rozjazdów: podpisy v1 łapią 13 (miasto) i 81 (śnieg)', () => {
  const v1 = [...P];
  v1[12] = 'Miasto jeszcze śpi. Ty *już* nie.';
  v1[80] = 'Wszystko, co zasiałeś zimą, *rusza*.';
  const r = rozjazdy(v1);
  assert.ok(r.some((x) => x.startsWith('13 miasto')), r.join('\n'));
  assert.ok(r.some((x) => x.startsWith('81 śnieg')), r.join('\n'));
});

test('podpis nie wymienia rzeczy, której nie ma w opisie obrazu (reguła z przeglądu 1.11)', () => {
  assert.deepEqual(rozjazdy(P), []);
});
