/* blizna-236 (12.11 wieczór, Filip): jeden mur na Dziś i na stronie akcji: pasek cegieł pod sceną rośnie w dół.
   Zwinięty = jeden rząd najnowszych (tyle, ile mieści rząd) i mały przycisk „Cały mur (N)”; rozwinięty = kolejne rzędy w tym samym stylu i „Zwiń”.
   Przycisk tylko wtedy, gdy cegieł jest więcej, niż mieści rząd. Na Dziś domyślnie zwinięty, na stronie rozwinięty; wybór w localStorage w try/catch.
   Zachowanie w DOM sprawdza blizna-200 (atrapa sceny); tu kształt plików: scena, kafel, strona, brak dawnego „+N” z listą w dymku. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('scena: pamięć wyboru w try/catch z domyślnymi (Dziś zwinięty, strona rozwinięty), klucze te same co dawny blok w js/akcja.mjs', () => {
  const s = czytaj('js/ulica-scena.mjs');
  assert.match(s, /var KLUCZ_MURU = "bm_akcja_mur_";/);
  assert.match(s, /function czytajMur\(tryb\) \{ try \{ var z = g\.localStorage\.getItem\(KLUCZ_MURU \+ tryb\); if \(z === "1"\) return true; if \(z === "0"\) return false; \} catch \(e\) \{\} return tryb === "strona"; \}/);
  assert.match(s, /function zapiszMur\(tryb, roz\) \{ try \{ g\.localStorage\.setItem\(KLUCZ_MURU \+ tryb, roz \? "1" : "0"\); \} catch \(e\) \{\} \}/);
  assert.match(s, /trybMuru = o\.kafel \? "dzis" : "strona", murRozwiniety = czytajMur\(trybMuru\)/);
  assert.equal(czytaj('js/akcja.mjs').match(/KLUCZ_MURU = "bm_akcja_mur_"/g).length, 1, 'ten sam klucz w karcie (dawny blok zostaje w module)');
});

test('scena: przycisk tylko gdy cegieł więcej niż w rzędzie; rzędy w stylu .us-mc; blok pod oknem albo w kontenerze z karty; bez „+N” i listy w dymku', () => {
  const s = czytaj('js/ulica-scena.mjs');
  assert.match(s, /if \(n <= i\) return;\s+\/\/ wszystko w jednym rzędzie: bez przycisku i bez rzędów pod oknem/);
  assert.match(s, /murRozwiniety \? "Zwiń" : "Cały mur \(" \+ n \+ "\)"/);
  assert.match(s, /if \(o\.murDol\) o\.murDol\.appendChild\(murDol\); else korzen\.insertBefore\(murDol, okno\.nextSibling\);/);
  assert.match(s, /\.us-mur-rzad\{display:flex;align-items:center;gap:" \+ ODSTEP_CEGIEL \+ "px;height:" \+ MUREK_H \+ "px\}/, 'rząd pod oknem tej samej wysokości i z tym samym odstępem co pasek');
  assert.match(s, /\.us-mur-dol\{[^}]*background:#b4563c;background-repeat:repeat;background-size:auto " \+ MUREK_H \+ "px/, 'to samo tło muru, kafelkowane też w dół (rząd = wysokość obrazka)');
  assert.match(s, /el\("button", "us-mc us-mc-wiecej us-mur-przelacz", stopka/, 'przycisk w stylu cegły „+N”');
  assert.match(s, /if \(murDol && murDol\.parentNode\) murDol\.parentNode\.removeChild\(murDol\);\s+\/\/ na kaflu stoi poza korzeniem/, 'zniszcz sprząta blok');
  assert.doesNotMatch(s, /listaMurku|us-murek-lista|data-u", "murek"|MIEJSCE_NA_RESZTE/, 'dawne „+N” z listą w dymku zdjęte');
  assert.match(s, /\.us-mur-przelacz\{height:28px/);
});

test('kafel na Dziś: kontener .akcja-dzis-mur między sceną a danymi, przekazany do naKaflu; pusty nie zajmuje miejsca', () => {
  const a = czytaj('js/akcja.mjs');
  assert.match(a, /<\/div><div class="akcja-dzis-mur"><\/div><div class="akcja-dzis-dane"><\/div>'/);
  assert.match(a, /U\.naKaflu\(k\.querySelector\("\.akcja-dzis-tlo"\), d, \{ murDol: k\.querySelector\("\.akcja-dzis-mur"\) \}\)/);
  assert.match(a, /\.akcja-dzis-mur:empty\{display:none\}/);
  const u = czytaj('js/ulica.mjs');
  assert.match(u, /function naKaflu\(tu, d, opcje\) \{/);
  assert.match(u, /S\.zamontuj\(tu, ost, \{ kafel: true, murDol: \(opcje && opcje\.murDol\) \|\| null \}\)/);
});

test('strona akcji: blok muru zaraz pod oknem sceny (ten sam order, na całą szerokość), bez dawnego bloku „Mur cegiełek”', () => {
  const h = czytaj('dla-fabianka.html');
  assert.match(h, /#scena-gora \.us-okno \{ order: -10; margin: 0 -16px; \}\n\s*#scena-gora \.us-mur-dol \{ order: -10; margin: 0 -16px; \}/);
  assert.doesNotMatch(h, /mur-cegielek|murCegielekHtml/);
});
