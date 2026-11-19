/* BLIZNA 287 / 18.11: miniatura plakatu na bieg.html.
   19.11 (prostsza strona, prośba Filipa 18.11): plakat to JEDNA sekcja z miniaturą, „Pobierz plakat (PDF)” i „Udostępnij”; bez drugiego, dużego obrazka.
   - sekcja „Plakat” po „Wesprzyj zbiórkę”, przed zwiniętymi „Zasadami”; miniatura 96–120 px, zaokrąglona, z cieniem, link do PDF (jak „Pobierz”);
   - tylko gdy B.plakatBiegu daje plakat (bieg-mikolajki); obrazek się nie wczyta albo brak plakatu = cała sekcja schowana. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const h = fs.readFileSync(path.join(__dirname, '..', 'bieg.html'), 'utf8').replace(/\r/g, '');

test('miniatura w HTML: w sekcji „Plakat” (po „Wesprzyj zbiórkę”, przed „Zasadami”), leniwa, z alt; bez dużego obrazka', () => {
  const wes = h.indexOf('id="bw-wsparcie-sekcja"'), sek = h.indexOf('id="bw-plakat-sekcja"'), mini = h.indexOf('id="bw-plakat-mini"'), zas = h.indexOf('id="bw-zasady"'), koniecSek = h.indexOf('</section>', sek);
  assert.ok(wes > 0 && sek > wes && mini > sek && mini < koniecSek && zas > koniecSek, 'kolejność: „Wesprzyj”, „Plakat” z miniaturą, „Zasady”');
  assert.match(h, /<a class="bw-plakat-mini" id="bw-plakat-mini" target="_blank" rel="noopener noreferrer"><img id="bw-plakat-mini-obraz" alt="Plakat Wirtualnego Biegu Mikołajkowego" width="104" height="147" loading="lazy" decoding="async"><\/a>/);
  assert.doesNotMatch(h, /id="bw-plakat"[ >]/, 'bez drugiego, dużego obrazka plakatu'); assert.doesNotMatch(h, /\.bw-plakat \{/, 'bez stylu dużego obrazka');
});

test('miniatura w CSS: 96–120 px, zaokrąglona, z cieniem, proporcja A4', () => {
  const css = (/\.bw-plakat-mini img \{([^}]*)\}/.exec(h) || [])[1] || '';
  const szer = Number((/width: (\d+)px/.exec(css) || [])[1]);
  assert.ok(szer >= 96 && szer <= 120, 'szerokość ' + szer);
  assert.match(css, /border-radius: \d+px/); assert.match(css, /box-shadow: /); assert.match(css, /aspect-ratio: 210 \/ 297/);
});

test('rysujPlakat: miniatura i „Pobierz” prowadzą do PDF; błąd wczytania i brak plakatu chowają sekcję', () => {
  assert.match(h, /if \(!p\) \{ sek\.hidden = true; plakatSlug = null; return; \}/);
  assert.match(h, /miniObraz\.onerror = function \(\) \{ sek\.hidden = true; \};/);
  assert.match(h, /\$\('bw-plakat-pdf'\)\.href = p\.pdf; mini\.href = p\.pdf;/);
  assert.match(h, /sek\.hidden = false; miniObraz\.src = p\.obraz;/);
  assert.doesNotMatch(h, /\$\('bw-plakat'\)/, 'skrypt nie szuka już dużego obrazka');
});
