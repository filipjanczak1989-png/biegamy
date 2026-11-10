/* BLIZNA 209 / TABLICA Z LOGO U PARTNERÓW POPRZEDNICH WYZWAŃ (Filip 10.11, B2). Do 10.11 osiedle, galeria i fabryka miały logo w jasnym prostokącie
   na szyldzie (szyldFirmyNaBudynku, .us-szyld--logo), czyli inaczej niż sponsorzy akcji. Teraz każdy budynek firmy rysuje się jedną drogą: nazwa na namalowanym
   szyldzie (szyldZNazwa), logo na kwadratowej tablicy (tablicaZLogo + U.ciemnaMata). Kotwica tablicy per budynek w SZYLDY[...].tablica (i w assets/ulica/szyldy.json,
   blizna-151): środek nad szyldem, bok mniejszy niż 55 % szerokości (niska, szeroka bryła), słupki do parapetu albo dachu. Zrzuty przed/po: Downloads/biegamy-podglady/sponsor/. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const S = czytaj('js/ulica-scena.mjs'), U = czytaj('js/ulica.mjs');

function modulUlicy() {
  const c = { Math, Array, Object, String, Number, JSON, isNaN, isFinite, Date, RegExp, console, Promise, setTimeout, clearTimeout };
  c.globalThis = c; c.window = c; c.document = { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null };
  vm.createContext(c); vm.runInContext(U, c);
  return c.BM_ULICA;
}
function geometria() {
  const c = { Math, Array, Object, Number }; c.globalThis = c; vm.createContext(c);
  const T = /var TABLICA = \{[^}]+\};/.exec(S)[0], kod = S.slice(S.indexOf('function geometriaTablicy('), S.indexOf('function tablicaZLogo('));
  vm.runInContext(T + '\n' + kod + '\nglobalThis.g = geometriaTablicy; globalThis.T = TABLICA;', c);
  return { geo: c.g, T: c.T };
}

test('kotwica tablicy dla każdego budynku partnerów, w SZYLDY i w szyldy.json; wartości w sensownych granicach', () => {
  const L = modulUlicy(), json = JSON.parse(czytaj('assets/ulica/szyldy.json'));
  for (const b of Object.keys(L.BUDYNKI_POPRZEDNICH)) {
    const k = L.SZYLDY[b] && L.SZYLDY[b].tablica;
    assert.ok(k, b + ': kotwica tablicy w SZYLDY');
    assert.deepEqual({ ...json[b].tablica }, { ...k }, b + ': to samo w szyldy.json (blizna-151)');
    assert.ok(k.x > 0.2 && k.x < 0.8 && k.bok > 0.2 && k.bok <= 0.45 && k.wDach > 0.1 && k.wDach < 0.5 && k.nadDachem >= -0.08 && k.nadDachem < 0.1, b + ': ' + JSON.stringify(k) + ' (ujemne nadDachem = tablica wchodzi w pole obrazu nad niskim dachem, fabryka)');
    const sz = L.SZYLDY[b].szyld;
    assert.ok(k.x >= sz[0] && k.x <= sz[0] + sz[2], b + ': tablica wyśrodkowana nad namalowanym szyldem');
  }
  assert.equal(L.SZYLDY['domek-1'].tablica, undefined, 'domki bez kotwicy: geometria domyślna (55 %)');
  assert.equal(L.SZYLDY.wiezowiec.tablica, undefined, 'wieżowiec bez kotwicy: na elewacji');
});

test('geometria: partner nad dachem wg kotwicy, bok ≤ 45 % szerokości i ≤ 75 % wysokości, słupki chowają się za parapetem; domek i wieżowiec jak dotąd', () => {
  const L = modulUlicy(), { geo, T } = geometria();
  for (const b of Object.keys(L.BUDYNKI_POPRZEDNICH)) {
    const w = L.BUDYNKI_POPRZEDNICH[b], h0 = w / L.SZYLDY[b].proporcja, k = L.SZYLDY[b].tablica, g = geo(w, h0, false, k);
    assert.equal(g.bok, Math.round(w * k.bok), b + ': bok z kotwicy');
    assert.ok(g.bok <= 0.45 * w && g.bok <= 0.75 * h0, b + ': tablica mniejsza od bryły (' + g.bok + ' px przy ' + Math.round(w) + '×' + Math.round(h0) + ')');
    assert.ok(g.gora < 0 && g.gora + g.bok <= 0.12 * h0, b + ': nad dachem (najwyżej 12 % wysokości w polu obrazu, nad szczytami dachu)'); assert.ok(Math.abs(g.lewo + g.bok / 2 - w * k.x) < 0.01, b + ': środek w kotwicy');
    assert.equal(g.slupki.length, 2);
    for (const s of g.slupki) { assert.ok(s.wys > 0, b + ': słupek ma wysokość'); assert.ok(Math.abs(s.gora + s.wys - h0 * k.wDach) < 0.01, b + ': słupek sięga wDach'); assert.ok(s.lewo > 0 && s.lewo + s.szer < w, b + ': słupek w obrysie budynku'); }
  }
  const d = geo(160, 160 / 1.2203, false, undefined);
  assert.equal(d.bok, 88); assert.equal(d.lewo, 36); assert.ok(Math.abs(d.gora - -(88 + 160 * T.nadDachem)) < 1e-9, 'domek bez kotwicy: jak przed B2');
  assert.ok(Math.abs(d.slupki[0].gora + d.slupki[0].wys - (160 / 1.2203) * T.wDach) < 1e-9);
  const wz = geo(118, 236, true, undefined);
  assert.deepEqual({ ...wz, slupki: [...wz.slupki] }, { bok: Math.round(118 * T.wiezBok), lewo: (118 - Math.round(118 * T.wiezBok)) / 2, gora: 236 * T.wiezGora, slupki: [] }, 'wieżowiec: na elewacji, bez słupków');
  const n = geo(210, 140, false, { x: 0.5, bok: 0.42 });
  assert.ok(Math.abs(n.gora - -(88 + 210 * T.nadDachem)) < 1e-9 && Math.abs(n.slupki[0].gora + n.slupki[0].wys - 140 * T.wDach) < 1e-9, 'brakujące pola kotwicy = domyślne z TABLICA');
});

test('scena: jedna droga dla każdego budynku firmy; białego prostokąta z logo nie ma; szyld partnera z węższą deską', () => {
  assert.doesNotMatch(S, /szyldFirmyNaBudynku|szyldNazwyFirmy|us-szyld--logo|(?<![\w-])us-logo\b|LOGO_SZER|LOGO_WYS/, 'stara droga usunięta razem z CSS');
  const b = S.slice(S.indexOf('function budynekFirmy('), S.indexOf('/** Cegła w murze'));
  assert.match(b, /if \(poprz\) \{\n\s*dolSzyldu = szyldZNazwa\(U, b, f, r, w, false, h0, 0\.5\);\n\s*if \(f\.logo \|\| f\.pustaTablica\) tablicaZLogo\(U, b, oprawa, f, w, h0, false, laduj, naLogo, def\.tablica\);\n\s*if \(!f\.logo && naLogo\) naLogo\(null, false\);/);
  assert.match(S, /var maks = w \* \(maksDeski \|\| \(wiez \? 0\.82 : 0\.66\)\)/, 'większa deska partnera do 50 % szerokiej bryły');
  assert.match(S, /function tablicaZLogo\(U, b, oprawa, f, w, h0, wiez, laduj, naLogo, kotwica\) \{\n\s*var geo = geometriaTablicy\(w, h0, wiez, kotwica\)/);
  assert.match(S, /geometriaTablicy: geometriaTablicy, TABLICA: TABLICA \};/, 'geometria wystawiona do testów');
  /* w słupkach i tablicy tylko wartości z geometrii: żadnych własnych wzorów w tablicaZLogo */
  const t = S.slice(S.indexOf('function tablicaZLogo('), S.indexOf('/** Budynek firmy:'));
  assert.doesNotMatch(t, /TABLICA\.(bok|wiezBok|wiezGora|nadDachem|rozstaw|wDach|slupek)/, 'tablicaZLogo nie liczy geometrii sama');
});
