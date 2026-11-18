/* BLIZNA 287 / 18.11: miniatura plakatu wyżej na bieg.html (duża sekcja „Plakat” na dole zostaje, blizna-285).
   - pod przyciskiem zapisu (#bw-cta), przed kartą dystansów: obrazek 96–120 px, zaokrąglone rogi, cień, podpis; link #bw-plakat-sekcja (przewija do sekcji);
   - tylko gdy B.plakatBiegu daje plakat (bieg-mikolajki); obrazek się nie wczyta = miniatura znika; bez plakatu ukryta. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const h = fs.readFileSync(path.join(__dirname, '..', 'bieg.html'), 'utf8').replace(/\r/g, '');

test('miniatura w HTML: ukryta, pod #bw-cta, przed dystansami; link do sekcji „Plakat”', () => {
  const cta = h.indexOf('id="bw-cta"'), mini = h.indexOf('id="bw-plakat-mini"'), dyst = h.indexOf('id="bw-dystanse-sekcja"'), sek = h.indexOf('id="bw-plakat-sekcja"');
  assert.ok(cta > 0 && mini > cta && mini < dyst && sek > dyst, 'kolejność: przycisk zapisu, miniatura, dystanse, …, sekcja „Plakat”');
  assert.match(h, /<a class="bw-plakat-mini" id="bw-plakat-mini" href="#bw-plakat-sekcja" hidden><img id="bw-plakat-mini-obraz" alt="[^"]+" width="104" height="147" decoding="async">/);
});

test('miniatura w CSS: 96–120 px, zaokrąglona, z cieniem, proporcja A4', () => {
  const css = (/\.bw-plakat-mini img \{([^}]*)\}/.exec(h) || [])[1] || '';
  const szer = Number((/width: (\d+)px/.exec(css) || [])[1]);
  assert.ok(szer >= 96 && szer <= 120, 'szerokość ' + szer);
  assert.match(css, /border-radius: \d+px/); assert.match(css, /box-shadow: /); assert.match(css, /aspect-ratio: 210 \/ 297/);
});

test('rysujPlakat: miniatura z tym samym plikiem co duża sekcja; błąd wczytania i brak plakatu chowają miniaturę', () => {
  assert.match(h, /if \(!p\) \{ sek\.hidden = true; mini\.hidden = true; plakatSlug = null; return; \}/);
  assert.match(h, /miniObraz\.onerror = function \(\) \{ mini\.hidden = true; \};/);
  assert.match(h, /mini\.hidden = false; miniObraz\.src = p\.obraz;/);
});
