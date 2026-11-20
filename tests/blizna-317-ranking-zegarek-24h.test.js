/* BLIZNA 317 / 20.11 (decyzja Filipa): migracja 20261219 dała automatowi 24 h po końcu biegu dla treningu z zegarka zrobionego przed końcem. Strona mówi to w „Jak działa
   ranking ›”: „Trening z zegarka zrobiony przed 20:00 wejdzie, jeśli zsynchronizuje się do 24 h po końcu.” Godzina z koniec_at w bazie (prawdziwy bieg: 20:00, słowo w słowo);
   bieg bez godziny końca (koniec dniem) bez tego zdania. Zdanie w regulaminie się nie zmienia (§ 2 ust. 3 bez zmian, decyzja 20.11). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B;
test.before(async () => { globalThis.escapeHtml = (x) => String(x); await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL; });
const BIEG = { slug: 'bieg-mikolajki', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], regulamin_wersja: '2026-11-v8' };
const ZDANIE = 'Trening z zegarka zrobiony przed 20:00 wejdzie, jeśli zsynchronizuje się do 24 h po końcu.';

test('„Jak działa ranking”: zdanie Filipa słowo w słowo na końcu (godzina z bazy); bez koniec_at bez zdania; regulamin bez tego zdania', () => {
  const t = B.tekstyDystansow(BIEG).czasy_prywatne;
  assert.ok(t.endsWith('Dzieci nigdy nie są w rankingu. ' + ZDANIE), t.slice(-160));
  assert.equal(t.split(ZDANIE).length, 2, 'raz');
  const bez = B.tekstyDystansow(Object.assign({}, BIEG, { koniec_at: null })).czasy_prywatne;
  assert.ok(bez.endsWith('Dzieci nigdy nie są w rankingu.'), bez.slice(-80)); assert.doesNotMatch(bez, /24 h/);
  assert.match(B.tekstyDystansow(Object.assign({}, BIEG, { koniec_at: '2026-12-06T17:30:00+00:00' })).czasy_prywatne, /zrobiony przed 18:30 wejdzie/, 'godzina z bazy');
  const reg = B.regulaminTekst(B.wartosciTekstow(Object.assign({ nazwa: 'Bieg', faza: 'trwa', regulamin_od: '2026-11-20' }, BIEG), { imie: 'Fabianek' }, 'https://example.org/z'));
  assert.doesNotMatch(reg, /zsynchronizuje się do 24 h/, 'regulamin bez zmian');
  const h = czytaj('bieg.html');
  assert.match(h, /<details class="bw-rozwin"><summary>Jak działa ranking <span aria-hidden="true">›<\/span><\/summary><p class="bw-drobne" id="bw-czasy-prywatne"><\/p><\/details>/);
  assert.match(h, /\$\('bw-czasy-prywatne'\)\.textContent = t\.czasy_prywatne;/, 'wstawiane przez textContent');
});
