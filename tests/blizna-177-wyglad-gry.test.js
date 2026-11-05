/* BLIZNA 177 / WYGLĄD GRY (Filip 5.11): mur jako scena, menu z dużym Graj i kaflami, rankingi z medalami.
   Na scenie muru nie ma rysunku Szefa: wizerunek do startu jest tajny, na rusztowaniu stoi budowniczy z istniejącej grafiki.
   Mur dalej liczy zebrane cegły, nie punkty. Po skutku: przeglądarka (narzędzie poza repo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;

test('mur: cegły na scenie z postępu, pierwsza cegła widać od razu, nigdy ponad mur', () => {
  const W = L.MUR_SCENA.rzedy * L.MUR_SCENA.kolumny, C = 1250000;
  assert.equal(L.ceglyNaScenie(0, C), 0); assert.equal(L.ceglyNaScenie(1, C), 1, 'pierwsza prawdziwa cegła jest widoczna');
  assert.equal(L.ceglyNaScenie(C / 4, C), W / 4); assert.equal(L.ceglyNaScenie(C / 2, C), W / 2);
  assert.equal(L.ceglyNaScenie(C, C), W); assert.equal(L.ceglyNaScenie(C * 3, C), W, 'ponad cel mur się nie przelewa');
  assert.equal(L.ceglyNaScenie(100, 0), 0, 'bez celu pusto'); assert.equal(L.ceglyNaScenie(null, null), 0);
});

test('mur: animacja od tego, co gracz widział, a przynajmniej ostatnie 12 cegieł', () => {
  assert.equal(L.odKtorejCegly(100, null), 0, 'pierwsze wejście: cały mur');
  assert.equal(L.odKtorejCegly(100, 95), 88, 'nic nowego: ostatnie 12');
  assert.equal(L.odKtorejCegly(100, 50), 50, 'od ostatnio widzianej');
  assert.equal(L.odKtorejCegly(5, 5), 0, 'mały mur od zera'); assert.equal(L.odKtorejCegly(100, 300), 88, 'stary zapis większy niż mur');
  assert.equal(L.odKtorejCegly(100, 'x'), 0, 'śmieci w pamięci telefonu');
});

test('flagi: 25, 50 i 100 procent, zdobyta dopiero po progu', () => {
  const C = 1250000, f = L.flagiMuru(625000, C);
  assert.deepEqual(f.map((x) => x.tytul), ['Mur do pasa', 'Połowa muru', 'Mur stoi!']);
  assert.deepEqual(f.map((x) => x.ulamek), [0.25, 0.5, 1]);
  assert.deepEqual(f.map((x) => x.zdobyta), [true, true, false]);
  assert.deepEqual(L.flagiMuru(312499, C).map((x) => x.zdobyta), [false, false, false]);
  assert.deepEqual(L.flagiMuru(C, C).map((x) => x.zdobyta), [true, true, true]);
});

test('ekran muru: scena, jedna duża liczba, Twoje cegły w murze tylko z kontem; lista progów zniknęła', () => {
  const k = czytaj('js/cegielki-konto.js'), h = czytaj('gra-cegielki.html'), s = czytaj('js/cegielki.js');
  for (const id of ['e-mur-scena', 'e-mur-liczba', 'e-mur-z', 'e-mur-moje', 'e-mur-tresc']) assert.match(h, new RegExp('id="' + id + '"'), id);
  assert.doesNotMatch(h, /e-mur-progi/);
  assert.match(k, /stan\.zalogowany && stan\.cegly > 0 \? "Twoje cegły w murze: "/, 'bez konta cegły nie idą do muru');
  assert.match(k, /if \(id === "e-mur"\) \{ if \(stopMuru\) stopMuru\(\);/, 'wyjście zatrzymuje animację');
  assert.match(s, /prefers-reduced-motion: reduce/, 'bez ruchu dla tych, którzy o to proszą');
  const scena = s.slice(s.indexOf('function scenaMuru'), s.indexOf('function pokazPlansze'));
  assert.match(scena, /assets\/ulica\/budowniczy\.webp/);
  assert.doesNotMatch(scena, /koparka|arkusz|wizerunek|fabian/i, 'bez rysunku Szefa na scenie muru');
});

test('menu: duży Graj bez rejestru postaci poza urządzeniem, karty grają od razu, ukryta postać nie wraca', () => {
  const h = czytaj('gra-cegielki.html'), s = czytaj('js/cegielki.js');
  assert.ok(h.indexOf('id="m-graj-guzik"') < h.indexOf('<div class="m-guziki">'), 'Graj nad kaflami');
  assert.match(h, /id="m-mur-pasek"/); assert.match(h, /id="m-dziennik-ile"/);
  assert.match(s, /return b && !b\.hidden \? z : "kasia";/, 'postać zniknęła z menu: Kasia');
  assert.match(s, /\$\("m-graj-guzik"\)\.addEventListener\("click", function \(\) \{ start\(postacDoGry\(\)\); \}\);/);
  assert.match(s, /document\.querySelectorAll\("\.postac"\)\.forEach\(function \(b\) \{ b\.addEventListener\("click", function \(\) \{ start\(b\.dataset\.postac\); \}\); \}\);/);
  assert.match(h, /@media \(max-height:500px\) and \(orientation:landscape\) \{\s+#menu h1/, 'układ na telefon w poziomie');
});

test('rankingi: cztery zakładki, medale 1–3, własny wiersz także spoza dziesiątki', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /var ZAKLADKI = \{ dzien: "Dzień", tydzien: "Tydzień", wszech: "Wszech", dolozyli_akcja: "Dołożone" \};/);
  assert.doesNotMatch(k, /r-widok/);
  assert.match(k, /m >= 1 && m <= 3 \? el\("span", "r-medal r-medal-" \+ m, String\(m\)\)/);
  assert.match(k, /if \(!naLiscie && mojeM && mojeM\.miejsce\)/);
  assert.doesNotMatch(k.slice(k.indexOf('function rysuj()'), k.indexOf('async function zapiszPseudonim')), /innerHTML/, 'pseudonimy tylko przez textContent');
});
